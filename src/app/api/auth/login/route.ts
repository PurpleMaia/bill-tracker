import { NextRequest, NextResponse } from "next/server";
import { authenticateUser, createSession } from "@/lib/auth";
import { setSessionCookie } from "@/lib/cookies";
import { limitFixedWindow, retryAfterMs } from "@/lib/ratelimit-memory";
import type { User } from "@/types/user";
import { loginSchema } from "@/lib/validators";
import { ApiError } from "@/lib/errors";
import { getUserMemberships } from "@/services/data/tenants";

const LOGIN_RATE_LIMIT = { limit: 5, windowMs: 5 * 60_000 };

/**
 * Extract client IP address from request headers
 * Checks common proxy headers in order of reliability
 */
function getClientIp(request: NextRequest): string {
  // Cloudflare
  const cfConnectingIP = request.headers.get("cf-connecting-ip");
  if (cfConnectingIP) return cfConnectingIP;

  const xForwardedFor = request.headers.get("x-forwarded-for");
  if (xForwardedFor) {
    // x-forwarded-for can contain multiple IPs: "client, proxy1, proxy2"
    // The first one is the original client (only one proxy on this infrastructure)
    return xForwardedFor.split(",")[0]?.trim() || "unknown";
  }

  // Standard proxy header
  const xRealIP = request.headers.get("x-real-ip");
  if (xRealIP) return xRealIP;

  // Fallback (may not be available in serverless)
  return "unknown";
}

export async function POST(request: NextRequest) {
  try {
    const clientIp = getClientIp(request);
    const rl = limitFixedWindow(
      `login:${clientIp}`,
      LOGIN_RATE_LIMIT.limit,
      LOGIN_RATE_LIMIT.windowMs
    );
    if (!rl.ok) {
      const retryMs = retryAfterMs(rl.resetAt);
      return NextResponse.json(
        {
          error: "Too many login attempts. Please try again later.",
          retryAfterMs: retryMs,
        },
        {
          status: 429,
          headers: {
            "Retry-After": Math.ceil(retryMs / 1000).toString(),
          },
        }
      );
    }


    // retrieve email/username and password from request body
    const { authString, password } = await request.json();

    //validates input
    const validation = loginSchema.safeParse({ authString, password });
    if (!validation.success) {
      const messages = validation.error.issues.map(i => i.message).join(', ');
      return NextResponse.json({ error: messages }, { status: 400 });
    }

    // Authenticate user
    try {
      const user = await authenticateUser(authString, password);

      // Create session token for successfully authenticated user
      const token = await createSession(user.id);

      // Fetch memberships for the authenticated user
      const memberships = await getUserMemberships(user.id);

      // Set session token in cookie and return user information with memberships
      return NextResponse.json(
        { success: true, user: user as User, memberships },
        {
          status: 200,
          headers: {
            "Set-Cookie": setSessionCookie(token),
          },
        }
      );
    } catch (error) {
      // Rethrow known authentication errors to be handled in the outer catch block
      throw error;
    }
  } catch (error) {
    if (error instanceof ApiError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.statusCode }
      );
    }

    // Unknown error
    console.error("[LOGIN]", error);
    return NextResponse.json({ error: "Unknown Error" }, { status: 500 });
  }
}
