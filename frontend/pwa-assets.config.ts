import { defineConfig, minimal2023Preset } from '@vite-pwa/assets-generator/config';

// Gera os ícones do PWA a partir de public/icone.svg:  npm run icones
export default defineConfig({
  preset: {
    ...minimal2023Preset,
    maskable: { ...minimal2023Preset.maskable, resizeOptions: { background: '#0e7490' } },
    apple: { ...minimal2023Preset.apple, resizeOptions: { background: '#0e7490' } },
  },
  images: ['public/icone.svg'],
});
