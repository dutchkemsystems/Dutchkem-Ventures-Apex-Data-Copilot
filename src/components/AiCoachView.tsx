import React, { useCallback, useEffect, useState } from "react";
import {
  ArrowLeft,
  AudioWaveform,
  CheckCircle2,
  Compass,
  CreditCard,
  Eye,
  FileAudio,
  FileText,
  Lock,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Upload,
  XCircle,
} from "lucide-react";
import type {
  CertificationCurrency,
  CoachModality,
  CoachPreflightReport,
  CoachProSubscription,
} from "../types/tenant";

interface AiCoachViewProps {
  orgId: string;
  orgName: string;
  userId: string;
  userName: string;
  userEmail: string;
  standalone?: boolean;
  isAuthenticated?: boolean;
  onReturnHomepage?: () => void;
  onOpenJobBoard?: () => void;
  onOpenLogin?: () => void;
}

interface CoachStatusResponse {
  tierName: "coach_pro";
  tierLabel: "Coach Pro";
  monthlyPriceUsd: number;
  currencyAmounts: Record<CertificationCurrency, number>;
  active: boolean;
  subscription: CoachProSubscription | null;
  history: CoachPreflightReport[];
  koraPublicKey: string;
}

interface UploadedWavEntry {
  fileName: string;
  audioBase64: string;
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result || "");
      const idx = result.indexOf(",");
      resolve(idx >= 0 ? result.slice(idx + 1) : result);
    };
    reader.onerror = () => reject(new Error(`Failed to read WAV file ${file.name}.`));
    reader.readAsDataURL(file);
  });
}

