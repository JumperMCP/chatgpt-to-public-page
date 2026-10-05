import { Unzip, UnzipInflate } from "fflate";
import {
  LIMITS,
  Problem,
  decoder,
  encoder,
  requireThat,
  type Settings,
} from "./types";

export function safePath(input: string): string {
  requireThat(
    input !== ".assetsignore",
    "unsupported_config",
    "Remove unwanted files before upload; .assetsignore is not supported.",
  );
  requireThat(
    input.length > 0 &&
      input.length <= 240 &&
      !/[\\\x00-\x1f\x7f?#%:]/.test(input) &&
      !input.startsWith("/"),
    "unsafe_path",
    "Use relative, unencoded file paths without traversal.",
  );
  const parts = input.normalize("NFC").split("/");
  requireThat(
    parts.every(
      (p) =>
        p &&
        p !== "." &&
        p !== ".." &&
        !["__proto__", "prototype", "constructor"].includes(p),
    ),
    "unsafe_path",
    "Empty or traversal path segments are not allowed.",
  );
  requireThat(
    !parts.some((p) => p.startsWith(".") || p === "node_modules") &&
      !/(^|\/)(_worker\.js|package(-lock)?\.json|yarn\.lock|pnpm-lock\.yaml|wrangler\.[^/]+)$|\.(php|py|rb|sh|tsx?|jsx|vue|svelte)$/i.test(
        input,
      ),
    "unsupported_project",
    "Upload compiled static output, without dotfiles, build inputs, or server code.",
  );
  return parts.join("/");
}
export function contentType(path: string) {
  const extension = path.split(".").pop()?.toLowerCase() ?? "";
  return (
    (
      {
        html: "text/html; charset=utf-8",
        css: "text/css; charset=utf-8",
        js: "text/javascript; charset=utf-8",
        json: "application/json",
        svg: "image/svg+xml",
        png: "image/png",
        jpg: "image/jpeg",
        jpeg: "image/jpeg",
        gif: "image/gif",
        webp: "image/webp",
        ico: "image/x-icon",
        woff: "font/woff",
        woff2: "font/woff2",
        txt: "text/plain; charset=utf-8",
        xml: "application/xml",
        pdf: "application/pdf",
        wasm: "application/wasm",
      } as Record<string, string>
    )[extension] ?? "application/octet-stream"
  );
}
export function isText(type: string) {
  return type.startsWith("text/") || /json|xml|svg/.test(type);
}
export function warningsFor(path: string, before: string, after: string) {
  const result: string[] = [];
  const marker =
    /(?:rest|remaining|existing|other)\s+(?:of\s+)?(?:the\s+)?(?:code|content|styles?|markup)?\s*(?:is\s+)?(?:unchanged|omitted)|\.\.\.\s*(?:same|unchanged)|TODO:\s*(?:insert|restore)/gi;
  if ((after.match(marker)?.length ?? 0) > (before.match(marker)?.length ?? 0))
    result.push(`${path}: a new possible elision marker needs review.`);
  if (before.length > 1000 && after.length < before.length * 0.5)
    result.push(
      `${path}: file shrank by more than half; confirm this rewrite is intentional.`,
    );
  return result;
}
export function servingSettings(
  files: Record<string, unknown>,
  read: (path: string) => string,
  spa?: boolean,
  previous?: Settings,
): Settings {
  requireThat(
    !files[".assetsignore"],
    "unsupported_config",
    "Remove unwanted files before upload; .assetsignore is not supported.",
  );
  const settings: Settings = {
    not_found_handling:
      spa === true
        ? "single-page-application"
        : spa === false
          ? files["404.html"]
            ? "404-page"
            : "none"
          : previous?.not_found_handling === "single-page-application"
            ? "single-page-application"
            : files["404.html"]
              ? "404-page"
              : "none",
  };
  for (const name of ["_headers", "_redirects"] as const) {
    if (!files[name]) continue;
    const text = read(name);
    requireThat(
      encoder.encode(text).length <= 16000,
      "invalid_config",
      `${name} is too large.`,
    );
    const lines = text
      .split(/\r?\n/)
      .filter((l) => l.trim() && !l.trim().startsWith("#"));
    if (name === "_headers") {
      let block = false;
      for (const line of lines) {
        if (!/^\s/.test(line)) {
          requireThat(
            /^\/[^\s]*$/.test(line),
            "invalid_config",
            "Header rules must begin with a relative URL path.",
          );
          block = true;
        } else
          requireThat(
            block &&
              /^\s+(?:![A-Za-z0-9-]+|[A-Za-z0-9-]+:\s*[^\x00-\x1f]*)$/.test(
                line,
              ),
            "invalid_config",
            "Invalid header directive.",
          );
      }
      settings.headers = text;
    } else {
      requireThat(
        lines.length <= 100,
        "invalid_config",
        "At most 100 redirect rules are supported.",
      );
      for (const line of lines) {
        const [source, target, code, ...rest] = line.trim().split(/\s+/);
        requireThat(
          source?.startsWith("/") &&
            target &&
            ((target.startsWith("/") && !target.startsWith("//")) ||
              /^https:\/\//.test(target)) &&
            (!code || /^(200|301|302|303|307|308)$/.test(code)) &&
            !rest.length,
          "invalid_config",
          "Invalid redirect rule. Use relative paths or HTTPS destinations and a supported status.",
        );
        requireThat(
          code !== "200" ||
            (target.startsWith("/") && !target.startsWith("//")),
          "invalid_config",
          "Proxy redirects must target a relative path.",
        );
      }
      settings.redirects = text;
    }
  }
  return settings;
}
export async function readBounded(
  stream: ReadableStream<Uint8Array> | null,
  limit: number,
): Promise<Uint8Array> {
  requireThat(stream, "empty_body", "An input body is required.");
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.length;
      requireThat(
        size <= limit,
        "too_large",
        "The input exceeds the size limit.",
        413,
      );
      chunks.push(value);
    }
  } catch (error) {
    await reader.cancel();
    throw error;
  } finally {
    reader.releaseLock();
  }
  const out = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.length;
  }
  return out;
}
export function safeDownloadUrl(raw: string, allowedHosts: string[]) {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Problem("download_blocked", "The file URL is invalid.");
  }
  requireThat(
    url.protocol === "https:" &&
      !url.username &&
      !url.password &&
      !url.port &&
      allowedHosts.includes(url.hostname) &&
      !/^(localhost|.*\.localhost|.*\.local|[\d.]+|\[.*\])$/.test(url.hostname),
    "download_blocked",
    "This file host has not been approved. Attach or upload the original file through an approved source.",
  );
  return url;
}
export async function download(
  raw: string,
  allowedHosts: string[],
  fetcher: typeof fetch = fetch,
): Promise<Response> {
  let url = safeDownloadUrl(raw, allowedHosts);
  for (let redirects = 0; redirects <= 3; redirects++) {
    const response = await fetcher(url, {
      redirect: "manual",
      signal: AbortSignal.timeout(30000),
    });
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      await response.body?.cancel();
      requireThat(
        location,
        "download_failed",
        "File redirect is missing a destination.",
      );
      url = safeDownloadUrl(new URL(location, url).href, allowedHosts);
      continue;
    }
    requireThat(
      response.ok,
      "download_failed",
      "The approved file could not be accessed. Export and attach the original file again.",
    );
    return response;
  }
  throw new Problem(
    "download_failed",
    "The file has too many redirects. Attach the original file again.",
  );
}

