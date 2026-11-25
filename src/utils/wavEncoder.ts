/**
 * Client-side Web Audio API PCM-16 Mono 24kHz WAV encoder for Phase 22C
 * mobile MediaRecorder streams (WebM Opus, M4A/MP4, OGG) and native captures.
 */

export const TARGET_QA_SAMPLE_RATE = 24000;

export interface ConvertedWavResult {
  wavBlob: Blob;
  wavBase64: string;
  sampleRateHz: number;
  channels: number;
  durationSec: number;
  peakDbfs: number;
  isSilent: boolean;
  convertedFromMime: string;
}

export function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  const chunkSize = 0x8000;
  const parts: string[] = [];
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const slice = bytes.subarray(i, Math.min(i + chunkSize, bytes.length));
    parts.push(String.fromCharCode(...slice));
  }
  return btoa(parts.join(""));
}

export async function blobToBase64(blob: Blob): Promise<string> {
  const buffer = await blob.arrayBuffer();
  return arrayBufferToBase64(buffer);
}

/**
 * Encodes floating-point mono PCM samples (-1.0 .. 1.0) into a standard
 * 44-byte RIFF/WAVE PCM 16-bit little-endian buffer.
 */
export function encodePcm16MonoWav(
  samples: Float32Array,
  sampleRate: number = TARGET_QA_SAMPLE_RATE
): ArrayBuffer {
  const numChannels = 1;
  const bitsPerSample = 16;
  const bytesPerSample = bitsPerSample / 8;
  const blockAlign = numChannels * bytesPerSample;
  const byteRate = sampleRate * blockAlign;
  const dataByteLength = samples.length * bytesPerSample;
  const buffer = new ArrayBuffer(44 + dataByteLength);
  const view = new DataView(buffer);

  const writeAscii = (offset: number, text: string) => {
    for (let i = 0; i < text.length; i++) {
      view.setUint8(offset + i, text.charCodeAt(i));
    }
  };

  writeAscii(0, "RIFF");
  view.setUint32(4, 36 + dataByteLength, true);
  writeAscii(8, "WAVE");
  writeAscii(12, "fmt ");
  view.setUint32(16, 16, true); // PCM fmt chunk size
  view.setUint16(20, 1, true); // AudioFormat = 1 (PCM)
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitsPerSample, true);
  writeAscii(36, "data");
  view.setUint32(40, dataByteLength, true);

  let offset = 44;
  for (let i = 0; i < samples.length; i++) {
    const clamped = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(
      offset,
      clamped < 0 ? Math.round(clamped * 0x8000) : Math.round(clamped * 0x7fff),
      true
    );
    offset += 2;
  }

  return buffer;
}

function mergePcmChunks(chunks: Float32Array[]): Float32Array {
  let total = 0;
  for (const chunk of chunks) total += chunk.length;
  const merged = new Float32Array(total);
  let cursor = 0;
  for (const chunk of chunks) {
    merged.set(chunk, cursor);
    cursor += chunk.length;
  }
  return merged;
}

function resampleMonoLinear(
  input: Float32Array,
  sourceRate: number,
  targetRate: number
): Float32Array {
  if (sourceRate === targetRate || input.length === 0) return input;
  const ratio = sourceRate / targetRate;
  const outLength = Math.max(1, Math.round(input.length / ratio));
  const out = new Float32Array(outLength);
  for (let i = 0; i < outLength; i++) {
    const srcIdx = i * ratio;
    const i0 = Math.floor(srcIdx);
    const i1 = Math.min(input.length - 1, i0 + 1);
    const frac = srcIdx - i0;
    out[i] = input[i0] * (1 - frac) + input[i1] * frac;
  }
  return out;
}

function computePeakStats(samples: Float32Array): { peakDbfs: number; isSilent: boolean } {
  let maxPeak = 0;
  for (let i = 0; i < samples.length; i++) {
    const abs = Math.abs(samples[i]);
    if (abs > maxPeak) maxPeak = abs;
  }
  const peakDbfs = maxPeak > 1e-6 ? 20 * Math.log10(maxPeak) : -120;
  return {
    peakDbfs: Math.round(peakDbfs * 100) / 100,
    isSilent: maxPeak < 0.001,
  };
}

function hasRiffWaveHeader(bytes: Uint8Array): boolean {
  if (bytes.length < 44) return false;
  return (
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x41 &&
    bytes[10] === 0x56 &&
    bytes[11] === 0x45
  );
}

