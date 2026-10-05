import { readBounded } from "./files";
import { verifyRelease, type SignedRelease } from "./releases";
import { Problem, decoder, requireThat } from "./types";
export async function downloadRelease(
  base: string,
  publicKey: string,
  fetcher: typeof fetch = fetch,
) {
  const url = new URL(base);
  requireThat(
    url.protocol === "https:" &&
      !url.username &&
      !url.password &&
      !url.search &&
      !url.hash,
    "release_source",
    "Configure a trusted HTTPS release directory.",
  );
  if (!url.pathname.endsWith("/")) url.pathname += "/";
  async function get(path: string, limit: number) {
    const response = await fetcher(new URL(path, url), {
      redirect: "error",
      signal: AbortSignal.timeout(30000),
    });
    requireThat(
      response.ok,
      "release_download",
      "The release could not be downloaded.",
      503,
    );
    return readBounded(response.body, limit);
  }
  let signed: SignedRelease;
  try {
    signed = JSON.parse(decoder.decode(await get("release.json", 65536)));
  } catch (error) {
    if (error instanceof Problem) throw error;
    throw new Problem("invalid_release", "Release metadata is invalid.");
  }
  requireThat(
    Array.isArray(signed.manifest?.modules) &&
      signed.manifest.modules.length <= 20,
    "invalid_release",
    "Invalid module list.",
  );
  const modules = new Map<string, Uint8Array>();
  let total = 0;
  for (const entry of signed.manifest.modules) {
    requireThat(
      /^[\w.-]+\.(js|mjs|wasm)$/.test(entry.name),
      "invalid_release",
      "Invalid module path.",
    );
    const bytes = await get(entry.name, 10 * 1024 * 1024 - total);
    total += bytes.length;
    modules.set(entry.name, bytes);
  }
  await verifyRelease(signed, modules, publicKey);
  return { signed, modules };
}
