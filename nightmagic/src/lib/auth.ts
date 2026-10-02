/**
 * Shared-password gate for deployed instances. Right-sized for a single-team
 * deployment: one password in NIGHTMAGIC_PASSWORD guards every page and API
 * route. Unset the variable (local dev) and the gate disappears entirely.
 *
 * Edge-safe on purpose: middleware runs in the edge runtime, so only Web
 * Crypto is used here — no node builtins.
 */

export const AUTH_COOKIE = "nm_auth";
export const AUTH_COOKIE_MAX_AGE = 60 * 60 * 24 * 30; // 30 days

export function gateEnabled(password: string | undefined | null): password is string {
  return typeof password === "string" && password.length > 0;
}

/** The cookie value a correct password earns: a salted SHA-256 of it. */
export async function tokenFor(password: string): Promise<string> {
  const data = new TextEncoder().encode(`nightmagic:${password}`);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function isAuthed(
  password: string | undefined | null,
  cookieValue: string | undefined | null,
): Promise<boolean> {
  if (!gateEnabled(password)) return true;
  if (!cookieValue) return false;
  return cookieValue === (await tokenFor(password));
}
