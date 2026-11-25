import { GoogleGenAI, Type } from "@google/genai";

export interface SupportFaqReply {
  aiResponse: string;
  matchedTopic: string;
  confidence: number;
  suggestEscalation: boolean;
  model: string;
}

export const APEX_PLATFORM_FAQ_CONTEXT = `
Dutchkem Ventures Apex Data Copilot — Verified Platform Knowledge Base:
1. Kora Pay Escrow & Split Settlements:
   - Marketplace contracts use Kora Pay escrow funding with an 85% / 15% split (85% released to the verified annotator/freelancer, 15% platform coordination fee).
   - Multi-currency support includes NGN (local Nigerian bank & mobile money payouts) as well as USD, GBP, and EUR international transfers.
   - Users see masked Kora split references (e.g. split_***_abcd) and masked recipient IDs in /dashboard for security; full values are unmasked only to Finance/Super Admin staff under aud='apex:admin'.
2. Multimodal AI QA Evaluation Engines:
   - Vision Bounding-Box QA: Validates IoU overlap, label precision, and defect detection.
   - Audio QA: Validates MOS clarity, pronunciation accuracy, background noise, and Whisper/Gemini STT transcription alignment.
   - Text Localization QA: Evaluates Yoruba, Igbo, Hausa, Pidgin, French, and Spanish fluency + cultural fidelity.
3. Three-Plane Authentication & Optional 2FA:
   - Users sign in via /login (apex_user_session cookie) and can enable optional TOTP 2FA + 10 single-use backup codes in Settings -> Security (/dashboard/settings/security).
   - User logout clears only the user session cookie and redirects to /.
4. B2B API Gateway & Metered Billing:
   - Workspace admins generate sk_live_... API keys under API Gateway, monitor latency and usage logs, and settle metered Kora Pay invoices.
5. Job Board, Marketplace Auto-Bidder & Affiliate Program:
   - Public jobs live at /jobs-board and /jobs/<slug>. Referrers share /ref/<user_id> links to earn 10% recurring affiliate commissions.
6. NDPA Data Compliance & Tax Receipts:
   - Tax receipts and audit exports follow AES-256-GCM envelope encryption (KEK_USER / KEK_ADMIN with 90-day key rotation) and Nigerian Data Protection Act (NDPA) compliance rules.
`;

import { PromptVaultClient } from "../security/promptVault.js";

const supportVaultFallback = new PromptVaultClient();

export async function generateSupportAgentReply(
  ai: GoogleGenAI,
  input: {
    subject: string;
    message: string;
    userName: string;
    userRole: string;
    systemInstruction?: string;
  }
): Promise<SupportFaqReply> {
  const vaultSystemInstruction =
    input.systemInstruction ||
    (await supportVaultFallback.getDecryptedPrompt("support_agent")).systemPrompt;

  const response = await ai.models.generateContent({
    model: "gemini-4-hydrogen",
    contents: `User: ${input.userName} (role: ${input.userRole})
Ticket Subject: ${input.subject}
User Question: ${input.message}

Provide a clear, practical, step-by-step Tier-1 support answer grounded strictly in the Dutchkem Ventures Apex Data Copilot FAQ context.`,
    config: {
      systemInstruction: `${vaultSystemInstruction}\n\n${APEX_PLATFORM_FAQ_CONTEXT}`,
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          aiResponse: {
            type: Type.STRING,
            description: "Helpful customer support answer grounded in platform documentation.",
          },
          matchedTopic: {
            type: Type.STRING,
            description: "Short category slug such as kora_payouts, qa_engines, security_2fa, api_gateway, billing, or general.",
          },
          confidence: {
            type: Type.NUMBER,
            description: "Confidence score from 0.0 to 1.0.",
          },
          suggestEscalation: {
            type: Type.BOOLEAN,
            description: "True if human admin follow-up is recommended.",
          },
        },
        required: ["aiResponse", "matchedTopic", "confidence", "suggestEscalation"],
      },
    },
  });

  const parsed = JSON.parse((response.text ?? "{}").trim()) as Partial<SupportFaqReply>;
  return {
    aiResponse:
      parsed.aiResponse?.trim() ||
      "We reviewed your inquiry against the Apex Data Copilot FAQ. Please review details or click \"This didn't help\" to route directly to a human specialist.",
    matchedTopic: parsed.matchedTopic?.trim() || "general",
    confidence: typeof parsed.confidence === "number" ? Math.min(1, Math.max(0, parsed.confidence)) : 0.85,
    suggestEscalation: Boolean(parsed.suggestEscalation),
    model: "gemini-4-hydrogen",
  };
}
