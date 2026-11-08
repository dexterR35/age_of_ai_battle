import {defineConfig} from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins:[react()],
  publicDir:false,
  server:{host:'127.0.0.1',port:5173,strictPort:true,proxy:{'/api':{target:'http://127.0.0.1:8899',changeOrigin:true}}},
  preview:{host:'127.0.0.1',port:4173,strictPort:true,proxy:{'/api':{target:'http://127.0.0.1:8899',changeOrigin:true}}},
  build:{outDir:'dist/client',emptyOutDir:true,sourcemap:false,target:'es2022'},
});
