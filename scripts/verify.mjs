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
if (/(?:src|href)=["']\/(?!\/)/i.test(html)) throw new Error("Root-relative assets break mobile-server subdirectory hosting");

await access(path.join(dist, "src", "app", "bootstrap.js"));
await access(path.join(dist, "src", "styles", "app.css"));
await access(path.join(dist, "build-meta.json"));
const license = await readFile(path.join(dist, "LICENSE"), "utf8");
if (!license.includes("GNU AFFERO GENERAL PUBLIC LICENSE") || !license.includes("Version 3, 19 November 2007")) throw new Error("Release bundle is missing the AGPL v3 license text");
await access(path.join(dist, "THIRD_PARTY_NOTICES.md"));

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
const allowedTransport = path.join(dist, "src", "infrastructure", "robot", "web-bluetooth-transport.js");
for (const file of sourceFiles) {
  const source = await readFile(file, "utf8");
  if (/requestDevice\s*\(/.test(source) && path.normalize(file) !== path.normalize(allowedTransport)) {
    throw new Error(`Bluetooth device request escaped the gated transport: ${file}`);
  }
  const imports = source.matchAll(/(?:^|\n)\s*(?:import|export)\s+(?:[^"'\n]*?\sfrom\s*)?["']([^"']+)["']/g);
  for (const match of imports) {
    const specifier = match[1];
    if (!specifier.startsWith(".")) throw new Error(`Built module has a non-relative runtime import: ${file} -> ${specifier}`);
    await access(path.resolve(path.dirname(file), specifier));
  }
}
const flags = await readFile(path.join(dist, "src", "app", "feature-flags.js"), "utf8");
if (!/robot:\s*false/.test(flags)) throw new Error("Robot feature flag must remain disabled until physical verification passes");
const bootstrap = await readFile(path.join(dist, "src", "app", "bootstrap.js"), "utf8");
if (/application\/robot|infrastructure\/robot/.test(bootstrap)) throw new Error("Production bootstrap must not activate the unverified robot stack");
if (!bootstrap.includes("AGPL-3.0-or-later") || !bootstrap.includes("github.com/shimuranmonk/nova-prime")) throw new Error("Application About screen must expose source and license information");

console.log(`Verified ${files.length} built files and relative module graph; robot transport is packaged but feature-gated off.`);
