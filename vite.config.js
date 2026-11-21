import {defineConfig} from 'vite';

// base: './' → Hostinger의 하위 폴더(예: public_html/duty)에 올려도 동작
export default defineConfig({
  base: './',
  build: {outDir: 'dist', emptyOutDir: true},
  server: {port: 5181, strictPort: true},
});
