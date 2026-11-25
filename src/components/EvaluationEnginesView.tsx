import React, { useCallback, useEffect, useState } from "react";
import { Check, FileAudio, Gauge, Play, ScanEye, ShieldAlert, ShieldCheck, Type as TypeIcon, Upload, AlertTriangle } from "lucide-react";
import type {
  AudioQaReport,
  BoundingBox,
  CostControlUserStatus,
  ModerationStatusResponse,
  Task,
  TextLocalizationReport,
  VisionQaReport,
} from "../types/tenant";
import { convertAudioBlobToWav } from "../utils/wavEncoder";
import { MobileMediaRecorder } from "./MobileMediaRecorder";

interface EvaluationEnginesViewProps {
  orgId: string;
  orgName: string;
  userId: string;
  tasks: Task[];
  onTaskUpdated: () => Promise<void>;
}

type EngineTab = "audio" | "vision" | "text";

const INITIAL_REF_BOXES: BoundingBox[] = [
  { id: "ref_forklift", label: "forklift", x1: 68, y1: 148, x2: 268, y2: 312 },
  { id: "ref_pallet", label: "pallet_rack", x1: 332, y1: 78, x2: 562, y2: 308 },
  { id: "ref_worker", label: "safety_vest", x1: 276, y1: 186, x2: 326, y2: 306 },
];

const INITIAL_CAND_BOXES: BoundingBox[] = [
  { id: "cand_1", label: "forklift", x1: 74, y1: 154, x2: 264, y2: 308 },
  { id: "cand_2", label: "pallet_rack", x1: 380, y1: 112, x2: 590, y2: 325 },
  { id: "cand_3", label: "safety_vest", x1: 278, y1: 188, x2: 324, y2: 304 },
];

