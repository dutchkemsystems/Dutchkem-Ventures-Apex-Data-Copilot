/**
 * Phase 16 — Next.js 15 App Router Referral Link Interceptor (/ref/[userId]/route.ts)
 * Captures the referral click, sets the persistent 30-day `apex_ref_id` cookie,
 * and forwards the visitor to the Apex Data Copilot onboarding / pricing funnel.
 */
import { NextRequest, NextResponse } from "next/server";

const BACKEND_URL = process.env.FASTAPI_BACKEND_URL || "http://127.0.0.1:8000";
const THIRTY_DAYS_SECONDS = 30 * 24 * 60 * 60;

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ userId: string }> }
) {
  const { userId } = await context.params;
  const cleanReferrerId = decodeURIComponent(userId || "").trim();

  if (!cleanReferrerId) {
    return NextResponse.redirect(new URL("/", request.url));
  }

  // Forward telemetry click asynchronously to FastAPI/PostgreSQL
  fetch(`${BACKEND_URL}/api/referrals/track`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      referrerId: cleanReferrerId,
      landingPath: "/",
      userAgent: request.headers.get("user-agent") || "next-ssr",
    }),
  }).catch(() => {});

  const destination = new URL(`/?ref=${encodeURIComponent(cleanReferrerId)}`, request.url);
  const response = NextResponse.redirect(destination, { status: 302 });

  response.cookies.set({
    name: "apex_ref_id",
    value: cleanReferrerId,
    path: "/",
    maxAge: THIRTY_DAYS_SECONDS,
    sameSite: "lax",
    httpOnly: false, // Readable by client signup telemetry while persisted across reloads
    secure: process.env.NODE_ENV === "production",
  });

  return response;
}
