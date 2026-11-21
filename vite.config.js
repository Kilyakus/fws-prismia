import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  root: fileURLToPath(new URL('./src/web/', import.meta.url)),
  base: './',
  plugins: [viteSingleFile()],
  server: { host: '0.0.0.0', port: 5176, strictPort: false, allowedHosts: ['.e2b.app'] },
  preview: { host: '0.0.0.0', port: 4176, strictPort: false, allowedHosts: ['.e2b.app'] },
  resolve: { dedupe: ['three'] },
  build: { outDir: fileURLToPath(new URL('./standalone/', import.meta.url)), emptyOutDir: true, assetsInlineLimit: 100_000_000 },
});
