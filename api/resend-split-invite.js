import {
  signPayload, verifyPayload, readSplitMeta, readParticipant, baseUrl
} from './_split-invite-utils.js';
import { recordAcceptedEmail } from './_split-email-state.js';
import { invitationEmailReady } from './_email-capabilities.js';
import { inviteSubject, inviteHtml, inviteText, sendOneInvite } from './_split-email.js';

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
    if(!invitationEmailReady()){
      return res.status(503).json({success:false,error:'Email invitations are not enabled yet. Copy and share the participant payment link instead.'});
    }
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
        html:inviteHtml(meta,participant,url),
        text:inviteText(meta,participant,url)
      },
      `split-resend/${meta.splitId}/${participant.id}/${day}`
    );

    const updated=await recordAcceptedEmail(meta,participant.id,delivered.id,{lastResentAt:new Date().toISOString()},true);

    return res.status(200).json({
      success:true,
      participantId:updated.id,
      emailSent:true,
      emailId:updated.emailId,
      url
    });
  }catch(error){
    console.error(error);
    const raw=String(error?.message||'');
    const safe=/not configured|api key|sender|domain/i.test(raw)
      ?'Email invitations are temporarily unavailable. Copy and share the participant payment link instead.'
      :(raw||'Could not resend invitation.');
    const status=/already paid/i.test(raw)?409:/unavailable/i.test(safe)?503:400;
    return res.status(status).json({success:false,error:safe});
  }
}
