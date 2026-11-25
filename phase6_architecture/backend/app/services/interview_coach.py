from __future__ import annotations

import base64
import json
import os
from dataclasses import dataclass

from google import genai
from google.genai import types


@dataclass
class InterviewRubricEvaluation:
    transcript: str
    tone_score: int
    clarity_score: int
    technical_accuracy_score: int
    overall_score: int
    strengths: list[str]
    coaching_notes: str
    sample_improved_answer: str


class EthicalMockInterviewCoach:
    """
    Ethical B2C Interview Preparation Simulator.
    Designed strictly for candidate self-practice before real interviews
    (never for live interview deception). Uses TTS voice synthesis, STT
    transcription, and structured coaching rubrics.
    """

    def __init__(self) -> None:
        self.client = genai.Client(api_key=os.getenv("GEMINI_API_KEY"))

    def synthesize_interviewer_prompt(
        self,
        question_text: str,
        voice_name: str = "Kore",
    ) -> bytes:
        response = self.client.models.generate_content(
            model="gemini-3.8-flash-lite-tts",
            contents=[
                {
                    "role": "user",
                    "parts": [
                        {
                            "text": question_text,
                            "speechMetadata": {
                                "style": "Warm, encouraging senior technical interviewer"
                            },
                        }
                    ],
                }
            ],
            config=types.GenerateContentConfig(
                response_modalities=["AUDIO"],
                speech_config=types.SpeechConfig(
                    voice_config=types.VoiceConfig(
                        prebuilt_voice_config=types.PrebuiltVoiceConfig(
                            voice_name=voice_name
                        )
                    )
                ),
            ),
        )
        b64 = response.candidates[0].content.parts[0].inline_data.data
        return base64.b64decode(b64) if isinstance(b64, str) else b64

    def transcribe_and_grade(
        self,
        role_track: str,
        question_text: str,
        audio_bytes: bytes | None = None,
        audio_mime_type: str = "audio/wav",
        fallback_transcript: str | None = None,
    ) -> InterviewRubricEvaluation:
        transcript = (fallback_transcript or "").strip()
        if audio_bytes:
            stt = self.client.models.generate_content(
                model="gemini-3.5-transcribe",
                contents=[
                    types.Part.from_bytes(data=audio_bytes, mime_type=audio_mime_type),
                    "Transcribe this mock interview candidate response verbatim.",
                ],
            )
            transcript = (stt.text or "").strip()

        grade_resp = self.client.models.generate_content(
            model="gemini-4-hydrogen",
            contents=(
                f"Role Track: {role_track}\n"
                f"Practice Question: {question_text}\n"
                f"Candidate Transcript: {transcript}\n\n"
                "Score the candidate from 0 to 100 on tone_score, clarity_score, "
                "and technical_accuracy_score, and provide ethical practice coaching."
            ),
            config=types.GenerateContentConfig(
                response_mime_type="application/json",
            ),
        )
        data = json.loads(grade_resp.text or "{}")
        tone = int(data.get("tone_score", 75))
        clarity = int(data.get("clarity_score", 75))
        tech = int(data.get("technical_accuracy_score", 75))
        overall = round((tone + clarity + tech) / 3)
        return InterviewRubricEvaluation(
            transcript=transcript,
            tone_score=tone,
            clarity_score=clarity,
            technical_accuracy_score=tech,
            overall_score=overall,
            strengths=list(data.get("strengths", [])),
            coaching_notes=str(data.get("coaching_notes", "")),
            sample_improved_answer=str(data.get("sample_improved_answer", "")),
        )
