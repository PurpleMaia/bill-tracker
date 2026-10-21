// Cookie helpers

import { NextRequest } from "next/server";

/**
 * Retrieves the session cookie value from the request.
 * @returns The session cookie value or null if not found.
 */
export function getSessionCookie(request: NextRequest): string | null {
  return request.cookies.get('session')?.value || null;
}

/**
 * Gets the Set-Cookie header string to set the session cookie.
 * @param token Raw session token
 * @returns Set-Cookie header string
 */
export function setSessionCookie(token: string): string {
  return `session=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${7 * 24 * 60 * 60}`;
}

/**
 * Get the clear session cookie by setting its expiration to the past.
 */
export function getClearSessionCookie(): string {
  return 'session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0';
}