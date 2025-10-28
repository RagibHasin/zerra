import tailwindcss from '@tailwindcss/vite';
import { tanstackRouter } from '@tanstack/router-plugin/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { compression } from 'vite-plugin-compression2';

const prod = {
  plugins: [
    tanstackRouter({ target: 'react', autoCodeSplitting: true }),
    react(),
    tailwindcss(),
    compression({ algorithms: [['gzip', { level: 9 }], 'brotli'] }),
  ],
  build: { reportCompressedSize: false },
};
const dev = {
  plugins: [tanstackRouter({ target: 'react', autoCodeSplitting: true }), react(), tailwindcss()],
  build: { sourcemap: true, minify: false, cssMinify: false, reportCompressedSize: false },
  experimental: { enableNativePlugin: true },
};
// https://vite.dev/config/
export default defineConfig(dev);
