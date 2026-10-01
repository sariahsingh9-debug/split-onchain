export function invitationEmailReady(){
  return Boolean(process.env.RESEND_API_KEY&&process.env.SPLIT_EMAIL_FROM&&process.env.SPLIT_INVITE_SECRET&&process.env.SPLIT_EMAIL_DOMAIN_VERIFIED==='true');
}
