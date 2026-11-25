import crypto from "node:crypto";
import { NextRequest, NextResponse } from "next/server";

function verifyCronSecret(authHeader: string | null): boolean {
  const secret = process.env.CRON_SECRET || "";
  if (!secret || !authHeader?.startsWith("Bearer ")) return false;
  const supplied = authHeader.slice("Bearer ".length).trim();
  const a = Buffer.from(secret, "utf8");
  const b = Buffer.from(supplied, "utf8");
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export async function GET(request: NextRequest) {
  if (!verifyCronSecret(request.headers.get("authorization"))) {
    return NextResponse.json({ error: "Unauthorized cron trigger." }, { status: 401 });
  }

  const backendUrl = process.env.FASTAPI_BACKEND_URL || "http://localhost:8000";
  const res = await fetch(`${backendUrl}/api/v1/sales-agent/cron-scan`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-cron-secret": process.env.CRON_SECRET || "",
    },
  });

  const data = await res.json().catch(() => ({}));
  return NextResponse.json({
    ok: res.ok,
    job: "auto-bidder",
    ranAt: new Date().toISOString(),
    result: data,
  });
}
