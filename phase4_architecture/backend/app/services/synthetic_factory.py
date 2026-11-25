from __future__ import annotations

import asyncio
import json
import os
from dataclasses import dataclass
from typing import Protocol
from uuid import UUID

import httpx
from google import genai
from google.genai import types


class VoiceCloningProvider(Protocol):
    async def synthesize_wav(
        self,
        text: str,
        voice_id: str,
        locale: str,
        tone: str,
    ) -> bytes: ...


class ElevenLabsVoiceProvider:
    """Calls ElevenLabs v2 multilingual speech synthesis API."""

    def __init__(self, api_key: str) -> None:
        self._api_key = api_key

    async def synthesize_wav(
        self, text: str, voice_id: str, locale: str, tone: str
    ) -> bytes:
        async with httpx.AsyncClient(timeout=30.0) as client:
            resp = await client.post(
                f"https://api.elevenlabs.io/v1/text-to-speech/{voice_id}",
                headers={"xi-api-key": self._api_key, "Accept": "audio/wav"},
                json={
                    "text": text,
                    "model_id": "eleven_multilingual_v2",
                    "voice_settings": {"stability": 0.45, "similarity_boost": 0.8},
                },
            )
            resp.raise_for_status()
            return resp.content


class CoquiXttsProvider:
    """Self-hosted Coqui XTTS-v2 worker adapter for zero-marginal-cost dataset generation."""

    def __init__(self, worker_url: str) -> None:
        self._worker_url = worker_url.rstrip("/")

    async def synthesize_wav(
        self, text: str, voice_id: str, locale: str, tone: str
    ) -> bytes:
        async with httpx.AsyncClient(timeout=45.0) as client:
            resp = await client.post(
                f"{self._worker_url}/api/tts",
                json={
                    "text": text,
                    "speaker_wav": voice_id,
                    "language": locale.split("-")[0],
                    "emotion": tone,
                },
            )
            resp.raise_for_status()
            return resp.content


@dataclass(slots=True)
class SyntheticUtterance:
    locale: str
    accent: str
    tone: str
    phonetic_complexity: str
    script_text: str
    ipa_hint: str


class SyntheticDataFactory:
    """
    Generates up to 10,000+ multilingual audio/text training records with
    varying accents, prosodic tones, and phonetic complexities without human recording.
    """

    def __init__(self, voice_provider: VoiceCloningProvider) -> None:
        self._ai = genai.Client(api_key=os.environ["GEMINI_API_KEY"])
        self._voice = voice_provider

    async def generate_phonetic_scripts(
        self,
        locales: list[str],
        accents: list[str],
        tones: list[str],
        complexity: str,
        batch_size: int = 25,
    ) -> list[SyntheticUtterance]:
        prompt = (
            f"Generate {batch_size} diverse synthetic speech scripts across locales {locales}, "
            f"accents {accents}, and speaking tones {tones}. Phonetic target: {complexity}. "
            "Include realistic numerals, diphthongs, and prosody punctuation plus IPA hint."
        )
        resp = self._ai.models.generate_content(
            model="gemini-4-hydrogen",
            contents=prompt,
            config=types.GenerateContentConfig(
                response_mime_type="application/json",
                response_schema={
                    "type": "ARRAY",
                    "items": {
                        "type": "OBJECT",
                        "properties": {
                            "locale": {"type": "STRING"},
                            "accent": {"type": "STRING"},
                            "tone": {"type": "STRING"},
                            "phonetic_complexity": {"type": "STRING"},
                            "script_text": {"type": "STRING"},
                            "ipa_hint": {"type": "STRING"},
                        },
                        "required": [
                            "locale",
                            "accent",
                            "tone",
                            "phonetic_complexity",
                            "script_text",
                            "ipa_hint",
                        ],
                    },
                },
            ),
        )
        raw = json.loads(resp.text or "[]")
        return [SyntheticUtterance(**item) for item in raw]

    async def synthesize_dataset_batch(
        self,
        org_id: UUID,
        utterances: list[SyntheticUtterance],
        voice_id: str,
        concurrency: int = 8,
    ) -> list[dict]:
        semaphore = asyncio.Semaphore(concurrency)

        async def _produce(idx: int, item: SyntheticUtterance) -> dict:
            async with semaphore:
                wav_bytes = await self._voice.synthesize_wav(
                    text=item.script_text,
                    voice_id=voice_id,
                    locale=item.locale,
                    tone=item.tone,
                )
                return {
                    "org_id": str(org_id),
                    "index": idx,
                    "locale": item.locale,
                    "accent": item.accent,
                    "tone": item.tone,
                    "script_text": item.script_text,
                    "byte_size": len(wav_bytes),
                }

        return await asyncio.gather(*[_produce(i, u) for i, u in enumerate(utterances)])
