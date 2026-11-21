/// <reference types="vitest" />
import fs from 'node:fs';
import react from '@vitejs/plugin-react';
import { defineConfig, loadEnv } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  // O app chama /api na MESMA origem; o Vite repassa para o backend (dev e preview).
  // Assim, no celular, basta um endereço (e um certificado) para o app e a API.
  const proxy = { '/api': { target: env.API_PROXY_TARGET || 'http://localhost:3000', changeOrigin: true } };

  // HTTPS opcional para testar no celular pela rede local (veja o README):
  // coloque os arquivos gerados pelo mkcert em frontend/certs/.
  const temCertificado = fs.existsSync('certs/cert.pem') && fs.existsSync('certs/key.pem');
  const https = temCertificado
    ? { cert: fs.readFileSync('certs/cert.pem'), key: fs.readFileSync('certs/key.pem') }
    : undefined;

  return {
    plugins: [
      react(),
      VitePWA({
        registerType: 'autoUpdate',
        includeAssets: ['favicon.ico', 'apple-touch-icon-180x180.png', 'icone.svg'],
        manifest: {
          name: 'Fechadura Inteligente',
          short_name: 'Fechadura',
          description: 'Controle e histórico da fechadura inteligente (Arduino Uno R4 WiFi).',
          lang: 'pt-BR',
          start_url: '/',
          scope: '/',
          display: 'standalone',
          orientation: 'portrait',
          theme_color: '#0e7490',
          background_color: '#f3f6f8',
          icons: [
            { src: 'pwa-64x64.png', sizes: '64x64', type: 'image/png' },
            { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
            { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
            { src: 'maskable-icon-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
          ],
        },
        workbox: {
          // Cache só do "casco" do app (HTML, JS, CSS, ícones). A API vai sempre pela rede.
          globPatterns: ['**/*.{js,css,html,ico,png,svg}'],
          navigateFallback: '/index.html',
          navigateFallbackDenylist: [/^\/api\//],
          runtimeCaching: [{ urlPattern: ({ url }) => url.pathname.startsWith('/api/'), handler: 'NetworkOnly' }],
        },
      }),
    ],
    server: { port: 5173, host: true, proxy, https, allowedHosts: true },
    preview: { port: 4173, host: true, proxy, https, allowedHosts: true },
    test: {
      environment: 'jsdom',
      globals: true,
      setupFiles: ['./src/test/setup.ts'],
      css: false,
    },
  };
});
