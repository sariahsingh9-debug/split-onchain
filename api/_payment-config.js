export function decimalToUnits(value,decimals){
  const s=String(value).trim();
  if(!/^\d+(\.\d+)?$/.test(s))throw new Error('Invalid payment amount.');
  const [whole,frac='']=s.split('.');
  if(frac.length>decimals&&/[1-9]/.test(frac.slice(decimals)))throw new Error('Amount has more decimal places than this asset supports.');
  const padded=(frac+'0'.repeat(decimals)).slice(0,decimals);
  return BigInt(whole||'0')*(10n**BigInt(decimals))+BigInt(padded||'0');
}
export function unitsToDecimal(units,decimals){
  const n=BigInt(units);const neg=n<0n;let raw=(neg?-n:n).toString().padStart(decimals+1,'0');
  if(!decimals)return (neg?'-':'')+raw;
  const whole=raw.slice(0,-decimals)||'0';const frac=raw.slice(-decimals).replace(/0+$/,'');
  return (neg?'-':'')+whole+(frac?'.'+frac:'');
}
export function addressWord(address){return String(address).toLowerCase().replace(/^0x/,'').padStart(64,'0')}
export function uintWord(value){return BigInt(value).toString(16).padStart(64,'0')}

export const SOLANA_MINTS={
  USDC:{mint:'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',decimals:6},
  USDT:{mint:'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB',decimals:6}
};

// Deliberately narrow allowlist: only native assets plus current canonical
// USDC and directly supported USDT deployments. Wrapped/legacy assets were removed.
export const EVM={
  ethereum:{name:'Ethereum',chainId:'0x1',rpcEnv:'PAYMENT_ETHEREUM_RPC_URL',rpc:'https://ethereum-rpc.publicnode.com',native:['ETH'],tokens:{
    USDC:{address:'0xA0b86991c6218b36c1d19d4a2e9eb0ce3606eb48',decimals:6},USDT:{address:'0xdAC17F958D2ee523a2206206994597C13D831ec7',decimals:6}
  }},
  base:{name:'Base',chainId:'0x2105',rpcEnv:'PAYMENT_BASE_RPC_URL',rpc:'https://base-rpc.publicnode.com',native:['ETH'],tokens:{
    USDC:{address:'0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',decimals:6}
  }},
  arbitrum:{name:'Arbitrum',chainId:'0xa4b1',rpcEnv:'PAYMENT_ARBITRUM_RPC_URL',rpc:'https://arbitrum-one-rpc.publicnode.com',native:['ETH'],tokens:{
    USDC:{address:'0xaf88d065e77c8cC2239327C5EDb3A432268e5831',decimals:6}
  }},
  optimism:{name:'Optimism',chainId:'0xa',rpcEnv:'PAYMENT_OPTIMISM_RPC_URL',rpc:'https://optimism-rpc.publicnode.com',native:['ETH'],tokens:{
    USDC:{address:'0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85',decimals:6}
  }},
  polygon:{name:'Polygon',chainId:'0x89',rpcEnv:'PAYMENT_POLYGON_RPC_URL',rpc:'https://polygon-bor-rpc.publicnode.com',native:['POL'],tokens:{
    USDC:{address:'0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359',decimals:6}
  }},
  avalanche:{name:'Avalanche',chainId:'0xa86a',rpcEnv:'PAYMENT_AVALANCHE_RPC_URL',rpc:'https://avalanche-c-chain-rpc.publicnode.com',native:['AVAX'],tokens:{
    USDC:{address:'0xB97EF9Ef8734C71904D8002F8b6Bc66Dd9c48a6E',decimals:6},USDT:{address:'0x9702230A8Ea53601f5cD2dc00fDBc13d4dF4A8c7',decimals:6}
  }},
  bnb:{name:'BNB Chain',chainId:'0x38',rpcEnv:'PAYMENT_BNB_RPC_URL',rpc:'https://bsc-rpc.publicnode.com',native:['BNB'],tokens:{
    USDT:{address:'0x55d398326f99059fF775485246999027B3197955',decimals:18}
  }}
};
export const PAYMENT_NETWORK_NAMES={solana:'Solana',...Object.fromEntries(Object.entries(EVM).map(([k,v])=>[k,v.name]))};
export function evmRpc(network){const cfg=EVM[network];return cfg?(process.env[cfg.rpcEnv]||cfg.rpc):''}
export function decimalsFor(network,asset){
  if(network==='solana'){
    if(asset==='SOL')return 9;
    const token=SOLANA_MINTS[asset];if(token)return token.decimals;
    throw new Error('This Solana payment asset is not supported.');
  }
  const cfg=EVM[network];if(!cfg)throw new Error('This payment network is not supported.');
  if(cfg.native.includes(asset))return 18;
  const token=cfg.tokens[asset];if(!token)throw new Error('This payment asset is not supported on the selected network.');
  return token.decimals;
}