export function EvaluationEnginesView({
  orgId,
  orgName,
  userId,
  tasks,
  onTaskUpdated,
}: EvaluationEnginesViewProps) {
  const [activeTab, setActiveTab] = useState<EngineTab>("audio");
  const [selectedTaskId, setSelectedTaskId] = useState<string>("");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Audio QA state
  const [wavFileName, setWavFileName] = useState<string>("");
  const [wavBase64, setWavBase64] = useState<string>("");
  const [audioPreviewUrl, setAudioPreviewUrl] = useState<string>("");
  const [refTranscript, setRefTranscript] = useState(
    "La arquitectura multi-inquilino garantiza aislamiento completo."
  );
  const [runStt, setRunStt] = useState(false);
  const [audioLoading, setAudioLoading] = useState(false);
  const [audioReport, setAudioReport] = useState<AudioQaReport | null>(null);

  // Vision QA state
  const [refBoxes] = useState<BoundingBox[]>(INITIAL_REF_BOXES);
  const [candBoxes, setCandBoxes] = useState<BoundingBox[]>(INITIAL_CAND_BOXES);
  const [visionLoading, setVisionLoading] = useState(false);
  const [visionReport, setVisionReport] = useState<VisionQaReport | null>(null);

  // Text / Localization QA state
  const [targetLocale, setTargetLocale] = useState("es-ES");
  const [sourceText, setSourceText] = useState(
    "Row-Level Security ensures Organization A can never access Organization B's annotation tasks or escrow payouts."
  );
  const [candidateOutput, setCandidateOutput] = useState(
    "La seguridad a nivel de fila garantiza que la Organización A nunca pueda acceder a las tareas de anotación ni a los pagos en depósito de la Organización B."
  );
  const [rubricInput, setRubricInput] = useState(
    "Semantic Accuracy, Fluency & Idiomatic Tone, Terminology Consistency, Format & Policy Adherence"
  );
  const [textLoading, setTextLoading] = useState(false);
  const [textReport, setTextReport] = useState<TextLocalizationReport | null>(null);

  // Phase 20B Pre-Upload Moderation state
  const [modStatus, setModStatus] = useState<ModerationStatusResponse | null>(null);
  // Phase 20C Rate Limit & Daily AI Cost Circuit Breaker state
  const [costStatus, setCostStatus] = useState<CostControlUserStatus | null>(null);

  const refreshModerationStatus = useCallback(async () => {
    try {
      const [modRes, costRes] = await Promise.all([
        fetch("/api/moderation/status", {
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
      if (modRes.ok) {
        setModStatus((await modRes.json()) as ModerationStatusResponse);
      }
      if (costRes.ok) {
        setCostStatus((await costRes.json()) as CostControlUserStatus);
      }
    } catch {
      // ignore transient poll failures
    }
  }, [orgId, userId]);

  useEffect(() => {
    void refreshModerationStatus();
  }, [refreshModerationStatus]);

  async function loadAudioPreset(preset: "pass" | "fail") {
    setErrorMsg(null);
    setAudioReport(null);
    try {
      const res = await fetch(`/api/qa/audio/sample/${preset}`, {
        credentials: "include",
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.detail || "Failed to fetch sample WAV fixture.");
      }
      const data = (await res.json()) as { fileName: string; wavBase64: string };
      setWavFileName(data.fileName);
      setWavBase64(data.wavBase64);
      setAudioPreviewUrl(`data:audio/wav;base64,${data.wavBase64}`);
      await runAudioEvaluation(data.wavBase64, data.fileName);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Failed to load WAV preset.");
    }
  }

  async function handleWavUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setErrorMsg(null);
    setAudioReport(null);
    try {
      const converted = await convertAudioBlobToWav(file, { targetSampleRate: 24000 });
      const baseStem = file.name.replace(/\.[^.]+$/, "") || "captured_audio";
      const outName = file.name.toLowerCase().endsWith(".wav") ? file.name : `${baseStem}.wav`;
      setWavFileName(outName);
      setWavBase64(converted.wavBase64);
      setAudioPreviewUrl(URL.createObjectURL(converted.wavBlob));
    } catch (err) {
      setErrorMsg(
        err instanceof Error
          ? err.message
          : "Failed to decode captured audio file into .wav format."
      );
    }
  }

  async function runAudioEvaluation(overrideBase64?: string, overrideName?: string) {
    const b64 = overrideBase64 ?? wavBase64;
    const name = overrideName ?? wavFileName;
    if (!b64) return;
    setAudioLoading(true);
    setErrorMsg(null);
    try {
      const res = await fetch("/api/qa/audio", {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          "x-org-id": orgId,
          "x-user-id": userId,
        },
        body: JSON.stringify({
          wavBase64: b64,
          fileName: name,
          referenceTranscript: refTranscript,
          runStt,
          taskId: selectedTaskId || undefined,
        }),
      });
      const body = await res.json();
      void refreshModerationStatus();
      if (!res.ok) throw new Error(body.detail || "Audio QA evaluation failed.");
      setAudioReport(body.report);
      if (selectedTaskId) await onTaskUpdated();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Audio QA evaluation failed.");
    } finally {
      setAudioLoading(false);
    }
  }

  async function runVisionEvaluation(boxesToEval?: BoundingBox[]) {
    setVisionLoading(true);
    setErrorMsg(null);
    try {
      const res = await fetch("/api/qa/vision", {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          "x-org-id": orgId,
          "x-user-id": userId,
        },
        body: JSON.stringify({
          candidateBoxes: boxesToEval ?? candBoxes,
          referenceBoxes: refBoxes,
          taskId: selectedTaskId || undefined,
        }),
      });
      const body = await res.json();
      void refreshModerationStatus();
      if (!res.ok) throw new Error(body.detail || "Vision QA evaluation failed.");
      setVisionReport(body.report);
      if (selectedTaskId) await onTaskUpdated();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Vision QA evaluation failed.");
    } finally {
      setVisionLoading(false);
    }
  }

  function updateCandBoxCoord(
    id: string,
    field: "x1" | "y1" | "x2" | "y2",
    value: number
  ) {
    setCandBoxes((prev) =>
      prev.map((b) => (b.id === id ? { ...b, [field]: value } : b))
    );
  }

  function snapBoxesToGroundTruth() {
    const aligned = INITIAL_CAND_BOXES.map((b, i) =>
      i === 1 ? { ...b, x1: 336, y1: 82, x2: 558, y2: 304 } : b
    );
    setCandBoxes(aligned);
    void runVisionEvaluation(aligned);
  }

  async function runTextEvaluation(e: React.FormEvent) {
    e.preventDefault();
    setTextLoading(true);
    setErrorMsg(null);
    try {
      const criteria = rubricInput
        .split(",")
        .map((c) => c.trim())
        .filter(Boolean);
      const res = await fetch("/api/qa/text", {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          "x-org-id": orgId,
          "x-user-id": userId,
        },
        body: JSON.stringify({
          sourceText,
          candidateOutput,
          targetLocale,
          rubricCriteria: criteria,
          taskId: selectedTaskId || undefined,
        }),
      });
      const body = await res.json();
      void refreshModerationStatus();
      if (!res.ok) throw new Error(body.detail || "Text QA evaluation failed.");
      setTextReport(body.report);
      if (selectedTaskId) await onTaskUpdated();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Text QA evaluation failed.");
    } finally {
      setTextLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="border-b border-slate-200 pb-6 flex flex-col lg:flex-row lg:items-end justify-between gap-4">
        <div>
          <p className="text-xs font-medium text-slate-500">
            Phase 3 · Multi-Modal Evaluation Engines · {orgName}
          </p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-slate-900">
            Audio, Vision & Text QA Verifiers
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            Automated DSP acoustic telemetry, YOLOv8 IoU bounding-box auditing, and 1–5 localization rubric scoring.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className="w-64">
            <label
              htmlFor="qa-task-bind"
              className="block text-[11px] font-medium text-slate-500 mb-1"
            >
              Bind Verifier Score to Task (Optional)
            </label>
            <select
              id="qa-task-bind"
              value={selectedTaskId}
              onChange={(e) => setSelectedTaskId(e.target.value)}
              className="w-full min-h-[44px] px-2.5 py-2 text-xs bg-white border border-slate-200 rounded-md"
            >
              <option value="">Standalone QA Run (No Task Bound)</option>
              {tasks.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.title.slice(0, 40)}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Engine Tabs */}
      <div className="flex flex-wrap items-center gap-1.5 p-1.5 bg-slate-100 rounded-lg w-full sm:w-fit">
        <button
          type="button"
          onClick={() => setActiveTab("audio")}
          className={`min-h-[44px] inline-flex items-center gap-2 px-3.5 py-2 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
            activeTab === "audio"
              ? "bg-white text-slate-900 shadow-xs"
              : "text-slate-600 hover:text-slate-900"
          }`}
        >
          <FileAudio className="w-3.5 h-3.5" />
          <span>Audio QA (librosa / STT WER)</span>
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("vision")}
          className={`min-h-[44px] inline-flex items-center gap-2 px-3.5 py-2 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
            activeTab === "vision"
              ? "bg-white text-slate-900 shadow-xs"
              : "text-slate-600 hover:text-slate-900"
          }`}
        >
          <ScanEye className="w-3.5 h-3.5" />
          <span>Vision QA (YOLOv8 IoU)</span>
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("text")}
          className={`min-h-[44px] inline-flex items-center gap-2 px-3.5 py-2 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
            activeTab === "text"
              ? "bg-white text-slate-900 shadow-xs"
              : "text-slate-600 hover:text-slate-900"
          }`}
        >
          <TypeIcon className="w-3.5 h-3.5" />
          <span>Text & Localization (1–5 Rubric)</span>
        </button>
      </div>

      {costStatus?.circuitOpen && (
        <div
          role="alert"
          className="p-4 rounded-md border border-amber-300 bg-amber-50 text-amber-950 text-xs flex flex-wrap items-center justify-between gap-3"
        >
          <div className="flex items-center gap-2.5">
            <AlertTriangle className="w-4 h-4 text-amber-700 shrink-0" />
            <div>
              <p className="font-semibold text-amber-950">
                High Traffic · Automated QA Agents Temporarily Paused
              </p>
              <p className="text-amber-900 mt-0.5">
                {costStatus.highTrafficMessage ||
                  "High Traffic: Automated AI QA Agents are temporarily paused. Please retry shortly."}
              </p>
            </div>
          </div>
          <span className="font-mono font-semibold text-amber-900 uppercase">
            CIRCUIT OPEN (503)
          </span>
        </div>
      )}

      {costStatus && (
        <div className="px-4 py-2.5 rounded-md border border-slate-200 bg-white text-xs flex flex-wrap items-center justify-between gap-3 text-slate-700">
          <div className="flex items-center gap-2">
            <Gauge className="w-4 h-4 text-slate-500 shrink-0" />
            <span>
              Upstash Rate Guard ·{" "}
              <span className="font-semibold text-slate-900 uppercase">{costStatus.tier}</span>{" "}
              tier QA Agent allowance
            </span>
          </div>
          <div className="flex items-center gap-4 font-mono tabular-nums">
            <span>
              Remaining:{" "}
              <strong className="text-slate-900">
                {costStatus.qaRemainingThisHour} / {costStatus.qaHourlyLimit}
              </strong>{" "}
              uploads/hr
            </span>
            <span className="text-slate-500">
              {costStatus.backend === "upstash_redis_rest" ? "Upstash Redis" : "Sliding Window"}
            </span>
          </div>
        </div>
      )}

      {modStatus && (
        <div
          className={`p-4 rounded-md border text-xs flex flex-wrap items-center justify-between gap-3 ${
            modStatus.isSuspended
              ? "border-red-300 bg-red-50 text-red-900"
              : "border-slate-200 bg-slate-50 text-slate-700"
          }`}
        >
          <div className="flex items-center gap-2">
            {modStatus.isSuspended ? (
              <ShieldAlert className="w-4 h-4 text-red-600 shrink-0" />
            ) : (
              <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0" />
            )}
            <span>
              {modStatus.isSuspended
                ? modStatus.suspensionReason ||
                  "Account suspended after 3 malicious uploads. QA submissions locked."
                : "Pre-Upload Content Moderation Shield Active: NSFW Image/Video, Audio STT Speech Gate & Text Toxicity filters run before QA Agents."}
            </span>
          </div>
          <span className="font-mono font-semibold tabular-nums">
            Moderation Strikes: {modStatus.moderationStrikes} / {modStatus.maxStrikes}
          </span>
        </div>
      )}

      {errorMsg && (
        <div className="p-4 border border-red-200 bg-red-50 text-red-900 rounded-md text-sm">
          {errorMsg}
        </div>
      )}

      {/* ==================== TAB 1: AUDIO QA ==================== */}
      {activeTab === "audio" && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <section className="lg:col-span-5 border border-slate-200 bg-white rounded-lg p-6 space-y-5">
            <div>
              <h2 className="text-base font-semibold text-slate-900">
                1. Load .wav Asset & Reference Script
              </h2>
              <p className="text-xs text-slate-500 mt-1">
                Checks Mono, 24kHz, Peak (-3 to -6 dBFS), Noise Floor (&lt; -70 dBFS), SNR (&gt; 35 dB), and STT WER.
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => loadAudioPreset("pass")}
                className="min-h-[44px] px-3 py-2 text-xs font-medium bg-[#0F172A] text-white rounded-md hover:bg-slate-800 whitespace-nowrap"
              >
                Load Passing 24kHz Mono WAV
              </button>
              <button
                type="button"
                onClick={() => loadAudioPreset("fail")}
                className="min-h-[44px] px-3 py-2 text-xs font-medium border border-slate-200 text-slate-700 rounded-md hover:bg-slate-50 whitespace-nowrap"
              >
                Load Failing 44.1kHz Stereo WAV
              </button>
            </div>

            <MobileMediaRecorder
              compact
              orgId={orgId}
              userId={userId}
              taskId={selectedTaskId || undefined}
              defaultScript={refTranscript}
              onWavPrepared={(b64, name, url) => {
                setWavFileName(name);
                setWavBase64(b64);
                setAudioPreviewUrl(url);
              }}
              onAudioQaResult={(report) => {
                setAudioReport(report);
                if (selectedTaskId) void onTaskUpdated();
              }}
            />

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1.5">
                Or Upload Local .wav / Native Capture
              </label>
              <label className="min-h-[44px] flex items-center justify-center gap-2 px-4 py-3 border border-dashed border-slate-300 rounded-md text-xs text-slate-600 hover:bg-slate-50 cursor-pointer">
                <Upload className="w-4 h-4" />
                <span>{wavFileName || "Choose .wav / capture audio"}</span>
                <input
                  type="file"
                  accept="audio/*,video/*,.wav"
                  capture="environment"
                  onChange={handleWavUpload}
                  className="hidden"
                />
              </label>
            </div>

            {audioPreviewUrl && (
              <div>
                <p className="text-xs font-medium text-slate-700 mb-1">
                  Loaded Waveform Preview
                </p>
                <audio controls src={audioPreviewUrl} className="w-full h-11" />
              </div>
            )}

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Reference Script (for STT WER Check)
              </label>
              <textarea
                rows={2}
                value={refTranscript}
                onChange={(e) => setRefTranscript(e.target.value)}
                className="w-full min-h-[64px] px-3 py-2 text-sm border border-slate-200 rounded-md"
              />
            </div>

            <label className="min-h-[44px] flex items-center gap-2 text-xs text-slate-700 cursor-pointer">
              <input
                type="checkbox"
                checked={runStt}
                onChange={(e) => setRunStt(e.target.checked)}
                className="w-4 h-4 rounded border-slate-300"
              />
              <span>Run Gemini STT Transcription & Word Error Rate (WER)</span>
            </label>

            <button
              type="button"
              disabled={!wavBase64 || audioLoading}
              onClick={() => runAudioEvaluation()}
              className="w-full min-h-[44px] inline-flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium bg-[#0F172A] text-white rounded-md hover:bg-slate-800 disabled:opacity-50"
            >
              <Play className="w-4 h-4" />
              <span>{audioLoading ? "Analyzing WAV..." : "Run Audio QA Inspection"}</span>
            </button>
          </section>

          <section className="lg:col-span-7 border border-slate-200 bg-white rounded-lg p-6 space-y-5">
            <div className="flex items-center justify-between border-b border-slate-200 pb-4">
              <div>
                <h2 className="text-base font-semibold text-slate-900">
                  2. Acoustic Telemetry & Verdict
                </h2>
                <p className="text-xs text-slate-500">
                  {audioReport ? audioReport.fileName : "Awaiting .wav analysis"}
                </p>
              </div>
              {audioReport && (
                <span
                  className={`inline-flex items-center gap-1.5 text-sm font-semibold ${
                    audioReport.passed ? "text-emerald-700" : "text-red-700"
                  }`}
                >
                  {audioReport.passed ? (
                    <Check className="w-4 h-4" />
                  ) : (
                    <AlertTriangle className="w-4 h-4" />
                  )}
                  <span>{audioReport.passed ? "QA Passed" : "QA Flagged"}</span>
                </span>
              )}
            </div>

            {audioReport ? (
              <div className="space-y-5">
                <table className="w-full text-left border-collapse text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 text-xs font-medium text-slate-500">
                      <th className="py-2">Acoustic Metric</th>
                      <th className="py-2">Target Spec</th>
                      <th className="py-2 text-right">Measured</th>
                      <th className="py-2 text-right">Result</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    <tr>
                      <td className="py-2.5 font-medium text-slate-900">Channels</td>
                      <td className="py-2.5 text-slate-500">Mono (1 ch)</td>
                      <td className="py-2.5 text-right font-mono tabular-nums">
                        {audioReport.channels} ch
                      </td>
                      <td
                        className={`py-2.5 text-right font-medium ${
                          audioReport.checks.mono ? "text-emerald-700" : "text-red-700"
                        }`}
                      >
                        {audioReport.checks.mono ? "Pass" : "Fail"}
                      </td>
                    </tr>
                    <tr>
                      <td className="py-2.5 font-medium text-slate-900">Sample Rate</td>
                      <td className="py-2.5 text-slate-500">24,000 Hz</td>
                      <td className="py-2.5 text-right font-mono tabular-nums">
                        {audioReport.sampleRateHz} Hz
                      </td>
                      <td
                        className={`py-2.5 text-right font-medium ${
                          audioReport.checks.sampleRate24kHz
                            ? "text-emerald-700"
                            : "text-red-700"
                        }`}
                      >
                        {audioReport.checks.sampleRate24kHz ? "Pass" : "Fail"}
                      </td>
                    </tr>
                    <tr>
                      <td className="py-2.5 font-medium text-slate-900">Peak Amplitude</td>
                      <td className="py-2.5 text-slate-500">-6.0 to -3.0 dBFS</td>
                      <td className="py-2.5 text-right font-mono tabular-nums">
                        {audioReport.peakDbfs.toFixed(2)} dBFS
                      </td>
                      <td
                        className={`py-2.5 text-right font-medium ${
                          audioReport.checks.peakRange
                            ? "text-emerald-700"
                            : "text-red-700"
                        }`}
                      >
                        {audioReport.checks.peakRange ? "Pass" : "Fail"}
                      </td>
                    </tr>
                    <tr>
                      <td className="py-2.5 font-medium text-slate-900">Noise Floor</td>
                      <td className="py-2.5 text-slate-500">&lt; -70.0 dBFS</td>
                      <td className="py-2.5 text-right font-mono tabular-nums">
                        {audioReport.noiseFloorDbfs.toFixed(2)} dBFS
                      </td>
                      <td
                        className={`py-2.5 text-right font-medium ${
                          audioReport.checks.noiseFloor
                            ? "text-emerald-700"
                            : "text-red-700"
                        }`}
                      >
                        {audioReport.checks.noiseFloor ? "Pass" : "Fail"}
                      </td>
                    </tr>
                    <tr>
                      <td className="py-2.5 font-medium text-slate-900">
                        Signal-to-Noise Ratio
                      </td>
                      <td className="py-2.5 text-slate-500">&gt; 35.0 dB</td>
                      <td className="py-2.5 text-right font-mono tabular-nums">
                        {audioReport.snrDb.toFixed(2)} dB
                      </td>
                      <td
                        className={`py-2.5 text-right font-medium ${
                          audioReport.checks.snr ? "text-emerald-700" : "text-red-700"
                        }`}
                      >
                        {audioReport.checks.snr ? "Pass" : "Fail"}
                      </td>
                    </tr>
                    {audioReport.wordErrorRate !== null && (
                      <tr>
                        <td className="py-2.5 font-medium text-slate-900">
                          STT Word Error Rate
                        </td>
                        <td className="py-2.5 text-slate-500">&le; 5.0%</td>
                        <td className="py-2.5 text-right font-mono tabular-nums">
                          {(audioReport.wordErrorRate * 100).toFixed(2)}%
                        </td>
                        <td
                          className={`py-2.5 text-right font-medium ${
                            audioReport.checks.wer
                              ? "text-emerald-700"
                              : "text-red-700"
                          }`}
                        >
                          {audioReport.checks.wer ? "Pass" : "Fail"}
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>

                {audioReport.transcript !== null && (
                  <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-md text-xs">
                    <p className="font-medium text-slate-700">STT Transcript:</p>
                    <p className="mt-1 text-slate-900">
                      {audioReport.transcript || "(No spoken speech detected in synthetic tone waveform)"}
                    </p>
                  </div>
                )}

                {audioReport.failureReasons.length > 0 && (
                  <div className="p-4 border border-red-200 bg-red-50 rounded-md text-xs text-red-900 space-y-1">
                    <p className="font-semibold">Detected Violations</p>
                    {audioReport.failureReasons.map((reason) => (
                      <p key={reason}>· {reason}</p>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <div className="py-16 text-center text-sm text-slate-500">
                Load a sample WAV or upload a recording on the left to inspect acoustic metrics.
              </div>
            )}
          </section>
        </div>
      )}

      {/* ==================== TAB 2: VISION QA ==================== */}
      {activeTab === "vision" && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <section className="lg:col-span-7 border border-slate-200 bg-white rounded-lg p-6 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h2 className="text-base font-semibold text-slate-900">
                  Bounding-Box Overlay (YOLOv8 Reference vs. Candidate)
                </h2>
                <p className="text-xs text-slate-500">
                  Dashed lines = YOLOv8 Ground Truth · Solid lines = Annotator Boxes (Flagged if IoU &lt; 0.70)
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={snapBoxesToGroundTruth}
                  className="px-3 py-1.5 text-xs font-medium border border-slate-200 text-slate-700 rounded-md hover:bg-slate-50 whitespace-nowrap"
                >
                  Align All & Verify
                </button>
                <button
                  type="button"
                  disabled={visionLoading}
                  onClick={() => runVisionEvaluation()}
                  className="px-3.5 py-1.5 text-xs font-medium bg-[#0F172A] text-white rounded-md hover:bg-slate-800 whitespace-nowrap"
                >
                  {visionLoading ? "Computing IoU..." : "Evaluate IoU"}
                </button>
              </div>
            </div>

            {/* Clean Architectural SVG Inspection Scene */}
            <div className="border border-slate-200 rounded-md overflow-hidden bg-slate-950">
              <svg
                viewBox="0 0 640 360"
                className="w-full h-auto block"
                role="img"
                aria-label="Warehouse bounding box inspection canvas"
              >
                {/* Warehouse floor & rack silhouettes */}
                <rect x="0" y="0" width="640" height="360" fill="#0F172A" />
                <line x1="0" y1="305" x2="640" y2="305" stroke="#334155" strokeWidth="1.5" />
                {/* Rack */}
                <rect x="336" y="82" width="222" height="222" fill="#1E293B" stroke="#475569" />
                <line x1="336" y1="156" x2="558" y2="156" stroke="#475569" strokeWidth="3" />
                <line x1="336" y1="230" x2="558" y2="230" stroke="#475569" strokeWidth="3" />
                {/* Forklift silhouette */}
                <rect x="74" y="210" width="130" height="75" rx="4" fill="#334155" />
                <rect x="204" y="152" width="18" height="148" fill="#64748B" />
                <rect x="222" y="280" width="42" height="12" fill="#94A3B8" />
                <circle cx="104" cy="296" r="16" fill="#475569" />
                <circle cx="182" cy="296" r="16" fill="#475569" />
                {/* Worker safety vest silhouette */}
                <rect x="284" y="190" width="34" height="58" rx="4" fill="#D97706" opacity="0.7" />
                <circle cx="301" cy="176" r="10" fill="#94A3B8" />
                <rect x="288" y="248" width="26" height="54" fill="#475569" />

                {/* Reference YOLOv8 Boxes */}
                {refBoxes.map((box) => (
                  <g key={box.id}>
                    <rect
                      x={box.x1}
                      y={box.y1}
                      width={Math.max(0, box.x2 - box.x1)}
                      height={Math.max(0, box.y2 - box.y1)}
                      fill="none"
                      stroke="#10B981"
                      strokeWidth="1.5"
                      strokeDasharray="6 4"
                    />
                    <text
                      x={box.x1 + 4}
                      y={box.y1 - 5}
                      fill="#10B981"
                      fontSize="10"
                      fontFamily="monospace"
                    >
                      GT: {box.label}
                    </text>
                  </g>
                ))}

                {/* Candidate Annotator Boxes */}
                {candBoxes.map((box) => {
                  const evalMatch = visionReport?.evaluations.find(
                    (e) => e.boxId === box.id
                  );
                  const strokeColor = evalMatch?.flagged
                    ? "#EF4444"
                    : evalMatch
                      ? "#3B82F6"
                      : "#F8FAFC";
                  return (
                    <g key={box.id}>
                      <rect
                        x={box.x1}
                        y={box.y1}
                        width={Math.max(0, box.x2 - box.x1)}
                        height={Math.max(0, box.y2 - box.y1)}
                        fill={evalMatch?.flagged ? "rgba(239,68,68,0.12)" : "rgba(59,130,246,0.08)"}
                        stroke={strokeColor}
                        strokeWidth="2"
                      />
                      <text
                        x={box.x1 + 4}
                        y={box.y2 + 12}
                        fill={strokeColor}
                        fontSize="10"
                        fontFamily="monospace"
                      >
                        {box.label}
                        {evalMatch ? ` (IoU ${evalMatch.iou.toFixed(2)})` : ""}
                      </text>
                    </g>
                  );
                })}
              </svg>
            </div>

            {/* Coordinate Adjustment Controls */}
            <div className="space-y-3 pt-2">
              <p className="text-xs font-medium text-slate-700">
                Adjust Candidate Box Coordinates (Test IoU &lt; 0.70 Flagging)
              </p>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                {candBoxes.map((box) => (
                  <div
                    key={box.id}
                    className="p-3 border border-slate-200 rounded-md space-y-2 text-xs"
                  >
                    <p className="font-semibold text-slate-900 font-mono">
                      {box.id} · {box.label}
                    </p>
                    <div className="grid grid-cols-2 gap-2">
                      <label className="text-slate-600">
                        x1: <span className="font-mono">{box.x1}</span>
                        <input
                          type="range"
                          min={20}
                          max={480}
                          value={box.x1}
                          onChange={(e) =>
                            updateCandBoxCoord(box.id, "x1", Number(e.target.value))
                          }
                          className="w-full"
                        />
                      </label>
                      <label className="text-slate-600">
                        y1: <span className="font-mono">{box.y1}</span>
                        <input
                          type="range"
                          min={20}
                          max={280}
                          value={box.y1}
                          onChange={(e) =>
                            updateCandBoxCoord(box.id, "y1", Number(e.target.value))
                          }
                          className="w-full"
                        />
                      </label>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </section>

          <section className="lg:col-span-5 border border-slate-200 bg-white rounded-lg p-6 space-y-4">
            <div className="border-b border-slate-200 pb-4 flex items-center justify-between">
              <div>
                <h2 className="text-base font-semibold text-slate-900">
                  IoU Verification Report
                </h2>
                <p className="text-xs text-slate-500">
                  Threshold: IoU &ge; 0.700 per bounding box
                </p>
              </div>
              {visionReport && (
                <span
                  className={`text-sm font-semibold ${
                    visionReport.passed ? "text-emerald-700" : "text-red-700"
                  }`}
                >
                  {visionReport.passed
                    ? "All Boxes Verified"
                    : `${visionReport.flaggedCount} Flagged`}
                </span>
              )}
            </div>

            {visionReport ? (
              <div className="space-y-4">
                <div className="grid grid-cols-2 border border-slate-200 rounded-md divide-x divide-slate-200">
                  <div className="p-3.5">
                    <p className="text-xs text-slate-500">Mean IoU</p>
                    <p className="mt-1 text-xl font-semibold font-mono tabular-nums text-slate-900">
                      {visionReport.meanIou.toFixed(3)}
                    </p>
                  </div>
                  <div className="p-3.5">
                    <p className="text-xs text-slate-500">Flagged (&lt; 0.70)</p>
                    <p className="mt-1 text-xl font-semibold font-mono tabular-nums text-slate-900">
                      {visionReport.flaggedCount} / {visionReport.totalBoxes}
                    </p>
                  </div>
                </div>

                <div className="divide-y divide-slate-200 border border-slate-200 rounded-md">
                  {visionReport.evaluations.map((ev) => (
                    <div key={ev.boxId} className="p-3.5 text-xs space-y-1">
                      <div className="flex items-center justify-between">
                        <span className="font-mono font-semibold text-slate-900">
                          {ev.boxId} · {ev.label}
                        </span>
                        <span
                          className={`font-mono font-semibold ${
                            ev.flagged ? "text-red-700" : "text-emerald-700"
                          }`}
                        >
                          IoU {ev.iou.toFixed(3)} · {ev.flagged ? "Flagged" : "Pass"}
                        </span>
                      </div>
                      {ev.reason && <p className="text-red-700">{ev.reason}</p>}
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="py-16 text-center text-sm text-slate-500">
                Click &quot;Evaluate IoU&quot; to inspect bounding-box overlap against YOLOv8 ground truth.
              </div>
            )}
          </section>
        </div>
      )}

      {/* ==================== TAB 3: TEXT & LOCALIZATION ==================== */}
      {activeTab === "text" && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <form
            onSubmit={runTextEvaluation}
            className="lg:col-span-6 border border-slate-200 bg-white rounded-lg p-6 space-y-4"
          >
            <div className="flex items-center justify-between">
              <h2 className="text-base font-semibold text-slate-900">
                Translation / Model Output Input
              </h2>
              <div className="w-28">
                <select
                  value={targetLocale}
                  onChange={(e) => setTargetLocale(e.target.value)}
                  className="w-full px-2.5 py-1.5 text-xs border border-slate-200 rounded-md bg-white"
                >
                  <option value="es-ES">es-ES</option>
                  <option value="es-MX">es-MX</option>
                  <option value="ja-JP">ja-JP</option>
                  <option value="de-DE">de-DE</option>
                  <option value="fr-FR">fr-FR</option>
                </select>
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Source Text
              </label>
              <textarea
                rows={3}
                required
                value={sourceText}
                onChange={(e) => setSourceText(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-md"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Candidate Output / Translation
              </label>
              <textarea
                rows={3}
                required
                value={candidateOutput}
                onChange={(e) => setCandidateOutput(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-md"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                1–5 Rubric Criteria (comma-separated)
              </label>
              <input
                type="text"
                value={rubricInput}
                onChange={(e) => setRubricInput(e.target.value)}
                className="w-full px-3 py-2 text-xs border border-slate-200 rounded-md"
              />
            </div>

            <button
              type="submit"
              disabled={textLoading}
              className="w-full px-4 py-2 text-sm font-medium bg-[#0F172A] text-white rounded-md hover:bg-slate-800 disabled:opacity-50"
            >
              {textLoading
                ? "Grading Against Rubric..."
                : "Grade Output (1–5 Rubric)"}
            </button>
          </form>

          <section className="lg:col-span-6 border border-slate-200 bg-white rounded-lg p-6 space-y-5">
            <div className="border-b border-slate-200 pb-4 flex items-center justify-between">
              <div>
                <h2 className="text-base font-semibold text-slate-900">
                  Rubric Scorecard (1–5 Scale)
                </h2>
                <p className="text-xs text-slate-500">
                  Evaluated via Gemini · Pass threshold &ge; 4.00 / 5.00
                </p>
              </div>
              {textReport && (
                <div className="text-right">
                  <p className="text-xl font-semibold font-mono tabular-nums text-slate-900">
                    {textReport.overallScore.toFixed(2)} / 5.00
                  </p>
                  <p
                    className={`text-xs font-medium ${
                      textReport.passed ? "text-emerald-700" : "text-red-700"
                    }`}
                  >
                    {textReport.passed ? "Passed Rubric" : "Needs Revision"}
                  </p>
                </div>
              )}
            </div>

            {textReport ? (
              <div className="space-y-4">
                <div className="divide-y divide-slate-200 border border-slate-200 rounded-md">
                  {textReport.criteriaScores.map((item) => (
                    <div key={item.criterion} className="p-3.5 space-y-1">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium text-slate-900">
                          {item.criterion}
                        </span>
                        <span className="font-mono tabular-nums text-sm font-semibold text-slate-900">
                          {item.score} / 5
                        </span>
                      </div>
                      <p className="text-xs text-slate-600">{item.justification}</p>
                    </div>
                  ))}
                </div>

                {textReport.revisionSuggestion && (
                  <div className="p-4 bg-slate-50 border border-slate-200 rounded-md text-xs text-slate-800">
                    <p className="font-semibold text-slate-900 mb-1">
                      Revision Guidance
                    </p>
                    <p>{textReport.revisionSuggestion}</p>
                  </div>
                )}
              </div>
            ) : (
              <div className="py-16 text-center text-sm text-slate-500">
                Submit a translation or model output on the left to compute 1–5 rubric scores.
              </div>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
