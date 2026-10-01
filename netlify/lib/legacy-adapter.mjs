export async function runLegacyHandler(handler, request, context){
  const url=new URL(request.url);
  const query={};
  for(const [key,value] of url.searchParams.entries()){
    if(query[key]===undefined)query[key]=value;
    else if(Array.isArray(query[key]))query[key].push(value);
    else query[key]=[query[key],value];
  }

  const headers={};
  for(const [key,value] of request.headers.entries())headers[key.toLowerCase()]=value;

  let body='';
  if(!['GET','HEAD'].includes(request.method)){
    body=await request.text();
  }

  const req={
    method:request.method,
    headers,
    query,
    body,
    url:request.url,
    waitUntil:(promise)=>{
      if(context?.waitUntil)context.waitUntil(Promise.resolve(promise));
      else Promise.resolve(promise).catch(()=>{});
    }
  };

  let statusCode=200;
  const responseHeaders=new Headers();
  let responseBody='';
  let ended=false;

  const res={
    setHeader(name,value){
      if(Array.isArray(value))responseHeaders.set(name,value.join(', '));
      else responseHeaders.set(name,String(value));
      return this;
    },
    status(code){statusCode=Number(code)||200;return this;},
    json(value){
      if(!responseHeaders.has('content-type'))responseHeaders.set('content-type','application/json; charset=utf-8');
      responseBody=JSON.stringify(value);
      ended=true;
      return this;
    },
    send(value){
      responseBody=typeof value==='string'?value:String(value??'');
      ended=true;
      return this;
    }
  };

  try{
    await handler(req,res);
  }catch(error){
    console.error('Unhandled SPLIT API error:',error);
    statusCode=500;
    responseHeaders.set('content-type','application/json; charset=utf-8');
    responseBody=JSON.stringify({success:false,error:'Internal server error.'});
    ended=true;
  }

  if(!ended && responseBody===''){
    responseBody='';
  }

  return new Response(responseBody,{status:statusCode,headers:responseHeaders});
}
