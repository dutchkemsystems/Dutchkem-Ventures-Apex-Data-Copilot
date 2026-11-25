import crypto from "node:crypto";
import { NextRequest, NextResponse } from "next/server";

function verifyKoraSignature(
  dataObject: unknown,
  signatureHeader: string | null,
  secretKey: string
): boolean {
  if (!signatureHeader || !secretKey || !dataObject) return false;
  const expectedHex = crypto
    .createHmac("sha256", secretKey)
    .update(JSON.stringify(dataObject))
    .digest("hex");
  const expectedBuf = Buffer.from(expectedHex, "utf8");
  const actualBuf = Buffer.from(signatureHeader, "utf8");
  if (expectedBuf.length !== actualBuf.length) return false;
  return crypto.timingSafeEqual(expectedBuf, actualBuf);
}

export async function POST(request: NextRequest) {
  const rawBody = await request.text();
  const koraSig = request.headers.get("x-korapay-signature");

  const payload = JSON.parse(rawBody || "{}") as {
    type?: string;
    event?: string;
    data?: {
      customer?: string;
      reference?: string;
      status?: string;
      metadata?: { org_id?: string; user_id?: string; target_tier?: "pro" | "agency" };
    };
  };

  if (koraSig) {
    const valid = verifyKoraSignature(
      payload.data,
      koraSig,
      process.env.KORA_SECRET_KEY || ""
    );
    if (!valid) {
      return NextResponse.json({ error: "Invalid Kora Pay webhook signature." }, { status: 401 });
    }
  }

  const eventType = payload.event || payload.type || "";
  const metadata = payload.data?.metadata || {};
  const orgId = metadata.org_id || "";
  const userId = metadata.user_id || "";
  const requestedTier: "pro" | "agency" =
    metadata.target_tier === "agency" ? "agency" : "pro";

  const isUpgradeSuccess =
    (eventType === "charge.success" && payload.data?.status === "success") ||
    eventType === "checkout.session.completed" ||
    eventType === "invoice.payment_succeeded";

  const isDowngradeOrFailure =
    eventType === "charge.failed" ||
    eventType === "subscription.cancelled" ||
    eventType === "invoice.payment_failed" ||
    eventType === "customer.subscription.deleted";

  if (isUpgradeSuccess) {
    const subscriptionEndsAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    const tasksLimit = requestedTier === "pro" ? 50 : Infinity;

    await fetch(`${process.env.FASTAPI_BACKEND_URL || "http://127.0.0.1:8000"}/api/v1/payments/sync`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        org_id: orgId,
        user_id: userId,
        subscription_tier: requestedTier,
        subscription_ends_at: subscriptionEndsAt.toISOString(),
        tasks_limit: Number.isFinite(tasksLimit) ? tasksLimit : null,
        subscription_locked: false,
      }),
    }).catch(() => undefined);

    return NextResponse.json({
      received: true,
      action: "upgraded",
      provider: "korapay",
      subscription_tier: requestedTier,
      subscription_ends_at: subscriptionEndsAt.toISOString(),
      tasks_limit: Number.isFinite(tasksLimit) ? tasksLimit : "Infinity",
      subscription_locked: false,
    });
  }

  if (isDowngradeOrFailure) {
    await fetch(`${process.env.FASTAPI_BACKEND_URL || "http://127.0.0.1:8000"}/api/v1/payments/sync`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        org_id: orgId,
        user_id: userId,
        subscription_tier: "trial",
        subscription_ends_at: null,
        tasks_limit: 3,
        subscription_locked: true,
      }),
    }).catch(() => undefined);

    return NextResponse.json({
      received: true,
      action: "downgraded_and_locked",
      provider: "korapay",
      subscription_tier: "trial",
      tasks_limit: 3,
      subscription_locked: true,
    });
  }

  return NextResponse.json({ received: true, ignored: true, event: eventType });
}
