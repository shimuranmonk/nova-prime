import { access, readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const variant = process.argv[2] ?? "";
if (variant && !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(variant)) throw new Error("Invalid full physical-test output variant");
const dist = path.join(root, `dist-full-physical-test${variant ? `-${variant}` : ""}`);
const meta = JSON.parse(await readFile(path.join(dist, "build-meta.json"), "utf8"));
if (meta.physicalTestOnly !== true || meta.productionMainGateOpen !== true || meta.outputContainsLiveRobotControl !== true) throw new Error("Physical-test build metadata is not correctly isolated from the now-open production gate");
const html = await readFile(path.join(dist, "index.html"), "utf8");
if (!html.includes('type="module" src="./src/app/full-physical-test-bootstrap.js"')) throw new Error("Test build entry point is missing");
if (/https?:\/\/(?!www\.w3\.org)/i.test(html) || /(?:src|href)=["']\/(?!\/)/i.test(html)) throw new Error("Test build contains remote or root-relative runtime assets");
await access(path.join(dist, "LICENSE"));
await access(path.join(dist, "THIRD_PARTY_NOTICES.md"));
const flags = await readFile(path.join(dist, "src/app/feature-flags.js"), "utf8");
if (!/robot:\s*true/.test(flags)) throw new Error("Test package does not inherit the completed production robot gate");
const productionBootstrap = await readFile(path.join(dist, "src/app/bootstrap.js"), "utf8");
if (/application\/robot|infrastructure\/robot/.test(productionBootstrap)) throw new Error("Test package modified the production bootstrap to import the robot stack");
const visited = new Set();
async function walk(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  for (const entry of entries) {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) await walk(file);
    else if (file.endsWith(".js")) {
      visited.add(file);
      const source = await readFile(file, "utf8");
      const imports = source.matchAll(/(?:^|\n)\s*(?:import|export)\s+(?:[^"'\n]*?\sfrom\s*)?["']([^"']+)["']/g);
      for (const match of imports) {
        if (!match[1].startsWith(".")) throw new Error(`Non-relative runtime import: ${file} -> ${match[1]}`);
        await access(path.resolve(path.dirname(file), match[1]));
      }
    }
  }
}
await walk(path.join(dist, "src"));
console.log(`Verified isolated full physical-test bundle: ${visited.size} JavaScript modules, relative imports, license/notices, and unchanged production gate.`);
