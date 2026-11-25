import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  AlertTriangle,
  Camera,
  CheckCircle2,
  Download,
  FileAudio,
  Loader2,
  Mic,
  RotateCcw,
  Square,
  UploadCloud,
  Video,
} from "lucide-react";
import type { AudioQaReport, VideoQaReport } from "../types/tenant";
import {
  blobToBase64,
  convertAudioBlobToWav,
  type ConvertedWavResult,
} from "../utils/wavEncoder";

export interface MobileMediaRecorderProps {
  orgId: string;
  userId: string;
  taskId?: string;
  taskTitle?: string;
  defaultScript?: string;
  compact?: boolean;
  onAudioQaResult?: (report: AudioQaReport) => void | Promise<void>;
  onVideoQaResult?: (report: VideoQaReport) => void | Promise<void>;
  onWavPrepared?: (wavBase64: string, fileName: string, previewUrl: string) => void;
}

type CaptureMode = "audio" | "video";

interface CapturedMediaState {
  mode: CaptureMode;
  fileName: string;
  mimeType: string;
  previewUrl: string;
  durationSec: number;
  width?: number | null;
  height?: number | null;
  hasAudioTrack: boolean;
  wavResult?: ConvertedWavResult;
  videoBlob?: Blob;
}

function pickSupportedRecorderMime(mode: CaptureMode): string {
  if (typeof MediaRecorder === "undefined") return "";
  const candidates =
    mode === "video"
      ? [
          "video/webm;codecs=vp9,opus",
          "video/webm;codecs=vp8,opus",
          "video/webm",
          "video/mp4",
        ]
      : [
          "audio/webm;codecs=opus",
          "audio/webm",
          "audio/mp4",
          "audio/ogg;codecs=opus",
        ];
  for (const mime of candidates) {
    if (MediaRecorder.isTypeSupported(mime)) {
      return mime;
    }
  }
  return "";
}

function formatTimer(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
}

