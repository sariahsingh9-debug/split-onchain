export const FIXED_ROUTING = Object.freeze({
  creatorBps: 3500,
  treasuryBps: 2000,
  reserveBps: 3500,
  protocolBps: 1000
});

export const MIN_INITIAL_BUY_USD = 5;

export function normalizeInitialBuyUsd(value){
  const n=Number(value);
  if(!Number.isFinite(n))throw new Error('Initial buy amount is invalid.');
  if(n<MIN_INITIAL_BUY_USD)throw new Error(`Initial buy must be at least ${MIN_INITIAL_BUY_USD} USDC-equivalent.`);
  if(n>100000)throw new Error('Initial buy is too large for this launch flow.');
  return Math.round(n*100)/100;
}

export function assertFixedRoute(route){
  const actual=[
    Number(route?.creatorBps),
    Number(route?.treasuryBps),
    Number(route?.liquidityBps),
    Number(route?.protocolBps)
  ];
  const expected=[
    FIXED_ROUTING.creatorBps,
    FIXED_ROUTING.treasuryBps,
    FIXED_ROUTING.reserveBps,
    FIXED_ROUTING.protocolBps
  ];
  if(actual.some((v,i)=>v!==expected[i])){
    throw new Error('SPLIT launch routing must remain fixed at Creator 35%, Treasury 20%, Reserve 35%, Protocol 10%.');
  }
  if(String(route?.creatorRecipient||'')!==String(route?.creatorWallet||'')){
    throw new Error('Creator revenue must route to the connected launch wallet.');
  }
  return true;
}
