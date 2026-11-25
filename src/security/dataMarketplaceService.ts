import crypto from "node:crypto";
import type {
  CertificationCurrency,
  DatasetCategory,
  DatasetPurchaseRecord,
  MarketplaceDataset,
} from "../types/tenant.js";

export const DATA_MARKETPLACE_COMMISSION_RATE = 0.1; // 10% platform commission via Kora Pay split
export const DATA_MARKETPLACE_SELLER_SHARE_RATE = 0.9; // 90% to dataset creator
export const MINIMUM_LISTING_QA_SCORE = 85;

const UNMASKED_PII_PATTERNS: RegExp[] = [
  /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/,
  /\b\d{11}\b/, // Nigerian NIN / BVN length
  /\b(?:\+?\d{1,3}[-.\s]?)?(?:\(?\d{3}\)?[-.\s]?)\d{3}[-.\s]?\d{4}\b/,
  /\b(?:\d{4}[-\s]?){3}\d{4}\b/, // 16-digit PAN
];

export function computeMarketplaceCurrencyAmount(
  usdAmount: number,
  currency: CertificationCurrency
): number {
  if (currency === "NGN") return Math.round(usdAmount * 1530);
  if (currency === "GBP") return Math.round(usdAmount * 0.79 * 100) / 100;
  return Math.round(usdAmount * 100) / 100;
}

export function detectUnmaskedPii(fields: string[]): string | null {
  for (const field of fields) {
    if (!field) continue;
    for (const pattern of UNMASKED_PII_PATTERNS) {
      if (pattern.test(field)) {
        return "Detected potential unmasked PII (email, phone number, BVN/NIN, or card number). Redact before listing.";
      }
    }
  }
  return null;
}

export function computeTenPercentKoraSplit(priceUsd: number): {
  grossPriceUsd: number;
  platformCommission10Pct: number;
  sellerPayout90Pct: number;
} {
  const gross = Math.round(priceUsd * 100) / 100;
  const commission = Math.round(gross * DATA_MARKETPLACE_COMMISSION_RATE * 100) / 100;
  const seller = Math.round((gross - commission) * 100) / 100;
  return {
    grossPriceUsd: gross,
    platformCommission10Pct: commission,
    sellerPayout90Pct: seller,
  };
}

export class DataMarketplaceService {
  private readonly datasets: MarketplaceDataset[] = [];
  private readonly purchases: DatasetPurchaseRecord[] = [];
  private readonly downloadTokens = new Map<string, string>();

  constructor() {
    this.seedInitialDatasets();
  }

