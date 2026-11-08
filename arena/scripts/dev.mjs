import {spawn} from 'node:child_process';
import {createServer} from 'vite';

const api=spawn(process.execPath,['src/server.mjs'],{stdio:'inherit',env:{...process.env,HOST:'127.0.0.1',PORT:'8899'}});
const vite=await createServer();
await vite.listen();
vite.printUrls();
let closing=false;
async function close(){if(closing)return;closing=true;await vite.close();api.kill('SIGTERM');process.exit(0);}
process.on('SIGINT',close);process.on('SIGTERM',close);
api.on('error',async error=>{console.error(error.message);await close();});
api.on('exit',code=>{if(!closing){console.error(`API server exited (${code}).`);close();}});
