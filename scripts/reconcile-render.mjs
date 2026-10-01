import handler from '../api/reconcile-payments.js';

const secret=process.env.CRON_SECRET;
if(!secret){
  console.error('CRON_SECRET is not configured.');
  process.exit(1);
}

let code=200;
let body='';
const req={
  method:'POST',
  headers:{authorization:`Bearer ${secret}`},
  query:{},
  body:'',
  waitUntil:(promise)=>Promise.resolve(promise).catch(error=>console.error(error))
};
const res={
  setHeader(){return this},
  status(value){code=Number(value)||200;return this},
  json(value){body=JSON.stringify(value);return this},
  send(value){body=String(value??'');return this}
};

await handler(req,res);
console.log(body);
if(code>=400)process.exit(1);
