"use client";

import React, { useRef, useState } from "react";
import { Camera, Mic, Square, UploadCloud, Video } from "lucide-react";

/**
 * Next.js 15 App Router Phase 22C blueprint:
 * Mobile MediaRecorder component capturing browser audio/video, converting audio
 * streams to 24kHz Mono PCM .wav, and supporting native OS camera/voice capture
 * via <input type="file" accept="audio/*,video/*" capture="environment" />.
 */
export function MobileMediaRecorder({
  taskId,
  onUploaded,
}: {
  taskId?: string;
  onUploaded?: (report: unknown) => void;
}) {
  const [recordingMode, setRecordingMode] = useState<"audio" | "video" | null>(null);
  const [wavBlob, setWavBlob] = useState<Blob | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string>("");
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  async function encodeMonoWav24k(blob: Blob): Promise<Blob> {
    const rawBuffer = await blob.arrayBuffer();
    const AudioCtx = window.AudioContext;
    const ctx = new AudioCtx();
    try {
      const decoded = await ctx.decodeAudioData(rawBuffer.slice(0));
      const targetRate = 24000;
      const frameCount = Math.max(1, Math.ceil(decoded.duration * targetRate));
      const offline = new OfflineAudioContext(1, frameCount, targetRate);
      const src = offline.createBufferSource();
      src.buffer = decoded;
      src.connect(offline.destination);
      src.start(0);
      const rendered = await offline.startRendering();
      const samples = rendered.getChannelData(0);

      const wavBuffer = new ArrayBuffer(44 + samples.length * 2);
      const view = new DataView(wavBuffer);
      const writeStr = (off: number, s: string) =>
        [...s].forEach((c, i) => view.setUint8(off + i, c.charCodeAt(0)));
      writeStr(0, "RIFF");
      view.setUint32(4, 36 + samples.length * 2, true);
      writeStr(8, "WAVE");
      writeStr(12, "fmt ");
      view.setUint32(16, 16, true);
      view.setUint16(20, 1, true);
      view.setUint16(22, 1, true);
      view.setUint32(24, targetRate, true);
      view.setUint32(28, targetRate * 2, true);
      view.setUint16(32, 2, true);
      view.setUint16(34, 16, true);
      writeStr(36, "data");
      view.setUint32(40, samples.length * 2, true);
      for (let i = 0; i < samples.length; i++) {
        const s = Math.max(-1, Math.min(1, samples[i]));
        view.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
      }
      return new Blob([wavBuffer], { type: "audio/wav" });
    } finally {
      await ctx.close();
    }
  }

  async function startCapture(mode: "audio" | "video") {
    setStatusMessage(null);
    const stream = await navigator.mediaDevices.getUserMedia(
      mode === "video"
        ? { audio: true, video: { facingMode: "environment" } }
        : { audio: { channelCount: 1, sampleRate: 24000 } }
    );
    streamRef.current = stream;
    chunksRef.current = [];

    const recorder = new MediaRecorder(stream);
    recorder.ondataavailable = (ev) => {
      if (ev.data.size > 0) chunksRef.current.push(ev.data);
    };
    recorder.onstop = async () => {
      stream.getTracks().forEach((t) => t.stop());
      setRecordingMode(null);
      const raw = new Blob(chunksRef.current, { type: recorder.mimeType || "audio/webm" });
      if (mode === "audio") {
        const converted = await encodeMonoWav24k(raw);
        setWavBlob(converted);
        setPreviewUrl(URL.createObjectURL(converted));
      } else {
        setWavBlob(raw);
        setPreviewUrl(URL.createObjectURL(raw));
      }
    };

    recorderRef.current = recorder;
    recorder.start();
    setRecordingMode(mode);
  }

  function stopCapture() {
    recorderRef.current?.stop();
  }

  async function handleFileInput(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.type.startsWith("audio/")) {
      const converted = await encodeMonoWav24k(file);
      setWavBlob(converted);
      setPreviewUrl(URL.createObjectURL(converted));
    } else {
      setWavBlob(file);
      setPreviewUrl(URL.createObjectURL(file));
    }
  }

  async function submitToQaAgent() {
    if (!wavBlob) return;
    setUploading(true);
    try {
      const buf = await wavBlob.arrayBuffer();
      const base64 = btoa(String.fromCharCode(...new Uint8Array(buf)));
      const endpoint = wavBlob.type.startsWith("video/") ? "/api/qa/video" : "/api/qa/audio";
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...(endpoint === "/api/qa/audio" ? { wavBase64: base64 } : { videoBase64: base64 }),
          fileName: endpoint === "/api/qa/audio" ? "capture.wav" : "capture.webm",
          taskId,
        }),
      });
      const json = await res.json();
      setStatusMessage(res.ok ? "Uploaded to QA Agent." : json.detail || "Upload failed.");
      if (res.ok) onUploaded?.(json.report);
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="p-4 sm:p-6 rounded-2xl border border-slate-200 bg-white space-y-4">
      {recordingMode ? (
        <button
          type="button"
          onClick={stopCapture}
          className="w-full min-h-[48px] inline-flex items-center justify-center gap-2 rounded-xl bg-red-600 text-white font-semibold"
        >
          <Square className="w-4 h-4" />
          <span>Stop Recording</span>
        </button>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <button
            type="button"
            onClick={() => void startCapture("audio")}
            className="min-h-[48px] inline-flex items-center justify-center gap-2 rounded-xl bg-[#0B1F3A] text-white font-semibold"
          >
            <Mic className="w-4 h-4" />
            <span>Record Audio</span>
          </button>
          <button
            type="button"
            onClick={() => void startCapture("video")}
            className="min-h-[48px] inline-flex items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white text-[#0B1F3A] font-semibold"
          >
            <Video className="w-4 h-4" />
            <span>Record Video</span>
          </button>
        </div>
      )}

      <label className="w-full min-h-[48px] inline-flex items-center justify-center gap-2 rounded-xl border border-dashed border-blue-300 bg-blue-50 text-blue-900 text-sm font-semibold cursor-pointer">
        <Camera className="w-4 h-4" />
        <span>Open Camera or Voice Recorder</span>
        <input
          type="file"
          accept="audio/*,video/*"
          capture="environment"
          onChange={(e) => void handleFileInput(e)}
          className="sr-only"
        />
      </label>

      {previewUrl && (
        <div className="space-y-3">
          {wavBlob?.type.startsWith("video/") ? (
            <video controls playsInline src={previewUrl} className="w-full rounded-lg" />
          ) : (
            <audio controls src={previewUrl} className="w-full h-11" />
          )}
          <button
            type="button"
            disabled={uploading}
            onClick={() => void submitToQaAgent()}
            className="w-full min-h-[48px] inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-600 text-white font-bold"
          >
            <UploadCloud className="w-4 h-4" />
            <span>{uploading ? "Uploading..." : "Upload to QA Agent"}</span>
          </button>
        </div>
      )}

      {statusMessage && <p className="text-xs font-medium text-slate-700">{statusMessage}</p>}
    </div>
  );
}
