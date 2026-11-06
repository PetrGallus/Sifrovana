export const securityHeaders = {
  "Content-Security-Policy": "base-uri 'self'; object-src 'none'; frame-ancestors 'self'",
  "Cross-Origin-Opener-Policy": "same-origin-allow-popups",
  "Permissions-Policy": "camera=(self), geolocation=(self), microphone=()",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Strict-Transport-Security": "max-age=31536000",
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "SAMEORIGIN",
} as const;

export function withSecurityHeaders(response: Response): Response {
  // A Workers WebSocket upgrade carries runtime-only metadata that a standard
  // Response constructor cannot preserve. Handshakes do not render a document,
  // so leave them untouched instead of breaking a future realtime endpoint.
  const workerResponse = response as Response & { webSocket?: unknown };
  if (response.status === 101 || workerResponse.webSocket) return response;

  // Passing the original Response as ResponseInit preserves status, statusText
  // and every existing header while keeping its body stream unbuffered.
  const securedResponse = new Response(response.body, response);
  for (const [name, value] of Object.entries(securityHeaders)) securedResponse.headers.set(name, value);
  return securedResponse;
}
