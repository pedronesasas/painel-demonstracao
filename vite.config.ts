// @lovable.dev/vite-tanstack-config já inclui tanstackStart, viteReact, tailwindcss,
// tsConfigPaths, nitro (só no build), o atalho "@/" e a deduplicação de React.
// Não adicione esses plugins de novo aqui.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";

export default defineConfig({
  // O build sai no formato da Vercel (.vercel/output).
  nitro: { preset: "vercel" },
  tanstackStart: {
    // O servidor parte de src/server.ts, que embrulha os erros de SSR.
    server: { entry: "server" },
  },
});
