import { GoogleGenAI, Type } from "@google/genai";

export type ModerationAssetType = "image" | "video" | "audio" | "text";

export interface ModerationCheckResult {
  allowed: boolean;
  assetType: ModerationAssetType;
  scanner: string;
  verdict: "approved" | "blocked";
  categories: string[];
  confidence: number;
  reason: string | null;
  transcript?: string | null;
}

const PROFANITY_AND_TOXICITY_PATTERNS: Array<{ category: string; regex: RegExp }> = [
  {
    category: "profanity",
    regex: /\b(fuck(?:ing|er|ed|s)?|shit(?:ty|head|s)?|bitch(?:es|ing)?|asshole|cunt|whore|slut|motherfucker|dickhead|bastard)\b/i,
  },
  {
    category: "hate_speech",
    regex: /\b(nigger|faggot|kike|spic|chink|wetback|retard(?:ed)?|subhuman)\b/i,
  },
  {
    category: "severe_harm_threat",
    regex: /\b(kill\s+yourself|kys|go\s+die|murder\s+you|bomb\s+threat|csam|child\s+porn|terrorist\s+attack)\b/i,
  },
  {
    category: "prompt_injection_abuse",
    regex: /(?:ignore\s+all\s+previous\s+instructions|reveal\s+system\s+prompt|exfiltrate\s+(?:env|api[_\s]?key|secret))/i,
  },
];

const NSFW_MEDIA_KEYWORD_REGEX =
  /\b(nsfw|porn|pornography|xxx|nude|nudity|explicit_adult|hentai|gore|beheading|csam|deepfake_nude)\b/i;

function detectBinarySpoofOrScript(raw: Buffer): string | null {
  if (raw.length === 0) return "Uploaded binary file is empty (0 bytes).";
  // PE/COFF (Windows .exe/.dll), ELF (Linux binary), Mach-O, Shebang scripts
  if (raw.length >= 2 && raw[0] === 0x4d && raw[1] === 0x5a) {
    return "Blocked disguised Windows PE executable (MZ header) uploaded as media asset.";
  }
  if (raw.length >= 4 && raw[0] === 0x7f && raw[1] === 0x45 && raw[2] === 0x4c && raw[3] === 0x46) {
    return "Blocked disguised ELF binary uploaded as media asset.";
  }
  if (raw.length >= 2 && raw[0] === 0x23 && raw[1] === 0x21) {
    return "Blocked disguised executable shell script (#!) uploaded as media asset.";
  }
  const headText = raw.subarray(0, 512).toString("utf8").toLowerCase();
  if (headText.includes("<script") || headText.includes("javascript:") || headText.includes("<svg onload")) {
    return "Blocked inline XSS / SVG script payload inside media upload.";
  }
  return null;
}

export function scanTextModerationDeterministic(text: string): ModerationCheckResult {
  const cleaned = (text || "").trim();
  if (!cleaned) {
    return {
      allowed: false,
      assetType: "text",
      scanner: "text_toxicity_filter",
      verdict: "blocked",
      categories: ["empty_payload"],
      confidence: 1.0,
      reason: "Text payload is empty or whitespace-only.",
    };
  }

  const matchedCategories: string[] = [];
  for (const rule of PROFANITY_AND_TOXICITY_PATTERNS) {
    if (rule.regex.test(cleaned)) {
      matchedCategories.push(rule.category);
    }
  }

  const tokens = cleaned.toLowerCase().split(/\s+/).filter(Boolean);
  if (tokens.length >= 16 && new Set(tokens).size <= 2) {
    matchedCategories.push("repetitive_spam");
  }

  if (matchedCategories.length > 0) {
    return {
      allowed: false,
      assetType: "text",
      scanner: "text_toxicity_filter",
      verdict: "blocked",
      categories: matchedCategories,
      confidence: 0.98,
      reason: `Pre-upload text filter blocked unsafe content (${matchedCategories.join(", ")}).`,
    };
  }

  return {
    allowed: true,
    assetType: "text",
    scanner: "text_toxicity_filter",
    verdict: "approved",
    categories: [],
    confidence: 0.99,
    reason: null,
  };
}

