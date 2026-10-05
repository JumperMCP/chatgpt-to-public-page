import {
  Problem,
  encoder,
  requireThat,
  sha256,
  type Env,
  type Store,
} from "./types";
export const COOKIE = "__Host-publisher";
export function randomToken() {
  return [...crypto.getRandomValues(new Uint8Array(32))]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
export function exactOrigin(request: Request, origin: string) {
  requireThat(
    request.headers.get("origin") === origin,
    "invalid_origin",
    "This action must originate from your Publisher.",
    403,
  );
}
export function sessionCookie(token: string, maxAge = 43200) {
  return `${COOKIE}=${token}; Secure; HttpOnly; Path=/; SameSite=Strict; Max-Age=${maxAge}`;
}
export function getCookie(request: Request) {
  const matches = (request.headers.get("cookie") ?? "")
    .split(";")
    .map((s) => s.trim())
    .filter((s) => s.startsWith(COOKIE + "="));
  requireThat(
    matches.length <= 1,
    "invalid_session",
    "Ambiguous session cookie.",
    401,
  );
  return matches[0]?.slice(COOKIE.length + 1);
}
async function passwordHash(password: string, salt: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(password),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  return [
    ...new Uint8Array(
      await crypto.subtle.deriveBits(
        {
          name: "PBKDF2",
          hash: "SHA-256",
          salt: encoder.encode(salt),
          iterations: 100000,
        },
        key,
        256,
      ),
    ),
  ]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
export interface Session {
  csrf: string;
  expires: number;
  epoch: string;
}
interface Owner {
  salt: string;
  hash: string;
  epoch: string;
}
export class OwnerAuth {
  constructor(
    private store: Store,
    private env: Pick<
      Env,
      | "SETUP_TOKEN_HASH"
      | "SETUP_EXPIRES_AT"
      | "RECOVERY_TOKEN_HASH"
      | "RECOVERY_EXPIRES_AT"
    >,
    private now = Date.now,
  ) {}
  async setup(token: string, password: string, recovery = false) {
    requireThat(
      password.length >= 12 && password.length <= 256,
      "weak_password",
      "Use a password of 12–256 characters.",
    );
    const expected = recovery
        ? this.env.RECOVERY_TOKEN_HASH
        : this.env.SETUP_TOKEN_HASH,
      expiry = Number(
        recovery ? this.env.RECOVERY_EXPIRES_AT : this.env.SETUP_EXPIRES_AT,
      );
    const digest = await sha256(token);
    requireThat(
      expected &&
        digest === expected &&
        this.now() < expiry &&
        !this.store.get("used-setup:" + digest),
      "invalid_setup",
      "This setup or recovery link is invalid or expired.",
      403,
    );
    requireThat(
      recovery || !this.store.get("owner"),
      "already_configured",
      "An owner is already configured.",
      409,
    );
    const salt = randomToken(),
      hash = await passwordHash(password, salt),
      epoch = randomToken();
    this.store.transaction(() => {
      requireThat(
        !this.store.get("used-setup:" + digest) &&
          (recovery || !this.store.get("owner")),
        "invalid_setup",
        "This setup link was already used.",
        403,
      );
      this.store.put("owner", { salt, hash, epoch });
      this.store.put("used-setup:" + digest, true);
      for (const [key] of this.store.list("session:")) this.store.delete(key);
    });
    return this.createSession(epoch);
  }
  async login(password: string) {
    const attempts = this.store.get<{ count: number; until: number }>(
      "login-attempts",
    ) ?? { count: 0, until: 0 };
    if (attempts.until <= this.now()) {
      attempts.count = 0;
      attempts.until = this.now() + 900000;
    }
    requireThat(
      attempts.count < 10,
      "throttled",
      "Too many login attempts. Wait 15 minutes.",
      429,
    );
    attempts.count++;
    this.store.put("login-attempts", attempts);
    const owner = this.store.get<Owner>("owner");
    requireThat(
      owner,
      "not_configured",
      "Open your single-use owner setup link.",
      403,
    );
    requireThat(
      password.length <= 256 &&
        (await passwordHash(password, owner.salt)) === owner.hash,
      "invalid_login",
      "Incorrect password.",
      401,
    );
    this.store.delete("login-attempts");
    return this.createSession(owner.epoch);
  }
  private async createSession(epoch: string) {
    const token = randomToken();
    const session = {
      csrf: randomToken(),
      expires: this.now() + 43200000,
      epoch,
    };
    this.store.put("session:" + (await sha256(token)), session);
    return { token, ...session };
  }
  async session(request: Request) {
    const token = getCookie(request);
    const session = token
      ? this.store.get<Session>("session:" + (await sha256(token)))
      : undefined;
    const owner = this.store.get<Owner>("owner");
    requireThat(
      session &&
        owner &&
        session.epoch === owner.epoch &&
        session.expires > this.now(),
      "unauthorized",
      "Sign in to your Publisher.",
      401,
    );
    return session;
  }
  async mutate(request: Request, origin: string, csrf: string) {
    exactOrigin(request, origin);
    const session = await this.session(request);
    requireThat(
      csrf === session.csrf,
      "invalid_csrf",
      "This form expired. Reload your Publisher.",
      403,
    );
    return session;
  }
  async logout(request: Request) {
    const token = getCookie(request);
    if (token) this.store.delete("session:" + (await sha256(token)));
  }
  epoch() {
    return this.store.get<Owner>("owner")?.epoch;
  }
}
export async function encrypt(value: unknown, keyHex: string) {
  requireThat(
    /^[a-f0-9]{64}$/i.test(keyHex),
    "missing_key",
    "The credential encryption key is missing.",
    503,
  );
  const key = await crypto.subtle.importKey(
    "raw",
    Uint8Array.from(keyHex.match(/../g)!, (h) => parseInt(h, 16)),
    "AES-GCM",
    false,
    ["encrypt"],
  );
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    encoder.encode(JSON.stringify(value)),
  );
  return { iv: [...iv], data: [...new Uint8Array(ciphertext)] };
}
export async function decrypt<T>(
  value: { iv: number[]; data: number[] },
  keyHex: string,
): Promise<T> {
  try {
    const key = await crypto.subtle.importKey(
      "raw",
      Uint8Array.from(keyHex.match(/../g)!, (h) => parseInt(h, 16)),
      "AES-GCM",
      false,
      ["decrypt"],
    );
    return JSON.parse(
      new TextDecoder().decode(
        await crypto.subtle.decrypt(
          { name: "AES-GCM", iv: new Uint8Array(value.iv) },
          key,
          new Uint8Array(value.data),
        ),
      ),
    );
  } catch {
    throw new Problem(
      "credential_key",
      "Credential decryption failed. Restore the original encryption key or reconnect.",
      503,
    );
  }
}
export interface Credential {
  access_token: string;
  refresh_token?: string;
  expires_at?: number;
  client_id?: string;
  scopes: string[];
}
export class Credentials {
  private inFlight?: Promise<string>;
  constructor(
    private store: Store,
    private key: string,
    private refresh: (credential: Credential) => Promise<Credential>,
    private now = Date.now,
  ) {}
  async save(credential: Credential) {
    const encrypted = await encrypt(credential, this.key);
    this.store.transaction(() => {
      this.store.put("credential", encrypted);
      this.store.put("credential-health", {
        state: "connected",
        expires_at: credential.expires_at ?? null,
      });
      this.store.delete("refresh-pending");
    });
  }
  seal(value: unknown) {
    return encrypt(value, this.key);
  }
  unseal<T>(value: { iv: number[]; data: number[] }) {
    return decrypt<T>(value, this.key);
  }
  token() {
    if (this.inFlight) return this.inFlight;
    this.inFlight = this.getToken().finally(() => {
      this.inFlight = undefined;
    });
    return this.inFlight;
  }
  private async getToken() {
    const saved = this.store.get<{ iv: number[]; data: number[] }>(
      "credential",
    );
    requireThat(
      saved,
      "reconnect",
      "Connect a scoped Cloudflare token in the owner UI.",
      503,
    );
    requireThat(
      !this.store.get("refresh-pending"),
      "reconnect",
      "Credential rotation was interrupted. Reconnect Cloudflare.",
      503,
    );
    const credential = await decrypt<Credential>(saved, this.key);
    if (!credential.expires_at || credential.expires_at > this.now() + 60000)
      return credential.access_token;
    requireThat(
      credential.refresh_token,
      "reconnect",
      "Cloudflare authorization expired. Reconnect in the owner UI.",
      503,
    );
    this.store.put("refresh-pending", true);
    try {
      const replacement = await this.refresh(credential);
      await this.save(replacement);
      return replacement.access_token;
    } catch {
      this.store.put("credential-health", { state: "reconnection_required" });
      throw new Problem(
        "reconnect",
        "Cloudflare refresh failed or was interrupted. Reconnect in the owner UI.",
        503,
      );
    }
  }
  revoked() {
    this.store.put("credential-health", { state: "reconnection_required" });
  }
}
