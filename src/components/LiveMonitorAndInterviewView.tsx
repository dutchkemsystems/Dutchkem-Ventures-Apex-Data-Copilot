import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Activity,
  Mic,
  Play,
  Radio,
  Square,
  Upload,
  Volume2,
} from "lucide-react";
import type {
  InterviewTrack,
  LiveHealthSnapshot,
  MockInterviewEvaluation,
  MockInterviewQuestion,
  TelemetryEvent,
} from "../types/tenant";

interface LiveMonitorAndInterviewViewProps {
  orgId: string;
  orgName: string;
  userId: string;
  userName: string;
}

type Phase6Tab = "live" | "interview";

const TRACK_LABELS: Record<InterviewTrack, string> = {
  tts_audio_qa: "TTS Audio QA Specialist",
  prompt_engineering: "LLM Prompt Engineer",
  ai_red_teaming: "AI Safety Red-Teamer",
  bilingual_localization: "Bilingual Localization Reviewer",
};

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const s = String(reader.result || "");
      const idx = s.indexOf(",");
      resolve(idx >= 0 ? s.slice(idx + 1) : s);
    };
    reader.onerror = () => reject(new Error("Failed to read audio recording."));
    reader.readAsDataURL(blob);
  });
}

export function LiveMonitorAndInterviewView({
  orgId,
  orgName,
  userId,
  userName,
}: LiveMonitorAndInterviewViewProps) {
  const [activeTab, setActiveTab] = useState<Phase6Tab>("live");

  // WebSocket Telemetry State
  const [wsState, setWsState] = useState<"connecting" | "connected" | "reconnecting">(
    "connecting"
  );
  const [snapshot, setSnapshot] = useState<LiveHealthSnapshot | null>(null);
  const [events, setEvents] = useState<TelemetryEvent[]>([]);
  const wsRef = useRef<WebSocket | null>(null);

  // Mock Interview Simulator State
  const [track, setTrack] = useState<InterviewTrack>("tts_audio_qa");
  const [voiceName, setVoiceName] = useState("Kore");
  const [question, setQuestion] = useState<MockInterviewQuestion | null>(null);
  const [generatingQuestion, setGeneratingQuestion] = useState(false);

  const [recording, setRecording] = useState(false);
  const [recordedBlob, setRecordedBlob] = useState<Blob | null>(null);
  const [recordedMime, setRecordedMime] = useState<string>("audio/webm");
  const [recordedFileName, setRecordedFileName] = useState<string>("");
  const [practiceText, setPracticeText] = useState<string>(
    "I first verify 24kHz mono PCM format, check that peak levels stay between -6 and -3 dBFS with no clipping, ensure the 10th percentile silence floor sits below -70 dBFS, and confirm SNR exceeds 35 dB alongside Whisper WER under 5 percent."
  );
  const [evaluating, setEvaluating] = useState(false);
  const [evaluation, setEvaluation] = useState<MockInterviewEvaluation | null>(
    null
  );
  const [history, setHistory] = useState<MockInterviewEvaluation[]>([]);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);

  // Initial HTTP fallback & Interview History load
  const loadInitialData = useCallback(async () => {
    try {
      const [snapRes, histRes] = await Promise.all([
        fetch("/api/telemetry/snapshot", {
          credentials: "include",
          headers: { "x-org-id": orgId, "x-user-id": userId },
        }),
        fetch("/api/interview/history", {
          credentials: "include",
          headers: { "x-org-id": orgId, "x-user-id": userId },
        }),
      ]);
      if (snapRes.ok) {
        const snapBody = (await snapRes.json()) as {
          snapshot: LiveHealthSnapshot;
          events: TelemetryEvent[];
        };
        setSnapshot(snapBody.snapshot);
        setEvents(snapBody.events);
      }
      if (histRes.ok) {
        const histBody = (await histRes.json()) as {
          history: MockInterviewEvaluation[];
        };
        setHistory(histBody.history);
      }
    } catch {
      // Initial HTTP snapshot failure handled by WS reconnect
    }
  }, [orgId, userId]);

  useEffect(() => {
    loadInitialData();
  }, [loadInitialData]);

  // Tenant-scoped WebSocket subscription with idempotent event deduplication
  useEffect(() => {
    let closedByCleanup = false;
    let reconnectTimer: number | null = null;

    function connect() {
      setWsState((prev) => (prev === "connected" ? "connected" : "connecting"));
      const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
      const url = `${protocol}//${window.location.host}/ws/telemetry?orgId=${encodeURIComponent(orgId)}&userId=${encodeURIComponent(userId)}`;
      const socket = new WebSocket(url);
      wsRef.current = socket;

      socket.onopen = () => {
        setWsState("connected");
      };

      socket.onmessage = (msg) => {
        try {
          const payload = JSON.parse(msg.data) as {
            type: string;
            snapshot?: LiveHealthSnapshot;
            events?: TelemetryEvent[];
            event?: TelemetryEvent;
          };
          if (payload.snapshot) {
            setSnapshot(payload.snapshot);
          }
          if (payload.type === "telemetry:init" && payload.events) {
            setEvents(payload.events);
          } else if (payload.type === "telemetry:event" && payload.event) {
            const incoming = payload.event;
            setEvents((prev) => {
              if (prev.some((e) => e.id === incoming.id)) return prev;
              return [incoming, ...prev].slice(0, 40);
            });
          }
        } catch {
          // Ignore invalid JSON frames
        }
      };

      socket.onclose = () => {
        wsRef.current = null;
        if (!closedByCleanup) {
          setWsState("reconnecting");
          reconnectTimer = window.setTimeout(connect, 2000);
        }
      };
    }

    connect();

    return () => {
      closedByCleanup = true;
      if (reconnectTimer !== null) window.clearTimeout(reconnectTimer);
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, [orgId, userId]);

  async function handleHealthProbe() {
    setErrorMsg(null);
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: "telemetry:health_probe" }));
      return;
    }
    try {
      const res = await fetch("/api/telemetry/health-probe", {
        method: "POST",
        credentials: "include",
        headers: { "x-org-id": orgId, "x-user-id": userId },
      });
      if (res.ok) {
        const body = (await res.json()) as {
          snapshot: LiveHealthSnapshot;
          events: TelemetryEvent[];
        };
        setSnapshot(body.snapshot);
        setEvents(body.events);
      }
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Health probe failed.");
    }
  }

  async function handleGenerateQuestion() {
    setGeneratingQuestion(true);
    setErrorMsg(null);
    setEvaluation(null);
    try {
      const res = await fetch("/api/interview/question", {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          "x-org-id": orgId,
          "x-user-id": userId,
        },
        body: JSON.stringify({
          track,
          voiceName,
          synthesizeAudio: true,
        }),
      });
      const body = await res.json();
      if (!res.ok) {
        throw new Error(body.detail || "Failed to generate practice question.");
      }
      setQuestion(body.question);
    } catch (err) {
      setErrorMsg(
        err instanceof Error ? err.message : "Unable to start practice session."
      );
    } finally {
      setGeneratingQuestion(false);
    }
  }

  async function startMicrophoneRecording() {
    setErrorMsg(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      audioChunksRef.current = [];

      recorder.ondataavailable = (ev) => {
        if (ev.data.size > 0) audioChunksRef.current.push(ev.data);
      };
      recorder.onstop = () => {
        const mime = recorder.mimeType || "audio/webm";
        const blob = new Blob(audioChunksRef.current, { type: mime });
        setRecordedBlob(blob);
        setRecordedMime(mime);
        setRecordedFileName("mic_practice_answer.webm");
        stream.getTracks().forEach((t) => t.stop());
      };

      mediaRecorderRef.current = recorder;
      recorder.start();
      setRecording(true);
    } catch {
      setErrorMsg(
        "Microphone access unavailable in this browser context. Upload a .wav/.webm clip or enter your practice answer below."
      );
    }
  }

  function stopMicrophoneRecording() {
    if (mediaRecorderRef.current && recording) {
      mediaRecorderRef.current.stop();
      setRecording(false);
    }
  }

  async function handleUploadPracticeAudio(
    e: React.ChangeEvent<HTMLInputElement>
  ) {
    const file = e.target.files?.[0];
    if (!file) return;
    setRecordedBlob(file);
    setRecordedMime(file.type || "audio/wav");
    setRecordedFileName(file.name);
  }

  async function handleEvaluateAnswer(e: React.FormEvent) {
    e.preventDefault();
    setEvaluating(true);
    setErrorMsg(null);
    try {
      const audioBase64 = recordedBlob ? await blobToBase64(recordedBlob) : undefined;
      const res = await fetch("/api/interview/evaluate", {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          "x-org-id": orgId,
          "x-user-id": userId,
        },
        body: JSON.stringify({
          sessionId: question?.sessionId,
          track,
          questionText: question?.questionText,
          audioBase64,
          audioMimeType: recordedMime,
          practiceText,
        }),
      });
      const body = await res.json();
      if (!res.ok) {
        throw new Error(body.detail || "Evaluation failed.");
      }
      setEvaluation(body.evaluation);
      setHistory((prev) => [body.evaluation, ...prev]);
      setRecordedBlob(null);
      setRecordedFileName("");
    } catch (err) {
      setErrorMsg(
        err instanceof Error ? err.message : "Failed to grade practice response."
      );
    } finally {
      setEvaluating(false);
    }
  }

  return (
    <div className="space-y-8">
      <div className="border-b border-slate-200 pb-6 flex flex-col lg:flex-row lg:items-end justify-between gap-4">
        <div>
          <p className="text-xs font-medium text-slate-500">
            {orgName} · Real-Time WebSocket Hub & Ethical Interview Readiness
          </p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-slate-900">
            Live Operations & Mock Interview Simulator
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            Monitor live tenant-isolated tasks and QA throughput over WebSockets, or rehearse technical interviews with AI voice coaching and STT rubric grading.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-1 p-1 bg-slate-100 rounded-md self-start">
          <button
            type="button"
            onClick={() => setActiveTab("live")}
            className={`px-3 py-1.5 text-xs font-medium rounded transition-colors whitespace-nowrap shrink-0 ${
              activeTab === "live"
                ? "bg-white text-slate-900 shadow-xs"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            WebSocket Telemetry
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("interview")}
            className={`px-3 py-1.5 text-xs font-medium rounded transition-colors whitespace-nowrap shrink-0 ${
              activeTab === "interview"
                ? "bg-white text-slate-900 shadow-xs"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            Mock Interview Simulator
          </button>
        </div>
      </div>

      {errorMsg && (
        <div className="p-4 border border-red-200 bg-red-50 text-red-900 rounded-md text-sm">
          {errorMsg}
        </div>
      )}

      {activeTab === "live" ? (
        <div className="space-y-6">
          {/* Live Connection Header & 4-Column Telemetry KPIs */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border border-slate-200 bg-white rounded-lg px-5 py-4">
            <div className="flex items-center gap-3 text-xs text-slate-700">
              <span
                className={`inline-block w-2 h-2 rounded-full ${
                  wsState === "connected"
                    ? "bg-emerald-600"
                    : "bg-amber-500 animate-pulse"
                }`}
              />
              <span className="font-medium text-slate-900">
                {wsState === "connected"
                  ? "WebSocket Stream Connected"
                  : wsState === "connecting"
                    ? "Connecting WebSocket..."
                    : "Reconnecting WebSocket..."}
              </span>
              <span aria-hidden="true">·</span>
              <span className="font-mono tabular-nums text-slate-500">
                Room: {orgId.slice(0, 8)}... ({snapshot?.connected_peers ?? 1} peer
                {(snapshot?.connected_peers ?? 1) === 1 ? "" : "s"})
              </span>
            </div>

            <button
              type="button"
              onClick={handleHealthProbe}
              className="inline-flex items-center gap-2 px-3.5 py-1.5 text-xs font-medium border border-slate-200 rounded-md text-slate-800 hover:bg-slate-50 whitespace-nowrap shrink-0"
            >
              <Radio className="w-3.5 h-3.5 text-slate-600" />
              <span>Verify RLS & Broadcast Health Probe</span>
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="border border-slate-200 bg-white rounded-lg p-5">
              <p className="text-xs font-medium text-slate-500">Active & Review Tasks</p>
              <p className="mt-2 text-2xl font-semibold font-mono tabular-nums text-slate-900">
                {(snapshot?.active_tasks_count ?? 0) +
                  (snapshot?.in_review_tasks_count ?? 0)}
              </p>
              <p className="mt-1 text-xs text-slate-500 font-mono tabular-nums">
                {snapshot?.active_tasks_count ?? 0} in progress ·{" "}
                {snapshot?.in_review_tasks_count ?? 0} in review
              </p>
            </div>

            <div className="border border-slate-200 bg-white rounded-lg p-5">
              <p className="text-xs font-medium text-slate-500">QA Pass Rate & Score</p>
              <p className="mt-2 text-2xl font-semibold font-mono tabular-nums text-emerald-700">
                {snapshot ? `${snapshot.qa_pass_rate_pct.toFixed(1)}%` : "—"}
              </p>
              <p className="mt-1 text-xs text-slate-500 font-mono tabular-nums">
                Mean verifier:{" "}
                {snapshot?.mean_verifier_score !== null &&
                snapshot?.mean_verifier_score !== undefined
                  ? snapshot.mean_verifier_score.toFixed(3)
                  : "N/A"}
              </p>
            </div>

            <div className="border border-slate-200 bg-white rounded-lg p-5">
              <p className="text-xs font-medium text-slate-500">Released vs. Held Escrow</p>
              <p className="mt-2 text-2xl font-semibold font-mono tabular-nums text-slate-900">
                ${(snapshot?.escrow_released_usd ?? 0).toFixed(2)}
              </p>
              <p className="mt-1 text-xs text-slate-500 font-mono tabular-nums">
                Held in escrow: ${(snapshot?.escrow_held_usd ?? 0).toFixed(2)}
              </p>
            </div>

            <div className="border border-slate-200 bg-white rounded-lg p-5">
              <p className="text-xs font-medium text-slate-500">
                Marketplace & Coaching Runs
              </p>
              <p className="mt-2 text-2xl font-semibold font-mono tabular-nums text-slate-900">
                {(snapshot?.marketplace_settled_count ?? 0) +
                  (snapshot?.mock_interviews_completed ?? 0)}
              </p>
              <p className="mt-1 text-xs text-slate-500 font-mono tabular-nums">
                {snapshot?.marketplace_settled_count ?? 0} payouts ·{" "}
                {snapshot?.mock_interviews_completed ?? 0} mock interviews
              </p>
            </div>
          </div>

          <section className="border border-slate-200 bg-white rounded-lg overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
              <div>
                <h2 className="text-sm font-semibold text-slate-900">
                  Real-Time Tenant Event Stream
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Server-authoritative mutations across tasks, Audio QA, payouts, and coaching sessions scoped to {orgName}.
                </p>
              </div>
              <span className="text-xs font-mono tabular-nums text-slate-500">
                {events.length} events
              </span>
            </div>

            {events.length === 0 ? (
              <div className="p-6 text-sm text-slate-500">
                Waiting for tenant telemetry events...
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50 text-xs font-medium text-slate-500">
                      <th className="py-3 px-4">Timestamp</th>
                      <th className="py-3 px-4">Event</th>
                      <th className="py-3 px-4">Actor</th>
                      <th className="py-3 px-4">Summary</th>
                      <th className="py-3 px-4 text-right">Metric</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 text-sm">
                    {events.map((ev) => (
                      <tr key={ev.id} className="hover:bg-slate-50">
                        <td className="py-3 px-4 font-mono tabular-nums text-xs text-slate-500 whitespace-nowrap">
                          {new Date(ev.created_at).toLocaleTimeString()}
                        </td>
                        <td className="py-3 px-4 font-mono text-xs text-slate-800 whitespace-nowrap">
                          {ev.event_type}
                        </td>
                        <td className="py-3 px-4 text-xs font-medium text-slate-900 whitespace-nowrap">
                          {ev.actor_name}
                        </td>
                        <td className="py-3 px-4 text-xs text-slate-600">
                          {ev.summary}
                        </td>
                        <td className="py-3 px-4 text-right font-mono tabular-nums text-xs font-medium text-slate-900 whitespace-nowrap">
                          {ev.metric_label ?? "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>
      ) : (
        <div className="space-y-6">
          <div className="p-4 border border-slate-200 bg-white rounded-lg flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="text-xs text-slate-600">
              <span className="font-semibold text-slate-900">
                Ethical Career Practice Mode ({userName}):
              </span>{" "}
              Solo rehearsal trainer using Gemini 3.8 TTS interviewer voice and Gemini 3.5 STT transcription to score your tone, clarity, and technical accuracy. Not intended for live human interview assistance or deception.
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            {/* Left Column: Setup & Question Prompt */}
            <div className="lg:col-span-5 space-y-6">
              <section className="border border-slate-200 bg-white rounded-lg p-5 space-y-4">
                <div>
                  <h2 className="text-sm font-semibold text-slate-900">
                    1. Configure Practice Interview
                  </h2>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Select a technical AI data track and AI interviewer voice persona.
                  </p>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Target Job Track
                  </label>
                  <select
                    value={track}
                    onChange={(e) => setTrack(e.target.value as InterviewTrack)}
                    className="w-full px-3 py-2 text-xs border border-slate-200 rounded-md bg-white text-slate-900"
                  >
                    {Object.entries(TRACK_LABELS).map(([key, label]) => (
                      <option key={key} value={key}>
                        {label}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Interviewer Voice Persona
                  </label>
                  <select
                    value={voiceName}
                    onChange={(e) => setVoiceName(e.target.value)}
                    className="w-full px-3 py-2 text-xs border border-slate-200 rounded-md bg-white text-slate-900"
                  >
                    <option value="Kore">Kore (Measured & Clear)</option>
                    <option value="Puck">Puck (Warm & Conversational)</option>
                    <option value="Charon">Charon (Executive Analytical)</option>
                    <option value="Fenrir">Fenrir (Direct Technical Lead)</option>
                    <option value="Zephyr">Zephyr (Supportive Coach)</option>
                  </select>
                </div>

                <button
                  type="button"
                  disabled={generatingQuestion}
                  onClick={handleGenerateQuestion}
                  className="w-full inline-flex items-center justify-center gap-2 px-4 py-2 text-xs font-medium text-white bg-[#0F172A] rounded-md hover:bg-slate-800 disabled:opacity-50 whitespace-nowrap"
                >
                  <Play className="w-3.5 h-3.5" />
                  <span>
                    {generatingQuestion
                      ? "Generating Question & Voice..."
                      : "Start New Practice Question"}
                  </span>
                </button>
              </section>

              {question && (
                <section className="border border-slate-200 bg-white rounded-lg p-5 space-y-4">
                  <div>
                    <p className="text-xs font-medium text-slate-500">
                      {TRACK_LABELS[question.track]} · Voice: {question.voiceName}
                    </p>
                    <h3 className="mt-1 text-base font-semibold text-slate-900 leading-snug">
                      {question.questionText}
                    </h3>
                    <p className="mt-2 text-xs text-slate-600">
                      {question.interviewerContext}
                    </p>
                  </div>

                  {question.questionAudioBase64 && (
                    <div className="p-3 bg-slate-50 border border-slate-200 rounded-md space-y-2">
                      <p className="text-xs font-medium text-slate-700 flex items-center gap-1.5">
                        <Volume2 className="w-3.5 h-3.5" />
                        <span>Listen to AI Interviewer Prompt (24kHz WAV)</span>
                      </p>
                      <audio
                        controls
                        className="w-full h-9"
                        src={`data:audio/wav;base64,${question.questionAudioBase64}`}
                      />
                    </div>
                  )}

                  <div>
                    <p className="text-xs font-medium text-slate-500 mb-1.5">
                      Key Rubric Signals Evaluated
                    </p>
                    <ul className="space-y-1 text-xs text-slate-700">
                      {question.keyRubricPoints.map((pt) => (
                        <li key={pt}>• {pt}</li>
                      ))}
                    </ul>
                  </div>
                </section>
              )}
            </div>

            {/* Right Column: Candidate Recording / Upload / Evaluation */}
            <div className="lg:col-span-7 space-y-6">
              <form
                onSubmit={handleEvaluateAnswer}
                className="border border-slate-200 bg-white rounded-lg p-6 space-y-5"
              >
                <div>
                  <h2 className="text-sm font-semibold text-slate-900">
                    2. Record or Submit Practice Response
                  </h2>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Record via microphone, upload a spoken audio clip for Gemini STT transcription, or type a practice response.
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-3">
                  {!recording ? (
                    <button
                      type="button"
                      onClick={startMicrophoneRecording}
                      className="inline-flex items-center gap-2 px-3.5 py-2 text-xs font-medium border border-slate-200 rounded-md text-slate-800 hover:bg-slate-50 whitespace-nowrap"
                    >
                      <Mic className="w-3.5 h-3.5 text-slate-700" />
                      <span>Record Voice Answer</span>
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={stopMicrophoneRecording}
                      className="inline-flex items-center gap-2 px-3.5 py-2 text-xs font-medium bg-red-700 text-white rounded-md hover:bg-red-800 whitespace-nowrap"
                    >
                      <Square className="w-3.5 h-3.5" />
                      <span>Stop Recording</span>
                    </button>
                  )}

                  <label className="inline-flex items-center gap-2 px-3.5 py-2 text-xs font-medium border border-slate-200 rounded-md text-slate-800 hover:bg-slate-50 cursor-pointer whitespace-nowrap">
                    <Upload className="w-3.5 h-3.5 text-slate-600" />
                    <span>
                      {recordedFileName || "Upload .wav / .webm Answer"}
                    </span>
                    <input
                      type="file"
                      accept="audio/*"
                      onChange={handleUploadPracticeAudio}
                      className="hidden"
                    />
                  </label>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1.5">
                    Practice Transcript / Text Fallback
                  </label>
                  <textarea
                    rows={4}
                    value={practiceText}
                    onChange={(e) => setPracticeText(e.target.value)}
                    placeholder="Speak your answer using the microphone above or draft your spoken phrasing here..."
                    className="w-full px-3.5 py-2.5 text-sm border border-slate-200 rounded-md text-slate-900"
                  />
                </div>

                <div className="flex justify-end">
                  <button
                    type="submit"
                    disabled={evaluating}
                    className="inline-flex items-center gap-2 px-4 py-2 text-xs font-medium text-white bg-[#0F172A] rounded-md hover:bg-slate-800 disabled:opacity-50 whitespace-nowrap"
                  >
                    <Activity className="w-3.5 h-3.5" />
                    <span>
                      {evaluating
                        ? "Transcribing & Grading..."
                        : "Transcribe & Grade Response"}
                    </span>
                  </button>
                </div>
              </form>

              {evaluation && (
                <section className="border border-slate-200 bg-white rounded-lg p-6 space-y-5">
                  <div className="flex items-center justify-between border-b border-slate-200 pb-4">
                    <div>
                      <p className="text-xs text-slate-500">
                        Coaching Evaluation · {TRACK_LABELS[evaluation.track]}
                      </p>
                      <h3 className="mt-0.5 text-base font-semibold text-slate-900">
                        Candidate Readiness Scorecard
                      </h3>
                    </div>
                    <p className="text-2xl font-semibold font-mono tabular-nums text-slate-900">
                      {evaluation.overallScore}/100
                    </p>
                  </div>

                  <div className="grid grid-cols-3 gap-3">
                    <div className="p-3 bg-slate-50 border border-slate-200 rounded-md">
                      <p className="text-xs text-slate-500">Tone & Pacing</p>
                      <p className="mt-1 text-lg font-semibold font-mono tabular-nums text-slate-900">
                        {evaluation.toneScore}/100
                      </p>
                    </div>
                    <div className="p-3 bg-slate-50 border border-slate-200 rounded-md">
                      <p className="text-xs text-slate-500">Clarity & Structure</p>
                      <p className="mt-1 text-lg font-semibold font-mono tabular-nums text-slate-900">
                        {evaluation.clarityScore}/100
                      </p>
                    </div>
                    <div className="p-3 bg-slate-50 border border-slate-200 rounded-md">
                      <p className="text-xs text-slate-500">Technical Accuracy</p>
                      <p className="mt-1 text-lg font-semibold font-mono tabular-nums text-slate-900">
                        {evaluation.technicalAccuracyScore}/100
                      </p>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <p className="text-xs font-medium text-slate-500">
                      Evaluated Transcript
                    </p>
                    <p className="p-3 bg-slate-50 border border-slate-200 rounded-md text-xs text-slate-800">
                      "{evaluation.candidateTranscript}"
                    </p>
                  </div>

                  <div className="space-y-2">
                    <p className="text-xs font-medium text-slate-500">
                      Strengths & Coaching Feedback
                    </p>
                    <ul className="space-y-1 text-xs text-slate-700">
                      {evaluation.strengths.map((s) => (
                        <li key={s}>• {s}</li>
                      ))}
                    </ul>
                    <p className="text-xs text-slate-700 pt-1">
                      {evaluation.coachingNotes}
                    </p>
                  </div>

                  <div className="space-y-1.5 border-t border-slate-200 pt-4">
                    <p className="text-xs font-medium text-slate-500">
                      Recommended Sample Phrasing
                    </p>
                    <p className="text-xs text-slate-800 leading-relaxed">
                      {evaluation.sampleImprovedAnswer}
                    </p>
                  </div>
                </section>
              )}

              {history.length > 0 && (
                <section className="border border-slate-200 bg-white rounded-lg overflow-hidden">
                  <div className="px-5 py-3.5 border-b border-slate-200">
                    <h3 className="text-sm font-semibold text-slate-900">
                      Recent Practice Sessions ({history.length})
                    </h3>
                  </div>
                  <div className="divide-y divide-slate-200">
                    {history.slice(0, 5).map((item) => (
                      <div
                        key={`${item.sessionId}-${item.evaluatedAt}`}
                        className="px-5 py-3 flex items-center justify-between gap-4 text-xs"
                      >
                        <div className="min-w-0">
                          <p className="font-medium text-slate-900 truncate">
                            {item.questionText}
                          </p>
                          <p className="text-slate-500 mt-0.5">
                            {TRACK_LABELS[item.track]} · Tone {item.toneScore} · Clarity{" "}
                            {item.clarityScore} · Tech {item.technicalAccuracyScore}
                          </p>
                        </div>
                        <span className="font-mono tabular-nums font-semibold text-slate-900 shrink-0">
                          {item.overallScore}/100
                        </span>
                      </div>
                    ))}
                  </div>
                </section>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