export async function moderateTextPayload(input: {
  text: string;
  ai?: GoogleGenAI | null;
}): Promise<ModerationCheckResult> {
  const deterministic = scanTextModerationDeterministic(input.text);
  if (!deterministic.allowed) {
    return deterministic;
  }

  if (input.ai) {
    const response = await input.ai.models.generateContent({
      model: "gemini-4-hydrogen",
      contents: `Classify the following text submission for profanity, hate speech, harassment, sexually explicit content, malware instructions, or spam gibberish.\n\nTEXT:\n${input.text}`,
      config: {
        systemInstruction:
          "You are a strict Trust & Safety pre-upload content moderator. Return JSON judging whether the submission is safe to enter the QA annotation pipeline.",
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            safe: { type: Type.BOOLEAN },
            categories: { type: Type.ARRAY, items: { type: Type.STRING } },
            confidence: { type: Type.NUMBER },
            reason: { type: Type.STRING },
          },
          required: ["safe", "categories", "confidence", "reason"],
        },
      },
    });
    const parsed = JSON.parse((response.text ?? "{}").trim()) as {
      safe?: boolean;
      categories?: string[];
      confidence?: number;
      reason?: string;
    };
    if (parsed.safe === false) {
      return {
        allowed: false,
        assetType: "text",
        scanner: "text_toxicity_filter+gemini",
        verdict: "blocked",
        categories: parsed.categories?.length ? parsed.categories : ["toxicity"],
        confidence: typeof parsed.confidence === "number" ? parsed.confidence : 0.92,
        reason: parsed.reason || "Flagged by semantic toxicity moderation.",
      };
    }
    return {
      allowed: true,
      assetType: "text",
      scanner: "text_toxicity_filter+gemini",
      verdict: "approved",
      categories: [],
      confidence: typeof parsed.confidence === "number" ? parsed.confidence : 0.98,
      reason: null,
    };
  }

  return deterministic;
}

