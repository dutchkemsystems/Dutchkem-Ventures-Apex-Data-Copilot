/**
 * Phase 18A — Tax-Compliant PDF Receipt Generator using pdf-lib
 * Generates downloadable PDF receipts for Kora Pay 85/15 multi-currency (NGN & USD) payouts.
 */
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

export interface KoraTaxReceiptInput {
  receiptNumber: string;
  escrowId: string;
  freelancerName: string;
  koraRecipientId: string;
  currency: "NGN" | "USD";
  grossAmount: number;
  platformFee15Pct: number;
  vatOnFee: number;
  netPayout85Pct: number;
  koraTransactionId: string;
  splitRuleName: string;
  generatedAtIso: string;
}

export async function generateKoraTaxReceiptPdf(
  input: KoraTaxReceiptInput
): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([595.28, 841.89]); // A4 portrait
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const fontRegular = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontMono = await pdfDoc.embedFont(StandardFonts.Courier);

  const money = (value: number) =>
    `${input.currency} ${value.toLocaleString("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;

  // Header Band
  page.drawRectangle({
    x: 42,
    y: 740,
    width: 511,
    height: 62,
    color: rgb(0.06, 0.09, 0.16),
  });

  page.drawText("DUTCHKEM VENTURES — APEX DATA COPILOT", {
    x: 58,
    y: 778,
    size: 13,
    font: fontBold,
    color: rgb(1, 1, 1),
  });
  page.drawText("KORA PAY TAX-COMPLIANT MARKETPLACE SETTLEMENT RECEIPT", {
    x: 58,
    y: 758,
    size: 9,
    font: fontRegular,
    color: rgb(0.58, 0.77, 0.99),
  });

  let y = 708;
  const drawRow = (label: string, value: string, boldValue = false) => {
    page.drawText(label, {
      x: 48,
      y,
      size: 10,
      font: fontRegular,
      color: rgb(0.35, 0.4, 0.48),
    });
    page.drawText(value, {
      x: 260,
      y,
      size: 10,
      font: boldValue ? fontBold : fontMono,
      color: rgb(0.06, 0.09, 0.16),
    });
    y -= 24;
  };

  drawRow("Receipt Number", input.receiptNumber, true);
  drawRow("Generated Date (UTC)", new Date(input.generatedAtIso).toISOString());
  drawRow("Escrow Ledger ID", input.escrowId);
  drawRow("Split Rule", `${input.splitRuleName} (85% Freelancer / 15% Platform)`);
  drawRow("Freelancer Name", input.freelancerName, true);
  drawRow("Kora Recipient ID", input.koraRecipientId);
  drawRow("Kora Transaction Reference", input.koraTransactionId);

  y -= 10;
  page.drawLine({
    start: { x: 48, y: y + 12 },
    end: { x: 547, y: y + 12 },
    thickness: 1,
    color: rgb(0.85, 0.88, 0.92),
  });

  drawRow("Gross Escrow Received from Client", money(input.grossAmount), true);
  drawRow("Platform Commission Fee (15%)", `- ${money(input.platformFee15Pct)}`);
  drawRow("VAT on Platform Fee (7.5% NG / 0% Export)", money(input.vatOnFee));
  drawRow("Net Freelancer Payout (85% Split)", money(input.netPayout85Pct), true);

  y -= 16;
  page.drawText(
    "Settlement Window: T+2 business days via Kora Pay Multi-Currency Settlement Rail.",
    {
      x: 48,
      y,
      size: 9,
      font: fontRegular,
      color: rgb(0.25, 0.32, 0.42),
    }
  );

  return pdfDoc.save();
}
