import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { Plugin } from "vite";
import { defineConfig } from "vitest/config";
import { parsePinchSettings } from "./src/input/pinchSettings.ts";

const EXAMPLES_FILE = join(dirname(fileURLToPath(import.meta.url)), "data/asl-examples.json");
const readExamples = () => (existsSync(EXAMPLES_FILE) ? readFileSync(EXAMPLES_FILE, "utf8") : "{}");

/**
 * Your recorded ASL examples live in data/asl-examples.json so they survive restarts and can be
 * committed. In dev the page reads and writes that file through this plugin; a build copies it
 * into dist/ as asl-examples.json.
 */
function aslExamples(): Plugin {
  return {
    name: "asl-examples",
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const path = (req.url ?? "").split("?")[0];
        if (req.method === "GET" && path.endsWith("/asl-examples.json")) {
          res.setHeader("content-type", "application/json");
          res.setHeader("cache-control", "no-store");
          return res.end(readExamples());
        }
        if (req.method === "POST" && path.endsWith("/__asl-examples")) {
          const chunks: Buffer[] = [];
          let size = 0;
          req.on("data", (c: Buffer) => {
            size += c.length;
            if (size <= 8_000_000) chunks.push(c);
          });
          req.on("end", () => {
            try {
              if (size > 8_000_000) throw new Error("too large");
              const body = Buffer.concat(chunks).toString("utf8");
              JSON.parse(body); // refuse anything that isn't JSON
              mkdirSync(dirname(EXAMPLES_FILE), { recursive: true });
              writeFileSync(EXAMPLES_FILE, body);
              res.end("ok");
            } catch (err) {
              res.statusCode = 400;
              res.end(String(err));
            }
          });
          return;
        }
        next();
      });
    },
    generateBundle() {
      this.emitFile({ type: "asset", fileName: "asl-examples.json", source: readExamples() });
    },
  };
}

export default defineConfig(({ command }) => {
  const configFile = join(dirname(fileURLToPath(import.meta.url)), "config/pinch.local.json");
  const pinchConfig = command === "serve" && existsSync(configFile)
    ? parsePinchSettings(JSON.parse(readFileSync(configFile, "utf8"))) : {};
  return {
  define: { __PINCH_LOCAL_CONFIG__: JSON.stringify(pinchConfig) },
  base: "./",
  plugins: [aslExamples()],
  // saving examples must not make the dev server reload the page mid-recording
  server: { watch: { ignored: ["**/data/**"] } },
  build: { chunkSizeWarningLimit: 2000 },
  test: { include: ["tests/**/*.test.ts"] },
};
});
