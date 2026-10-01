import handler from '../../api/verify-split-invite.js';
import { runLegacyHandler } from '../lib/legacy-adapter.mjs';

export default async (request, context) => runLegacyHandler(handler, request, context);

export const config = {
  path: '/api/verify-split-invite'
};
