import './build-assets.mjs';
import {build} from 'esbuild';
import fs from 'node:fs/promises';
await fs.mkdir('dist/server',{recursive:true});
await fs.mkdir('dist/.openai',{recursive:true});
await build({entryPoints:['worker/site.mjs'],bundle:true,format:'esm',platform:'browser',target:'es2022',outfile:'dist/server/index.js',minify:false});
await fs.copyFile('.openai/hosting.json','dist/.openai/hosting.json');
console.log('Built hosted Site Worker. Cloud runner uses wrangler.jsonc separately.');
