import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { createServer } from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

const defaultRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "dist");

export const CONTENT_TYPES = Object.freeze({
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".mp3": "audio/mpeg",
  ".svg": "image/svg+xml",
  ".wav": "audio/wav",
});

export function normalizeBasePath(value = "/") {
  const input = String(value || "/").replace(/\\/g, "/");
  const segments = input.split("/").filter(Boolean);
  if (segments.some((segment) => segment === "." || segment === "..")) throw new Error("NOVA_SERVER_BASE_PATH_INVALID");
  return segments.length ? `/${segments.join("/")}/` : "/";
}

export function resolveStaticRequest(root, requestUrl, basePath = "/") {
  const base = normalizeBasePath(basePath);
  const pathname = decodeURIComponent(new URL(requestUrl, "http://127.0.0.1").pathname);
  if (base !== "/" && pathname === base.slice(0, -1)) return Object.freeze({ status: 308, location: base });
  if (!pathname.startsWith(base)) return Object.freeze({ status: 404 });
  const relativePath = pathname.slice(base.length).replace(/^\/+/, "");
  const requested = relativePath || "index.html";
  const resolvedRoot = path.resolve(root);
  const file = path.resolve(resolvedRoot, requested);
  if (file !== resolvedRoot && !file.startsWith(`${resolvedRoot}${path.sep}`)) return Object.freeze({ status: 403 });
  return Object.freeze({ status: 200, file, contentType: CONTENT_TYPES[path.extname(file).toLowerCase()] ?? "application/octet-stream" });
}

export function createStaticServer({ root = defaultRoot, basePath = "/" } = {}) {
  const normalizedBase = normalizeBasePath(basePath);
  return createServer(async (request, response) => {
    let resolved;
    try {
      resolved = resolveStaticRequest(root, request.url, normalizedBase);
    } catch {
      response.writeHead(400, { "Content-Type": "text/plain; charset=utf-8" }).end("Bad request");
      return;
    }
    if (resolved.status === 308) {
      response.writeHead(308, { Location: resolved.location }).end();
      return;
    }
    if (resolved.status !== 200) {
      response.writeHead(resolved.status, { "Content-Type": "text/plain; charset=utf-8" }).end(resolved.status === 403 ? "Forbidden" : "Not found");
      return;
    }
    try {
      const details = await stat(resolved.file);
      if (!details.isFile()) throw new Error("Not a file");
      response.writeHead(200, { "Content-Type": resolved.contentType, "X-Content-Type-Options": "nosniff" });
      createReadStream(resolved.file).pipe(response);
    } catch {
      response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" }).end("Not found");
    }
  });
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : "";
if (invokedPath === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.NOVA_PREVIEW_PORT ?? 4173);
  const basePath = normalizeBasePath(process.env.NOVA_PREVIEW_BASE_PATH ?? "/");
  createStaticServer({ basePath }).listen(port, "127.0.0.1", () => {
    console.log(`Nova Prime preview: http://127.0.0.1:${port}${basePath}`);
  });
}
