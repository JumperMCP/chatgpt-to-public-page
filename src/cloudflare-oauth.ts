import { Problem, requireThat } from "./types";
import type { Credential } from "./security";
export const CF_AUTHORIZE = "https://dash.cloudflare.com/oauth2/auth";
export const CF_TOKEN = "https://dash.cloudflare.com/oauth2/token";
export function validateScopes(granted: string, required: string[]) {
  const scopes = granted.split(/\s+/).filter(Boolean);
  requireThat(
    required.length > 0 && required.every((scope) => scopes.includes(scope)),
    "missing_scope",
    "Cloudflare did not grant every required permission. Reauthorize before provisioning.",
    403,
  );
  return scopes;
}
export async function exchangeCloudflare(
  body: URLSearchParams,
  required: string[],
  previous?: Credential,
  fetcher: typeof fetch = fetch,
): Promise<Credential> {
  const response = await fetcher(CF_TOKEN, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
    signal: AbortSignal.timeout(20000),
  });
  requireThat(
    response.ok,
    "reconnect",
    "Cloudflare authorization failed. Reconnect your account.",
    503,
  );
  const value = (await response.json()) as {
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
    scope?: string;
    token_type?: string;
  };
  requireThat(
    value.access_token &&
      value.token_type?.toLowerCase() === "bearer" &&
      typeof value.expires_in === "number" &&
      value.expires_in > 0,
    "invalid_grant",
    "Cloudflare returned incomplete credential metadata.",
    503,
  );
  return {
    access_token: value.access_token,
    refresh_token: value.refresh_token ?? previous?.refresh_token,
    expires_at: Date.now() + value.expires_in * 1000,
    client_id: body.get("client_id") ?? undefined,
    scopes: validateScopes(
      value.scope ?? previous?.scopes.join(" ") ?? "",
      required,
    ),
  };
}
export async function refreshCloudflare(
  credential: Credential,
  required: string[],
) {
  requireThat(
    credential.client_id && credential.refresh_token,
    "reconnect",
    "Cloudflare must be reconnected.",
    503,
  );
  return exchangeCloudflare(
    new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: credential.refresh_token,
      client_id: credential.client_id,
    }),
    required,
    credential,
  );
}
