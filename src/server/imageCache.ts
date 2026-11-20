import { access, mkdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";

const publicRoot = resolve(process.cwd(), "public", "images");

export async function findFandomThumbnail(itemName: string): Promise<string | null> {
  const url = new URL("https://escapefromtarkov.fandom.com/api.php");
  url.search = new URLSearchParams({
    action: "query",
    titles: itemName,
    prop: "pageimages",
    format: "json",
    pithumbsize: "500",
  }).toString();
  const response = await fetch(url, { signal: AbortSignal.timeout(20_000) });
  if (!response.ok) throw new Error(`Fandom image lookup returned HTTP ${response.status}.`);
  const payload = await response.json() as { query?: { pages?: Record<string, { thumbnail?: { source?: string } }> } };
  return Object.values(payload.query?.pages ?? {}).find((page) => page.thumbnail?.source)?.thumbnail?.source ?? null;
}

export async function cacheImage(gameMode: string, itemId: string, urls: Array<string | null | undefined>): Promise<string | null> {
  const safeId = itemId.replace(/[^a-zA-Z0-9_-]/g, "_");
  for (const url of urls) {
    if (!url) continue;
    try {
      const extension = new URL(url).pathname.split(".").pop()?.toLowerCase();
      const suffix = ["png", "jpg", "jpeg", "webp", "avif", "gif"].includes(extension ?? "") ? extension : "jpg";
      const relativePath = `${gameMode}/${safeId}.${suffix}`;
      const destination = join(publicRoot, relativePath);
      if (await access(destination).then(() => true).catch(() => false)) return `/images/${relativePath}`;
      const response = await fetch(url, { signal: AbortSignal.timeout(20_000) });
      if (!response.ok) throw new Error(`Image server returned HTTP ${response.status}.`);
      if (!(response.headers.get("content-type") ?? "").startsWith("image/")) throw new Error("Image source returned a non-image response.");
      await mkdir(join(publicRoot, gameMode), { recursive: true });
      await writeFile(destination, new Uint8Array(await response.arrayBuffer()));
      return `/images/${relativePath}`;
    } catch (error) {
      console.warn(`Image cache failed for ${url}: ${error instanceof Error ? error.message : error}`);
    }
  }
  return null;
}
