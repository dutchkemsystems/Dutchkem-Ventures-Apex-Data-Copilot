from __future__ import annotations

import io
from dataclasses import dataclass
from typing import Optional

import librosa
import numpy as np
import soundfile as sf
import whisper
from jiwer import wer as compute_wer


@dataclass(slots=True)
class AudioQaReport:
    is_mono: bool
    channels: int
    sample_rate_hz: int
    duration_sec: float
    peak_dbfs: float
    noise_floor_dbfs: float
    snr_db: float
    transcript: Optional[str]
    word_error_rate: Optional[float]
    checks: dict[str, bool]
    passed: bool
    failure_reasons: list[str]


class AudioQaEngine:
    """
    Validates .wav assets against studio TTS QA invariants:
    - Channels: Mono (1)
    - Sample Rate: 24,000 Hz
    - Peak Amplitude: -6.0 dBFS <= peak <= -3.0 dBFS
    - Noise Floor: < -70.0 dBFS
    - SNR: > 35.0 dB
    - Whisper STT Word Error Rate (WER) check against reference script
    """

    TARGET_SAMPLE_RATE = 24000
    PEAK_MIN_DB = -6.0
    PEAK_MAX_DB = -3.0
    MAX_NOISE_FLOOR_DB = -70.0
    MIN_SNR_DB = 35.0
    MAX_WER = 0.05

    def __init__(self, whisper_model_size: str = "base") -> None:
        self._whisper_model = whisper.load_model(whisper_model_size)

    def evaluate_wav_bytes(
        self,
        wav_bytes: bytes,
        reference_transcript: Optional[str] = None,
    ) -> AudioQaReport:
        data, sr = sf.read(io.BytesIO(wav_bytes), always_2d=True)
        channels = int(data.shape[1])
        is_mono = channels == 1
        mono_signal = data[:, 0] if is_mono else np.mean(data, axis=1)
        duration_sec = float(len(mono_signal) / sr) if sr > 0 else 0.0

        peak_amp = float(np.max(np.abs(mono_signal))) if len(mono_signal) else 0.0
        peak_dbfs = float(20.0 * np.log10(max(peak_amp, 1e-12)))

        # Frame-level RMS via librosa to separate noise floor (10th pct) from speech (90th pct)
        frame_rms = librosa.feature.rms(y=mono_signal, frame_length=1024, hop_length=512)[0]
        frame_db = 20.0 * np.log10(np.maximum(frame_rms, 1e-12))
        noise_floor_dbfs = float(np.percentile(frame_db, 10))
        speech_level_dbfs = float(np.percentile(frame_db, 90))
        snr_db = float(max(0.0, speech_level_dbfs - noise_floor_dbfs))

        transcript: Optional[str] = None
        word_error_rate: Optional[float] = None
        if reference_transcript:
            resampled_16k = librosa.resample(mono_signal, orig_sr=sr, target_sr=16000)
            stt_result = self._whisper_model.transcribe(resampled_16k.astype(np.float32))
            transcript = (stt_result.get("text") or "").strip()
            word_error_rate = float(compute_wer(reference_transcript.lower(), transcript.lower()))

        checks = {
            "mono": is_mono,
            "sample_rate_24khz": sr == self.TARGET_SAMPLE_RATE,
            "peak_range": self.PEAK_MIN_DB <= peak_dbfs <= self.PEAK_MAX_DB,
            "noise_floor": noise_floor_dbfs < self.MAX_NOISE_FLOOR_DB,
            "snr": snr_db > self.MIN_SNR_DB,
            "wer": True if word_error_rate is None else word_error_rate <= self.MAX_WER,
        }

        reasons: list[str] = []
        if not checks["mono"]:
            reasons.append(f"Expected Mono (1 channel), found {channels} channels.")
        if not checks["sample_rate_24khz"]:
            reasons.append(f"Expected 24000 Hz, found {sr} Hz.")
        if not checks["peak_range"]:
            reasons.append(f"Peak {peak_dbfs:.2f} dBFS outside [-6.0, -3.0] dBFS.")
        if not checks["noise_floor"]:
            reasons.append(f"Noise floor {noise_floor_dbfs:.2f} dBFS >= -70.0 dBFS.")
        if not checks["snr"]:
            reasons.append(f"SNR {snr_db:.2f} dB <= 35.0 dB minimum.")
        if not checks["wer"] and word_error_rate is not None:
            reasons.append(f"WER {word_error_rate:.2%} exceeds 5.0% threshold.")

        return AudioQaReport(
            is_mono=is_mono,
            channels=channels,
            sample_rate_hz=int(sr),
            duration_sec=round(duration_sec, 3),
            peak_dbfs=round(peak_dbfs, 2),
            noise_floor_dbfs=round(noise_floor_dbfs, 2),
            snr_db=round(snr_db, 2),
            transcript=transcript,
            word_error_rate=round(word_error_rate, 4) if word_error_rate is not None else None,
            checks=checks,
            passed=all(checks.values()),
            failure_reasons=reasons,
        )
