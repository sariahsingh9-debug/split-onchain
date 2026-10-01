import { get, put } from './_blob-store.js';

const CACHE_PATH='market-cache/sol-usd.json';
const MAX_CACHE_AGE_MS=30*60*1000;

async function fetchJson(url,timeout=4500){
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),timeout);
  try{
    const response=await fetch(url,{headers:{accept:'application/json'},signal:controller.signal});
    if(!response.ok)throw new Error(`Price source returned ${response.status}.`);
    return await response.json();
  }finally{clearTimeout(timer)}
}
function validPrice(value){
  const n=Number(value);
  return Number.isFinite(n)&&n>1&&n<100000?n:0;
}
async function readCached(){
  try{
    const result=await get(CACHE_PATH);
    if(!result?.stream)return null;
    const body=JSON.parse(await new Response(result.stream).text());
    const price=validPrice(body?.price);
    const age=Date.now()-Number(body?.at||0);
    if(price&&age>=0&&age<=MAX_CACHE_AGE_MS)return {price,source:'cached',at:Number(body.at)};
  }catch{}
  return null;
}
async function cachePrice(price,source){
  try{
    await put(CACHE_PATH,JSON.stringify({price,source,at:Date.now()}),{allowOverwrite:true});
  }catch{}
}
export async function getSolUsdPrice(){
  const override=validPrice(process.env.SOL_USD_PRICE_OVERRIDE);
  if(override)return {price:override,source:'env',at:Date.now()};

  try{
    const body=await fetchJson('https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd');
    const price=validPrice(body?.solana?.usd);
    if(price){await cachePrice(price,'coingecko');return {price,source:'coingecko',at:Date.now()}}
  }catch{}

  try{
    const body=await fetchJson('https://api.coinbase.com/v2/prices/SOL-USD/spot');
    const price=validPrice(body?.data?.amount);
    if(price){await cachePrice(price,'coinbase');return {price,source:'coinbase',at:Date.now()}}
  }catch{}

  const cached=await readCached();
  if(cached)return cached;
  throw new Error('SOL/USD pricing is temporarily unavailable. Try the launch again in a moment.');
}

export async function quoteInitialBuyUsd(usd){
  const {normalizeInitialBuyUsd}=await import('./_launch-policy.js');
  const amountUsd=normalizeInitialBuyUsd(usd);
  const quote=await getSolUsdPrice();
  const lamports=Math.ceil((amountUsd/quote.price)*1_000_000_000);
  if(!Number.isSafeInteger(lamports)||lamports<=0)throw new Error('Initial-buy conversion failed.');
  return {
    amountUsd,
    solUsdPrice:quote.price,
    priceSource:quote.source,
    lamports,
    sol:Number((lamports/1_000_000_000).toFixed(9))
  };
}