export async function moderateAudioPayload(input: {
  wavBuffer: Buffer;
  fileName: string;
  runStt?: boolean;
  ai?: GoogleGenAI | null;
}): Promise<ModerationCheckResult> {
  const spoof = detectBinarySpoofOrScript(input.wavBuffer);
  if (spoof) {
    return {
      allowed: false,
      assetType: "audio",
      scanner: "audio_binary_guard",
      verdict: "blocked",
      categories: ["malicious_binary_spoof"],
      confidence: 1.0,
      reason: spoof,
    };
  }

  if (
    input.wavBuffer.length < 44 ||
    input.wavBuffer.toString("ascii", 0, 4) !== "RIFF" ||
    input.wavBuffer.toString("ascii", 8, 12) !== "WAVE"
  ) {
    return {
      allowed: false,
      assetType: "audio",
      scanner: "audio_container_guard",
      verdict: "blocked",
      categories: ["invalid_wav_header"],
      confidence: 1.0,
      reason: `Blocked corrupt or spoofed WAV container (${input.fileName}).`,
    };
  }

  const channels = Math.max(1, input.wavBuffer.readUInt16LE(22));
  const bitsPerSample = input.wavBuffer.readUInt16LE(34) || 16;
  const bytesPerSample = Math.max(1, bitsPerSample / 8);

  // Locate data subchunk
  let offset = 12;
  let dataOffset = 44;
  let dataSize = input.wavBuffer.length - 44;
  while (offset + 8 <= input.wavBuffer.length) {
    const chunkId = input.wavBuffer.toString("ascii", offset, offset + 4);
    const chunkSize = input.wavBuffer.readUInt32LE(offset + 4);
    if (chunkId === "data") {
      dataOffset = offset + 8;
      dataSize = Math.min(chunkSize, input.wavBuffer.length - dataOffset);
      break;
    }
    offset += 8 + chunkSize + (chunkSize % 2);
  }

  const frameSize = channels * bytesPerSample;
  const totalFrames = Math.floor(dataSize / frameSize);
  if (totalFrames < 400) {
    return {
      allowed: false,
      assetType: "audio",
      scanner: "stt_speech_gate",
      verdict: "blocked",
      categories: ["empty_or_too_short_audio"],
      confidence: 0.99,
      reason: "Audio recording contains too few frames for valid speech.",
    };
  }

  // Analyze 20-slice RMS envelope dynamic range + zero-crossing cadence
  const windowFrames = Math.max(120, Math.floor(totalFrames / 20));
  const sliceRmsDb: number[] = [];
  let maxPeak = 0;

  for (let startFrame = 0; startFrame + windowFrames <= totalFrames; startFrame += windowFrames) {
    let sumSq = 0;
    for (let f = 0; f < windowFrames; f++) {
      const bytePos = dataOffset + (startFrame + f) * frameSize;
      const sample =
        bitsPerSample === 16
          ? input.wavBuffer.readInt16LE(bytePos) / 32768
          : (input.wavBuffer.readUInt8(bytePos) - 128) / 128;
      const abs = Math.abs(sample);
      if (abs > maxPeak) maxPeak = abs;
      sumSq += sample * sample;
    }
    const rms = Math.sqrt(sumSq / windowFrames);
    sliceRmsDb.push(20 * Math.log10(Math.max(rms, 1e-6)));
  }

  const maxSliceDb = sliceRmsDb.length > 0 ? Math.max(...sliceRmsDb) : -120;
  const minSliceDb = sliceRmsDb.length > 0 ? Math.min(...sliceRmsDb) : -120;
  const dynamicRangeDb = maxSliceDb - minSliceDb;

  if (maxPeak < 0.001 || maxSliceDb < -62) {
    return {
      allowed: false,
      assetType: "audio",
      scanner: "stt_speech_gate",
      verdict: "blocked",
      categories: ["silence_no_speech"],
      confidence: 0.99,
      reason: "Pre-upload audio check blocked file: only dead silence detected, no spoken speech.",
    };
  }

  if (dynamicRangeDb < 3.5) {
    return {
      allowed: false,
      assetType: "audio",
      scanner: "stt_speech_gate",
      verdict: "blocked",
      categories: ["noise_or_tone_spam"],
      confidence: 0.96,
      reason: `Pre-upload audio check blocked file: stationary noise or constant tone spam without speech modulation (envelope spread ${dynamicRangeDb.toFixed(1)} dB < 3.5 dB).`,
    };
  }

  let transcript: string | null = null;
  if (input.runStt && input.ai) {
    const sttRes = await input.ai.models.generateContent({
      model: "gemini-3.5-transcribe",
      contents: {
        parts: [
          {
            inlineData: {
              mimeType: "audio/wav",
              data: input.wavBuffer.toString("base64"),
            },
          },
          {
            text: "Transcribe any spoken human words verbatim. If there is only noise, music, humming, or static with zero intelligible speech, return the exact token [NO_SPEECH].",
          },
        ],
      },
    });
    transcript = (sttRes.text ?? "").trim();
    if (!transcript || transcript === "[NO_SPEECH]" || /^\[?(silence|noise|static|inaudible)\]?$/i.test(transcript)) {
      return {
        allowed: false,
        assetType: "audio",
        scanner: "gemini-3.5-transcribe_stt_gate",
        verdict: "blocked",
        categories: ["stt_no_speech_detected"],
        confidence: 0.95,
        reason: "STT moderation rejected upload: audio contains only noise or non-speech artifacts.",
        transcript,
      };
    }

    const spokenSafety = scanTextModerationDeterministic(transcript);
    if (!spokenSafety.allowed) {
      return {
        allowed: false,
        assetType: "audio",
        scanner: "gemini-3.5-transcribe_toxicity",
        verdict: "blocked",
        categories: spokenSafety.categories,
        confidence: 0.97,
        reason: `Spoken audio transcript violated moderation policy (${spokenSafety.categories.join(", ")}).`,
        transcript,
      };
    }
  }

  return {
    allowed: true,
    assetType: "audio",
    scanner: transcript ? "gemini-3.5-transcribe_stt_gate" : "stt_speech_gate",
    verdict: "approved",
    categories: [],
    confidence: 0.98,
    reason: null,
    transcript,
  };
}

