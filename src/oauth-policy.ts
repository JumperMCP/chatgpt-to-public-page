// Native clients such as Claude Code listen on a random loopback port (RFC 8252 §7.3).
const LOOPBACK_HOSTS = ["localhost", "127.0.0.1", "[::1]"];

export function loopbackCallback(uri: string) {
  let url: URL;
  try {
    url = new URL(uri);
  } catch {
    return false;
  }
  return (
    url.protocol === "http:" &&
    LOOPBACK_HOSTS.includes(url.hostname) &&
    !url.username &&
    !url.password &&
    !url.search &&
    !url.hash &&
    url.href === uri
  );
}

export function callbackAllowed(
  uri: string,
  allowed: string[],
  loopback: boolean,
) {
  return allowed.includes(uri) || (loopback && loopbackCallback(uri));
}

export function registrationAllowed(
  metadata: Record<string, unknown>,
  allowed: string[],
  loopback: boolean,
) {
  return (
    Array.isArray(metadata.redirect_uris) &&
    metadata.redirect_uris.length > 0 &&
    metadata.redirect_uris.every(
      (uri) =>
        typeof uri === "string" && callbackAllowed(uri, allowed, loopback),
    ) &&
    metadata.token_endpoint_auth_method === "none"
  );
}
