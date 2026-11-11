import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(scriptDirectory, "..");
const output = path.join(root, "dist");

if (path.basename(output) !== "dist" || !output.startsWith(`${root}${path.sep}`)) {
  throw new Error("Refusing to clean an unexpected output directory");
}

const packageJson = JSON.parse(await readFile(path.join(root, "package.json"), "utf8"));
await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });
await cp(path.join(root, "index.html"), path.join(output, "index.html"));
await cp(path.join(root, "LICENSE"), path.join(output, "LICENSE"));
await cp(path.join(root, "THIRD_PARTY_NOTICES.md"), path.join(output, "THIRD_PARTY_NOTICES.md"));
await cp(path.join(root, "src"), path.join(output, "src"), { recursive: true });
await writeFile(path.join(output, ".nojekyll"), "", "utf8");
await writeFile(
  path.join(output, "build-meta.json"),
  `${JSON.stringify({ name: packageJson.name, version: packageJson.version }, null, 2)}\n`,
  "utf8",
);

console.log(`Built ${packageJson.name} ${packageJson.version} in dist/`);
