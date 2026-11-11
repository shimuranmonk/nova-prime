import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { createStaticServer, normalizeBasePath, resolveStaticRequest } from "../scripts/serve.mjs";

test("mobile server base paths are normalized and traversal stays outside the release bundle", () => {
  assert.equal(normalizeBasePath("nova-prime"), "/nova-prime/");
  assert.equal(normalizeBasePath("/nova-prime/"), "/nova-prime/");
  assert.equal(resolveStaticRequest("C:/release", "/nova-prime", "/nova-prime/").status, 308);
  assert.equal(resolveStaticRequest("C:/release", "/other/", "/nova-prime/").status, 404);
  assert.notEqual(resolveStaticRequest("C:/release", "/nova-prime/%2e%2e/secret", "/nova-prime/").status, 200);
});

test("device-local subdirectory hosting serves modules and metadata with safe MIME types", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "nova-prime-server-"));
  const source = path.join(root, "src", "app");
  await mkdir(source, { recursive: true });
  await writeFile(path.join(root, "index.html"), '<script type="module" src="./src/app/bootstrap.js"></script>', "utf8");
  await writeFile(path.join(source, "bootstrap.js"), "export const ready = true;", "utf8");
  await writeFile(path.join(root, "build-meta.json"), '{"name":"nova-prime"}', "utf8");
  const server = createStaticServer({ root, basePath: "/apps/nova-prime/" });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  try {
    const { port } = server.address();
    const base = `http://127.0.0.1:${port}/apps/nova-prime/`;
    const html = await fetch(base);
    assert.equal(html.status, 200);
    assert.match(html.headers.get("content-type"), /^text\/html/);
    const moduleResponse = await fetch(new URL("./src/app/bootstrap.js", base));
    assert.equal(moduleResponse.status, 200);
    assert.match(moduleResponse.headers.get("content-type"), /^text\/javascript/);
    assert.equal(moduleResponse.headers.get("x-content-type-options"), "nosniff");
    const metadata = await fetch(new URL("./build-meta.json", base));
    assert.match(metadata.headers.get("content-type"), /^application\/json/);
    assert.equal((await fetch(`http://127.0.0.1:${port}/`)).status, 404);
  } finally {
    await new Promise((resolve) => server.close(resolve));
    await rm(root, { recursive: true, force: true });
  }
});