export function AiCoachView({
  orgId,
  orgName,
  userId,
  userName,
  userEmail,
  standalone = false,
  isAuthenticated = true,
  onReturnHomepage,
  onOpenJobBoard,
  onOpenLogin,
}: AiCoachViewProps) {
  const [statusData, setStatusData] = useState<CoachStatusResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [currency, setCurrency] = useState<CertificationCurrency>("NGN");
  const [pendingSub, setPendingSub] = useState<CoachProSubscription | null>(null);

  const [modality, setModality] = useState<CoachModality>("audio");
  const [audioPreset, setAudioPreset] = useState<"batch_with_4db_floor_defect" | "studio_clean_batch">(
    "batch_with_4db_floor_defect"
  );
  const [uploadedWavs, setUploadedWavs] = useState<UploadedWavEntry[]>([]);

  const [visionPreset, setVisionPreset] = useState<"mixed_iou_fail" | "clean_iou_pass">(
    "mixed_iou_fail"
  );
  const [visionJsonInput, setVisionJsonInput] = useState(
    JSON.stringify(
      {
        predictedBoxes: [
          { id: "b1", label: "pallet", x1: 112, y1: 182, x2: 418, y2: 388 },
          { id: "b2", label: "forklift", x1: 480, y1: 140, x2: 660, y2: 310 },
        ],
        referenceBoxes: [
          { id: "r1", label: "pallet", x1: 110, y1: 180, x2: 420, y2: 390 },
          { id: "r2", label: "forklift", x1: 520, y1: 160, x2: 720, y2: 360 },
        ],
      },
      null,
      2
    )
  );

  const [sourceLocale, setSourceLocale] = useState("English (en-US)");
  const [targetLocale, setTargetLocale] = useState("Yoruba (yo-NG)");
  const [sourcePromptText, setSourcePromptText] = useState(
    "Confirm studio microphone gain sits cleanly below -3 dBFS."
  );
  const [localizedDraftText, setLocalizedDraftText] = useState(
    "Jẹ́rìísí pé agbóhùnsáfẹ́fẹ́ ilé-ìṣe wà ní ìwọ̀n tó mọ́."
  );

  const [latestReport, setLatestReport] = useState<CoachPreflightReport | null>(null);
  const [busyAction, setBusyAction] = useState<
    "subscribe" | "verify" | "cancel" | "analyze" | null
  >(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const authHeaders = useCallback(
    (): Record<string, string> => ({
      "Content-Type": "application/json",
      ...(orgId ? { "x-org-id": orgId } : {}),
      ...(userId ? { "x-user-id": userId } : {}),
    }),
    [orgId, userId]
  );

  const loadStatus = useCallback(async () => {
    if (!orgId || !userId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(
        `/api/coach/status?userId=${encodeURIComponent(userId)}&orgId=${encodeURIComponent(orgId)}`,
        {
          credentials: "include",
          headers: { "x-org-id": orgId, "x-user-id": userId },
        }
      );
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.detail || "Unable to load AI Coach Pro status.");
      }
      const data = (await res.json()) as CoachStatusResponse;
      setStatusData(data);
      if (data.subscription?.status === "pending") {
        setPendingSub(data.subscription);
      } else {
        setPendingSub(null);
      }
      if (data.history?.length > 0 && !latestReport) {
        setLatestReport(data.history[0]);
      }
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Failed to load AI Coach.");
    } finally {
      setLoading(false);
    }
  }, [orgId, userId, latestReport]);

  useEffect(() => {
    void loadStatus();
  }, [loadStatus]);

  async function handleVerifySubscription(reference: string, gatewayStatus = "success") {
    setErrorMsg(null);
    setBusyAction("verify");
    try {
      const res = await fetch("/api/coach/subscribe/verify", {
        method: "POST",
        credentials: "include",
        headers: authHeaders(),
        body: JSON.stringify({ reference, gatewayStatus, userId, orgId }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.detail || "Unable to verify $19/month Coach Pro subscription.");
      }
      setPendingSub(null);
      setNotice(
        `Coach Pro ($19/month) active via Kora Pay (${reference}). Pre-flight AI Coach QA checks unlocked.`
      );
      await loadStatus();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Subscription verification failed.");
    } finally {
      setBusyAction(null);
    }
  }

  async function handleStartCoachPro() {
    if (!isAuthenticated || !userId || !orgId) {
      onOpenLogin?.();
      return;
    }
    setErrorMsg(null);
    setNotice(null);
    setBusyAction("subscribe");
    try {
      const res = await fetch("/api/coach/subscribe/initialize", {
        method: "POST",
        credentials: "include",
        headers: authHeaders(),
        body: JSON.stringify({ currency, userId, orgId }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.detail || "Failed to initialize Coach Pro ($19/mo) checkout.");
      }

      if (data.alreadyActive) {
        setNotice("Coach Pro ($19/month) subscription is already active.");
        await loadStatus();
        return;
      }

      setPendingSub(data.subscription);

      const korapayGlobal = (
        window as unknown as {
          Korapay?: { initialize: (opts: Record<string, unknown>) => void };
        }
      ).Korapay;

      if (korapayGlobal && (data.publicKey || statusData?.koraPublicKey)) {
        korapayGlobal.initialize({
          key: data.publicKey || statusData?.koraPublicKey,
          reference: data.reference,
          amount: data.chargeAmount,
          currency: data.currency,
          narration: "Dutchkem Coach Pro Monthly Subscription ($19/mo)",
          customer: { name: userName, email: userEmail },
          onSuccess: () => {
            void handleVerifySubscription(data.reference, "success");
          },
        });
      }

      setNotice(
        `Initialized Coach Pro ($19/mo · ${data.currency} ${Number(data.chargeAmount).toLocaleString()}). Confirm settlement below to unlock AI Coach pre-flight analysis.`
      );
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Failed to start Coach Pro checkout.");
    } finally {
      setBusyAction(null);
    }
  }

  async function handleCancelCoachPro() {
    setErrorMsg(null);
    setBusyAction("cancel");
    try {
      const res = await fetch("/api/coach/subscribe/cancel", {
        method: "POST",
        credentials: "include",
        headers: authHeaders(),
        body: JSON.stringify({ userId, orgId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Unable to cancel Coach Pro.");
      setNotice("Coach Pro ($19/mo) canceled. Pre-flight QA analysis is now re-gated fail closed.");
      await loadStatus();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Cancellation failed.");
    } finally {
      setBusyAction(null);
    }
  }

  async function handleWavFileInput(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;
    try {
      const encoded = await Promise.all(
        files.slice(0, 6).map(async (f) => ({
          fileName: f.name,
          audioBase64: await fileToBase64(f),
        }))
      );
      setUploadedWavs(encoded);
      setNotice(`Loaded ${encoded.length} local WAV file(s) ready for pre-flight AI Coach inspection.`);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Could not read uploaded WAV files.");
    }
  }

  async function handleRunPreflight(e: React.FormEvent) {
    e.preventDefault();
    setErrorMsg(null);
    setNotice(null);
    setBusyAction("analyze");
    try {
      let payload: Record<string, unknown> = { modality, userId, orgId };
      if (modality === "audio") {
        payload = {
          ...payload,
          audioPreset,
          audioFiles: uploadedWavs.length > 0 ? uploadedWavs : undefined,
        };
      } else if (modality === "vision") {
        let parsedBoxes: Record<string, unknown> = {};
        try {
          parsedBoxes = JSON.parse(visionJsonInput);
        } catch {
          throw new Error("Invalid Vision JSON bounding boxes payload.");
        }
        payload = {
          ...payload,
          visionPreset,
          ...parsedBoxes,
        };
      } else {
        payload = {
          ...payload,
          sourceLocale,
          targetLocale,
          sourceText: sourcePromptText,
          localizedText: localizedDraftText,
        };
      }

      const res = await fetch("/api/coach/analyze", {
        method: "POST",
        credentials: "include",
        headers: authHeaders(),
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.detail || "Pre-flight AI Coach analysis rejected.");
      }

      setLatestReport(data.report);
      setNotice(
        `Pre-flight completed: Predicted QA pass rate ${data.report.predicted_pass_rate_pct}% (${data.report.issues.length} issue(s) identified).`
      );
      await loadStatus();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Pre-flight QA check failed.");
    } finally {
      setBusyAction(null);
    }
  }

  const isCoachProActive = Boolean(statusData?.active);
  const currencyMap = statusData?.currencyAmounts ?? {
    USD: 19,
    NGN: 29070,
    GBP: 15.01,
  };
  const formattedPrice =
    currency === "NGN"
      ? `₦${currencyMap.NGN.toLocaleString()}`
      : currency === "GBP"
        ? `£${currencyMap.GBP.toFixed(2)}`
        : `$${currencyMap.USD}`;
  const history = statusData?.history || [];

  return (
    <div className={standalone ? "min-h-screen bg-[#F8FAFF] text-[#0F172A]" : "space-y-8"}>
      {standalone && (
        <header className="sticky top-0 z-40 border-b border-slate-200/80 bg-white/90 backdrop-blur-xl">
          <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-8 px-6">
            <button
              type="button"
              onClick={onReturnHomepage}
              className="inline-flex items-center gap-2.5 text-base font-bold tracking-tight text-slate-900 whitespace-nowrap shrink-0"
            >
              <span className="w-7 h-7 rounded-lg bg-gradient-to-br from-blue-600 via-sky-500 to-emerald-500 text-white flex items-center justify-center shadow-xs">
                <Compass className="w-4 h-4" />
              </span>
              <span>Dutchkem Ventures</span>
            </button>

            <div className="flex items-center gap-4 text-sm font-medium text-slate-600">
              {onReturnHomepage && (
                <button
                  type="button"
                  onClick={onReturnHomepage}
                  className="inline-flex items-center gap-1.5 hover:text-blue-700 whitespace-nowrap"
                >
                  <ArrowLeft className="w-3.5 h-3.5" />
                  <span>Homepage</span>
                </button>
              )}
              {onOpenJobBoard && (
                <button
                  type="button"
                  onClick={onOpenJobBoard}
                  className="font-semibold text-blue-700 hover:text-blue-800 whitespace-nowrap"
                >
                  Open Job Board
                </button>
              )}
            </div>
          </div>
        </header>
      )}

      <div className={standalone ? "mx-auto max-w-6xl px-6 py-10 space-y-8" : "space-y-8"}>
        {/* Header Card */}
        <section className="rounded-2xl border border-blue-200/80 bg-white p-6 lg:p-8 flex flex-col lg:flex-row lg:items-center justify-between gap-6">
          <div className="max-w-2xl">
            <p className="text-xs font-semibold text-blue-700">
              Phase 21G · AI Coach Pre-Flight QA Advisor ($19/month Coach Pro)
            </p>
            <h1 className="mt-1.5 text-2xl lg:text-3xl font-bold tracking-tight text-slate-950">
              Pre-Submission AI Coach &amp; Pass-Rate Predictor
            </h1>
            <p className="mt-2 text-sm text-slate-600 leading-relaxed">
              Submit your Audio WAV clips, YOLOv8 bounding boxes, or localized text drafts BEFORE submitting on a live job. AI Coach runs the identical production QA engines and reports your{" "}
              <span className="font-semibold text-slate-950">predicted QA pass rate</span>, exact metric failure deltas (dB floor, SNR, IoU), and step-by-step fixes.
            </p>
          </div>

          <div className="shrink-0 text-left lg:text-right space-y-1">
            <p className="text-xs font-semibold text-slate-500">Coach Pro Tier</p>
            <p className="text-2xl font-bold font-mono tabular-nums text-slate-950">
              $19<span className="text-sm font-normal text-slate-500">/mo</span>
            </p>
            <p className="text-xs font-semibold">
              {isCoachProActive ? (
                <span className="text-emerald-700">Coach Pro Active · Pre-Flight Unlocked</span>
              ) : (
                <span className="text-amber-700">Locked · Requires Coach Pro ($19/mo)</span>
              )}
            </p>
          </div>
        </section>

        {errorMsg && (
          <div className="p-4 rounded-xl border border-red-200 bg-red-50 text-red-900 text-sm font-medium flex items-center justify-between gap-4">
            <div className="flex items-center gap-2.5">
              <ShieldAlert className="w-4 h-4 text-red-600 shrink-0" />
              <span>{errorMsg}</span>
            </div>
            <button
              type="button"
              onClick={() => setErrorMsg(null)}
              className="text-xs font-semibold underline shrink-0"
            >
              Dismiss
            </button>
          </div>
        )}

        {notice && (
          <div className="p-4 rounded-xl border border-emerald-200 bg-emerald-50 text-emerald-950 text-sm font-medium flex items-center justify-between gap-4">
            <div className="flex items-center gap-2.5">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>{notice}</span>
            </div>
            <button
              type="button"
              onClick={() => setNotice(null)}
              className="text-xs font-semibold underline shrink-0"
            >
              Dismiss
            </button>
          </div>
        )}

        {/* $19/Month Coach Pro Subscription Gate */}
        <section className="rounded-2xl border border-slate-200 bg-white p-6 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 pb-4">
            <div>
              <h2 className="text-lg font-bold text-slate-950 flex items-center gap-2">
                {isCoachProActive ? (
                  <ShieldCheck className="w-5 h-5 text-emerald-600 shrink-0" />
                ) : (
                  <Lock className="w-5 h-5 text-amber-600 shrink-0" />
                )}
                <span>
                  {isCoachProActive
                    ? `Coach Pro Active · ${userName} (${orgName})`
                    : 'Subscribe to "Coach Pro" ($19/month via Kora Pay)'}
                </span>
              </h2>
              <p className="text-xs text-slate-600 mt-0.5">
                {isCoachProActive && statusData?.subscription
                  ? `Subscription ${statusData.subscription.kora_subscription_code || statusData.subscription.id} · Renews ${statusData.subscription.current_period_end?.slice(0, 10)}`
                  : "Fail-closed upsell gate: unsubscribed accounts receive HTTP 402 PAYMENT_REQUIRED until Coach Pro activates."}
              </p>
            </div>

            {isCoachProActive ? (
              <button
                type="button"
                disabled={busyAction === "cancel"}
                onClick={() => void handleCancelCoachPro()}
                className="px-4 py-2 text-xs font-semibold rounded-xl border border-red-200 bg-red-50 text-red-700 hover:bg-red-100 whitespace-nowrap shrink-0"
              >
                {busyAction === "cancel" ? "Canceling..." : "Cancel Coach Pro"}
              </button>
            ) : (
              <div className="flex flex-wrap items-center gap-3 shrink-0">
                <select
                  aria-label="Coach Pro settlement currency"
                  value={currency}
                  onChange={(e) => setCurrency(e.target.value as CertificationCurrency)}
                  className="px-3.5 py-2 text-xs font-semibold border border-slate-200 rounded-xl bg-slate-50 text-slate-950"
                >
                  <option value="NGN">NGN (₦{currencyMap.NGN.toLocaleString()}/mo)</option>
                  <option value="USD">USD ($19.00/mo)</option>
                  <option value="GBP">GBP (£{currencyMap.GBP.toFixed(2)}/mo)</option>
                </select>

                <button
                  type="button"
                  disabled={busyAction === "subscribe"}
                  onClick={() => void handleStartCoachPro()}
                  className="inline-flex items-center gap-2 px-5 py-2.5 text-xs font-semibold rounded-xl bg-gradient-to-r from-blue-600 via-sky-500 to-emerald-500 text-white hover:brightness-105 disabled:opacity-50 whitespace-nowrap"
                >
                  <CreditCard className="w-4 h-4" />
                  <span>
                    {busyAction === "subscribe"
                      ? "Initializing Kora Pay..."
                      : `Unlock Coach Pro (${formattedPrice}/mo)`}
                  </span>
                </button>
              </div>
            )}
          </div>

          {!isCoachProActive && pendingSub && (
            <div className="p-4 rounded-xl border border-amber-200 bg-amber-50 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <p className="text-xs font-semibold text-amber-950">
                  Kora Pay Subscription Checkout Ready · Ref:{" "}
                  <span className="font-mono">{pendingSub.kora_reference}</span>
                </p>
                <p className="text-xs text-amber-800 mt-0.5 font-mono tabular-nums">
                  Plan: Coach Pro · Charge: {pendingSub.currency}{" "}
                  {pendingSub.charge_amount.toLocaleString()} / month
                </p>
              </div>
              <button
                type="button"
                disabled={busyAction === "verify"}
                onClick={() => void handleVerifySubscription(pendingSub.kora_reference, "success")}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-xl bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50 whitespace-nowrap shrink-0"
              >
                <CreditCard className="w-3.5 h-3.5" />
                <span>
                  {busyAction === "verify"
                    ? "Activating Coach Pro..."
                    : "Confirm $19/mo Kora Pay & Activate"}
                </span>
              </button>
            </div>
          )}
        </section>

        {/* Pre-Flight QA File Submission Workspace */}
        <section className="rounded-2xl border border-slate-200 bg-white p-6 space-y-6">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-100 pb-4">
            <div>
              <h2 className="text-lg font-bold text-slate-950">
                Submit QA Files Before the Actual Job
              </h2>
              <p className="text-xs text-slate-600 mt-0.5">
                Choose Audio DSP, Vision YOLOv8 IoU, or Localized Text pre-flight validation.
              </p>
            </div>

            <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-xl shrink-0">
              {(
                [
                  ["audio", "Audio WAV", AudioWaveform],
                  ["vision", "Vision IoU", Eye],
                  ["text", "Localization Text", FileText],
                ] as const
              ).map(([val, text, Icon]) => (
                <button
                  key={val}
                  type="button"
                  onClick={() => setModality(val)}
                  className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap ${
                    modality === val
                      ? "bg-white text-slate-950 shadow-xs"
                      : "text-slate-600 hover:text-slate-950"
                  }`}
                >
                  <Icon className="w-3.5 h-3.5" />
                  <span>{text}</span>
                </button>
              ))}
            </div>
          </div>

          <form onSubmit={(e) => void handleRunPreflight(e)} className="space-y-5">
            {modality === "audio" && (
              <div className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="rounded-xl border border-slate-200 p-4 space-y-2.5 bg-slate-50/50">
                    <label className="block text-xs font-semibold text-slate-800">
                      Upload Real .WAV Clips (Optional · up to 6 clips)
                    </label>
                    <label className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold rounded-xl border border-slate-200 bg-white text-slate-800 hover:border-blue-400 cursor-pointer">
                      <Upload className="w-3.5 h-3.5 text-blue-600" />
                      <span>Select .WAV Files</span>
                      <input
                        type="file"
                        multiple
                        accept=".wav,audio/wav"
                        onChange={(e) => void handleWavFileInput(e)}
                        className="sr-only"
                      />
                    </label>
                    {uploadedWavs.length > 0 ? (
                      <div className="text-xs text-emerald-700 font-mono space-y-1 pt-1">
                        {uploadedWavs.map((w) => (
                          <p key={w.fileName} className="flex items-center gap-1.5">
                            <FileAudio className="w-3.5 h-3.5 shrink-0" />
                            <span>{w.fileName}</span>
                          </p>
                        ))}
                        <button
                          type="button"
                          onClick={() => setUploadedWavs([])}
                          className="text-[11px] underline text-slate-500"
                        >
                          Clear uploads &amp; use sample batch
                        </button>
                      </div>
                    ) : (
                      <p className="text-[11px] text-slate-500">
                        Or run our synthetic pre-flight batch selector on the right.
                      </p>
                    )}
                  </div>

                  <div className="rounded-xl border border-slate-200 p-4 space-y-2.5">
                    <label
                      htmlFor="coach-audio-preset"
                      className="block text-xs font-semibold text-slate-800"
                    >
                      Pre-Flight Studio Test Batch (when no files uploaded)
                    </label>
                    <select
                      id="coach-audio-preset"
                      value={audioPreset}
                      onChange={(e) =>
                        setAudioPreset(
                          e.target.value as "batch_with_4db_floor_defect" | "studio_clean_batch"
                        )
                      }
                      className="w-full px-3.5 py-2 text-xs border border-slate-200 rounded-xl bg-white text-slate-950"
                    >
                      <option value="batch_with_4db_floor_defect">
                        3-Clip Studio Batch (Audio 3 fails noise floor by 4.0 dB)
                      </option>
                      <option value="studio_clean_batch">
                        3-Clip Clean Studio Batch (24kHz Mono · &gt; 40 dB SNR)
                      </option>
                    </select>
                    <p className="text-[11px] text-slate-500">
                      Runs identical `analyzeWavBuffer` librosa-equivalent DSP checks (24kHz Mono, -6 to -3 dBFS peak, &lt; -70 dBFS floor, &gt; 35 dB SNR).
                    </p>
                  </div>
                </div>
              </div>
            )}

            {modality === "vision" && (
              <div className="space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <label className="text-xs font-semibold text-slate-800">
                    YOLOv8 Predicted vs Reference Bounding Boxes (JSON)
                  </label>
                  <select
                    value={visionPreset}
                    onChange={(e) => {
                      const next = e.target.value as "mixed_iou_fail" | "clean_iou_pass";
                      setVisionPreset(next);
                      setVisionJsonInput(
                        JSON.stringify(
                          next === "clean_iou_pass"
                            ? {
                                predictedBoxes: [
                                  { id: "b1", label: "pallet", x1: 112, y1: 182, x2: 418, y2: 388 },
                                  { id: "b2", label: "forklift", x1: 522, y1: 162, x2: 718, y2: 358 },
                                ],
                                referenceBoxes: [
                                  { id: "r1", label: "pallet", x1: 110, y1: 180, x2: 420, y2: 390 },
                                  { id: "r2", label: "forklift", x1: 520, y1: 160, x2: 720, y2: 360 },
                                ],
                              }
                            : {
                                predictedBoxes: [
                                  { id: "b1", label: "pallet", x1: 112, y1: 182, x2: 418, y2: 388 },
                                  { id: "b2", label: "forklift", x1: 480, y1: 140, x2: 660, y2: 310 },
                                ],
                                referenceBoxes: [
                                  { id: "r1", label: "pallet", x1: 110, y1: 180, x2: 420, y2: 390 },
                                  { id: "r2", label: "forklift", x1: 520, y1: 160, x2: 720, y2: 360 },
                                ],
                              },
                          null,
                          2
                        )
                      );
                    }}
                    className="px-3 py-1.5 text-xs border border-slate-200 rounded-lg bg-slate-50"
                  >
                    <option value="mixed_iou_fail">Load Mixed Batch (Box 2 fails IoU)</option>
                    <option value="clean_iou_pass">Load Passing Batch (IoU &gt; 0.90)</option>
                  </select>
                </div>
                <textarea
                  rows={8}
                  value={visionJsonInput}
                  onChange={(e) => setVisionJsonInput(e.target.value)}
                  className="w-full p-3.5 text-xs font-mono border border-slate-200 rounded-xl bg-slate-50 text-slate-950"
                />
              </div>
            )}

            {modality === "text" && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Source Locale
                  </label>
                  <input
                    value={sourceLocale}
                    onChange={(e) => setSourceLocale(e.target.value)}
                    className="w-full px-3.5 py-2 text-sm border border-slate-200 rounded-xl"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Target Locale
                  </label>
                  <input
                    value={targetLocale}
                    onChange={(e) => setTargetLocale(e.target.value)}
                    className="w-full px-3.5 py-2 text-sm border border-slate-200 rounded-xl"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Source Script / Prompt
                  </label>
                  <textarea
                    rows={3}
                    value={sourcePromptText}
                    onChange={(e) => setSourcePromptText(e.target.value)}
                    className="w-full p-3 text-xs border border-slate-200 rounded-xl"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Localized Draft Translation
                  </label>
                  <textarea
                    rows={3}
                    value={localizedDraftText}
                    onChange={(e) => setLocalizedDraftText(e.target.value)}
                    className="w-full p-3 text-xs border border-slate-200 rounded-xl"
                  />
                </div>
              </div>
            )}

            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pt-2 border-t border-slate-100">
              <p className="text-xs text-slate-500">
                {isCoachProActive
                  ? "Coach Pro active · Protected by Vault-isolated AI prompts & PromptGuard."
                  : 'Subscription required: clicking submit without "Coach Pro" enforces fail-closed HTTP 402.'}
              </p>
              <button
                type="submit"
                disabled={busyAction === "analyze"}
                className="inline-flex items-center justify-center gap-2 px-6 py-2.5 text-sm font-semibold rounded-xl bg-slate-950 text-white hover:bg-slate-800 disabled:opacity-50 whitespace-nowrap shrink-0"
              >
                <Sparkles className="w-4 h-4 text-emerald-400" />
                <span>
                  {busyAction === "analyze"
                    ? "Running Production QA Agents..."
                    : "Run AI Coach Pre-Flight QA"}
                </span>
              </button>
            </div>
          </form>
        </section>

        {/* Latest Pre-Flight Coaching Report */}
        {latestReport && (
          <section className="rounded-2xl border border-slate-200 bg-white p-6 space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 pb-4">
              <div>
                <p className="text-xs font-semibold text-blue-700 uppercase font-mono">
                  {latestReport.modality} Pre-Flight Diagnostic Report · {latestReport.files_count}{" "}
                  item(s)
                </p>
                <h2 className="text-xl font-bold text-slate-950 mt-0.5">
                  {latestReport.verdict === "ready_for_job"
                    ? "Ready for Live Client Job Submission"
                    : "Remediation Recommended Before Submitting"}
                </h2>
              </div>

              <div className="text-left sm:text-right shrink-0">
                <p className="text-xs font-medium text-slate-500">Predicted QA Pass Rate</p>
                <p
                  className={`text-3xl font-bold font-mono tabular-nums ${
                    latestReport.predicted_pass_rate_pct >= 90
                      ? "text-emerald-700"
                      : latestReport.predicted_pass_rate_pct >= 65
                        ? "text-amber-600"
                        : "text-red-700"
                  }`}
                >
                  {latestReport.predicted_pass_rate_pct}%
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Specific Issues to Fix */}
              <div className="space-y-3">
                <h3 className="text-sm font-bold text-slate-950">
                  Specific Issues to Fix ({latestReport.issues.length})
                </h3>
                {latestReport.issues.length === 0 ? (
                  <div className="p-4 rounded-xl border border-emerald-200 bg-emerald-50 text-xs text-emerald-900 font-medium flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                    <span>Zero QA threshold violations found. Every check passed.</span>
                  </div>
                ) : (
                  <div className="divide-y divide-slate-100 border border-slate-200 rounded-xl">
                    {latestReport.issues.map((issue, idx) => (
                      <div key={idx} className="p-3.5 space-y-1 text-xs">
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-semibold text-red-700 flex items-center gap-1.5">
                            <XCircle className="w-3.5 h-3.5 shrink-0" />
                            <span>{issue.item}</span>
                          </span>
                          <span className="font-mono tabular-nums text-slate-500">
                            {issue.measured} (Target: {issue.target})
                          </span>
                        </div>
                        <p className="text-slate-900 font-medium">{issue.summary}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Actionable Improvement Suggestions */}
              <div className="space-y-3">
                <h3 className="text-sm font-bold text-slate-950">
                  Coach Pro Improvement Suggestions
                </h3>
                <ul className="space-y-2.5">
                  {latestReport.suggestions.map((tip, idx) => (
                    <li
                      key={idx}
                      className="p-3.5 rounded-xl border border-blue-100 bg-blue-50/40 text-xs text-slate-800 leading-relaxed flex items-start gap-2.5"
                    >
                      <Sparkles className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
                      <span>{tip}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            {latestReport.audio_files && latestReport.audio_files.length > 0 && (
              <div className="overflow-x-auto border-t border-slate-100 pt-4">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="border-b border-slate-200 text-slate-500 font-semibold">
                      <th className="py-2 pr-4">Clip</th>
                      <th className="py-2 pr-4">Format</th>
                      <th className="py-2 pr-4">Peak</th>
                      <th className="py-2 pr-4">Noise Floor</th>
                      <th className="py-2 pr-4">SNR</th>
                      <th className="py-2 text-right">QA Gate</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 font-mono tabular-nums">
                    {latestReport.audio_files.map((af, idx) => (
                      <tr key={idx}>
                        <td className="py-2.5 pr-4 font-sans font-semibold text-slate-900">
                          Audio {idx + 1} · {af.fileName}
                        </td>
                        <td className="py-2.5 pr-4 text-slate-600">
                          {af.sampleRateHz}Hz · {af.isMono ? "Mono" : `${af.channels}ch`}
                        </td>
                        <td className="py-2.5 pr-4 text-slate-800">{af.peakDbfs} dBFS</td>
                        <td
                          className={`py-2.5 pr-4 font-semibold ${
                            af.noiseFloorDbfs < -70 ? "text-emerald-700" : "text-red-700"
                          }`}
                        >
                          {af.noiseFloorDbfs} dBFS
                        </td>
                        <td
                          className={`py-2.5 pr-4 font-semibold ${
                            af.snrDb > 35 ? "text-emerald-700" : "text-red-700"
                          }`}
                        >
                          {af.snrDb} dB
                        </td>
                        <td className="py-2.5 text-right font-sans font-semibold">
                          {af.passed ? (
                            <span className="text-emerald-700">PASS</span>
                          ) : (
                            <span className="text-red-700">FIX NEEDED</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        )}

        {/* Recent Pre-Flight History */}
        {history.length > 0 && (
          <section className="rounded-2xl border border-slate-200 bg-white p-6 space-y-3">
            <h2 className="text-sm font-bold text-slate-950">
              Recent Pre-Flight Runs ({history.length})
            </h2>
            <div className="divide-y divide-slate-100 text-xs">
              {history.slice(0, 5).map((run) => (
                <div
                  key={run.id}
                  className="py-2.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2"
                >
                  <span className="font-mono text-slate-700">
                    {run.modality.toUpperCase()} · {run.files_count} item(s) ·{" "}
                    {run.created_at.replace("T", " ").slice(0, 19)} UTC
                  </span>
                  <span className="font-mono tabular-nums font-semibold text-slate-900">
                    Predicted Pass: {run.predicted_pass_rate_pct}% ({run.issues.length} issue
                    {run.issues.length === 1 ? "" : "s"})
                  </span>
                </div>
              ))}
            </div>
          </section>
        )}

        {loading && !statusData && (
          <div className="p-6 text-center text-xs text-slate-500">
            Loading AI Coach workspace...
          </div>
        )}
      </div>
    </div>
  );
}
