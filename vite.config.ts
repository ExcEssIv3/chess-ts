import { createReadStream, existsSync } from "node:fs";
import { extname, join } from "node:path";
import { defineConfig, type Plugin } from "vite";

const PUBLIC_DIR = join(process.cwd(), "public");

const MIME_TYPES: Record<string, string> = {
  ".js": "text/javascript",
  ".mjs": "text/javascript",
  ".wasm": "application/wasm",
  ".json": "application/json",
};

// engine-cs's published output (public/dotnet-engine/, and the Engine
// Competition feature's second build at public/dotnet-engine-compare/, see
// scripts/build-compare-engine.ts) is loaded via a runtime `import()` from
// inside a worker so dotnet.js's `import.meta.url` resolves to its real
// served path (needed to fetch sibling .wasm/.js chunks) — but Vite's dev
// server refuses to resolve *any* `import()` of a file under publicDir, even
// at runtime with a dynamic, non-statically-analyzable specifier. That
// restriction is dev-server-only (production is just static files with no
// Vite in the loop, so `dist/dotnet-engine*/` already works with zero help).
// This middleware answers those requests directly, before Vite's own
// transform pipeline sees them, so the dev server behaves like any other
// static host for these paths.
function serveDotnetEngineRaw(): Plugin {
  return {
    name: "serve-dotnet-engine-raw",
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const url = req.url ?? "";
        const match = url.match(/\/dotnet-engine(-[\w-]+)?\//);
        if (!match) return next();

        const relative = url.slice(match.index! + match[0].length).split("?")[0];
        const filePath = join(PUBLIC_DIR, `dotnet-engine${match[1] ?? ""}`, relative);
        if (!existsSync(filePath)) return next();

        const contentType = MIME_TYPES[extname(filePath)];
        if (contentType) res.setHeader("Content-Type", contentType);
        // Without this, browsers are free to cache these dev-server-served
        // files indefinitely across engine rebuilds — stale WASM with a
        // changed [JSExport] signature (e.g. FindBestMove gaining a
        // parameter) then gets called with the new JS call shape, producing
        // confusing marshalling errors that look nothing like "stale cache".
        res.setHeader("Cache-Control", "no-store");
        createReadStream(filePath).pipe(res);
      });
    },
  };
}

export default defineConfig({
  base: "/chess-ts/",
  plugins: [serveDotnetEngineRaw()],
  build: {
    rollupOptions: {
      input: {
        main: join(process.cwd(), "index.html"),
        competition: join(process.cwd(), "competition.html"),
      },
    },
  },
});
