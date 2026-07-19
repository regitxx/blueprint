import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

// vite.config can't see .env through process.env, so load it explicitly with loadEnv.
// In Google AI Studio, process.env.API_KEY is injected automatically at deploy time.
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  return {
    plugins: [react()],
    define: {
      'process.env.API_KEY': JSON.stringify(env.GEMINI_API_KEY ?? env.API_KEY ?? ''),
    },
  };
});
