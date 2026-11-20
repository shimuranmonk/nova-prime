import { access, readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(scriptDirectory, "..");
const distName = process.argv[2] ?? "dist";
if (!/^(?:dist|dist-[a-z0-9]+(?:-[a-z0-9]+)*)$/.test(distName)) throw new Error("Invalid build directory name");
const dist = path.join(root, distName);

const html = await readFile(path.join(dist, "index.html"), "utf8");
const buildMeta = JSON.parse(await readFile(path.join(dist, "build-meta.json"), "utf8"));
if (!html.includes(`<meta name="nova-prime-version" content="${buildMeta.version}">`)) throw new Error("Visible application version does not match the package version");
if (!html.includes('type="module" src="./src/app/bootstrap.js"')) throw new Error("Built index is missing the application module");
if (!html.includes('href="./src/styles/app.css"')) throw new Error("Built index is missing the stylesheet");
if (/https?:\/\/(?!www\.w3\.org)/i.test(html)) throw new Error("Unexpected remote runtime dependency in index.html");
if (/(?:src|href)=["']\/(?!\/)/i.test(html)) throw new Error("Root-relative assets break mobile-server subdirectory hosting");

await access(path.join(dist, "src", "app", "bootstrap.js"));
await access(path.join(dist, "src", "styles", "app.css"));
for (const icon of ["robot-connect.svg", "robot-disconnect.svg"]) {
  const svg = await readFile(path.join(dist, "src", "assets", "icons", icon), "utf8");
  if (!svg.includes('xmlns="http://www.w3.org/2000/svg"')) throw new Error(`Invalid packaged icon: ${icon}`);
}
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
if (!/robot:\s*true/.test(flags)) throw new Error("Production robot feature flag must be enabled after physical verification passes");
const bootstrap = await readFile(path.join(dist, "src", "app", "bootstrap.js"), "utf8");
if (!bootstrap.includes("live-robot-runtime.js") || !bootstrap.includes("FEATURE_FLAGS.robot")) throw new Error("Production bootstrap must mount the reviewed live robot runtime");
const gateRecord = await readFile(path.join(root, "docs", "PHYSICAL_TEST_RUN.md"), "utf8");
if (!gateRecord.includes("LIVE TRAINING BETA — Calibration and MSYNC PENDING")) throw new Error("Production release requires an explicit physical gate pass record");
await access(path.join(dist, "src", "app", "live-robot-runtime.js"));
await access(path.join(dist, "src", "styles", "live-robot-controls.css"));
if (!bootstrap.includes("AGPL-3.0-or-later") || !bootstrap.includes("github.com/shimuranmonk/nova-prime")) throw new Error("Application About screen must expose source and license information");

console.log(`Verified ${files.length} built files and relative module graph; production live robot controls are enabled for authorized beta testing; Calibration and MSYNC pending.`);
