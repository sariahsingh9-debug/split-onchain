import net from 'node:net';
function encode(value){
 if(value===null)return '$-1\r\n';if(value instanceof Error)return '-ERR '+value.message+'\r\n';if(typeof value==='number')return ':'+value+'\r\n';if(Array.isArray(value))return '*'+value.length+'\r\n'+value.map(encode).join('');const s=String(value);return '$'+Buffer.byteLength(s)+'\r\n'+s+'\r\n';
}
function command(buffer){
 let end=buffer.indexOf('\r\n');if(end<0)return;const count=Number(buffer.subarray(1,end));let pos=end+2;const args=[];
 for(let i=0;i<count;i++){end=buffer.indexOf('\r\n',pos);if(end<0)return;const size=Number(buffer.subarray(pos+1,end));pos=end+2;if(buffer.length<pos+size+2)return;args.push(buffer.subarray(pos,pos+size).toString());pos+=size+2}return {args,pos};
}
export async function fakeRedis(){
 const persistence={durable:true};
 const records=new Map(),slots=[],expires=new Map(),sockets=new Set();
 function purge(key){if(expires.get(key)<=Date.now()){records.delete(key);expires.delete(key)}}
 function execute(args){
  const [raw,...a]=args;const op=raw.toUpperCase();
  if(op==='INFO')return 'loading:0\r\ncluster_enabled:0\r\naof_enabled:'+Number(persistence.durable)+'\r\naof_last_write_status:ok\r\n';if(['CLIENT','SELECT'].includes(op))return 'OK';if(op==='PING')return 'PONG';
  if(op==='GET'){purge(a[0]);return records.get(a[0])??null}
  if(op==='SET'){purge(a[0]);if(a.includes('NX')&&records.has(a[0]))return null;if(!slots.includes(a[0]))slots.push(a[0]);records.set(a[0],a[1]);const ex=a.indexOf('EX');if(ex>=0)expires.set(a[0],Date.now()+Number(a[ex+1])*1000);return 'OK'}
  if(op==='DEL'){let n=0;for(const k of a)if(records.delete(k))n++;return n}
  if(op==='SCAN'){
   const cursor=Number(a[0]),count=Number(a[a.indexOf('COUNT')+1]);const pattern=a[a.indexOf('MATCH')+1];const end=Math.min(slots.length,cursor+count);
   const regex=new RegExp('^'+pattern.split('*').map(x=>x.replace(/[.+?^${}()|[\]\\]/g,'\\$&')).join('.*')+'$');
   return [end>=slots.length?'0':String(end),slots.slice(cursor,end).filter(k=>{purge(k);return records.has(k)&&regex.test(k)})];
  }
  if(op==='EVAL'&&a[0].includes("'incr'")){const key=a[2];purge(key);const n=Number(records.get(key)||0)+1;records.set(key,String(n));if(n===1)expires.set(key,Date.now()+Number(a[3])*1000);return n}
  if(op==='EVAL'){const key=a[2],token=a[3];if(records.get(key)===token)return Number(records.delete(key));return 0}
  return new Error('Unsupported command '+op);
 }
 const server=net.createServer(socket=>{
  sockets.add(socket);socket.on('close',()=>sockets.delete(socket));let buffer=Buffer.alloc(0),queue=null;
  socket.on('data',data=>{buffer=Buffer.concat([buffer,data]);while(true){const parsed=command(buffer);if(!parsed)break;buffer=buffer.subarray(parsed.pos);const op=parsed.args[0].toUpperCase();let value;
   if(op==='MULTI'){queue=[];value='OK'}else if(op==='EXEC'){value=queue.map(execute);queue=null}else if(queue){queue.push(parsed.args);value='QUEUED'}else value=execute(parsed.args);socket.write(encode(value));
  }});
 });
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 return {persistence,url:`redis://127.0.0.1:${server.address().port}`,records,slots,async close(){for(const s of sockets)s.destroy();await new Promise(resolve=>server.close(resolve))}};
}
