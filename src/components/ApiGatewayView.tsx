import React, { useCallback, useEffect, useState } from "react";
import {
  AlertTriangle,
  Check,
  Copy,
  CreditCard,
  Gauge,
  KeyRound,
  Play,
  RefreshCw,
  ShieldAlert,
  Trash2,
} from "lucide-react";
import type {
  B2BApiKey,
  B2BApiScope,
  B2BApiUsageLog,
  B2BMeteredInvoice,
  CostControlUserStatus,
} from "../types/tenant";

interface ApiGatewayViewProps {
  orgId: string;
  orgName: string;
  userId: string;
  userEmail: string;
  userName: string;
}

interface B2BSummary {
  activeKeys: number;
  pastDueKeys: number;
  revokedKeys: number;
  totalCalls: number;
  unbilledCalls: number;
  unbilledUsd: number;
  unitPriceUsd: number;
}

export function ApiGatewayView({
  orgId,
  orgName,
  userId,
  userEmail,
  userName,
}: ApiGatewayViewProps) {
  const [keys, setKeys] = useState<B2BApiKey[]>([]);
  const [usageLogs, setUsageLogs] = useState<B2BApiUsageLog[]>([]);
  const [invoices, setInvoices] = useState<B2BMeteredInvoice[]>([]);
  const [summary, setSummary] = useState<B2BSummary>({
    activeKeys: 0,
    pastDueKeys: 0,
    revokedKeys: 0,
    totalCalls: 0,
    unbilledCalls: 0,
    unbilledUsd: 0,
    unitPriceUsd: 0.1,
  });
  const [koraPublicKey, setKoraPublicKey] = useState("");
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Key creation state
  const [label, setLabel] = useState("Production AI Lab QA Worker");
  const [selectedScopes, setSelectedScopes] = useState<B2BApiScope[]>([
    "audio",
    "vision",
    "text",
  ]);
  const [creatingKey, setCreatingKey] = useState(false);
  const [revealedSecret, setRevealedSecret] = useState<string | null>(null);
  const [copiedSecret, setCopiedSecret] = useState(false);

  // Billing currency & settlement state
  const [currency, setCurrency] = useState<"NGN" | "USD" | "GBP">("NGN");
  const [settlingMonth, setSettlingMonth] = useState(false);
  const [verifyingRef, setVerifyingRef] = useState<string | null>(null);

  // Interactive Gateway Explorer state
  const [bearerTokenInput, setBearerTokenInput] = useState("");
  const [activeEndpoint, setActiveEndpoint] = useState<"audio" | "vision" | "text">("audio");
  const [audioPreset, setAudioPreset] = useState<"pass" | "fail">("pass");
  const [audioUploadBase64, setAudioUploadBase64] = useState<string | null>(null);
  const [audioUploadName, setAudioUploadName] = useState<string | null>(null);
  const [iouThreshold, setIouThreshold] = useState("0.70");
  const [textPrompt, setTextPrompt] = useState(
    "Summarize PostgreSQL Row-Level Security guarantees for a SaaS buyer."
  );
  const [textResponse, setTextResponse] = useState(
    "Every query runs inside a transaction with app.current_org_id enforced by PostgreSQL RLS policies, guaranteeing strict multi-tenant row isolation at the storage engine layer."
  );
  const [textRubric, setTextRubric] = useState("Accuracy, Conciseness, Technical Depth");
  const [testingEndpoint, setTestingEndpoint] = useState(false);
  const [explorerResult, setExplorerResult] = useState<Record<string, unknown> | null>(null);
  const [explorerStatus, setExplorerStatus] = useState<number | null>(null);
  const [costStatus, setCostStatus] = useState<CostControlUserStatus | null>(null);

  const loadGatewayState = useCallback(async () => {
    setLoading(true);
    try {
      const [res, costRes] = await Promise.all([
        fetch("/api/b2b/keys", {
          credentials: "include",
          headers: {
            "x-org-id": orgId,
            "x-user-id": userId,
          },
        }),
        fetch("/api/cost-control/status", {
          credentials: "include",
          headers: {
            "x-org-id": orgId,
            "x-user-id": userId,
          },
        }),
      ]);
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.detail || "Unable to load B2B API Gateway telemetry.");
      }
      const data = await res.json();
      setKeys(data.keys ?? []);
      setUsageLogs(data.usageLogs ?? []);
      setInvoices(data.invoices ?? []);
      if (data.summary) setSummary(data.summary);
      if (data.koraPublicKey) setKoraPublicKey(data.koraPublicKey);
      if (costRes.ok) {
        setCostStatus((await costRes.json()) as CostControlUserStatus);
      }
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Failed to load API Gateway.");
    } finally {
      setLoading(false);
    }
  }, [orgId, userId]);

  useEffect(() => {
    void loadGatewayState();
  }, [loadGatewayState]);

  function toggleScope(scope: B2BApiScope) {
    setSelectedScopes((prev) =>
      prev.includes(scope)
        ? prev.length > 1
          ? prev.filter((s) => s !== scope)
          : prev
        : [...prev, scope]
    );
  }

  async function handleGenerateKey(e: React.FormEvent) {
    e.preventDefault();
    setErrorMsg(null);
    setNotice(null);
    setCreatingKey(true);
    try {
      const res = await fetch("/api/b2b/keys", {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          "x-org-id": orgId,
          "x-user-id": userId,
        },
        body: JSON.stringify({
          label: label.trim(),
          scopes: selectedScopes,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.detail || "Failed to generate API key.");
      }
      setRevealedSecret(data.rawKey);
      setBearerTokenInput(data.rawKey);
      setNotice(`Generated active key ${data.key.key_prefix} and pre-loaded into Explorer.`);
      await loadGatewayState();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Failed to generate API key.");
    } finally {
      setCreatingKey(false);
    }
  }

  async function handleRevokeKey(keyId: string) {
    setErrorMsg(null);
    setNotice(null);
    try {
      const res = await fetch(`/api/b2b/keys/${keyId}`, {
        method: "DELETE",
        credentials: "include",
        headers: {
          "x-org-id": orgId,
          "x-user-id": userId,
        },
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.detail || "Failed to revoke API key.");
      }
      setNotice(`Revoked ${data.key.key_prefix}. Requests using this key now fail with HTTP 403.`);
      await loadGatewayState();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Failed to revoke API key.");
    }
  }

  async function handleCopySecret() {
    if (!revealedSecret) return;
    try {
      await navigator.clipboard.writeText(revealedSecret);
    } catch {
      const el = document.createElement("textarea");
      el.value = revealedSecret;
      el.style.position = "fixed";
      el.style.opacity = "0";
      document.body.appendChild(el);
      el.select();
      document.execCommand("copy");
      document.body.removeChild(el);
    }
    setCopiedSecret(true);
    setTimeout(() => setCopiedSecret(false), 1800);
  }

  async function handleWavFileSelected(file: File | null) {
    if (!file) {
      setAudioUploadBase64(null);
      setAudioUploadName(null);
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") {
        setAudioUploadBase64(reader.result);
        setAudioUploadName(file.name);
      }
    };
    reader.readAsDataURL(file);
  }

  async function handleTestGatewayEndpoint() {
    setErrorMsg(null);
    setNotice(null);
    setTestingEndpoint(true);
    setExplorerResult(null);

    try {
      const url = `/api/v1/qa/${activeEndpoint}`;
      const bodyPayload =
        activeEndpoint === "audio"
          ? audioUploadBase64
            ? { audioBase64: audioUploadBase64, fileName: audioUploadName || "upload.wav" }
            : { preset: audioPreset }
          : activeEndpoint === "vision"
            ? { iouThreshold: Number.parseFloat(iouThreshold) || 0.7 }
            : {
                prompt: textPrompt,
                responseText: textResponse,
                rubric: textRubric,
              };

      const res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${bearerTokenInput.trim()}`,
        },
        body: JSON.stringify(bodyPayload),
      });
      setExplorerStatus(res.status);
      const data = await res.json();
      setExplorerResult(data);
      if (!res.ok) {
        setErrorMsg(data.detail || `Gateway returned HTTP ${res.status}.`);
      } else {
        setNotice(
          `Metered call recorded on ${url} (+$0.10 USD). Unbilled calls updated live.`
        );
      }
      await loadGatewayState();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Failed to call /api/v1/qa endpoint.");
    } finally {
      setTestingEndpoint(false);
    }
  }

  async function handleVerifyInvoice(
    reference: string,
    gatewayStatus: "success" | "failed"
  ) {
    setVerifyingRef(reference);
    setErrorMsg(null);
    setNotice(null);
    try {
      const res = await fetch("/api/b2b/billing/verify", {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          "x-org-id": orgId,
          "x-user-id": userId,
        },
        body: JSON.stringify({ reference, gatewayStatus }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.detail || "Unable to verify Kora Pay metered invoice.");
      }
      if (data.status === "paid") {
        setNotice(
          `Kora Pay verified metered settlement (${reference}). Unbilled usage reset to 0 and all keys active.`
        );
      } else {
        setNotice(
          `Kora Pay reported failed payment for ${reference}. Active org keys set to past_due until settled.`
        );
      }
      await loadGatewayState();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Failed to verify metered invoice.");
    } finally {
      setVerifyingRef(null);
    }
  }

  async function handleSettleViaKoraPay() {
    setErrorMsg(null);
    setNotice(null);
    setSettlingMonth(true);
    try {
      const res = await fetch("/api/b2b/billing/settle-month", {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          "x-org-id": orgId,
          "x-user-id": userId,
        },
        body: JSON.stringify({ currency }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.detail || "Unable to initialize Kora Pay metered settlement.");
      }
      const inv: B2BMeteredInvoice = data.invoice;

      const korapayGlobal = (
        window as unknown as {
          Korapay?: { initialize: (opts: Record<string, unknown>) => void };
        }
      ).Korapay;

      if (korapayGlobal && (data.publicKey || koraPublicKey)) {
        korapayGlobal.initialize({
          key: data.publicKey || koraPublicKey,
          reference: inv.kora_reference,
          amount: inv.charge_amount,
          currency: inv.charge_currency,
          narration: `Dutchkem B2B Metered API Usage (${inv.total_calls} calls)`,
          customer: {
            name: userName,
            email: userEmail,
          },
          onSuccess: () => {
            void handleVerifyInvoice(inv.kora_reference, "success");
          },
          onFailed: () => {
            void handleVerifyInvoice(inv.kora_reference, "failed");
          },
        });
      }

      setNotice(
        `Created Kora Pay metered invoice ${inv.kora_reference} (${inv.charge_currency} ${inv.charge_amount.toLocaleString()}). Complete payment in the ledger action controls below.`
      );
      await loadGatewayState();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Failed to initialize Kora Pay settlement.");
    } finally {
      setSettlingMonth(false);
    }
  }

  const estNgn = Math.round(summary.unbilledUsd * 1530);
  const estGbp = Math.round(summary.unbilledUsd * 0.79 * 100) / 100;

  return (
    <div className="space-y-8">
      {/* Page Header & Primary Settlement Action */}
      <section className="rounded-2xl border border-blue-200/80 bg-white p-6 lg:p-8 flex flex-col lg:flex-row lg:items-center justify-between gap-6">
        <div className="max-w-2xl">
          <p className="text-xs font-semibold text-blue-700">
            Phase 14 · B2B API Gateway &amp; Kora Pay Metered Billing
          </p>
          <h1 className="mt-1.5 text-2xl lg:text-3xl font-bold tracking-tight text-slate-950">
            Programmatic QA Engine Gateway for AI Labs
          </h1>
          <p className="mt-2 text-sm text-slate-600 leading-relaxed">
            Issue tenant-scoped <span className="font-mono text-slate-900">sk_live_...</span> keys for{" "}
            <span className="font-mono text-slate-900">/api/v1/qa/audio</span>,{" "}
            <span className="font-mono text-slate-900">/vision</span>, and{" "}
            <span className="font-mono text-slate-900">/text</span>. Every call is metered at{" "}
            <span className="font-mono tabular-nums font-semibold text-slate-950">$0.10/call</span>{" "}
            and settled monthly in NGN, USD, or GBP via Kora Pay.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3 shrink-0">
          <select
            aria-label="Kora Pay settlement currency"
            value={currency}
            onChange={(e) => setCurrency(e.target.value as "NGN" | "USD" | "GBP")}
            className="min-h-[44px] px-3.5 py-2 text-xs font-semibold border border-slate-200 bg-slate-50 rounded-xl text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500/30"
          >
            <option value="NGN">NGN (Local Nigeria)</option>
            <option value="USD">USD (Global)</option>
            <option value="GBP">GBP (UK / Europe)</option>
          </select>

          <button
            type="button"
            disabled={settlingMonth || summary.unbilledCalls === 0}
            onClick={() => void handleSettleViaKoraPay()}
            className="min-h-[44px] inline-flex items-center gap-2 px-5 py-2.5 text-xs font-semibold rounded-xl bg-gradient-to-r from-blue-600 via-sky-500 to-emerald-500 text-white hover:brightness-105 disabled:opacity-50 transition-all whitespace-nowrap shrink-0"
          >
            <CreditCard className="w-4 h-4" />
            <span>
              {settlingMonth
                ? "Initializing Kora Pay..."
                : `Settle Usage via Kora Pay (${summary.unbilledCalls} calls)`}
            </span>
          </button>
        </div>
      </section>

      {costStatus?.circuitOpen && (
        <div
          role="alert"
          className="p-4 rounded-xl border border-amber-300 bg-amber-50 text-amber-950 text-sm flex flex-wrap items-center justify-between gap-3"
        >
          <div className="flex items-center gap-2.5">
            <AlertTriangle className="w-4 h-4 text-amber-700 shrink-0" />
            <div>
              <p className="font-semibold">High Traffic · Gateway QA Requests Paused</p>
              <p className="text-xs text-amber-900 mt-0.5">
                {costStatus.highTrafficMessage ||
                  "High Traffic: Automated AI QA Agents are temporarily paused. Please retry shortly."}
              </p>
            </div>
          </div>
          <span className="font-mono text-xs font-semibold uppercase">HTTP 503</span>
        </div>
      )}

      {errorMsg && (
        <div className="p-4 rounded-xl border border-red-200 bg-red-50 text-red-900 text-sm font-medium flex items-center justify-between gap-4">
          <span>{errorMsg}</span>
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
          <span>{notice}</span>
          <button
            type="button"
            onClick={() => setNotice(null)}
            className="text-xs font-semibold underline shrink-0"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* 4-Column KPI Strip */}
      <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="rounded-2xl border border-slate-200 bg-white p-5">
          <p className="text-xs font-medium text-slate-500">Active B2B Keys</p>
          <p className="mt-2 text-2xl font-bold font-mono tabular-nums text-slate-950">
            {summary.activeKeys}
          </p>
          <p className="mt-1 text-xs text-slate-500 font-mono tabular-nums">
            {summary.pastDueKeys} past due · {summary.revokedKeys} revoked
          </p>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5">
          <p className="text-xs font-medium text-slate-500">Cumulative Gateway Calls</p>
          <p className="mt-2 text-2xl font-bold font-mono tabular-nums text-slate-950">
            {summary.totalCalls.toLocaleString()}
          </p>
          <p className="mt-1 text-xs text-slate-500 inline-flex items-center gap-1.5">
            <Gauge className="w-3.5 h-3.5 text-slate-400" />
            <span className="font-mono tabular-nums">
              {(costStatus?.b2bHourlyLimit ?? 1000).toLocaleString()} req/hr per API key
            </span>
          </p>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5">
          <p className="text-xs font-medium text-slate-500">Unbilled Metered Balance</p>
          <p className="mt-2 text-2xl font-bold font-mono tabular-nums text-blue-700">
            ${summary.unbilledUsd.toFixed(2)}
          </p>
          <p className="mt-1 text-xs text-slate-500 font-mono tabular-nums">
            {summary.unbilledCalls} calls · ₦{estNgn.toLocaleString()} · £{estGbp.toFixed(2)}
          </p>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5">
          <p className="text-xs font-medium text-slate-500">Metered Unit Rate &amp; Org</p>
          <p className="mt-2 text-2xl font-bold font-mono tabular-nums text-emerald-700">
            $0.10 / call
          </p>
          <p className="mt-1 text-xs text-slate-500 truncate">{orgName}</p>
        </div>
      </section>

      {/* API Key Creation & Key Registry */}
      <section className="rounded-2xl border border-slate-200 bg-white p-6 space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 pb-4">
          <div>
            <h2 className="text-lg font-bold text-slate-950">
              API Key Management (sk_live_...)
            </h2>
            <p className="text-xs text-slate-600 mt-0.5">
              Keys are SHA-256 hashed at rest. The plaintext secret is shown once upon generation.
            </p>
          </div>
          <button
            type="button"
            onClick={() => void loadGatewayState()}
            className="min-h-[44px] inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold border border-slate-200 rounded-lg text-slate-700 hover:bg-slate-50 whitespace-nowrap shrink-0 self-start sm:self-auto"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Refresh Usage</span>
          </button>
        </div>

        <form onSubmit={handleGenerateKey} className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-end">
          <div className="lg:col-span-5">
            <label htmlFor="b2b-key-label" className="block text-xs font-semibold text-slate-700 mb-1.5">
              Client Application / Pipeline Label
            </label>
            <input
              id="b2b-key-label"
              type="text"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              required
              minLength={2}
              placeholder="e.g., AfterQuery Ingestion Worker"
              className="w-full min-h-[44px] px-3.5 py-2.5 text-sm border border-slate-200 rounded-xl text-slate-950 focus:outline-none focus:ring-2 focus:ring-blue-500/30"
            />
          </div>

          <div className="lg:col-span-4">
            <span className="block text-xs font-semibold text-slate-700 mb-1.5">
              Permitted QA Endpoints
            </span>
            <div className="flex flex-wrap gap-2">
              {(["audio", "vision", "text"] as B2BApiScope[]).map((scope) => {
                const active = selectedScopes.includes(scope);
                return (
                  <button
                    key={scope}
                    type="button"
                    onClick={() => toggleScope(scope)}
                    className={`min-h-[44px] px-3.5 py-2 text-xs font-semibold rounded-lg border transition-colors whitespace-nowrap shrink-0 ${
                      active
                        ? "border-blue-600 bg-blue-50 text-blue-700"
                        : "border-slate-200 bg-white text-slate-600 hover:text-slate-900"
                    }`}
                  >
                    {scope.toUpperCase()}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="lg:col-span-3">
            <button
              type="submit"
              disabled={creatingKey}
              className="w-full min-h-[44px] inline-flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-semibold rounded-xl bg-slate-950 text-white hover:bg-slate-800 disabled:opacity-50 transition-colors whitespace-nowrap"
            >
              <KeyRound className="w-4 h-4" />
              <span>{creatingKey ? "Generating..." : "Generate sk_live_ Key"}</span>
            </button>
          </div>
        </form>

        {revealedSecret && (
          <div className="p-4 rounded-xl border border-emerald-200 bg-emerald-50 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-xs font-semibold text-emerald-900">
                Save this B2B API secret now — it will never be displayed again:
              </p>
              <p className="mt-1 font-mono text-xs sm:text-sm text-emerald-950 break-all">
                {revealedSecret}
              </p>
            </div>
            <button
              type="button"
              onClick={() => void handleCopySecret()}
              className="min-h-[44px] inline-flex items-center justify-center gap-1.5 px-3.5 py-2 text-xs font-semibold border border-emerald-300 bg-white rounded-lg text-emerald-900 hover:bg-emerald-100 whitespace-nowrap shrink-0"
            >
              {copiedSecret ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copiedSecret ? "Copied" : "Copy Key"}</span>
            </button>
          </div>
        )}

        {/* Mobile (<md) Stacked API Keys */}
        <div className="md:hidden divide-y divide-slate-200 border border-slate-200 rounded-xl overflow-hidden">
          {loading && keys.length === 0 ? (
            <p className="p-4 text-center text-slate-500 text-xs">Loading tenant API keys...</p>
          ) : keys.length === 0 ? (
            <p className="p-4 text-center text-slate-500 text-xs">
              No API keys created yet. Generate an sk_live_ key above to authenticate external calls.
            </p>
          ) : (
            keys.map((k) => (
              <article key={k.id} className="p-4 space-y-3 bg-white">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-slate-950 truncate">{k.label}</p>
                    <p className="mt-0.5 font-mono text-xs text-slate-600">{k.key_prefix}</p>
                  </div>
                  <span
                    className={`text-xs font-semibold shrink-0 ${
                      k.status === "active"
                        ? "text-emerald-700"
                        : k.status === "past_due"
                          ? "text-amber-700"
                          : "text-red-700"
                    }`}
                  >
                    {k.status === "active" ? "Active" : k.status === "past_due" ? "Past Due (402)" : "Revoked"}
                  </span>
                </div>
                <dl className="grid grid-cols-2 gap-2 text-xs border-t border-slate-100 pt-2">
                  <div>
                    <dt className="text-slate-500">Scopes</dt>
                    <dd className="font-medium text-slate-800">{k.scopes.join(" · ")}</dd>
                  </div>
                  <div>
                    <dt className="text-slate-500">Total Calls</dt>
                    <dd className="font-mono tabular-nums text-slate-900">{k.total_calls.toLocaleString()}</dd>
                  </div>
                  <div className="col-span-2">
                    <dt className="text-slate-500">Unbilled Metered</dt>
                    <dd className="font-mono tabular-nums font-semibold text-blue-700">
                      {k.unbilled_calls} calls (${(k.unbilled_calls * k.unit_price_usd).toFixed(2)})
                    </dd>
                  </div>
                </dl>
                {k.status !== "revoked" && (
                  <button
                    type="button"
                    onClick={() => void handleRevokeKey(k.id)}
                    className="w-full min-h-[44px] inline-flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-semibold text-red-700 border border-red-200 rounded-xl hover:bg-red-50"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Revoke Key</span>
                  </button>
                )}
              </article>
            ))
          )}
        </div>

        {/* Desktop (md+) API Key Table */}
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-left border-collapse text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-xs font-semibold text-slate-500">
                <th className="py-3 pr-4">Label</th>
                <th className="py-3 pr-4">Prefix</th>
                <th className="py-3 pr-4">Scopes</th>
                <th className="py-3 pr-4 text-right">Total Calls</th>
                <th className="py-3 pr-4 text-right">Unbilled</th>
                <th className="py-3 pr-4">State</th>
                <th className="py-3 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading && keys.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-6 text-center text-slate-500 text-xs">
                    Loading tenant API keys...
                  </td>
                </tr>
              ) : keys.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-6 text-center text-slate-500 text-xs">
                    No API keys created yet. Generate an sk_live_ key above to authenticate external calls.
                  </td>
                </tr>
              ) : (
                keys.map((k) => (
                  <tr key={k.id} className="hover:bg-slate-50/70">
                    <td className="py-3.5 pr-4 font-semibold text-slate-900">{k.label}</td>
                    <td className="py-3.5 pr-4 font-mono text-xs text-slate-700">{k.key_prefix}</td>
                    <td className="py-3.5 pr-4 text-xs text-slate-600">
                      {k.scopes.join(" · ")}
                    </td>
                    <td className="py-3.5 pr-4 text-right font-mono tabular-nums text-slate-900">
                      {k.total_calls.toLocaleString()}
                    </td>
                    <td className="py-3.5 pr-4 text-right font-mono tabular-nums font-semibold text-blue-700">
                      {k.unbilled_calls} (${(k.unbilled_calls * k.unit_price_usd).toFixed(2)})
                    </td>
                    <td className="py-3.5 pr-4 text-xs font-semibold">
                      {k.status === "active" ? (
                        <span className="text-emerald-700">Active</span>
                      ) : k.status === "past_due" ? (
                        <span className="text-amber-700">Past Due (402)</span>
                      ) : (
                        <span className="text-red-700">Revoked</span>
                      )}
                    </td>
                    <td className="py-3.5 text-right">
                      {k.status !== "revoked" ? (
                        <button
                          type="button"
                          onClick={() => void handleRevokeKey(k.id)}
                          className="min-h-[44px] inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-red-700 border border-red-200 rounded-lg hover:bg-red-50 whitespace-nowrap"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          <span>Revoke</span>
                        </button>
                      ) : (
                        <span className="text-xs text-slate-400">Disabled</span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* Live Interactive /api/v1/qa/* Explorer */}
      <section className="rounded-2xl border border-slate-200 bg-white p-6 space-y-5">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-slate-100 pb-4">
          <div>
            <h2 className="text-lg font-bold text-slate-950">
              Live B2B Gateway Explorer (/api/v1/qa/*)
            </h2>
            <p className="text-xs text-slate-600 mt-0.5">
              Execute real authenticated Bearer calls to verify DSP telemetry, YOLOv8 IoU checks, or Gemini rubric scoring and increment metered usage.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-1 p-1 bg-slate-100 rounded-xl self-start">
            <button
              type="button"
              onClick={() => setActiveEndpoint("audio")}
              className={`min-h-[44px] px-3 py-2 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap shrink-0 ${
                activeEndpoint === "audio"
                  ? "bg-white text-slate-950 shadow-xs"
                  : "text-slate-600 hover:text-slate-950"
              }`}
            >
              /api/v1/qa/audio
            </button>
            <button
              type="button"
              onClick={() => setActiveEndpoint("vision")}
              className={`min-h-[44px] px-3 py-2 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap shrink-0 ${
                activeEndpoint === "vision"
                  ? "bg-white text-slate-950 shadow-xs"
                  : "text-slate-600 hover:text-slate-950"
              }`}
            >
              /api/v1/qa/vision
            </button>
            <button
              type="button"
              onClick={() => setActiveEndpoint("text")}
              className={`min-h-[44px] px-3 py-2 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap shrink-0 ${
                activeEndpoint === "text"
                  ? "bg-white text-slate-950 shadow-xs"
                  : "text-slate-600 hover:text-slate-950"
              }`}
            >
              /api/v1/qa/text
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="space-y-4">
            <div>
              <label htmlFor="explorer-bearer" className="block text-xs font-semibold text-slate-700 mb-1.5">
                Authorization Bearer Token (generate an sk_live_ key above if empty)
              </label>
              <input
                id="explorer-bearer"
                type="text"
                value={bearerTokenInput}
                onChange={(e) => setBearerTokenInput(e.target.value)}
                placeholder="sk_live_..."
                className="w-full min-h-[44px] px-3.5 py-2.5 text-xs font-mono border border-slate-200 rounded-xl text-slate-950 focus:outline-none focus:ring-2 focus:ring-blue-500/30"
              />
            </div>

            {activeEndpoint === "audio" && (
              <div className="space-y-3">
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setAudioUploadBase64(null);
                      setAudioUploadName(null);
                      setAudioPreset("pass");
                    }}
                    className={`min-h-[44px] px-3 py-2 text-xs font-semibold rounded-lg border whitespace-nowrap ${
                      !audioUploadBase64 && audioPreset === "pass"
                        ? "border-blue-600 bg-blue-50 text-blue-700"
                        : "border-slate-200 text-slate-700"
                    }`}
                  >
                    Clean 24kHz Mono WAV (Pass)
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setAudioUploadBase64(null);
                      setAudioUploadName(null);
                      setAudioPreset("fail");
                    }}
                    className={`min-h-[44px] px-3 py-2 text-xs font-semibold rounded-lg border whitespace-nowrap ${
                      !audioUploadBase64 && audioPreset === "fail"
                        ? "border-blue-600 bg-blue-50 text-blue-700"
                        : "border-slate-200 text-slate-700"
                    }`}
                  >
                    Noisy 44.1kHz Stereo WAV (Fail)
                  </button>
                </div>
                <div>
                  <label htmlFor="b2b-wav-file" className="block text-xs font-semibold text-slate-700 mb-1">
                    Or Upload Custom .wav File
                  </label>
                  <input
                    id="b2b-wav-file"
                    type="file"
                    accept=".wav,audio/wav"
                    onChange={(e) => void handleWavFileSelected(e.target.files?.[0] ?? null)}
                    className="block w-full min-h-[44px] text-xs text-slate-600 file:mr-3 file:min-h-[44px] file:py-2 file:px-3 file:rounded-lg file:border file:border-slate-200 file:text-xs file:font-semibold file:bg-slate-50 file:text-slate-700 hover:file:bg-slate-100"
                  />
                </div>
              </div>
            )}

            {activeEndpoint === "vision" && (
              <div>
                <label htmlFor="vision-iou" className="block text-xs font-semibold text-slate-700 mb-1.5">
                  YOLOv8 IoU Acceptance Gate (0.10 – 0.99)
                </label>
                <input
                  id="vision-iou"
                  type="number"
                  step="0.05"
                  min="0.1"
                  max="0.99"
                  value={iouThreshold}
                  onChange={(e) => setIouThreshold(e.target.value)}
                  className="w-full min-h-[44px] px-3.5 py-2 text-sm font-mono tabular-nums border border-slate-200 rounded-xl text-slate-950"
                />
              </div>
            )}

            {activeEndpoint === "text" && (
              <div className="space-y-3">
                <div>
                  <label htmlFor="b2b-text-rubric" className="block text-xs font-semibold text-slate-700 mb-1">
                    Evaluation Rubric
                  </label>
                  <input
                    id="b2b-text-rubric"
                    type="text"
                    value={textRubric}
                    onChange={(e) => setTextRubric(e.target.value)}
                    className="w-full min-h-[44px] px-3 py-2 text-xs border border-slate-200 rounded-xl text-slate-950"
                  />
                </div>
                <div>
                  <label htmlFor="b2b-text-prompt" className="block text-xs font-semibold text-slate-700 mb-1">
                    Input Prompt
                  </label>
                  <textarea
                    id="b2b-text-prompt"
                    rows={2}
                    value={textPrompt}
                    onChange={(e) => setTextPrompt(e.target.value)}
                    className="w-full px-3 py-2 text-xs border border-slate-200 rounded-xl text-slate-950"
                  />
                </div>
                <div>
                  <label htmlFor="b2b-text-resp" className="block text-xs font-semibold text-slate-700 mb-1">
                    Model Response Under Review
                  </label>
                  <textarea
                    id="b2b-text-resp"
                    rows={2}
                    value={textResponse}
                    onChange={(e) => setTextResponse(e.target.value)}
                    className="w-full px-3 py-2 text-xs border border-slate-200 rounded-xl text-slate-950"
                  />
                </div>
              </div>
            )}

            <button
              type="button"
              disabled={testingEndpoint || !bearerTokenInput.trim()}
              onClick={() => void handleTestGatewayEndpoint()}
              className="w-full sm:w-auto min-h-[44px] inline-flex items-center justify-center gap-2 px-5 py-2.5 text-xs font-semibold rounded-xl bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 transition-colors whitespace-nowrap"
            >
              <Play className="w-3.5 h-3.5" />
              <span>
                {testingEndpoint
                  ? "Executing Metered Request..."
                  : `Execute POST /api/v1/qa/${activeEndpoint} ($0.10)`}
              </span>
            </button>
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between text-xs text-slate-500">
              <span className="font-semibold text-slate-700">Live JSON Response</span>
              {explorerStatus !== null && (
                <span className="font-mono tabular-nums font-semibold text-slate-900">
                  HTTP {explorerStatus}
                </span>
              )}
            </div>
            <pre className="p-4 rounded-xl bg-slate-950 text-slate-100 text-xs font-mono overflow-x-auto min-h-[210px] leading-relaxed">
              {explorerResult
                ? JSON.stringify(explorerResult, null, 2)
                : `curl -X POST http://localhost:3000/api/v1/qa/${activeEndpoint} \\\n  -H "Authorization: Bearer ${bearerTokenInput || "sk_live_your_key"}" \\\n  -H "Content-Type: application/json" \\\n  -d '${activeEndpoint === "audio" ? '{"preset":"pass"}' : activeEndpoint === "vision" ? '{"iouThreshold":0.7}' : '{"prompt":"...","responseText":"..."}'}'`}
            </pre>
          </div>
        </div>
      </section>

      {/* Kora Pay Metered Invoices & Recent Metered Calls */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <section className="rounded-2xl border border-slate-200 bg-white p-6 space-y-4">
          <div className="border-b border-slate-100 pb-3">
            <h2 className="text-base font-bold text-slate-950">
              Kora Pay Monthly Metered Invoices
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Settlements reset unbilled counters on success or lock keys past_due on failure.
            </p>
          </div>

          {/* Mobile (<md) Metered Invoice Cards */}
          <div className="md:hidden divide-y divide-slate-200 border border-slate-200 rounded-xl overflow-hidden">
            {invoices.length === 0 ? (
              <p className="p-4 text-xs text-slate-500 text-center">No metered invoices yet.</p>
            ) : (
              invoices.map((inv) => (
                <article key={inv.id} className="p-4 space-y-3 bg-white text-xs">
                  <div className="flex items-start justify-between gap-2">
                    <span className="font-mono font-semibold text-slate-900 break-all">
                      {inv.kora_reference}
                    </span>
                    <span
                      className={`font-semibold shrink-0 ${
                        inv.status === "paid"
                          ? "text-emerald-700"
                          : inv.status === "failed"
                            ? "text-red-700"
                            : "text-amber-700"
                      }`}
                    >
                      {inv.status === "paid" ? "Paid" : inv.status === "failed" ? "Past Due" : "Pending"}
                    </span>
                  </div>
                  <dl className="grid grid-cols-2 gap-2 pt-2 border-t border-slate-100">
                    <div>
                      <dt className="text-slate-500">Metered Calls</dt>
                      <dd className="font-mono tabular-nums font-semibold text-slate-900">
                        {inv.total_calls}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-slate-500">Amount</dt>
                      <dd className="font-mono tabular-nums font-semibold text-slate-900">
                        {inv.charge_currency} {inv.charge_amount.toLocaleString()} ($
                        {inv.amount_usd.toFixed(2)})
                      </dd>
                    </div>
                  </dl>
                  {inv.status !== "paid" && (
                    <div className="grid grid-cols-2 gap-2 pt-1">
                      <button
                        type="button"
                        disabled={verifyingRef === inv.kora_reference}
                        onClick={() => void handleVerifyInvoice(inv.kora_reference, "success")}
                        className="min-h-[44px] px-3 py-2 font-semibold rounded-xl bg-emerald-600 text-white hover:bg-emerald-700"
                      >
                        Confirm Paid
                      </button>
                      <button
                        type="button"
                        disabled={verifyingRef === inv.kora_reference}
                        onClick={() => void handleVerifyInvoice(inv.kora_reference, "failed")}
                        className="min-h-[44px] inline-flex items-center justify-center gap-1 px-3 py-2 font-semibold rounded-xl border border-amber-300 text-amber-800 hover:bg-amber-50"
                      >
                        <ShieldAlert className="w-3.5 h-3.5" />
                        <span>Past Due</span>
                      </button>
                    </div>
                  )}
                </article>
              ))
            )}
          </div>

          {/* Desktop (md+) Metered Invoice Table */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-200 text-slate-500 font-semibold">
                  <th className="py-2.5 pr-3">Reference</th>
                  <th className="py-2.5 pr-3 text-right">Calls</th>
                  <th className="py-2.5 pr-3 text-right">Amount</th>
                  <th className="py-2.5 pr-3">Status</th>
                  <th className="py-2.5 text-right">Webhook / Verify</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {invoices.map((inv) => (
                  <tr key={inv.id}>
                    <td className="py-3 pr-3 font-mono text-slate-800">
                      {inv.kora_reference.slice(0, 22)}...
                    </td>
                    <td className="py-3 pr-3 text-right font-mono tabular-nums text-slate-900">
                      {inv.total_calls}
                    </td>
                    <td className="py-3 pr-3 text-right font-mono tabular-nums text-slate-900">
                      {inv.charge_currency} {inv.charge_amount.toLocaleString()} ($
                      {inv.amount_usd.toFixed(2)})
                    </td>
                    <td className="py-3 pr-3 font-semibold">
                      {inv.status === "paid" ? (
                        <span className="text-emerald-700">Paid</span>
                      ) : inv.status === "failed" ? (
                        <span className="text-red-700">Past Due</span>
                      ) : (
                        <span className="text-amber-700">Pending</span>
                      )}
                    </td>
                    <td className="py-3 text-right">
                      {inv.status === "paid" ? (
                        <span className="text-slate-400">Settled</span>
                      ) : (
                        <div className="inline-flex items-center gap-1.5">
                          <button
                            type="button"
                            disabled={verifyingRef === inv.kora_reference}
                            onClick={() => void handleVerifyInvoice(inv.kora_reference, "success")}
                            className="min-h-[44px] px-3 py-1.5 font-semibold rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 whitespace-nowrap"
                          >
                            Confirm Paid
                          </button>
                          <button
                            type="button"
                            disabled={verifyingRef === inv.kora_reference}
                            onClick={() => void handleVerifyInvoice(inv.kora_reference, "failed")}
                            className="min-h-[44px] inline-flex items-center gap-1 px-3 py-1.5 font-semibold rounded-lg border border-amber-300 text-amber-800 hover:bg-amber-50 whitespace-nowrap"
                          >
                            <ShieldAlert className="w-3 h-3" />
                            <span>Mark Past Due</span>
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-6 space-y-4">
          <div className="border-b border-slate-100 pb-3">
            <h2 className="text-base font-bold text-slate-950">Recent Metered API Usage Logs</h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Immutable audit trail across /api/v1/qa/audio, /vision, and /text.
            </p>
          </div>

          {/* Mobile (<md) Stacked API Usage Cards */}
          <div className="md:hidden divide-y divide-slate-200 border border-slate-200 rounded-xl overflow-hidden">
            {usageLogs.length === 0 ? (
              <p className="p-4 text-xs text-slate-500 text-center">No metered API usage logs yet.</p>
            ) : (
              usageLogs.slice(0, 10).map((log) => (
                <article key={log.id} className="p-4 space-y-2.5 bg-white text-xs">
                  <div className="flex items-start justify-between gap-2">
                    <span className="font-mono font-semibold text-slate-950 break-all">
                      {log.endpoint}
                    </span>
                    <span
                      className={`font-semibold shrink-0 ${
                        log.passed_gate ? "text-emerald-700" : "text-amber-700"
                      }`}
                    >
                      {log.passed_gate ? "Pass" : "Flagged"}
                    </span>
                  </div>
                  <dl className="grid grid-cols-3 gap-2 pt-2 border-t border-slate-100">
                    <div>
                      <dt className="text-slate-500">Key Prefix</dt>
                      <dd className="font-mono text-slate-800 truncate">{log.key_prefix}</dd>
                    </div>
                    <div>
                      <dt className="text-slate-500">Latency</dt>
                      <dd className="font-mono tabular-nums text-slate-800">{log.latency_ms} ms</dd>
                    </div>
                    <div>
                      <dt className="text-slate-500">Metered</dt>
                      <dd className="font-mono tabular-nums font-bold text-slate-950">
                        ${log.cost_usd.toFixed(2)}
                      </dd>
                    </div>
                  </dl>
                </article>
              ))
            )}
          </div>

          {/* Desktop (md+) API Usage Table */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-200 text-slate-500 font-semibold">
                  <th className="py-2.5 pr-3">Endpoint</th>
                  <th className="py-2.5 pr-3">Key</th>
                  <th className="py-2.5 pr-3">Gate</th>
                  <th className="py-2.5 pr-3 text-right">Latency</th>
                  <th className="py-2.5 text-right">Metered</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {usageLogs.slice(0, 10).map((log) => (
                  <tr key={log.id}>
                    <td className="py-3 pr-3 font-mono text-slate-900">{log.endpoint}</td>
                    <td className="py-3 pr-3 font-mono text-slate-500">{log.key_prefix}</td>
                    <td className="py-3 pr-3 font-semibold">
                      {log.passed_gate ? (
                        <span className="text-emerald-700">Pass</span>
                      ) : (
                        <span className="text-amber-700">Flagged</span>
                      )}
                    </td>
                    <td className="py-3 pr-3 text-right font-mono tabular-nums text-slate-700">
                      {log.latency_ms} ms
                    </td>
                    <td className="py-3 text-right font-mono tabular-nums font-semibold text-slate-950">
                      ${log.cost_usd.toFixed(2)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </div>
  );
}
