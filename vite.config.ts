import { defineConfig } from 'vite';
import { bridgePlugin } from './src/bridge/middleware.ts';

export default defineConfig({
  plugins: [bridgePlugin()],
  server: {
    port: 5173,
    // Reachable over the tailnet (and LAN): bind all interfaces and accept
    // the Tailscale MagicDNS hostname.
    host: true,
    allowedHosts: ['.ts.net'],
  },
  build: {
    chunkSizeWarningLimit: 4096,
  },
});
