import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default defineConfig(({ mode }) => {
  const repoName = String(process.env.GITHUB_REPOSITORY_NAME || '')
    .trim()
    .replace(/^\/+|\/+$/g, '');
  const base = mode === 'production' && repoName ? `/${repoName}/` : '/';

  return {
    base,
    root: path.resolve(__dirname, 'front'),
    plugins: [
      tailwindcss(),
      react(),
    ],
    build: {
      outDir: path.resolve(__dirname, 'dist'),
      emptyOutDir: true,
    },
    server: {
      host: '0.0.0.0',
      port: 3000,
    },
  };
});
