import handler from '../../api/register-launch.js';
import { runLegacyHandler } from '../lib/legacy-adapter.mjs';

export default async (request, context) => runLegacyHandler(handler, request, context);

export const config = {
  path: '/api/register-launch'
};
