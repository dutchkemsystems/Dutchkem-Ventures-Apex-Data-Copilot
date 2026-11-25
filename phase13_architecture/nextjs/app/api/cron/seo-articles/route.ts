import crypto from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { GoogleGenAI } from "@google/genai";

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

  const ai = new GoogleGenAI({
    apiKey: process.env.GEMINI_API_KEY,
    httpOptions: { headers: { "User-Agent": "aistudio-build" } },
  });

  const response = await ai.models.generateContent({
    model: "gemini-4-hydrogen",
    contents:
      "Generate a 1,000-word SEO article guide on passing voice cloning and YOLOv8 video annotation QA contracts using Dutchkem Ventures Apex Data Copilot.",
  });

  return NextResponse.json({
    ok: true,
    job: "seo-articles",
    ranAt: new Date().toISOString(),
    previewChars: (response.text ?? "").length,
  });
}
