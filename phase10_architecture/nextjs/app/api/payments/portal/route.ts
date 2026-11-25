import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  const origin = request.nextUrl.origin;
  const body = (await request.json().catch(() => ({}))) as {
    korapay_customer_ref?: string;
    return_url?: string;
  };

  return NextResponse.json({
    mode: "korapay_self_serve_portal",
    korapayCustomerRef: body.korapay_customer_ref || null,
    portalUrl: body.return_url || `${origin}/pricing?portal=manage`,
  });
}

export async function GET(request: NextRequest) {
  return NextResponse.redirect(new URL("/pricing?portal=manage", request.url));
}
