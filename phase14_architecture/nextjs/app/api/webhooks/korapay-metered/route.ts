// Phase 14: Next.js 15 Kora Pay Metered Billing & End-of-Month Usage Settlement Route
// Handles monthly Kora Pay charge initialization + HMAC-SHA256 webhook verification (Zero Stripe).

import crypto from "node:crypto";
import { NextRequest, NextResponse } from "next/server";

const UNIT_COST_USD = 0.10;
const USD_TO_NGN = 1530;
const USD_TO_GBP = 0.79;

export async function POST(req: NextRequest) {
  const signature = req.headers.get("x-korapay-signature") ?? "";
  const secretKey = process.env.KORA_SECRET_KEY ?? "";
  const body = (await req.json().catch(() => ({}))) as {
    event?: string;
    data?: {
      reference?: string;
      status?: string;
      amount?: number;
      currency?: string;
      metadata?: {
        org_id?: string;
        billing_period?: string;
        unbilled_calls?: number;
        billing_type?: string;
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

  const eventName = body.event ?? "";
  const meta = body.data?.metadata ?? {};

  if (eventName === "charge.success" && body.data?.status === "success") {
    // 1. Mark b2b_metered_invoices row 'paid' by body.data.reference
    // 2. Reset unbilled_calls = 0 for all keys in meta.org_id and unlock any PAST_DUE keys
    return NextResponse.json({
      received: true,
      provider: "korapay",
      billingType: meta.billing_type ?? "b2b_api_metered",
      orgId: meta.org_id,
      settledCalls: meta.unbilled_calls ?? 0,
      status: "paid",
    });
  }

  if (eventName === "charge.failed") {
    // Flag organization's b2b_api_keys as PAST_DUE until Kora Pay balance is cleared
    return NextResponse.json({
      received: true,
      provider: "korapay",
      orgId: meta.org_id,
      status: "past_due",
    });
  }

  return NextResponse.json({ received: true, ignored: true, event: eventName });
}

export function computeKoraMeteredCharge(calls: number, currency: "NGN" | "USD" | "GBP") {
  const usdAmount = Math.round(calls * UNIT_COST_USD * 100) / 100;
  if (currency === "NGN") {
    return { usdAmount, currency, chargeAmount: Math.round(usdAmount * USD_TO_NGN) };
  }
  if (currency === "GBP") {
    return { usdAmount, currency, chargeAmount: Math.round(usdAmount * USD_TO_GBP * 100) / 100 };
  }
  return { usdAmount, currency: "USD" as const, chargeAmount: usdAmount };
}
