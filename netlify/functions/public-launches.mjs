import handler from '../../api/public-launches.js';
import { runLegacyHandler } from '../lib/legacy-adapter.mjs';

export default async (request, context) => runLegacyHandler(handler, request, context);

export const config = {
  path: '/api/public-launches'
};
