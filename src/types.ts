export const MiB = 1024 * 1024;
export const LIMITS = {
  projects: 20,
  files: 100,
  projectBytes: 25 * MiB,
  fileBytes: 10 * MiB,
  retainedBytes: 250 * MiB,
  snapshots: 20,
  stagingMs: 86400000,
  chunkBytes: 512 * 1024,
  textBytes: 256 * 1024,
};
export class Problem extends Error {
  constructor(
    public code: string,
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}
export function requireThat(
  condition: unknown,
  code: string,
  message: string,
  status = 400,
): asserts condition {
  if (!condition) throw new Problem(code, message, status);
}
export function publicError(error: unknown) {
  return error instanceof Problem
    ? { code: error.code, message: error.message }
    : {
        code: "internal",
        message:
          "The operation could not complete. Retry or inspect its status.",
      };
}
export interface FileEntry {
  hash: string;
  size: number;
  type: string;
}
export interface Settings {
  not_found_handling: "none" | "404-page" | "single-page-application";
  headers?: string;
  redirects?: string;
}
export interface Revision {
  id: string;
  project: string;
  base: string | null;
  files: Record<string, FileEntry>;
  settings: Settings;
  created: number;
  warnings: string[];
  changes?: {
    added: string[];
    modified: string[];
    deleted: string[];
    serving_changed: boolean;
  };
}
export interface Project {
  id: string;
  name: string;
  hostname: string;
  head: string | null;
  live: string | null;
  history: string[];
  created: number;
  owned: boolean;
}
export interface Operation {
  id: string;
  project: string;
  revision: string;
  base: string | null;
  kind: "publish" | "unpublish" | "delete";
  state: "staged" | "uploading" | "activating" | "published" | "failed";
  attempts: number;
  created: number;
  version?: string;
  deployment?: string;
  error?: { code: string; message: string };
  reachable?: boolean;
}
export interface Patch {
  path: string;
  old_string: string;
  new_string: string;
}
export interface StageInput {
  project?: string;
  candidate?: string;
  name?: string;
  hostname?: string;
  base_revision: string | null;
  files?: Record<string, string>;
  deletes?: string[];
  patches?: Patch[];
  spa?: boolean;
}
export interface Store {
  get<T>(key: string): T | undefined;
  put<T>(key: string, value: T): void;
  delete(key: string): void;
  list<T>(prefix: string): [string, T][];
  transaction<T>(fn: () => T): T;
  chunk(hash: string, index: number): Uint8Array | undefined;
  putChunk(hash: string, index: number, bytes: Uint8Array): void;
  deleteChunks(hash: string): void;
}
export interface Env {
  PUBLISHER: DurableObjectNamespace;
  OAUTH_KV: KVNamespace;
  PUBLISHER_ORIGIN: string;
  ACCOUNT_ID: string;
  ACCOUNT_SUBDOMAIN: string;
  INSTALLATION_ID: string;
  CHATGPT_CALLBACKS: string;
  FILE_DOWNLOAD_HOSTS: string;
  RELEASE_VERSION: string;
  CREDENTIAL_KEY: string;
  SETUP_TOKEN_HASH: string;
  SETUP_EXPIRES_AT: string;
  HANDOFF_TOKEN_HASH?: string;
  CF_OAUTH_CLIENT_ID?: string;
  REQUIRED_CF_SCOPES?: string;
  RELEASE_BASE_URL?: string;
  RELEASE_PUBLIC_KEY?: string;
  OAUTH_KV_ID?: string;
  RECOVERY_TOKEN_HASH?: string;
  RECOVERY_EXPIRES_AT?: string;
}
export const encoder = new TextEncoder();
export const decoder = new TextDecoder("utf-8", { fatal: true });
export async function sha256(input: Uint8Array | string): Promise<string> {
  const bytes = typeof input === "string" ? encoder.encode(input) : input;
  return [
    ...new Uint8Array(
      await crypto.subtle.digest("SHA-256", bytes as BufferSource),
    ),
  ]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
export function canonical(value: unknown): string {
  if (Array.isArray(value)) return "[" + value.map(canonical).join(",") + "]";
  if (value && typeof value === "object")
    return (
      "{" +
      Object.entries(value)
        .filter(([, v]) => v !== undefined)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([k, v]) => JSON.stringify(k) + ":" + canonical(v))
        .join(",") +
      "}"
    );
  return JSON.stringify(value);
}
