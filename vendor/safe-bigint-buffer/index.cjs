'use strict';
// No native addon or unsafe allocation. These conversions service fixed-size
// Solana integer layouts, with explicit overflow and resource bounds.
function width(n){if(!Number.isSafeInteger(n)||n<0||n>16384)throw new RangeError('Invalid integer buffer width.');return n}
function read(buffer,little){
  if(!(buffer instanceof Uint8Array))throw new TypeError('An integer byte buffer is required.');width(buffer.length);
  let n=0n;
  if(little){for(let i=buffer.length-1;i>=0;i--)n=(n<<8n)|BigInt(buffer[i])}
  else{for(const byte of buffer)n=(n<<8n)|BigInt(byte)}
  return n;
}
function write(value,n,little){
  width(n);if(typeof value!=='bigint'||value<0n)throw new RangeError('An unsigned BigInt is required.');
  if(value>=1n<<BigInt(n*8))throw new RangeError('The integer does not fit the buffer.');
  const out=Buffer.alloc(n);let remaining=value;
  for(let i=0;i<n;i++){out[little?i:n-i-1]=Number(remaining&255n);remaining>>=8n}
  return out;
}
exports.toBigIntLE=buffer=>read(buffer,true);exports.toBigIntBE=buffer=>read(buffer,false);
exports.toBufferLE=(value,n)=>write(value,n,true);exports.toBufferBE=(value,n)=>write(value,n,false);
