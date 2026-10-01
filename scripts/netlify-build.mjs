import { existsSync } from 'node:fs';

const required=[
  'public/index.html',
  'netlify/functions/create-launch.mjs',
  'netlify/functions/register-launch.mjs',
  'netlify/functions/upload-media.mjs',
  'netlify/functions/config.mjs',
  'api/_blob-store.js'
];

const missing=required.filter(path=>!existsSync(path));
if(missing.length){
  console.error('Missing required SPLIT build files:',missing.join(', '));
  process.exit(1);
}
console.log('SPLIT Netlify build ready.');