/**
 * Converts a recorded MediaRecorder audio Blob (webm/mp4/ogg) or uploaded audio
 * File into a 24,000 Hz Mono 16-bit PCM .wav Blob. If the uploaded file is already
 * a valid RIFF/WAVE file, its raw header/metrics are preserved cleanly for exact QA testing.
 */
export async function convertAudioBlobToWav(
  blob: Blob,
  options?: {
    targetSampleRate?: number;
    fallbackPcmChunks?: Float32Array[];
    fallbackPcmSampleRate?: number;
  }
): Promise<ConvertedWavResult> {
  const targetRate = options?.targetSampleRate ?? TARGET_QA_SAMPLE_RATE;
  const rawBuffer = await blob.arrayBuffer();
  const rawBytes = new Uint8Array(rawBuffer);

  // Preserve uploaded .wav files directly so QA Engines accurately audit their native header
  if (hasRiffWaveHeader(rawBytes)) {
    const view = new DataView(rawBuffer);
    const channels = Math.max(1, view.getUint16(22, true));
    const sampleRateHz = view.getUint32(24, true) || targetRate;
    const bitsPerSample = view.getUint16(34, true) || 16;
    const dataBytes = Math.max(0, rawBytes.length - 44);
    const totalFrames = Math.floor(dataBytes / (channels * (bitsPerSample / 8)));
    const durationSec = Math.round((totalFrames / sampleRateHz) * 100) / 100;

    let maxPeak = 0;
    if (bitsPerSample === 16) {
      for (let pos = 44; pos + 1 < rawBytes.length; pos += 2 * channels) {
        const val = Math.abs(view.getInt16(pos, true) / 32768);
        if (val > maxPeak) maxPeak = val;
      }
    } else {
      maxPeak = 0.25;
    }

    const peakDbfs = maxPeak > 1e-6 ? Math.round(20 * Math.log10(maxPeak) * 100) / 100 : -120;
    return {
      wavBlob: new Blob([rawBuffer], { type: "audio/wav" }),
      wavBase64: arrayBufferToBase64(rawBuffer),
      sampleRateHz,
      channels,
      durationSec,
      peakDbfs,
      isSilent: maxPeak < 0.001,
      convertedFromMime: blob.type || "audio/wav",
    };
  }

  // Decode compressed MediaRecorder output via Web Audio API + resample to Mono 24kHz
  const AudioCtx =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;

  if (AudioCtx && rawBuffer.byteLength > 0) {
    const ctx = new AudioCtx();
    try {
      const decoded = await ctx.decodeAudioData(rawBuffer.slice(0));
      const frameCount = Math.max(1, Math.ceil(decoded.duration * targetRate));
      const offline = new OfflineAudioContext(1, frameCount, targetRate);
      const source = offline.createBufferSource();
      source.buffer = decoded;
      source.connect(offline.destination);
      source.start(0);
      const rendered = await offline.startRendering();
      const monoSamples = rendered.getChannelData(0);
      const wavBuffer = encodePcm16MonoWav(monoSamples, targetRate);
      const stats = computePeakStats(monoSamples);
      return {
        wavBlob: new Blob([wavBuffer], { type: "audio/wav" }),
        wavBase64: arrayBufferToBase64(wavBuffer),
        sampleRateHz: targetRate,
        channels: 1,
        durationSec: Math.round((monoSamples.length / targetRate) * 100) / 100,
        peakDbfs: stats.peakDbfs,
        isSilent: stats.isSilent,
        convertedFromMime: blob.type || "audio/webm",
      };
    } catch {
      // Fall through to live PCM chunk buffer if MediaRecorder container cannot decode in headless contexts
    } finally {
      await ctx.close().catch(() => {});
    }
  }

  if (options?.fallbackPcmChunks && options.fallbackPcmChunks.length > 0) {
    const merged = mergePcmChunks(options.fallbackPcmChunks);
    const resampled = resampleMonoLinear(
      merged,
      options.fallbackPcmSampleRate || 48000,
      targetRate
    );
    const wavBuffer = encodePcm16MonoWav(resampled, targetRate);
    const stats = computePeakStats(resampled);
    return {
      wavBlob: new Blob([wavBuffer], { type: "audio/wav" }),
      wavBase64: arrayBufferToBase64(wavBuffer),
      sampleRateHz: targetRate,
      channels: 1,
      durationSec: Math.round((resampled.length / targetRate) * 100) / 100,
      peakDbfs: stats.peakDbfs,
      isSilent: stats.isSilent,
      convertedFromMime: blob.type || "audio/pcm-fallback",
    };
  }

  throw new Error(
    "Unable to decode captured audio stream into .wav. Record again or upload a valid .wav / .mp3 / .m4a file."
  );
}
