import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const dashboardRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const sourcePath = resolve(dashboardRoot, "app", "release-manifest.json");
const publicPath = resolve(dashboardRoot, "public", "release.json");
const manifest = JSON.parse(await readFile(sourcePath, "utf8"));
const currentRelease = manifest.releases?.find((release) => release.version === manifest.currentVersion);

if (!currentRelease || currentRelease.status !== manifest.status) {
  throw new Error("Le manifeste FyxBot ne contient pas une version courante cohérente.");
}

await mkdir(dirname(publicPath), { recursive: true });
await writeFile(publicPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
console.log(`[FyxBot] release.json synchronisé sur la version ${manifest.currentVersion}.`);
