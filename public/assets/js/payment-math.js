// Use the same integer arithmetic as the server. Display every remainder unit.
(function(root){
  function units(value,decimals){
    const raw=String(value).trim();
    if(!/^\d+(?:\.\d+)?$/.test(raw))throw new Error('Enter a valid amount.');
    const [whole,fraction='']=raw.split('.');
    if(fraction.length>decimals&&/[1-9]/.test(fraction.slice(decimals)))throw new Error('The amount has too many decimal places for this asset.');
    return BigInt(whole)*10n**BigInt(decimals)+BigInt(fraction.slice(0,decimals).padEnd(decimals,'0')||'0');
  }
  function decimal(value,decimals){
    const factor=10n**BigInt(decimals),whole=value/factor;
    const fraction=(value%factor).toString().padStart(decimals,'0').replace(/0+$/,'');
    return whole.toString()+(fraction?'.'+fraction:'');
  }
  function equal(value,count,decimals=6){
    if(!Number.isInteger(count)||count<2||count>50)throw new Error('Choose 2–50 participants.');
    const total=units(value,decimals);
    if(total<BigInt(count))throw new Error('The total is too small for every participant to have a share.');
    const base=total/BigInt(count),remainder=total%BigInt(count);
    return Array.from({length:count},(_,i)=>decimal(base+(BigInt(i)<remainder?1n:0n),decimals));
  }
  function display(value){
    const [whole,fraction='']=String(value).split('.');
    return whole.replace(/\B(?=(\d{3})+(?!\d))/g,',')+'.'+fraction.padEnd(2,'0');
  }
  root.SPLIT_AMOUNT={units,decimal,equal,display};
})(window);
