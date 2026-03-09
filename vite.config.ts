import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { viteSingleFile } from "vite-plugin-singlefile";

function wasmContentTypePlugin(): Plugin {
  return {
    name: "wasm-content-type",
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (req.url?.endsWith(".wasm")) {
          res.setHeader("Content-Type", "application/wasm");
        }
        next();
      });
    },
  };
}

export default defineConfig({
  plugins: [wasmContentTypePlugin(), react(), tailwindcss(), viteSingleFile()],
  server: {
    proxy: {
      // Avoid CORS when fetching room search server list in dev (joinmatrix.org doesn't send CORS headers)
      "/joinmatrix-servers.json": {
        target: "https://servers.joinmatrix.org",
        changeOrigin: true,
        rewrite: () => "/servers.json",
      },
    },
  },
  build: {
    outDir: "docs",
    target: "esnext",
    assetsInlineLimit: 100000000,
    cssCodeSplit: false,
  },
  optimizeDeps: {
    exclude: ["@matrix-org/matrix-sdk-crypto-wasm"],
  },
});
