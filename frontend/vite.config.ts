import tailwindcss from '@tailwindcss/vite';
import { tanstackRouter } from '@tanstack/router-plugin/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { compression } from 'vite-plugin-compression2';

const plugins = [
  tanstackRouter({ target: 'react', autoCodeSplitting: true }),
  react(),
  tailwindcss(),
];
const prod = {
  plugins: [...plugins, compression({ algorithms: [['gzip', { level: 9 }], 'brotli'] })],
  build: { reportCompressedSize: false },
  experimental: { enableNativePlugin: true },
};
const dev = {
  plugins,
  build: { sourcemap: true, minify: false, cssMinify: false, reportCompressedSize: false },
  experimental: { enableNativePlugin: true },
};
// https://vite.dev/config/
export default defineConfig(prod);
