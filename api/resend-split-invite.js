import {
  signPayload, verifyPayload, readSplitMeta, readParticipant, saveParticipant, baseUrl, writeEmailIndex
} from './_split-invite-utils.js';
import { inviteSubject, inviteHtml, sendOneInvite } from './_split-email.js';

function bodyOf(req){if(typeof req.body==='string')return JSON.parse(req.body||'{}');return req.body||{}}

function participantToken(meta,p){
  return signPayload({
    v:2,role:'participant',splitId:meta.splitId,participantId:p.id,
    participantName:p.name,splitName:meta.name,amount:p.amount,total:meta.total,
    network:meta.network,networkName:meta.networkName,asset:meta.asset,payout:meta.payout,
    iat:meta.createdAtMs||Date.parse(meta.createdAt),
    exp:meta.expiresAtMs||Date.parse(meta.expiresAt)
  });
}

export default async function handler(req,res){
  res.setHeader('Cache-Control','no-store');
  if(req.method!=='POST')return res.status(405).json({success:false,error:'Method not allowed.'});
  try{
    const {adminToken,participantId}=bodyOf(req);
    const admin=verifyPayload(adminToken,'admin');
    const meta=await readSplitMeta(admin.splitId);
    if(!meta)throw new Error('SPLIT record was not found.');

    const participant=await readParticipant(admin.splitId,String(participantId||''));
    if(!participant)throw new Error('Participant record was not found.');
    if(participant.status==='confirmed'){
      return res.status(409).json({success:false,error:'This participant has already paid.'});
    }

    const token=participantToken(meta,participant);
    const url=`${baseUrl()}/?pay=${encodeURIComponent(token)}`;
    const day=new Date().toISOString().slice(0,10);
    const delivered=await sendOneInvite(
      {
        from:process.env.SPLIT_EMAIL_FROM,
        to:[participant.email],
        subject:inviteSubject(meta,participant),
        html:inviteHtml(meta,participant,url)
      },
      `split-resend/${meta.splitId}/${participant.id}/${day}`
    );

    const updated={
      ...participant,
      emailSent:true,
      emailStatus:'accepted',
      emailError:'',
      emailId:delivered?.id||participant.emailId||'',
      lastResentAt:new Date().toISOString()
    };
    await saveParticipant(meta.splitId,updated,meta);
    if(updated.emailId)await writeEmailIndex(updated.emailId,{splitId:meta.splitId,participantId:updated.id});

    return res.status(200).json({
      success:true,
      participantId:updated.id,
      emailSent:true,
      emailId:updated.emailId,
      url
    });
  }catch(error){
    console.error(error);
    const message=error?.message||'Could not resend invitation.';
    const status=/already paid/i.test(message)?409:400;
    return res.status(status).json({success:false,error:message});
  }
}
