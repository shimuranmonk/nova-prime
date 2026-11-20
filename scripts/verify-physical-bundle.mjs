import { access, readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const variant = process.argv[2] ?? "";
if (variant && !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(variant)) throw new Error("Invalid physical-test build variant");
const distName = `dist-physical-test${variant ? `-${variant}` : ""}`;
const dist = path.join(root, distName);
if (path.basename(dist) !== distName || !dist.startsWith(`${root}${path.sep}`)) throw new Error("Refusing to verify outside the dedicated physical-test output directory");
const html = await readFile(path.join(dist, "index.html"), "utf8");
if (!html.includes('type="module" src="./src/app/physical-test-bootstrap.js"')) throw new Error("Physical-test entry point is missing");
if (!html.includes('href="./physical-test.css"')) throw new Error("Physical-test stylesheet is missing");
if (!html.includes("Connect to Nova S Pro") || !html.includes("Send one test ball") || !html.includes("STOP ROBOT")) throw new Error("Physical-test controls are incomplete");
for (const forbidden of ["src/app/bootstrap.js", "src/app/feature-flags.js"]) {
  const target = path.join(dist, forbidden);
  try { await access(target); throw new Error(`Production application leaked into physical-test build: ${forbidden}`); }
  catch (error) { if (error?.code !== "ENOENT") throw error; }
}
const meta = JSON.parse(await readFile(path.join(dist, "build-meta.json"), "utf8"));
if (meta.physicalTestOnly !== true || meta.distribution !== "physical-test-only") throw new Error("Build is not marked as test-only");
const bootstrap = await readFile(path.join(dist, "src/app/physical-test-bootstrap.js"), "utf8");
for (const required of ["NovaRobotConnection", "RobotExecutor", "RobotSafetyMonitor", "encodeDrillPacket", "repetitions: 1", "stop({ force: true })"]) {
  if (!bootstrap.includes(required)) throw new Error(`Physical-test safety feature missing: ${required}`);
}
if (/audioPlayer|msync|voiceController|localStorage|indexedDB/i.test(bootstrap)) throw new Error("Unsupported production capability leaked into the one-ball test entry point");

const forbiddenFiles = new Set(["src/app/bootstrap.js", "src/app/feature-flags.js"]);
async function filesUnder(directory, prefix = "") {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(entries.map(async (entry) => {
    const relative = path.posix.join(prefix, entry.name);
    return entry.isDirectory() ? filesUnder(path.join(directory, entry.name), relative) : [relative];
  }));
  return nested.flat();
}
const files = await filesUnder(dist);
if (files.some((file) => forbiddenFiles.has(file))) throw new Error("Production bootstrap or feature flags leaked into the physical-test build");
const license = await readFile(path.join(dist, "LICENSE"), "utf8");
if (!license.includes("GNU AFFERO GENERAL PUBLIC LICENSE")) throw new Error("Physical-test bundle is missing AGPL license text");
await access(path.join(dist, "THIRD_PARTY_NOTICES.md"));
for (const file of files.filter((item) => item.endsWith(".js"))) {
  const source = await readFile(path.join(dist, file), "utf8");
  const imports = source.matchAll(/(?:^|\n)\s*(?:import|export)\s+(?:[^"'\n]*?\sfrom\s*)?["']([^"']+)["']/g);
  for (const match of imports) {
    if (!match[1].startsWith(".")) throw new Error(`External runtime dependency in ${file}: ${match[1]}`);
    await access(path.resolve(path.dirname(path.join(dist, file)), match[1]));
  }
}
console.log(`Verified isolated physical-test bundle (${files.length} files); no production app entry or live-control flag included.`);