export function MobileMediaRecorder({
  orgId,
  userId,
  taskId,
  taskTitle,
  defaultScript = "",
  compact = false,
  onAudioQaResult,
  onVideoQaResult,
  onWavPrepared,
}: MobileMediaRecorderProps) {
  const [recordingMode, setRecordingMode] = useState<CaptureMode | null>(null);
  const [elapsedSec, setElapsedSec] = useState(0);
  const [micLevelPct, setMicLevelPct] = useState(0);
  const [converting, setConverting] = useState(false);
  const [uploadingQa, setUploadingQa] = useState(false);

  const [captured, setCaptured] = useState<CapturedMediaState | null>(null);
  const [referenceTranscript, setReferenceTranscript] = useState(defaultScript);
  const [runStt, setRunStt] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [audioReport, setAudioReport] = useState<AudioQaReport | null>(null);
  const [videoReport, setVideoReport] = useState<VideoQaReport | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);
  const timerIntervalRef = useRef<number | null>(null);
  const levelRafRef = useRef<number | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const scriptProcessorRef = useRef<ScriptProcessorNode | null>(null);
  const pcmChunksRef = useRef<Float32Array[]>([]);
  const liveVideoRef = useRef<HTMLVideoElement | null>(null);
  const previewUrlRef = useRef<string | null>(null);
  const captureInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (defaultScript) {
      setReferenceTranscript(defaultScript);
    }
  }, [defaultScript]);

  const stopHardwareAndTimers = useCallback(() => {
    if (timerIntervalRef.current !== null) {
      window.clearInterval(timerIntervalRef.current);
      timerIntervalRef.current = null;
    }
    if (levelRafRef.current !== null) {
      window.cancelAnimationFrame(levelRafRef.current);
      levelRafRef.current = null;
    }
    if (scriptProcessorRef.current) {
      try {
        scriptProcessorRef.current.disconnect();
      } catch {
        // ignore disconnect errors
      }
      scriptProcessorRef.current = null;
    }
    if (audioCtxRef.current) {
      void audioCtxRef.current.close().catch(() => {});
      audioCtxRef.current = null;
    }
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((track) => track.stop());
      mediaStreamRef.current = null;
    }
    if (liveVideoRef.current) {
      liveVideoRef.current.srcObject = null;
    }
    setMicLevelPct(0);
  }, []);

  useEffect(() => {
    return () => {
      stopHardwareAndTimers();
      if (previewUrlRef.current) {
        URL.revokeObjectURL(previewUrlRef.current);
      }
    };
  }, [stopHardwareAndTimers]);

  function replacePreviewUrl(nextUrl: string) {
    if (previewUrlRef.current) {
      URL.revokeObjectURL(previewUrlRef.current);
    }
    previewUrlRef.current = nextUrl;
  }

  async function finalizeAudioBlob(rawBlob: Blob, rawFileName: string, elapsedHintSec: number) {
    setConverting(true);
    setErrorMsg(null);
    setAudioReport(null);
    setVideoReport(null);

    try {
      const wavResult = await convertAudioBlobToWav(rawBlob, {
        targetSampleRate: 24000,
        fallbackPcmChunks: pcmChunksRef.current,
        fallbackPcmSampleRate: 48000,
      });

      const baseStem = rawFileName.replace(/\.[^.]+$/, "") || "mobile_audio_capture";
      const wavFileName = `${baseStem}.wav`;
      const previewUrl = URL.createObjectURL(wavResult.wavBlob);
      replacePreviewUrl(previewUrl);

      const nextCaptured: CapturedMediaState = {
        mode: "audio",
        fileName: wavFileName,
        mimeType: "audio/wav",
        previewUrl,
        durationSec: wavResult.durationSec || elapsedHintSec,
        hasAudioTrack: true,
        wavResult,
      };
      setCaptured(nextCaptured);
      onWavPrepared?.(wavResult.wavBase64, wavFileName, previewUrl);
    } catch (err) {
      setErrorMsg(
        err instanceof Error
          ? err.message
          : "Could not convert recording to 24kHz Mono WAV."
      );
    } finally {
      setConverting(false);
    }
  }

  async function finalizeVideoBlob(
    rawBlob: Blob,
    rawFileName: string,
    elapsedHintSec: number,
    streamMeta?: { width?: number | null; height?: number | null; hasAudio?: boolean }
  ) {
    setConverting(true);
    setErrorMsg(null);
    setAudioReport(null);
    setVideoReport(null);

    try {
      const previewUrl = URL.createObjectURL(rawBlob);
      replacePreviewUrl(previewUrl);
      setCaptured({
        mode: "video",
        fileName: rawFileName,
        mimeType: rawBlob.type || "video/webm",
        previewUrl,
        durationSec: Math.max(0.5, elapsedHintSec),
        width: streamMeta?.width ?? null,
        height: streamMeta?.height ?? null,
        hasAudioTrack: streamMeta?.hasAudio ?? true,
        videoBlob: rawBlob,
      });
    } catch (err) {
      setErrorMsg(
        err instanceof Error ? err.message : "Failed to finalize recorded video."
      );
    } finally {
      setConverting(false);
    }
  }

  async function startRecording(mode: CaptureMode) {
    setErrorMsg(null);
    setAudioReport(null);
    setVideoReport(null);

    if (
      typeof navigator === "undefined" ||
      !navigator.mediaDevices?.getUserMedia ||
      typeof MediaRecorder === "undefined"
    ) {
      setErrorMsg(
        "MediaRecorder is unavailable in this browser context. Use the Native Camera / Voice Capture button below."
      );
      return;
    }

    try {
      const constraints: MediaStreamConstraints =
        mode === "video"
          ? {
              audio: { echoCancellation: true, noiseSuppression: true },
              video: {
                facingMode: { ideal: "environment" },
                width: { ideal: 1280 },
                height: { ideal: 720 },
              },
            }
          : {
              audio: {
                echoCancellation: true,
                noiseSuppression: true,
                channelCount: { ideal: 1 },
                sampleRate: { ideal: 24000 },
              },
              video: false,
            };

      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      mediaStreamRef.current = stream;

      if (mode === "video" && liveVideoRef.current) {
        liveVideoRef.current.srcObject = stream;
        void liveVideoRef.current.play().catch(() => {});
      }

      // Attach Web Audio Analyser + PCM capture buffer for meter feedback & fallback
      pcmChunksRef.current = [];
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (AudioCtx && stream.getAudioTracks().length > 0) {
        try {
          const ctx = new AudioCtx();
          audioCtxRef.current = ctx;
          const source = ctx.createMediaStreamSource(stream);
          const analyser = ctx.createAnalyser();
          analyser.fftSize = 256;
          source.connect(analyser);

          const processor = ctx.createScriptProcessor(4096, 1, 1);
          processor.onaudioprocess = (event) => {
            const channel = event.inputBuffer.getChannelData(0);
            pcmChunksRef.current.push(new Float32Array(channel));
          };
          source.connect(processor);
          processor.connect(ctx.destination);
          scriptProcessorRef.current = processor;

          const dataArray = new Uint8Array(analyser.frequencyBinCount);
          const tickLevel = () => {
            if (!audioCtxRef.current) return;
            analyser.getByteTimeDomainData(dataArray);
            let sum = 0;
            for (let i = 0; i < dataArray.length; i++) {
              const v = (dataArray[i] - 128) / 128;
              sum += v * v;
            }
            const rms = Math.sqrt(sum / dataArray.length);
            setMicLevelPct(Math.min(100, Math.round(rms * 320)));
            levelRafRef.current = window.requestAnimationFrame(tickLevel);
          };
          levelRafRef.current = window.requestAnimationFrame(tickLevel);
        } catch {
          // Audio level meter optional if AudioContext cannot attach to mocked stream
        }
      }

      const preferredMime = pickSupportedRecorderMime(mode);
      const recorder = preferredMime
        ? new MediaRecorder(stream, { mimeType: preferredMime })
        : new MediaRecorder(stream);

      recordedChunksRef.current = [];
      const videoTrackSettings = stream.getVideoTracks()[0]?.getSettings();
      const hasAudioTrack = stream.getAudioTracks().length > 0;
      const startedAt = Date.now();

      recorder.ondataavailable = (ev) => {
        if (ev.data && ev.data.size > 0) {
          recordedChunksRef.current.push(ev.data);
        }
      };

      recorder.onstop = () => {
        const mime =
          recorder.mimeType ||
          preferredMime ||
          (mode === "video" ? "video/webm" : "audio/webm");
        const blob = new Blob(recordedChunksRef.current, { type: mime });
        const totalSec = Math.max(0.5, (Date.now() - startedAt) / 1000);
        stopHardwareAndTimers();
        setRecordingMode(null);

        const ext = mime.includes("mp4") ? "mp4" : "webm";
        const fileName =
          mode === "video"
            ? `mobile_video_${Date.now()}.${ext}`
            : `mobile_audio_${Date.now()}.${ext}`;

        if (mode === "audio") {
          void finalizeAudioBlob(blob, fileName, totalSec);
        } else {
          void finalizeVideoBlob(blob, fileName, totalSec, {
            width: videoTrackSettings?.width ?? null,
            height: videoTrackSettings?.height ?? null,
            hasAudio: hasAudioTrack,
          });
        }
      };

      mediaRecorderRef.current = recorder;
      recorder.start(250);
      setRecordingMode(mode);
      setElapsedSec(0);

      timerIntervalRef.current = window.setInterval(() => {
        setElapsedSec((prev) => prev + 1);
      }, 1000);
    } catch (err) {
      stopHardwareAndTimers();
      setRecordingMode(null);
      const msg =
        err instanceof Error ? err.message : "Permission denied or camera/mic busy.";
      setErrorMsg(
        `Microphone/Camera permission error: ${msg}. Allow access in your mobile browser or use the Native Capture button below.`
      );
    }
  }

  function stopRecording() {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      mediaRecorderRef.current.stop();
    } else {
      stopHardwareAndTimers();
      setRecordingMode(null);
    }
  }

  async function handleNativeCaptureFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";
    setErrorMsg(null);
    setAudioReport(null);
    setVideoReport(null);

    const isVideo =
      file.type.startsWith("video/") || /\.(mp4|mov|m4v|webm)$/i.test(file.name);

    if (isVideo) {
      await finalizeVideoBlob(file, file.name, 1.0, { hasAudio: true });
    } else {
      await finalizeAudioBlob(file, file.name, 1.0);
    }
  }

  async function handleUploadToQaAgent() {
    if (!captured) return;
    setUploadingQa(true);
    setErrorMsg(null);

    try {
      if (captured.mode === "audio" && captured.wavResult) {
        if (captured.wavResult.isSilent) {
          throw new Error(
            "Captured audio has no detectable voice amplitude (silent track). Re-record close to your microphone before uploading to QA Agent."
          );
        }

        const res = await fetch("/api/qa/audio", {
          method: "POST",
          credentials: "include",
          headers: {
            "Content-Type": "application/json",
            "x-org-id": orgId,
            "x-user-id": userId,
          },
          body: JSON.stringify({
            wavBase64: captured.wavResult.wavBase64,
            fileName: captured.fileName,
            referenceTranscript: referenceTranscript.trim() || undefined,
            runStt,
            taskId: taskId || undefined,
          }),
        });
        const body = await res.json().catch(() => ({}));
        if (!res.ok) {
          throw new Error(body.detail || "Audio QA Agent rejected capture.");
        }
        setAudioReport(body.report as AudioQaReport);
        await onAudioQaResult?.(body.report as AudioQaReport);
      } else if (captured.mode === "video" && captured.videoBlob) {
        const videoBase64 = await blobToBase64(captured.videoBlob);
        const res = await fetch("/api/qa/video", {
          method: "POST",
          credentials: "include",
          headers: {
            "Content-Type": "application/json",
            "x-org-id": orgId,
            "x-user-id": userId,
          },
          body: JSON.stringify({
            videoBase64,
            fileName: captured.fileName,
            mimeType: captured.mimeType,
            durationSec: captured.durationSec,
            width: captured.width,
            height: captured.height,
            hasAudioTrack: captured.hasAudioTrack,
            taskId: taskId || undefined,
          }),
        });
        const body = await res.json().catch(() => ({}));
        if (!res.ok) {
          throw new Error(body.detail || "Video QA Agent rejected capture.");
        }
        setVideoReport(body.report as VideoQaReport);
        await onVideoQaResult?.(body.report as VideoQaReport);
      }
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Upload to QA Agent failed.");
    } finally {
      setUploadingQa(false);
    }
  }

  function handleResetCapture() {
    setCaptured(null);
    setAudioReport(null);
    setVideoReport(null);
    setErrorMsg(null);
  }

  return (
    <div
      className={`rounded-2xl border border-slate-200/90 bg-white shadow-xs ${
        compact ? "p-4 sm:p-5 space-y-4" : "p-4 sm:p-6 space-y-5"
      }`}
    >
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <FileAudio className="w-4 h-4 text-[#0B1F3A] shrink-0" />
            <h3 className="text-base font-bold text-[#0B1F3A] truncate">
              Native Mobile Media Capture
            </h3>
          </div>
          <p className="mt-1 text-xs text-slate-600">
            {taskTitle
              ? `Target Task: ${taskTitle} · Auto-converts audio to 24kHz Mono .wav`
              : "Record audio (.wav) or video directly in browser and stream straight to the QA Agent."}
          </p>
        </div>

        {recordingMode && (
          <span className="inline-flex items-center gap-2 font-mono text-xs font-bold text-red-700 bg-red-50 border border-red-200 px-2.5 py-1 rounded-lg tabular-nums shrink-0">
            <span>REC {recordingMode.toUpperCase()}</span>
            <span>{formatTimer(elapsedSec)}</span>
          </span>
        )}
      </div>

      {/* Live Video Viewfinder when recording video */}
      <div className={recordingMode === "video" ? "block" : "hidden"}>
        <div className="relative rounded-xl overflow-hidden bg-slate-950 border border-slate-800">
          <video
            ref={liveVideoRef}
            autoPlay
            muted
            playsInline
            className="w-full max-h-64 object-cover"
          />
          <div className="absolute bottom-2 left-2 right-2 flex items-center justify-between text-[11px] font-mono text-white bg-slate-950/75 px-3 py-1.5 rounded-lg">
            <span>Rear Camera · {formatTimer(elapsedSec)}</span>
            <span>720p Stream Active</span>
          </div>
        </div>
      </div>

      {/* Live Audio Input Meter when recording audio */}
      {recordingMode === "audio" && (
        <div className="p-3.5 rounded-xl bg-[#0B1F3A] text-white space-y-2">
          <div className="flex items-center justify-between text-xs font-mono">
            <span>Microphone Active (24kHz Mono target)</span>
            <span className="tabular-nums font-bold">{formatTimer(elapsedSec)}</span>
          </div>
          <div className="w-full h-2.5 rounded-full bg-white/15 overflow-hidden">
            <div
              className="h-full bg-emerald-400 transition-all duration-75"
              style={{ width: `${Math.max(8, micLevelPct)}%` }}
            />
          </div>
        </div>
      )}

      {/* Primary Action Controls (44px+ minimum touch targets) */}
      {recordingMode ? (
        <button
          type="button"
          onClick={stopRecording}
          className="w-full min-h-[48px] inline-flex items-center justify-center gap-2 px-4 py-3 text-sm font-bold bg-red-600 text-white rounded-xl hover:bg-red-700 transition-colors"
        >
          <Square className="w-4 h-4 fill-current" />
          <span>
            Stop {recordingMode === "audio" ? "Audio" : "Video"} Recording ({formatTimer(elapsedSec)})
          </span>
        </button>
      ) : (
        <div className="space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => void startRecording("audio")}
              disabled={converting || uploadingQa}
              className="min-h-[48px] inline-flex items-center justify-center gap-2 px-4 py-3 text-sm font-semibold bg-[#0B1F3A] text-white rounded-xl hover:bg-slate-800 disabled:opacity-50 transition-colors"
            >
              <Mic className="w-4 h-4 shrink-0" />
              <span>Record Audio</span>
            </button>

            <button
              type="button"
              onClick={() => void startRecording("video")}
              disabled={converting || uploadingQa}
              className="min-h-[48px] inline-flex items-center justify-center gap-2 px-4 py-3 text-sm font-semibold border border-slate-300 bg-white text-[#0B1F3A] rounded-xl hover:bg-slate-50 disabled:opacity-50 transition-colors"
            >
              <Video className="w-4 h-4 shrink-0 text-blue-700" />
              <span>Record Video</span>
            </button>
          </div>

          {/* Native Phone Camera / Voice Recorder Bypass File Input */}
          <label
            htmlFor={`mobile-native-capture-${taskId || "workspace"}`}
            className="w-full min-h-[48px] inline-flex items-center justify-center gap-2 px-4 py-3 text-xs sm:text-sm font-semibold border border-dashed border-blue-300 bg-blue-50/60 text-blue-900 rounded-xl hover:bg-blue-100/70 cursor-pointer transition-colors text-center"
          >
            <Camera className="w-4 h-4 shrink-0 text-blue-700" />
            <span>Open Native Camera or Voice Recorder</span>
            <input
              ref={captureInputRef}
              id={`mobile-native-capture-${taskId || "workspace"}`}
              data-testid="mobile-native-capture-input"
              type="file"
              accept="audio/*,video/*"
              capture="environment"
              onChange={(e) => void handleNativeCaptureFile(e)}
              className="sr-only"
            />
          </label>
        </div>
      )}

      {converting && (
        <div className="p-3 rounded-xl border border-blue-200 bg-blue-50 text-blue-900 text-xs flex items-center gap-2 font-medium">
          <Loader2 className="w-4 h-4 animate-spin shrink-0" />
          <span>Converting browser stream to 24kHz Mono PCM .wav...</span>
        </div>
      )}

      {errorMsg && (
        <div
          role="alert"
          className="p-3.5 rounded-xl border border-red-200 bg-red-50 text-red-900 text-xs flex items-start gap-2"
        >
          <AlertTriangle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* Captured Asset Preview & QA Agent Submission */}
      {captured && !recordingMode && (
        <div className="p-4 rounded-xl border border-slate-200 bg-slate-50/70 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="min-w-0">
              <p className="text-xs font-bold text-slate-900 truncate">{captured.fileName}</p>
              <p className="text-[11px] font-mono text-slate-600 mt-0.5">
                {captured.mode === "audio" && captured.wavResult
                  ? `WAV · ${captured.wavResult.sampleRateHz} Hz · ${
                      captured.wavResult.channels === 1 ? "Mono" : `${captured.wavResult.channels}ch`
                    } · ${captured.wavResult.durationSec.toFixed(1)}s · Peak ${captured.wavResult.peakDbfs.toFixed(1)} dBFS`
                  : `${captured.mimeType} · ${captured.durationSec.toFixed(1)}s${
                      captured.width && captured.height
                        ? ` · ${captured.width}x${captured.height}`
                        : ""
                    }`}
              </p>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <a
                href={captured.previewUrl}
                download={captured.fileName}
                className="min-h-[44px] min-w-[44px] inline-flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-semibold border border-slate-200 bg-white text-slate-700 rounded-lg hover:bg-slate-100"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Save</span>
              </a>
              <button
                type="button"
                onClick={handleResetCapture}
                aria-label="Discard captured media"
                className="min-h-[44px] min-w-[44px] inline-flex items-center justify-center px-3 py-2 text-xs font-semibold border border-slate-200 bg-white text-slate-600 rounded-lg hover:text-red-700"
              >
                <RotateCcw className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {captured.mode === "audio" ? (
            <audio controls src={captured.previewUrl} className="w-full h-11" />
          ) : (
            <video
              controls
              playsInline
              src={captured.previewUrl}
              className="w-full max-h-64 rounded-lg bg-slate-950"
            />
          )}

          {captured.mode === "audio" && (
            <div className="space-y-3">
              <div>
                <label
                  htmlFor={`capture-ref-script-${taskId || "workspace"}`}
                  className="block text-xs font-semibold text-slate-700 mb-1"
                >
                  Reference Script (for Whisper / Gemini STT WER Audit)
                </label>
                <textarea
                  id={`capture-ref-script-${taskId || "workspace"}`}
                  rows={2}
                  value={referenceTranscript}
                  onChange={(e) => setReferenceTranscript(e.target.value)}
                  placeholder="Optional reference script spoken in the recording..."
                  className="w-full min-h-[64px] px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500/30"
                />
              </div>

              <label className="min-h-[44px] inline-flex items-center gap-2.5 text-xs font-medium text-slate-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={runStt}
                  onChange={(e) => setRunStt(e.target.checked)}
                  className="w-5 h-5 rounded border-slate-300"
                />
                <span>Run STT Transcription &amp; Word Error Rate Check</span>
              </label>
            </div>
          )}

          <button
            type="button"
            disabled={uploadingQa || converting}
            onClick={() => void handleUploadToQaAgent()}
            className="w-full min-h-[48px] inline-flex items-center justify-center gap-2 px-4 py-3 text-sm font-bold bg-gradient-to-r from-blue-600 via-sky-500 to-emerald-500 text-white rounded-xl hover:brightness-105 disabled:opacity-50 shadow-xs transition-all"
          >
            {uploadingQa ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <UploadCloud className="w-4 h-4" />
            )}
            <span>
              {uploadingQa
                ? "Uploading to QA Agent..."
                : `Upload ${captured.mode === "audio" ? ".WAV Audio" : "Video"} Directly to QA Agent`}
            </span>
          </button>
        </div>
      )}

      {/* Audio QA Agent Result */}
      {audioReport && (
        <div
          className={`p-4 rounded-xl border text-xs space-y-2.5 ${
            audioReport.passed
              ? "border-emerald-200 bg-emerald-50/80 text-emerald-950"
              : "border-amber-200 bg-amber-50/80 text-amber-950"
          }`}
        >
          <div className="flex items-center justify-between gap-2 font-bold text-sm">
            <span className="inline-flex items-center gap-1.5">
              {audioReport.passed ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-700" />
              ) : (
                <AlertTriangle className="w-4 h-4 text-amber-700" />
              )}
              <span>
                Audio QA Verdict: {audioReport.passed ? "PASSED" : "FLAGGED"}
              </span>
            </span>
            <span className="font-mono text-xs tabular-nums">
              SNR {audioReport.snrDb.toFixed(1)} dB
            </span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 font-mono text-[11px]">
            <div className="p-2 rounded-lg bg-white/80 border border-slate-200/70">
              <span className="text-slate-500 block">Format</span>
              <span className="font-semibold">
                {audioReport.channels}ch · {audioReport.sampleRateHz}Hz
              </span>
            </div>
            <div className="p-2 rounded-lg bg-white/80 border border-slate-200/70">
              <span className="text-slate-500 block">Peak</span>
              <span className="font-semibold">{audioReport.peakDbfs.toFixed(1)} dBFS</span>
            </div>
            <div className="p-2 rounded-lg bg-white/80 border border-slate-200/70">
              <span className="text-slate-500 block">Noise Floor</span>
              <span className="font-semibold">{audioReport.noiseFloorDbfs.toFixed(1)} dBFS</span>
            </div>
            <div className="p-2 rounded-lg bg-white/80 border border-slate-200/70">
              <span className="text-slate-500 block">SNR</span>
              <span className="font-semibold">{audioReport.snrDb.toFixed(1)} dB</span>
            </div>
          </div>

          {audioReport.failureReasons.length > 0 && (
            <ul className="list-disc pl-4 space-y-0.5 text-[11px]">
              {audioReport.failureReasons.map((reason, idx) => (
                <li key={idx}>{reason}</li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* Video QA Agent Result */}
      {videoReport && (
        <div
          className={`p-4 rounded-xl border text-xs space-y-2 ${
            videoReport.passed
              ? "border-emerald-200 bg-emerald-50/80 text-emerald-950"
              : "border-amber-200 bg-amber-50/80 text-amber-950"
          }`}
        >
          <div className="flex items-center justify-between gap-2 font-bold text-sm">
            <span className="inline-flex items-center gap-1.5">
              {videoReport.passed ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-700" />
              ) : (
                <AlertTriangle className="w-4 h-4 text-amber-700" />
              )}
              <span>
                Video QA Verdict: {videoReport.passed ? "PASSED" : "FLAGGED"}
              </span>
            </span>
            <span className="font-mono text-xs">{videoReport.containerFormat}</span>
          </div>
          <p className="font-mono text-[11px]">
            Size {(videoReport.fileSizeBytes / 1024).toFixed(1)} KB · Audio Track:{" "}
            {videoReport.hasAudioTrack ? "Present" : "Missing"} · Moderation:{" "}
            {videoReport.moderationAllowed ? "Clean" : "Blocked"}
          </p>
        </div>
      )}
    </div>
  );
}