  private seedInitialDatasets(): void {
    this.datasets.push(
      {
        id: "ds-21f-yoruba-speech-01",
        seller_id: "33333333-3333-4333-8333-000000000001",
        seller_name: "Amina Okafor · Solstice Freelance Collective",
        seller_email: "amina@solsticefreelance.io",
        org_id: "7c9d2e40-1a33-4f7b-9e21-000000000003",
        org_name: "Solstice Freelance Collective",
        title: "Yoruba & Igbo 24kHz Tonal Conversational Speech Corpus",
        description:
          "Studio-recorded multi-speaker Yoruba and Igbo conversational speech with full diacritic-preserved transcripts and NDPA PII anonymization.",
        category: "audio_speech",
        sample_count: 1200,
        price: 1450,
        anonymized: true,
        qa_validated: true,
        qa_score: 97.4,
        qa_report_summary: "AudioQaEngine PASSED · 24kHz Mono · Mean SNR 43.2 dB · Floor -80.5 dBFS · 0% WER outliers",
        source_ref: "jb-1503-yoruba-tts",
        locale: "yo-NG / ig-NG",
        format_spec: "24kHz Mono PCM WAV + Anonymized JSONL",
        preview_samples: [
          "{\"utterance_id\":\"yo_001\",\"speaker\":\"[ANON_SPK_04]\",\"snr_db\":44.1,\"text\":\"Ẹ káàrọ̀, ṣé àlàáfíà ni?\",\"pii_redacted\":true}",
          "{\"utterance_id\":\"ig_042\",\"speaker\":\"[ANON_SPK_11]\",\"snr_db\":42.8,\"text\":\"Biko nyere m aka lelee akwụkwọ a.\",\"pii_redacted\":true}",
        ],
        purchases_count: 2,
        status: "listed",
        created_at: "2026-11-14T10:30:00Z",
      },
      {
        id: "ds-21f-latam-tts-02",
        seller_id: "11111111-1111-4111-8111-000000000002",
        seller_name: "Elena Rostova · Dutchkem Ventures Agency",
        seller_email: "elena.rostova@dutchkemventures.com",
        org_id: "8a1f3c20-4b11-4d9a-9f12-000000000001",
        org_name: "Dutchkem Ventures Agency",
        title: "LATAM Spanish Expressive Prosody TTS Dataset (es-MX / es-CO)",
        description:
          "Expressive multi-register Spanish prompts validated through librosa DSP gating (-4.2 dBFS peak average) for neural voice cloning.",
        category: "audio_speech",
        sample_count: 680,
        price: 980,
        anonymized: true,
        qa_validated: true,
        qa_score: 98.1,
        qa_report_summary: "AudioQaEngine PASSED · 24kHz Mono · Mean SNR 45.1 dB · Peak -4.4 dBFS",
        source_ref: "mb-1201-es-tts",
        locale: "es-MX / es-CO",
        format_spec: "24kHz Mono WAV + IPA Alignment JSONL",
        preview_samples: [
          "{\"utterance_id\":\"es_mx_019\",\"speaker\":\"[ANON_VOX_02]\",\"snr_db\":45.6,\"ipa\":\"konˈfiɾmo ke la ɡɾaβaˈsjon\",\"pii_redacted\":true}",
        ],
        purchases_count: 3,
        status: "listed",
        created_at: "2026-11-15T14:20:00Z",
      },
      {
        id: "ds-21f-yolo-warehouse-03",
        seller_id: "22222222-2222-4222-8222-000000000002",
        seller_name: "Kenji Takahashi · Vanguard Speech Labs",
        seller_email: "kenji@vanguardspeech.ai",
        org_id: "9b4e7d10-8c22-4a8e-b301-000000000002",
        org_name: "Vanguard Speech Labs",
        title: "Industrial Warehouse & Forklift YOLOv8 Bounding Box Benchmark",
        description:
          "High-density logistics frames with verified IoU >= 0.86 labels for pallet jacks, PPE helmets, and loading dock safety zones (faces/plates blurred).",
        category: "vision_bbox",
        sample_count: 2400,
        price: 1850,
        anonymized: true,
        qa_validated: true,
        qa_score: 94.8,
        qa_report_summary: "VisionQaEngine (YOLOv8) PASSED · Mean IoU 0.884 (>= 0.70) · Faces Blurred",
        source_ref: "jb-1502-vision-yolo",
        locale: "Global Industrial",
        format_spec: "COCO JSON + YOLO TXT + Anonymized Frame Manifest",
        preview_samples: [
          "{\"frame_id\":\"wh_0812\",\"classes\":[\"pallet\",\"forklift\",\"ppe_helmet\"],\"mean_iou\":0.91,\"faces_blurred\":true}",
        ],
        purchases_count: 1,
        status: "listed",
        created_at: "2026-11-16T09:15:00Z",
      },
      {
        id: "ds-21f-redteam-ndpa-04",
        seller_id: "11111111-1111-4111-8111-000000000001",
        seller_name: "Hendrik van der Berg · Dutchkem Ventures Agency",
        seller_email: "hendrik@dutchkemventures.com",
        org_id: "8a1f3c20-4b11-4d9a-9f12-000000000001",
        org_name: "Dutchkem Ventures Agency",
        title: "Multilingual Prompt Injection & FinTech Guardrail Red-Team Corpus",
        description:
          "Adversarial jailbreak and system prompt exfiltration probes paired with safe policy refusal rubrics and sanitized synthetic placeholders.",
        category: "red_team_eval",
        sample_count: 850,
        price: 720,
        anonymized: true,
        qa_validated: true,
        qa_score: 96.0,
        qa_report_summary: "Text & PromptGuard Rubric PASSED · Score 96/100 · Synthetic Placeholders Only",
        source_ref: "rt-1304-guardrail",
        locale: "en-US / en-NG / fr-FR",
        format_spec: "Sanitized JSONL Adversarial Eval Pairs",
        preview_samples: [
          "{\"probe_id\":\"rt_109\",\"vector\":\"system_exfiltration\",\"sanitized_prompt\":\"Simulate credential boundary refusal for [ORG_TOKEN]\",\"rubric_score\":5}",
        ],
        purchases_count: 4,
        status: "listed",
        created_at: "2026-11-17T11:45:00Z",
      }
    );

    const seedSplit = computeTenPercentKoraSplit(1450);
    this.purchases.push({
      id: "dspay-seed-001",
      dataset_id: "ds-21f-yoruba-speech-01",
      dataset_title: "Yoruba & Igbo 24kHz Tonal Conversational Speech Corpus",
      seller_id: "33333333-3333-4333-8333-000000000001",
      seller_name: "Amina Okafor · Solstice Freelance Collective",
      buyer_org_name: "Harmonic Voice AI",
      buyer_email: "datasets@harmonicvoice.ai",
      gross_price_usd: seedSplit.grossPriceUsd,
      platform_commission_10pct: seedSplit.platformCommission10Pct,
      seller_payout_90pct: seedSplit.sellerPayout90Pct,
      currency: "USD",
      charge_amount: 1450,
      kora_reference: "kora_ds_seed_001",
      kora_split_reference: "kpsplit_10_90_seed_001",
      payment_status: "paid",
      download_token: "dl_seed_token_001",
      created_at: "2026-11-16T16:10:00Z",
      paid_at: "2026-11-16T16:11:02Z",
    });
    this.downloadTokens.set("dspay-seed-001", "dl_seed_token_001");
  }

