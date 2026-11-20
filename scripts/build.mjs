import { access, cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(scriptDirectory, "..");
const outputName = process.argv[2] ?? "dist";
if (!/^(?:dist|dist-[a-z0-9]+(?:-[a-z0-9]+)*)$/.test(outputName)) throw new Error("Invalid output directory name");
const output = path.join(root, outputName);

if (path.basename(output) !== outputName || !output.startsWith(`${root}${path.sep}`)) {
  throw new Error("Refusing to clean an unexpected output directory");
}

const packageJson = JSON.parse(await readFile(path.join(root, "package.json"), "utf8"));
if (outputName === "dist") await rm(output, { recursive: true, force: true });
else {
  try { await access(output); throw new Error(`Dedicated output ${outputName} already exists; inspect it before rebuilding`); }
  catch (error) { if (error?.code !== "ENOENT") throw error; }
}
await mkdir(output, { recursive: true });
const indexHtml = (await readFile(path.join(root, "index.html"), "utf8"))
  .replace('<meta name="nova-prime-version" content="development">', `<meta name="nova-prime-version" content="${packageJson.version}">`);
if (!indexHtml.includes(`<meta name="nova-prime-version" content="${packageJson.version}">`)) {
  throw new Error("Application version marker is missing from index.html");
}
await writeFile(path.join(output, "index.html"), indexHtml, "utf8");
await cp(path.join(root, "LICENSE"), path.join(output, "LICENSE"));
await cp(path.join(root, "THIRD_PARTY_NOTICES.md"), path.join(output, "THIRD_PARTY_NOTICES.md"));
await cp(path.join(root, "src"), path.join(output, "src"), { recursive: true });
await writeFile(path.join(output, ".nojekyll"), "", "utf8");
await writeFile(
  path.join(output, "build-meta.json"),
  `${JSON.stringify({ name: packageJson.name, version: packageJson.version, distribution: "production", physicalReleaseGate: "beta-calibration-msync-pending" }, null, 2)}\n`,
  "utf8",
);

console.log(`Built ${packageJson.name} ${packageJson.version} in ${outputName}/`);
