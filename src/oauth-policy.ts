export function registrationAllowed(
  metadata: Record<string, unknown>,
  allowed: string[],
) {
  return (
    Array.isArray(metadata.redirect_uris) &&
    metadata.redirect_uris.length > 0 &&
    metadata.redirect_uris.every(
      (uri) => typeof uri === "string" && allowed.includes(uri),
    ) &&
    metadata.token_endpoint_auth_method === "none"
  );
}
