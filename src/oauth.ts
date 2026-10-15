import { loopbackCallback, registrationAllowed } from "./oauth-policy";
import {
  OAuthProvider,
  getOAuthApi,
  type OAuthProviderOptions,
} from "@cloudflare/workers-oauth-provider";
import { requireThat, type Env } from "./types";
export const SCOPES = ["projects:read", "projects:write"];
export function callbacks(env: Env): string[] {
  const parsed: unknown = JSON.parse(env.CHATGPT_CALLBACKS);
  return Array.isArray(parsed)
    ? parsed.filter(
        (s): s is string => typeof s === "string" && s.startsWith("https://"),
      )
    : [];
}
// Off unless the owner sets ALLOW_LOOPBACK_CALLBACKS=true on the Publisher Worker.
export function loopbackEnabled(env: Env) {
  return env.ALLOW_LOOPBACK_CALLBACKS === "true";
}

function registrationError(metadata: Record<string, unknown>, env: Env) {
  if (registrationAllowed(metadata, callbacks(env), loopbackEnabled(env)))
    return undefined;
  const uris = metadata.redirect_uris;
  if (
    !loopbackEnabled(env) &&
    Array.isArray(uris) &&
    uris.some((uri) => typeof uri === "string" && loopbackCallback(uri))
  )
    return {
      description:
        "Sign-in from programs on your own computer (localhost callbacks) is turned off. The Publisher owner can turn it on by setting ALLOW_LOOPBACK_CALLBACKS to true in the Publisher Worker's Cloudflare settings.",
    };
  return {
    description:
      "Only the verified ChatGPT callback, or localhost callbacks when enabled, with public-client PKCE are accepted.",
  };
}

function options(env: Env): OAuthProviderOptions<Env> {
  return {
    apiRoute: "/mcp",
    authorizeEndpoint: "/authorize",
    tokenEndpoint: "/oauth/token",
    clientRegistrationEndpoint: "/oauth/register",
    scopesSupported: SCOPES,
    requiredScopes: SCOPES,
    resourceMetadata: {
      resource: env.PUBLISHER_ORIGIN + "/mcp",
      authorization_servers: [env.PUBLISHER_ORIGIN],
    },
    clientIdMetadataDocumentEnabled: false,
    clientRegistrationCallback: ({ clientMetadata }) =>
      registrationError(clientMetadata, env),
    onError: () => {},
    apiHandler: {
      async fetch(request, bindings, ctx) {
        const context = ctx as typeof ctx & {
          props: { ownerEpoch?: string };
          auth: { scope: string[] };
        };
        requireThat(
          SCOPES.every((scope) => context.auth.scope.includes(scope)),
          "insufficient_scope",
          "Reconnect and consent to project read and publish access.",
          403,
        );
        const headers = new Headers(request.headers);
        headers.set("X-Publisher-Owner-Epoch", context.props.ownerEpoch ?? "");
        return bindings.PUBLISHER.get(
          bindings.PUBLISHER.idFromName("installation"),
        ).fetch(new Request(request, { headers }));
      },
    },
    defaultHandler: {
      async fetch(request, bindings) {
        const headers = new Headers(request.headers);
        headers.delete("X-Publisher-Owner-Epoch");
        return bindings.PUBLISHER.get(
          bindings.PUBLISHER.idFromName("installation"),
        ).fetch(new Request(request, { headers }));
      },
    },
  };
}
export function provider(env: Env) {
  return new OAuthProvider<Env>(options(env));
}
export function oauthHelpers(env: Env) {
  return getOAuthApi(options(env), env);
}
