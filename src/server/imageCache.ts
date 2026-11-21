import { access, mkdir, readdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";

const publicRoot = resolve(process.cwd(), "public", "images");
const browserUserAgent = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

function imageExtension(data: Uint8Array): string | null {
  const text = (start: number, length: number) => String.fromCharCode(...data.slice(start, start + length));
  if (data.length >= 8 && text(0, 8) === "\x89PNG\r\n\x1a\n") return "png";
  if (data.length >= 3 && data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff) return "jpg";
  if (data.length >= 6 && ["GIF87a", "GIF89a"].includes(text(0, 6))) return "gif";
  if (data.length >= 12 && text(0, 4) === "RIFF" && text(8, 4) === "WEBP") return "webp";
  if (data.length >= 12 && text(4, 4) === "ftyp" && ["avif", "avis"].includes(text(8, 4))) return "avif";
  return null;
}

export async function findCachedImage(gameMode: string, itemId: string): Promise<string | null> {
  const safeId = itemId.replace(/[^a-zA-Z0-9_-]/g, "_");
  const directory = join(publicRoot, gameMode);
  let files: string[];
  try {
    files = await readdir(directory);
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") return null;
    throw error;
  }
  const file = files.find((name) => {
    if (!name.startsWith(`${safeId}.`)) return false;
    return ["png", "jpg", "jpeg", "webp", "avif", "gif"].includes(name.slice(name.lastIndexOf(".") + 1).toLowerCase());
  });
  return file ? `/images/${gameMode}/${file}` : null;
}

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
  const cachedImage = await findCachedImage(gameMode, itemId);
  if (cachedImage) return cachedImage;
  for (const url of urls) {
    if (!url) continue;
    try {
      const source = new URL(url);
      const headers: Record<string, string> = { "User-Agent": browserUserAgent };
      if (source.hostname.endsWith("wikia.nocookie.net") || source.hostname.endsWith("fandom.com")) {
        headers.Referer = "https://escapefromtarkov.fandom.com/";
      }
      const response = await fetch(url, { headers, signal: AbortSignal.timeout(20_000) });
      if (!response.ok) throw new Error(`Image server returned HTTP ${response.status}.`);
      const data = new Uint8Array(await response.arrayBuffer());
      const suffix = imageExtension(data);
      if (!suffix) throw new Error("Image source returned a non-image response.");
      const relativePath = `${gameMode}/${safeId}.${suffix}`;
      const destination = join(publicRoot, relativePath);
      if (await access(destination).then(() => true).catch(() => false)) return `/images/${relativePath}`;
      await mkdir(join(publicRoot, gameMode), { recursive: true });
      await writeFile(destination, data);
      return `/images/${relativePath}`;
    } catch (error) {
      console.warn(`Image cache failed for ${url}: ${error instanceof Error ? error.message : error}`);
    }
  }
  return null;
}
