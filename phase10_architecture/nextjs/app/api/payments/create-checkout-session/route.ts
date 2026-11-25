import { NextRequest, NextResponse } from "next/server";

const PRICE_PLAN_MAP: Record<
  string,
  { tier: "pro" | "agency"; amountUsd: number; amountNgn: number; amountGbp: number; tasksLimit: number | null }
> = {
  price_pro_monthly: { tier: "pro", amountUsd: 49, amountNgn: 75000, amountGbp: 39, tasksLimit: 50 },
  pro: { tier: "pro", amountUsd: 49, amountNgn: 75000, amountGbp: 39, tasksLimit: 50 },
  price_agency_monthly: { tier: "agency", amountUsd: 199, amountNgn: 305000, amountGbp: 158, tasksLimit: null },
  agency: { tier: "agency", amountUsd: 199, amountNgn: 305000, amountGbp: 158, tasksLimit: null },
};

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as {
      price_id?: string;
      tier?: "pro" | "agency";
      currency?: "USD" | "NGN" | "GBP";
      org_id?: string;
      user_id?: string;
      customer_email?: string;
      customer_name?: string;
    };

    const planKey = body.price_id || body.tier || "price_pro_monthly";
    const plan = PRICE_PLAN_MAP[planKey];
    if (!plan) {
      return NextResponse.json(
        { error: "Invalid price_id. Expected price_pro_monthly ($49/mo) or price_agency_monthly ($199/mo)." },
        { status: 400 }
      );
    }

    const origin = request.nextUrl.origin;
    const currency: "USD" | "NGN" | "GBP" =
      body.currency === "USD" ? "USD" : body.currency === "GBP" ? "GBP" : "NGN";
    const orgId = body.org_id || request.headers.get("x-org-id") || "";
    const userId = body.user_id || request.headers.get("x-user-id") || "";

    const reference = `kora_sub_${orgId.slice(0, 8) || "apex"}_${Date.now()}`;
    const chargeAmount =
      currency === "NGN" ? plan.amountNgn : currency === "GBP" ? plan.amountGbp : plan.amountUsd;
    const publicKey = process.env.NEXT_PUBLIC_KORA_PUBLIC_KEY || "";
    const koraSecret = process.env.KORA_SECRET_KEY || "";
    const webhookUrl =
      process.env.KORA_WEBHOOK_SECRET || `${origin}/api/webhooks/payment`;

    let checkoutUrl: string | null = null;
    if (koraSecret) {
      const koraRes = await fetch("https://api.korapay.com/merchant/api/v1/charges/initialize", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${koraSecret}`,
        },
        body: JSON.stringify({
          amount: chargeAmount,
          currency,
          reference,
          redirect_url: `${origin}/pricing?reference=${encodeURIComponent(reference)}&tier=${plan.tier}`,
          notification_url: webhookUrl,
          narration: `Dutchkem Ventures Apex Copilot (${plan.tier.toUpperCase()} - ${currency})`,
          customer: {
            name: body.customer_name || "Apex Subscriber",
            email: body.customer_email || "billing@dutchkemventures.com",
          },
          metadata: {
            org_id: orgId,
            user_id: userId,
            target_tier: plan.tier,
            price_id: planKey,
            settlement_scope: currency === "NGN" ? "domestic" : "international",
          },
        }),
      }).catch(() => null);

      if (koraRes?.ok) {
        const parsed = (await koraRes.json().catch(() => ({}))) as {
          status?: boolean;
          data?: { checkout_url?: string };
        };
        if (parsed.status && parsed.data?.checkout_url) {
          checkoutUrl = parsed.data.checkout_url;
        }
      }
    }

    return NextResponse.json(
      {
        provider: "korapay",
        sessionId: reference,
        priceId: planKey,
        targetTier: plan.tier,
        amountUsd: plan.amountUsd,
        chargeAmount,
        currency,
        publicKey,
        checkoutUrl,
        notificationUrl: webhookUrl,
        inlineReady: Boolean(publicKey),
      },
      { status: 201 }
    );
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to create checkout session." },
      { status: 500 }
    );
  }
}
