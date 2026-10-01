import { Uploader } from '@irys/upload';
import { Solana } from '@irys/upload-solana';
import { creatorSession } from './_creator-utils.js';
import { consumeLaunchQuota } from './_launch-rate-limit.js';

const MAX_BYTES=3*1024*1024;
const KINDS=new Set(['token-image','banner']);
function bodyOf(req){if(typeof req.body==='string')return JSON.parse(req.body||'{}');return req.body||{}}
function sniff(buffer){
  if(buffer.length>=8&&buffer.subarray(0,8).equals(Buffer.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a])))return 'image/png';
  if(buffer.length>=3&&buffer[0]===0xff&&buffer[1]===0xd8&&buffer[2]===0xff)return 'image/jpeg';
  if(buffer.length>=6&&['GIF87a','GIF89a'].includes(buffer.subarray(0,6).toString('ascii')))return 'image/gif';
  if(buffer.length>=12&&buffer.subarray(0,4).toString('ascii')==='RIFF'&&buffer.subarray(8,12).toString('ascii')==='WEBP')return 'image/webp';
  return '';
}
function safeFilename(value){return String(value||'upload').replace(/[\u0000-\u001F\u007F]/g,'').replace(/[\\/]/g,'_').slice(0,120)||'upload'}
export default async function handler(req,res){
  res.setHeader('Cache-Control','no-store');
  if(req.method!=='POST')return res.status(405).json({error:'Method not allowed'});
  try{
    const session=creatorSession(req);
    if(session.family!=='solana')return res.status(401).json({error:'A Solana launch wallet is required.'});
    await consumeLaunchQuota(session.wallet,'media',{limit:12,windowMs:10*60*1000});
    if(!process.env.IRYS_SOLANA_PRIVATE_KEY)return res.status(503).json({error:'Permanent media upload is not configured.'});
    const {dataUrl,filename='upload',kind='media'}=bodyOf(req);
    if(!KINDS.has(kind))return res.status(400).json({error:'Unsupported media type.'});
    if(typeof dataUrl!=='string'||!/^data:image\/(png|jpeg|gif|webp);base64,/i.test(dataUrl))return res.status(400).json({error:'Use a PNG, JPEG, GIF or WebP image.'});
    const comma=dataUrl.indexOf(',');const base64=dataUrl.slice(comma+1);
    if(!/^[A-Za-z0-9+/=\r\n]+$/.test(base64))return res.status(400).json({error:'Invalid image data.'});
    const buffer=Buffer.from(base64,'base64');
    if(!buffer.length)return res.status(400).json({error:'Image is empty.'});
    if(buffer.length>MAX_BYTES)return res.status(413).json({error:'Images must be 3 MB or smaller.'});
    const actualType=sniff(buffer);if(!actualType)return res.status(400).json({error:'The uploaded file is not a supported image.'});

    let secret;
    try{secret=JSON.parse(process.env.IRYS_SOLANA_PRIVATE_KEY)}catch{throw new Error('IRYS_SOLANA_PRIVATE_KEY must be a JSON array secret key.');}
    if(!Array.isArray(secret)||secret.length<32)throw new Error('IRYS_SOLANA_PRIVATE_KEY is invalid.');
    const rpc=process.env.IRYS_SOLANA_RPC_URL||'https://api.mainnet-beta.solana.com';
    const irys=await Uploader(Solana).withWallet(secret).withRpc(rpc);
    const receipt=await irys.upload(buffer,{tags:[
      {name:'Content-Type',value:actualType},{name:'App-Name',value:'SPLIT'},
      {name:'SPLIT-Media-Type',value:kind},{name:'File-Name',value:safeFilename(filename)}
    ]});
    if(!receipt?.id)throw new Error('Irys did not return an upload id.');
    return res.status(200).json({url:`https://gateway.irys.xyz/${receipt.id}`,id:receipt.id,contentType:actualType});
  }catch(error){console.error(error);return res.status(500).json({error:error?.message||'Permanent upload failed.'})}
}
