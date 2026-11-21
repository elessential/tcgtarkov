import { spawn } from "node:child_process";
import { access, copyFile, mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(fileURLToPath(import.meta.url));
const appData = join(process.env.LOCALAPPDATA || process.env.APPDATA || root, "TarkovTCG");
const database = join(appData, "dev.db");
const databaseUrl = `file:${database.replace(/\\/g, "/")}`;
const port = process.env.PORT || "3000";
const url = `http://127.0.0.1:${port}`;

await mkdir(appData, { recursive: true });
try {
  await access(database);
} catch (error) {
  if (error instanceof Error && "code" in error && error.code !== "ENOENT") throw error;
  await copyFile(join(root, "prisma", "dev.db"), database);
}

const server = spawn(process.execPath, [join(root, "dist-server", "server", "index.js")], {
  cwd: root,
  env: { ...process.env, DATABASE_URL: databaseUrl, HOST: "127.0.0.1", PORT: port },
  stdio: "inherit",
});

const sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));
let ready = false;
for (let attempt = 0; attempt < 120; attempt += 1) {
  if (server.exitCode !== null) throw new Error("The app server stopped before it was ready. See the error above.");
  try {
    const response = await fetch(`${url}/api/health`, { signal: AbortSignal.timeout(1000) });
    if (response.ok) {
      await sleep(250);
      if (server.exitCode !== null) throw new Error("The app server stopped before it was ready. See the error above.");
      ready = true;
      break;
    }
  } catch (error) {
    if (error instanceof Error && error.message.includes("stopped before it was ready")) throw error;
  }
  await sleep(500);
}

if (!ready) {
  server.kill();
  throw new Error(`The app did not start at ${url} within one minute.`);
}

console.log(`Tarkov TCG is running at ${url}`);
spawn("rundll32.exe", ["url.dll,FileProtocolHandler", url], { detached: true, stdio: "ignore" }).unref();

const exitCode = await new Promise((resolve, reject) => {
  server.once("error", reject);
  server.once("exit", (code) => resolve(code ?? 0));
});
process.exitCode = exitCode;
