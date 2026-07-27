import { createReadStream, existsSync } from "node:fs";
import { extname, join } from "node:path";
import { defineConfig, type Plugin } from "vite";

const DOTNET_ENGINE_DIR = join(process.cwd(), "public/dotnet-engine");

const MIME_TYPES: Record<string, string> = {
  ".js": "text/javascript",
  ".mjs": "text/javascript",
  ".wasm": "application/wasm",
  ".json": "application/json",
};

// engine-cs's published output (public/dotnet-engine/) is loaded via a
// runtime `import()` from inside the worker so dotnet.js's `import.meta.url`
// resolves to its real served path (needed to fetch sibling .wasm/.js
// chunks) — but Vite's dev server refuses to resolve *any* `import()` of a
// file under publicDir, even at runtime with a dynamic, non-statically-
// analyzable specifier. That restriction is dev-server-only (production is
// just static files with no Vite in the loop, so `dist/dotnet-engine/`
// already works with zero help). This middleware answers those requests
// directly, before Vite's own transform pipeline sees them, so the dev
// server behaves like any other static host for this one path.
function serveDotnetEngineRaw(): Plugin {
  return {
    name: "serve-dotnet-engine-raw",
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const url = req.url ?? "";
        const marker = "/dotnet-engine/";
        const markerIndex = url.indexOf(marker);
        if (markerIndex === -1) return next();

        const relative = url.slice(markerIndex + marker.length).split("?")[0];
        const filePath = join(DOTNET_ENGINE_DIR, relative);
        if (!existsSync(filePath)) return next();

        const contentType = MIME_TYPES[extname(filePath)];
        if (contentType) res.setHeader("Content-Type", contentType);
        createReadStream(filePath).pipe(res);
      });
    },
  };
}

export default defineConfig({
  base: "/chess-ts/",
  plugins: [serveDotnetEngineRaw()],
});