export async function moderateMediaPayload(input: {
  assetType: "image" | "video";
  fileName: string;
  mimeType?: string;
  contentBase64?: string;
  labels?: string[];
  ai?: GoogleGenAI | null;
}): Promise<ModerationCheckResult> {
  const combinedHint = `${input.fileName || ""} ${(input.labels || []).join(" ")}`.trim();
  if (NSFW_MEDIA_KEYWORD_REGEX.test(combinedHint)) {
    return {
      allowed: false,
      assetType: input.assetType,
      scanner: "nsfw_policy_guard",
      verdict: "blocked",
      categories: ["nsfw_or_explicit_content"],
      confidence: 0.99,
      reason: `Pre-upload ${input.assetType} moderation blocked explicit/NSFW content indicator in '${input.fileName}'.`,
    };
  }

  if (input.contentBase64) {
    const cleanB64 = input.contentBase64.includes(",")
      ? input.contentBase64.split(",")[1]
      : input.contentBase64;
    const raw = Buffer.from(cleanB64, "base64");
    const spoof = detectBinarySpoofOrScript(raw);
    if (spoof) {
      return {
        allowed: false,
        assetType: input.assetType,
        scanner: "binary_magic_guard",
        verdict: "blocked",
        categories: ["malicious_binary_spoof"],
        confidence: 1.0,
        reason: spoof,
      };
    }

    const nsfwJsUrl = process.env.NSFWJS_SERVICE_URL;
    if (nsfwJsUrl) {
      const nsfwRes = await fetch(nsfwJsUrl, {
        method: "POST",
        signal: AbortSignal.timeout(5000),
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fileName: input.fileName,
          mimeType: input.mimeType || (input.assetType === "image" ? "image/png" : "video/mp4"),
          dataBase64: cleanB64,
        }),
      });
      if (!nsfwRes.ok) {
        throw new Error(`NSFW.js scanner returned HTTP ${nsfwRes.status}`);
      }
      const nsfwData = (await nsfwRes.json()) as {
        safe?: boolean;
        categories?: string[];
        confidence?: number;
        reason?: string;
      };
      if (nsfwData.safe === false) {
        return {
          allowed: false,
          assetType: input.assetType,
          scanner: "nsfwjs",
          verdict: "blocked",
          categories: nsfwData.categories || ["nsfw"],
          confidence: nsfwData.confidence ?? 0.95,
          reason: nsfwData.reason || "Blocked by NSFW.js classifier.",
        };
      }
      return {
        allowed: true,
        assetType: input.assetType,
        scanner: "nsfwjs",
        verdict: "approved",
        categories: [],
        confidence: nsfwData.confidence ?? 0.99,
        reason: null,
      };
    }

    if (input.ai) {
      const mimeType =
        input.mimeType || (input.assetType === "video" ? "video/mp4" : "image/png");
      const modRes = await input.ai.models.generateContent({
        model: "gemini-4-hydrogen",
        contents: {
          parts: [
            {
              inlineData: {
                mimeType,
                data: cleanB64,
              },
            },
            {
              text: "Inspect this visual asset for NSFW content, nudity, pornography, graphic gore, violence, hate symbols, or illegal content.",
            },
          ],
        },
        config: {
          systemInstruction:
            "You are the Trust & Safety visual moderation scanner (equivalent to AWS Rekognition / NSFW.js). Return strict JSON classifying whether this image or video is safe.",
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              safe: { type: Type.BOOLEAN },
              categories: { type: Type.ARRAY, items: { type: Type.STRING } },
              confidence: { type: Type.NUMBER },
              reason: { type: Type.STRING },
            },
            required: ["safe", "categories", "confidence", "reason"],
          },
        },
      });
      const parsed = JSON.parse((modRes.text ?? "{}").trim()) as {
        safe?: boolean;
        categories?: string[];
        confidence?: number;
        reason?: string;
      };
      if (parsed.safe === false) {
        return {
          allowed: false,
          assetType: input.assetType,
          scanner: "gemini_vision_nsfw_guard",
          verdict: "blocked",
          categories: parsed.categories?.length ? parsed.categories : ["nsfw_or_unsafe"],
          confidence: typeof parsed.confidence === "number" ? parsed.confidence : 0.94,
          reason: parsed.reason || `Blocked unsafe ${input.assetType} submission.`,
        };
      }
      return {
        allowed: true,
        assetType: input.assetType,
        scanner: "gemini_vision_nsfw_guard",
        verdict: "approved",
        categories: [],
        confidence: typeof parsed.confidence === "number" ? parsed.confidence : 0.99,
        reason: null,
      };
    }
  }

  return {
    allowed: true,
    assetType: input.assetType,
    scanner: "nsfw_policy_guard",
    verdict: "approved",
    categories: [],
    confidence: 0.98,
    reason: null,
  };
}
