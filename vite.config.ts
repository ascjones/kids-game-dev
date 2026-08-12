import { defineConfig } from 'vite';
import { bridgePlugin } from './src/bridge/middleware.ts';

export default defineConfig({
  plugins: [bridgePlugin()],
  server: {
    port: 5173,
  },
  build: {
    chunkSizeWarningLimit: 4096,
  },
});
