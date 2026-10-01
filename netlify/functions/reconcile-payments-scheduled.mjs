import handler from '../../api/reconcile-payments.js';
import { runLegacyHandler } from '../lib/legacy-adapter.mjs';

export default async (request, context) => {
  const secret=process.env.CRON_SECRET;
  if(!secret){
    console.warn('CRON_SECRET is not configured; skipping reconciliation.');
    return;
  }
  const synthetic=new Request(new URL('/api/reconcile-payments', request.url),{
    method:'POST',
    headers:{authorization:`Bearer ${secret}`}
  });
  await runLegacyHandler(handler, synthetic, context);
};

export const config = {
  schedule: '0 4 * * *'
};
