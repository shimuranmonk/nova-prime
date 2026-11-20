import { access, cp, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(scriptDirectory, "..");
const variant = process.argv[2] ?? "";
if (variant && !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(variant)) throw new Error("Invalid full physical-test output variant");
const outputName = `dist-full-physical-test${variant ? `-${variant}` : ""}`;
const output = path.join(root, outputName);
if (path.basename(output) !== outputName || !output.startsWith(`${root}${path.sep}`)) throw new Error("Unsafe full physical-test output path");
try { await access(output); throw new Error("Dedicated full physical-test output already exists; inspect it before rebuilding"); }
catch (error) { if (error?.code !== "ENOENT") throw error; }

const pkg = JSON.parse(await readFile(path.join(root, "package.json"), "utf8"));
await mkdir(output, { recursive: true });
await cp(path.join(root, "src"), path.join(output, "src"), { recursive: true });
await cp(path.join(root, "LICENSE"), path.join(output, "LICENSE"));
await cp(path.join(root, "THIRD_PARTY_NOTICES.md"), path.join(output, "THIRD_PARTY_NOTICES.md"));
const html = (await readFile(path.join(root, "index.html"), "utf8"))
  .replace('type="module" src="./src/app/bootstrap.js"', 'type="module" src="./src/app/full-physical-test-bootstrap.js"')
  .replace('<link rel="stylesheet" href="./src/styles/live-robot-controls.css">', '<link rel="stylesheet" href="./src/styles/live-robot-controls.css">');
if (html === (await readFile(path.join(root, "index.html"), "utf8"))) throw new Error("Could not set the isolated test entry point");
await writeFile(path.join(output, "index.html"), html, "utf8");
await writeFile(path.join(output, ".nojekyll"), "", "utf8");
await writeFile(path.join(output, "build-meta.json"), `${JSON.stringify({
  name: pkg.name,
  version: pkg.version,
  distribution: "full-physical-test-only",
  physicalTestOnly: true,
  productionMainGateOpen: true,
  outputVariant: variant || "standard",
  liveModes: ["reps", "time", "music", "msync"],
  outputContainsLiveRobotControl: true,
}, null, 2)}\n`, "utf8");
console.log(`Built isolated full physical-test app ${pkg.version} in ${outputName}/`);