  public listCatalog(params?: {
    category?: string;
    query?: string;
  }): MarketplaceDataset[] {
    const q = (params?.query || "").trim().toLowerCase();
    const cat = (params?.category || "").trim();

    return this.datasets
      .filter((d) => d.status === "listed" && d.qa_validated && d.anonymized)
      .filter((d) => (!cat || cat === "all" ? true : d.category === cat))
      .filter((d) => {
        if (!q) return true;
        return [
          d.title,
          d.description,
          d.category,
          d.locale,
          d.seller_name,
          d.org_name,
        ]
          .join(" ")
          .toLowerCase()
          .includes(q);
      })
      .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at));
  }

  public getDatasetById(id: string): MarketplaceDataset | null {
    return this.datasets.find((d) => d.id === id) || null;
  }

  /**
   * Fail-closed dataset listing: rejects unless QA validated (>= 85) AND anonymized=true with 0 unmasked PII.
   */
  public listCompletedDataset(input: {
    sellerId: string;
    sellerName: string;
    sellerEmail: string;
    orgId: string;
    orgName: string;
    title: string;
    description: string;
    category: DatasetCategory;
    sampleCount: number;
    priceUsd: number;
    anonymized: boolean;
    qaValidated: boolean;
    qaScore: number;
    qaReportSummary: string;
    sourceRef: string;
    locale?: string;
    formatSpec?: string;
    previewSamples?: string[];
  }):
    | { ok: true; dataset: MarketplaceDataset }
    | { ok: false; status: number; code: string; detail: string } {
    const cleanTitle = (input.title || "").trim();
    const cleanDesc = (input.description || "").trim();
    const cleanSource = (input.sourceRef || "").trim();
    const cleanSummary = (input.qaReportSummary || "").trim();

    if (cleanTitle.length < 5 || cleanDesc.length < 12) {
      return {
        ok: false,
        status: 400,
        code: "INVALID_METADATA",
        detail: "Provide a dataset title (>= 5 chars) and technical description (>= 12 chars).",
      };
    }

    if (!Number.isFinite(input.sampleCount) || input.sampleCount < 1) {
      return {
        ok: false,
        status: 400,
        code: "INVALID_SAMPLE_COUNT",
        detail: "Sample count must be a positive integer.",
      };
    }

    if (!Number.isFinite(input.priceUsd) || input.priceUsd <= 0) {
      return {
        ok: false,
        status: 400,
        code: "INVALID_PRICE",
        detail: "Listing price (USD) must be greater than $0.",
      };
    }

    // Fail closed if QA validation gate has not passed
    if (!input.qaValidated || !Number.isFinite(input.qaScore) || input.qaScore < MINIMUM_LISTING_QA_SCORE) {
      return {
        ok: false,
        status: 422,
        code: "QA_VALIDATION_REQUIRED",
        detail: `Dataset listing blocked (fail closed): automated QA validation must pass with score >= ${MINIMUM_LISTING_QA_SCORE}% before listing.`,
      };
    }

    // Fail closed if anonymization flag is false or unmasked PII appears
    if (!input.anonymized) {
      return {
        ok: false,
        status: 422,
        code: "ANONYMIZATION_REQUIRED",
        detail:
          "Dataset listing blocked (fail closed): NDPA 2023 PII anonymization attestation must be confirmed before listing.",
      };
    }

    const previewSamples = (input.previewSamples || [])
      .map((s) => s.trim())
      .filter(Boolean)
      .slice(0, 5);

    const piiViolation = detectUnmaskedPii([cleanTitle, cleanDesc, ...previewSamples]);
    if (piiViolation) {
      return {
        ok: false,
        status: 422,
        code: "UNMASKED_PII_DETECTED",
        detail: piiViolation,
      };
    }

    const defaultFormatByCat: Record<DatasetCategory, string> = {
      audio_speech: "24kHz Mono PCM WAV + Anonymized JSONL",
      vision_bbox: "COCO JSON + YOLO Bounding Box Set",
      multilingual_text: "Normalized UTF-8 JSONL + Rubric Metadata",
      red_team_eval: "Sanitized Adversarial Prompt/Response JSONL",
    };

    const dataset: MarketplaceDataset = {
      id: `ds-${crypto.randomUUID().slice(0, 10)}`,
      seller_id: input.sellerId,
      seller_name: `${input.sellerName} · ${input.orgName}`,
      seller_email: input.sellerEmail,
      org_id: input.orgId,
      org_name: input.orgName,
      title: cleanTitle,
      description: cleanDesc,
      category: input.category,
      sample_count: Math.round(input.sampleCount),
      price: Math.round(input.priceUsd * 100) / 100,
      anonymized: true,
      qa_validated: true,
      qa_score: Math.round(input.qaScore * 10) / 10,
      qa_report_summary: cleanSummary || `QA PASSED (${input.qaScore}%)`,
      source_ref: cleanSource || "completed-qa-cohort",
      locale: (input.locale || "").trim() || "Global",
      format_spec: (input.formatSpec || "").trim() || defaultFormatByCat[input.category],
      preview_samples:
        previewSamples.length > 0
          ? previewSamples
          : [
              JSON.stringify({
                sample_id: "sample_0001",
                qa_score: Math.round(input.qaScore * 10) / 10,
                pii_redacted: true,
                source: cleanSource || "verified_batch",
              }),
            ],
      purchases_count: 0,
      status: "listed",
      created_at: new Date().toISOString(),
    };

    this.datasets.unshift(dataset);
    return { ok: true, dataset };
  }

  public initializePurchase(params: {
    datasetId: string;
    buyerOrgName: string;
    buyerEmail: string;
    currency: CertificationCurrency;
  }):
    | { ok: true; purchase: DatasetPurchaseRecord; dataset: MarketplaceDataset }
    | { ok: false; status: number; code: string; detail: string } {
    const dataset = this.getDatasetById(params.datasetId);
    if (!dataset || dataset.status !== "listed" || !dataset.qa_validated || !dataset.anonymized) {
      return {
        ok: false,
        status: 404,
        code: "DATASET_NOT_AVAILABLE",
        detail: "Requested QA-validated dataset is not available for purchase.",
      };
    }

    const cleanOrg = (params.buyerOrgName || "").trim();
    const cleanEmail = (params.buyerEmail || "").trim().toLowerCase();
    if (cleanOrg.length < 2 || !cleanEmail.includes("@")) {
      return {
        ok: false,
        status: 400,
        code: "INVALID_BUYER_DETAILS",
        detail: "Provide buyer AI Lab organization name and delivery email.",
      };
    }

    const split = computeTenPercentKoraSplit(dataset.price);
    const chargeAmount = computeMarketplaceCurrencyAmount(
      split.grossPriceUsd,
      params.currency
    );
    const purchaseId = `dspay-${crypto.randomUUID().slice(0, 10)}`;

    const purchase: DatasetPurchaseRecord = {
      id: purchaseId,
      dataset_id: dataset.id,
      dataset_title: dataset.title,
      seller_id: dataset.seller_id,
      seller_name: dataset.seller_name,
      buyer_org_name: cleanOrg,
      buyer_email: cleanEmail,
      gross_price_usd: split.grossPriceUsd,
      platform_commission_10pct: split.platformCommission10Pct,
      seller_payout_90pct: split.sellerPayout90Pct,
      currency: params.currency,
      charge_amount: chargeAmount,
      kora_reference: `kora_ds_${Date.now()}_${crypto.randomUUID().slice(0, 6)}`,
      kora_split_reference: `kpsplit_10_90_${crypto.randomUUID().slice(0, 8)}`,
      payment_status: "pending",
      download_token: null,
      created_at: new Date().toISOString(),
      paid_at: null,
    };

    this.purchases.unshift(purchase);
    return { ok: true, purchase, dataset };
  }

  public findPurchaseByReference(reference: string): DatasetPurchaseRecord | null {
    return this.purchases.find((p) => p.kora_reference === reference) || null;
  }

  public getPurchaseById(purchaseId: string): DatasetPurchaseRecord | null {
    return this.purchases.find((p) => p.id === purchaseId) || null;
  }

  public markPurchasePaidAndIssueDownload(
    reference: string
  ): { purchase: DatasetPurchaseRecord; dataset: MarketplaceDataset | null } | null {
    const purchase = this.findPurchaseByReference(reference);
    if (!purchase) return null;

    if (purchase.payment_status !== "paid") {
      purchase.payment_status = "paid";
      purchase.paid_at = new Date().toISOString();
      const token = `dl_${crypto.randomBytes(16).toString("hex")}`;
      purchase.download_token = token;
      this.downloadTokens.set(purchase.id, token);

      const dataset = this.getDatasetById(purchase.dataset_id);
      if (dataset) {
        dataset.purchases_count += 1;
      }
      return { purchase, dataset };
    }

    return { purchase, dataset: this.getDatasetById(purchase.dataset_id) };
  }

  /**
   * Fail-closed download gate: requires paid status + matching cryptographic token.
   */
  public authorizeDownload(
    purchaseId: string,
    token: string
  ):
    | {
        ok: true;
        purchase: DatasetPurchaseRecord;
        dataset: MarketplaceDataset;
        bundleJsonl: string;
      }
    | { ok: false; status: number; code: string; detail: string } {
    const purchase = this.getPurchaseById(purchaseId);
    if (!purchase) {
      return {
        ok: false,
        status: 404,
        code: "PURCHASE_NOT_FOUND",
        detail: "Dataset purchase record not found.",
      };
    }

    if (purchase.payment_status !== "paid") {
      return {
        ok: false,
        status: 402,
        code: "PAYMENT_REQUIRED",
        detail:
          "Kora Pay settlement required before unlocking dataset download (fail closed).",
      };
    }

    const expectedToken = this.downloadTokens.get(purchase.id) || "";
    const providedBuf = Buffer.from(token || "", "utf8");
    const expectedBuf = Buffer.from(expectedToken, "utf8");
    if (
      expectedBuf.length === 0 ||
      providedBuf.length !== expectedBuf.length ||
      !crypto.timingSafeEqual(providedBuf, expectedBuf)
    ) {
      return {
        ok: false,
        status: 403,
        code: "INVALID_DOWNLOAD_TOKEN",
        detail: "Invalid or missing dataset download authorization token.",
      };
    }

    const dataset = this.getDatasetById(purchase.dataset_id);
    if (!dataset) {
      return {
        ok: false,
        status: 404,
        code: "DATASET_MISSING",
        detail: "Dataset record missing.",
      };
    }

    const manifestLine = JSON.stringify({
      type: "apex_dataset_manifest",
      dataset_id: dataset.id,
      title: dataset.title,
      category: dataset.category,
      sample_count: dataset.sample_count,
      qa_validated: dataset.qa_validated,
      qa_score: dataset.qa_score,
      anonymized: dataset.anonymized,
      buyer_org: purchase.buyer_org_name,
      kora_reference: purchase.kora_reference,
      kora_split_reference: purchase.kora_split_reference,
      platform_commission_10pct: purchase.platform_commission_10pct,
      seller_payout_90pct: purchase.seller_payout_90pct,
    });
    const bundleJsonl = [manifestLine, ...dataset.preview_samples].join("\n");

    return { ok: true, purchase, dataset, bundleJsonl };
  }

  public getSellerSummary(sellerOrgId: string): {
    listedDatasets: MarketplaceDataset[];
    settledSales: DatasetPurchaseRecord[];
    totalGrossSalesUsd: number;
    totalPlatformCommission10PctUsd: number;
    totalSellerNet90PctUsd: number;
  } {
    const listedDatasets = this.datasets.filter((d) => d.org_id === sellerOrgId);
    const datasetIds = new Set(listedDatasets.map((d) => d.id));
    const settledSales = this.purchases.filter(
      (p) => datasetIds.has(p.dataset_id) && p.payment_status === "paid"
    );

    const totalGrossSalesUsd =
      Math.round(settledSales.reduce((s, p) => s + p.gross_price_usd, 0) * 100) / 100;
    const totalPlatformCommission10PctUsd =
      Math.round(
        settledSales.reduce((s, p) => s + p.platform_commission_10pct, 0) * 100
      ) / 100;
    const totalSellerNet90PctUsd =
      Math.round(settledSales.reduce((s, p) => s + p.seller_payout_90pct, 0) * 100) / 100;

    return {
      listedDatasets,
      settledSales,
      totalGrossSalesUsd,
      totalPlatformCommission10PctUsd,
      totalSellerNet90PctUsd,
    };
  }

  public getCatalogMetrics(): {
    listedDatasetsCount: number;
    totalSamplesCount: number;
    totalGrossSalesUsd: number;
    platformCommissionPct: number;
    sellerPayoutPct: number;
  } {
    const listed = this.listCatalog();
    const paidPurchases = this.purchases.filter((p) => p.payment_status === "paid");
    return {
      listedDatasetsCount: listed.length,
      totalSamplesCount: listed.reduce((s, d) => s + d.sample_count, 0),
      totalGrossSalesUsd:
        Math.round(paidPurchases.reduce((s, p) => s + p.gross_price_usd, 0) * 100) / 100,
      platformCommissionPct: 10,
      sellerPayoutPct: 90,
    };
  }
}
