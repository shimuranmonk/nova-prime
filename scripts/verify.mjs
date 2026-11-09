import { access, readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(scriptDirectory, "..");
const dist = path.join(root, "dist");

const html = await readFile(path.join(dist, "index.html"), "utf8");
if (!html.includes('type="module" src="./src/app/bootstrap.js"')) throw new Error("Built index is missing the application module");
if (!html.includes('href="./src/styles/app.css"')) throw new Error("Built index is missing the stylesheet");
if (/https?:\/\/(?!www\.w3\.org)/i.test(html)) throw new Error("Unexpected remote runtime dependency in index.html");

await access(path.join(dist, "src", "app", "bootstrap.js"));
await access(path.join(dist, "src", "styles", "app.css"));
await access(path.join(dist, "build-meta.json"));

async function listFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(entries.map((entry) => {
    const fullPath = path.join(directory, entry.name);
    return entry.isDirectory() ? listFiles(fullPath) : [fullPath];
  }));
  return nested.flat();
}

const files = await listFiles(dist);
const sourceFiles = files.filter((file) => file.endsWith(".js"));
for (const file of sourceFiles) {
  const source = await readFile(file, "utf8");
  if (/requestDevice\s*\(/.test(source)) throw new Error(`Live Bluetooth request found in foundation build: ${file}`);
}

console.log(`Verified ${files.length} built files; live Bluetooth remains disabled.`);
