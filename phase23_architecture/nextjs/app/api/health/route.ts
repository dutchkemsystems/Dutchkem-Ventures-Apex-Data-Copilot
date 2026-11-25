import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  const backendUrl = (process.env.BACKEND_HEALTH_URL || "").trim().replace(/\/+$/, "");
  let backendStatus = "not_configured";
  let backendHealthy = true;

  if (backendUrl) {
    try {
      const res = await fetch(`${backendUrl}/api/health`, {
        method: "GET",
        cache: "no-store",
        signal: AbortSignal.timeout(3000),
      });
      backendHealthy = res.ok;
      backendStatus = res.ok ? "healthy" : `unhealthy_${res.status}`;
    } catch {
      backendHealthy = false;
      backendStatus = "unreachable";
    }
  }

  return NextResponse.json(
    {
      status: backendHealthy ? "healthy" : "degraded",
      plane: "frontend",
      pwa: {
        updateStrategy: "stale-while-revalidate",
        activatesOnNextNavigation: true,
        offlineRoute: "/offline",
      },
      upstreamBackend: backendStatus,
      checkedAt: new Date().toISOString(),
    },
    {
      status: backendHealthy ? 200 : 503,
      headers: {
        "Cache-Control": "no-store, max-age=0",
      },
    }
  );
}
