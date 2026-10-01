import handler from '../../api/config.js';
import { runLegacyHandler } from '../lib/legacy-adapter.mjs';

export default async (request, context) => runLegacyHandler(handler, request, context);

export const config = {
  path: '/api/config'
};
