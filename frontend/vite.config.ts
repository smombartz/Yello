import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  // Absolute origin (no trailing slash) prepended to og:/twitter: image URLs in
  // index.html. When unset the paths stay root-relative, which is fine for dev
  // but means link scrapers won't pick up the preview image.
  const publicUrl = (loadEnv(mode, process.cwd(), '').VITE_PUBLIC_URL ?? '').replace(/\/+$/, '');

  return {
    plugins: [
      react(),
      {
        name: 'inject-public-url',
        // 'pre' so the placeholder is gone before Vite's own %ENV% pass, which
        // would leave it in the HTML verbatim when the variable is unset
        transformIndexHtml: {
          order: 'pre' as const,
          handler: (html: string) => html.replaceAll('%VITE_PUBLIC_URL%', publicUrl),
        },
      },
    ],
    server: {
      proxy: {
        '/api': 'http://localhost:3456',
        '/photos': 'http://localhost:3456',
        '/health': 'http://localhost:3456'
      }
    }
  };
});
