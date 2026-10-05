import { registrationAllowed } from "./oauth-policy";
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
      registrationAllowed(clientMetadata, callbacks(env))
        ? undefined
        : {
            description:
              "Only experimentally verified ChatGPT callbacks with public-client PKCE are enabled.",
          },
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
