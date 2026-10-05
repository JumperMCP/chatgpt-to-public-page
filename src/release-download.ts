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
    try {
      const response = await fetcher(new URL(path, url), {
        redirect: "manual",
        signal: AbortSignal.timeout(30000),
      });
      requireThat(
        response.ok,
        "release_download",
        "The installation files could not be loaded. Please try again shortly.",
        503,
      );
      return await readBounded(response.body, limit);
    } catch (error) {
      if (error instanceof Problem) throw error;
      throw new Problem(
        "release_download",
        "The installation files could not be loaded. Please try again shortly.",
        503,
      );
    }
  }
  const metadata = await get("release.json", 65536);
  let signed: SignedRelease;
  try {
    signed = JSON.parse(decoder.decode(metadata));
  } catch {
    throw new Problem(
      "invalid_release",
      "The installation files could not be verified. Please report this problem to Jumper MCP.",
    );
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
