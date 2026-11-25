// Phase 15: Next.js 15 Kora Pay Webhook for Client $500 Listing Fees & Escrow Funding (Zero Stripe)

import crypto from "node:crypto";
import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  const signature = req.headers.get("x-korapay-signature") ?? "";
  const secretKey = process.env.KORA_SECRET_KEY ?? "";
  const body = (await req.json().catch(() => ({}))) as {
    event?: string;
    data?: {
      reference?: string;
      status?: string;
      metadata?: {
        flow?: "listing_fee" | "bid_escrow";
        job_id?: string;
        bid_id?: string;
      };
    };
  };

  if (secretKey && signature && body.data) {
    const expected = crypto
      .createHmac("sha256", secretKey)
      .update(JSON.stringify(body.data))
      .digest("hex");
    const a = Buffer.from(expected, "utf8");
    const b = Buffer.from(signature, "utf8");
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
      return NextResponse.json({ detail: "Invalid Kora Pay HMAC signature." }, { status: 401 });
    }
  }

  if (body.event === "charge.success" && body.data?.status === "success") {
    const meta = body.data.metadata ?? {};
    if (meta.flow === "listing_fee") {
      // Activate marketplace_jobs row -> listing_fee_paid = true, status = 'open'
      return NextResponse.json({ received: true, flow: "listing_fee", status: "open", jobId: meta.job_id });
    }
    if (meta.flow === "bid_escrow") {
      // Fund escrow -> escrow_status = 'funded', status = 'in_progress'
      return NextResponse.json({ received: true, flow: "bid_escrow", escrowStatus: "funded", jobId: meta.job_id });
    }
  }

  return NextResponse.json({ received: true, ignored: true });
}
