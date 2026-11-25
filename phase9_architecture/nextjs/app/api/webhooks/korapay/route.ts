import crypto from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";

interface KoraWebhookBody {
  event?: string;
  data?: {
    reference?: string;
    status?: string;
    amount?: number;
    currency?: string;
    metadata?: {
      org_id?: string;
      target_tier?: "pro" | "agency";
    };
  };
}

export async function POST(request: NextRequest) {
  const secretKey = process.env.KORA_SECRET_KEY;
  if (!secretKey) {
    return NextResponse.json(
      { detail: "KORA_SECRET_KEY is not configured." },
      { status: 500 }
    );
  }

  const body = (await request.json()) as KoraWebhookBody;
  const signature = request.headers.get("x-korapay-signature");

  if (signature && body.data) {
    const expectedSignature = crypto
      .createHmac("sha256", secretKey)
      .update(JSON.stringify(body.data))
      .digest("hex");

    if (signature !== expectedSignature) {
      return NextResponse.json(
        { detail: "Invalid Kora Pay webhook signature." },
        { status: 401 }
      );
    }
  }

  if (body.event === "charge.success" && body.data?.status === "success") {
    const orgId = body.data.metadata?.org_id;
    const targetTier = body.data.metadata?.target_tier;

    // In production PostgreSQL / FastAPI:
    // UPDATE organizations
    // SET subscription_tier = $targetTier, trial_ends_at = NULL,
    //     monthly_task_limit = CASE WHEN $targetTier = 'pro' THEN 50 ELSE NULL END
    // WHERE id = $orgId;
    return NextResponse.json({
      received: true,
      upgradedOrgId: orgId ?? null,
      subscriptionTier: targetTier ?? "pro",
      reference: body.data.reference ?? null,
    });
  }

  return NextResponse.json({ received: true, ignored: true });
}