const crcTable = Uint32Array.from({ length: 256 }, (_, n) => {
  let value = n;
  for (let bit = 0; bit < 8; bit++)
    value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  return value >>> 0;
});
function crc32(bytes: Uint8Array) {
  let crc = 0xffffffff;
  for (const byte of bytes) crc = crcTable[(crc ^ byte) & 255] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

// Stream decompression; retain only expanded files and the bounded central directory tail.
export async function unzip(
  stream: ReadableStream<Uint8Array> | null,
): Promise<Map<string, Uint8Array>> {
  requireThat(stream, "empty_body", "An archive body is required.");
  const files = new Map<string, Uint8Array>();
  const seen = new Set<string>();
  let total = 0,
    compressed = 0,
    failure: unknown,
    tail = new Uint8Array(0),
    pending = 0;
  const unzipper = new Unzip((file) => {
    try {
      if (file.name.endsWith("/")) {
        safePath(file.name.slice(0, -1));
        return;
      }
      const path = safePath(file.name);
      requireThat(
        !seen.has(path),
        "duplicate_path",
        "The archive contains duplicate normalized paths.",
      );
      seen.add(path);
      requireThat(
        seen.size <= LIMITS.files,
        "too_many_files",
        "The project has too many files.",
      );
      let size = 0;
      const parts: Uint8Array[] = [];
      pending++;
      file.ondata = (error, bytes, final) => {
        if (failure) return;
        try {
          if (error)
            throw new Problem(
              "invalid_archive",
              "The ZIP is damaged or unsupported.",
            );
          size += bytes.length;
          total += bytes.length;
          requireThat(
            size <= LIMITS.fileBytes && total <= LIMITS.projectBytes,
            "too_large",
            "Expanded archive exceeds the project limits.",
          );
          parts.push(bytes);
          if (final) {
            const out = new Uint8Array(size);
            let at = 0;
            for (const part of parts) {
              out.set(part, at);
              at += part.length;
            }
            files.set(path, out);
            pending--;
          }
        } catch (error) {
          failure = error;
          file.terminate();
        }
      };
      file.start();
    } catch (error) {
      failure = error;
    }
  });
  unzipper.register(UnzipInflate);
  const reader = stream.getReader();
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      compressed += value.length;
      requireThat(
        compressed <= LIMITS.projectBytes,
        "too_large",
        "The ZIP exceeds the upload limit.",
      );
      const merged = new Uint8Array(
        Math.min(128 * 1024, tail.length + value.length),
      );
      const old = Math.max(0, merged.length - value.length);
      if (old) merged.set(tail.subarray(tail.length - old));
      merged.set(
        value.subarray(Math.max(0, value.length - merged.length)),
        old,
      );
      tail = merged;
      for (let at = 0; at < value.length; at += 16384) {
        unzipper.push(value.subarray(at, at + 16384));
        if (failure) throw failure;
      }
    }
    unzipper.push(new Uint8Array(), true);
    if (failure) throw failure;
    requireThat(pending === 0, "invalid_archive", "The ZIP is incomplete.");
    const view = new DataView(tail.buffer, tail.byteOffset, tail.byteLength);
    let end = -1;
    for (let i = tail.length - 22; i >= 0; i--)
      if (
        view.getUint32(i, true) === 0x06054b50 &&
        i + 22 + view.getUint16(i + 20, true) === tail.length
      ) {
        end = i;
        break;
      }
    requireThat(
      end >= 0,
      "invalid_archive",
      "ZIP64 and incomplete archives are not supported.",
    );
    const count = view.getUint16(end + 10, true),
      centralSize = view.getUint32(end + 12, true);
    requireThat(
      view.getUint16(end + 4, true) === 0 &&
        view.getUint16(end + 6, true) === 0 &&
        count <= 200 &&
        centralSize <= end,
      "invalid_archive",
      "Unsupported archive directory.",
    );
    let offset = end - centralSize;
    let entries = 0;
    const centralFiles = new Set<string>();
    while (offset < end) {
      requireThat(
        offset + 46 <= end && view.getUint32(offset, true) === 0x02014b50,
        "invalid_archive",
        "Invalid archive directory.",
      );
      const attributes = view.getUint32(offset + 38, true),
        flags = view.getUint16(offset + 8, true);
      requireThat(
        ((attributes >>> 16) & 0xf000) !== 0xa000 && !(flags & 1),
        "unsafe_archive",
        "Symlinks and encrypted archives are not accepted.",
      );
      const length = view.getUint16(offset + 28, true);
      const path = decoder.decode(
        tail.subarray(offset + 46, offset + 46 + length),
      );
      if (!path.endsWith("/")) {
        const normalized = safePath(path),
          bytes = files.get(normalized);
        requireThat(
          !centralFiles.has(normalized) &&
            bytes &&
            bytes.length === view.getUint32(offset + 24, true) &&
            crc32(bytes) === view.getUint32(offset + 16, true),
          "invalid_archive",
          "Archive directories or checksums disagree.",
        );
        centralFiles.add(normalized);
      }
      offset +=
        46 +
        length +
        view.getUint16(offset + 30, true) +
        view.getUint16(offset + 32, true);
      entries++;
    }
    requireThat(
      offset === end && entries === count && centralFiles.size === files.size,
      "invalid_archive",
      "Invalid archive entry count.",
    );
    return files;
  } catch (error) {
    await reader.cancel();
    if (error instanceof Problem) throw error;
    throw new Problem("invalid_archive", "The ZIP is damaged or unsupported.");
  } finally {
    reader.releaseLock();
  }
}
