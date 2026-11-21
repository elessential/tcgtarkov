import { execFileSync } from "node:child_process";
import { cp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

if (process.platform !== "win32") {
  throw new Error("The Windows portable package must be built on Windows.");
}

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const releaseRoot = join(root, "release");
const appRoot = join(releaseRoot, "TarkovTCG-Portable");
const zipPath = join(releaseRoot, "TarkovTCG-Portable.zip");
const databasePath = join(appRoot, "prisma", "dev.db");
const databaseUrl = `file:${databasePath.replace(/\\/g, "/")}`;
const packageJson = JSON.parse(await readFile(join(root, "package.json"), "utf8"));
const runtimePackageJson = {
  name: packageJson.name,
  version: packageJson.version,
  private: true,
  type: "module",
};
const installPackageJson = {
  ...runtimePackageJson,
  dependencies: packageJson.dependencies,
};
const testDirectoryNames = new Set(["test", "tests", "__tests__", "fixtures", "__fixtures__"]);

function run(command, args, options = {}) {
  const commandPath = command.toLowerCase().endsWith(".cmd")
    ? "powershell.exe"
    : command;
  const commandArgs = command.toLowerCase().endsWith(".cmd")
    ? ["-NoProfile", "-Command", `& ${quotePowerShell(command)} ${args.map(quotePowerShell).join(" ")}`]
    : args;
  execFileSync(commandPath, commandArgs, { stdio: "inherit", windowsHide: true, ...options });
}

function quotePowerShell(value) {
  return `'${value.replace(/'/g, "''")}'`;
}

async function removeTestDirectories(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const path = join(directory, entry.name);
    if (testDirectoryNames.has(entry.name.toLowerCase())) {
      await rm(path, { recursive: true, force: true });
    } else {
      await removeTestDirectories(path);
    }
  }
}

await mkdir(releaseRoot, { recursive: true });
await rm(appRoot, { recursive: true, force: true });
await rm(zipPath, { force: true });
await mkdir(join(appRoot, "prisma"), { recursive: true });
await mkdir(join(appRoot, "public", "images"), { recursive: true });

await cp(join(root, "dist"), join(appRoot, "dist"), { recursive: true });
await rm(join(appRoot, "dist", "images"), { recursive: true, force: true });
await cp(join(root, "dist-server"), join(appRoot, "dist-server"), { recursive: true });
await cp(join(root, "prisma", "schema.prisma"), join(appRoot, "prisma", "schema.prisma"));
await cp(process.execPath, join(appRoot, "node.exe"));
await cp(join(root, "scripts", "portable-launcher.mjs"), join(appRoot, "launcher.mjs"));
await cp(join(root, "scripts", "Start-Tarkov-TCG.cmd"), join(appRoot, "Start-Tarkov-TCG.cmd"));
await writeFile(join(appRoot, "package.json"), `${JSON.stringify(installPackageJson, null, 2)}\n`, "utf8");
await cp(join(root, "package-lock.json"), join(appRoot, "package-lock.json"));

run(join(root, "node_modules", ".bin", "tsx.cmd"), [join(root, "scripts", "cache-collectible-artwork.ts")], {
  cwd: appRoot,
});
run("npm.cmd", ["install", "--package-lock-only", "--omit=dev", "--ignore-scripts", "--legacy-peer-deps", "--no-audit", "--no-fund"], { cwd: appRoot });
run("npm.cmd", ["ci", "--omit=dev", "--ignore-scripts", "--legacy-peer-deps", "--no-audit", "--no-fund"], { cwd: appRoot });
await mkdir(join(appRoot, "node_modules", ".prisma"), { recursive: true });
await cp(join(root, "node_modules", ".prisma", "client"), join(appRoot, "node_modules", ".prisma", "client"), { recursive: true });
await removeTestDirectories(join(appRoot, "node_modules"));

const buildEnv = { ...process.env, DATABASE_URL: databaseUrl };
const prismaCli = join(root, "node_modules", ".bin", "prisma.cmd");
run(prismaCli, ["db", "push", "--schema", join(appRoot, "prisma", "schema.prisma"), "--skip-generate"], {
  cwd: appRoot,
  env: buildEnv,
});
run(join(root, "node_modules", ".bin", "tsx.cmd"), [join(root, "src", "server", "seed.ts")], {
  cwd: appRoot,
  env: { ...buildEnv, TARKOV_SKIP_IMAGE_CACHE: "true" },
});
await rm(join(appRoot, "reports"), { recursive: true, force: true });
await rm(join(appRoot, "package-lock.json"), { force: true });
await writeFile(join(appRoot, "package.json"), `${JSON.stringify(runtimePackageJson, null, 2)}\n`, "utf8");

const powerShellCommand = [
  "$ErrorActionPreference = 'Stop'",
  `Compress-Archive -Path ${quotePowerShell(join(appRoot, "*"))} -DestinationPath ${quotePowerShell(zipPath)} -Force`,
].join("; ");
run("powershell.exe", ["-NoProfile", "-Command", powerShellCommand]);

console.log(`Portable Windows package created: ${zipPath}`);
