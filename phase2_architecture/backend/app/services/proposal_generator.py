from __future__ import annotations

import json
import os
from dataclasses import dataclass

from google import genai
from google.genai import types


@dataclass(slots=True)
class GeneratedProposal:
    extracted_requirements: list[str]
    suggested_rate_usd: float
    estimated_turnaround_days: int
    screening_answer: str
    proposal_text: str


class ProposalGeneratorService:
    """
    Parses a scraped Job Description and uses Gemini to craft a 3-paragraph
    winning agency proposal tailored to the organization's automated QA stack.
    """

    def __init__(self) -> None:
        self._client = genai.Client(api_key=os.environ["GEMINI_API_KEY"])

    def build_prompt(
        self,
        agency_name: str,
        job_title: str,
        job_description: str,
        detected_requirement: str,
    ) -> str:
        return (
            f"Agency Name: {agency_name}\n"
            f"Target Contract: {job_title}\n"
            f"Job Description:\n{job_description}\n\n"
            "Instructions:\n"
            f"You are an expert agency owner at {agency_name}. We have built a custom AI platform "
            f"that automatically validates {detected_requirement}. We can deliver this at 3x the "
            "speed with 100% accuracy. Write a 3-paragraph proposal proving we are the best choice "
            "for this project. Also extract the key technical requirements, suggest a competitive "
            "hourly/fixed USD rate, estimate turnaround days, and write a concise 2-sentence "
            "screening question response."
        )

    async def generate_for_lead(
        self,
        agency_name: str,
        job_title: str,
        job_description: str,
        detected_requirement: str,
    ) -> GeneratedProposal:
        prompt = self.build_prompt(
            agency_name=agency_name,
            job_title=job_title,
            job_description=job_description,
            detected_requirement=detected_requirement,
        )

        response = self._client.models.generate_content(
            model="gemini-4-hydrogen",
            contents=prompt,
            config=types.GenerateContentConfig(
                response_mime_type="application/json",
                response_schema={
                    "type": "OBJECT",
                    "properties": {
                        "extracted_requirements": {
                            "type": "ARRAY",
                            "items": {"type": "STRING"},
                        },
                        "suggested_rate_usd": {"type": "NUMBER"},
                        "estimated_turnaround_days": {"type": "INTEGER"},
                        "screening_answer": {"type": "STRING"},
                        "proposal_text": {"type": "STRING"},
                    },
                    "required": [
                        "extracted_requirements",
                        "suggested_rate_usd",
                        "estimated_turnaround_days",
                        "screening_answer",
                        "proposal_text",
                    ],
                },
            ),
        )

        payload = json.loads(response.text or "{}")
        return GeneratedProposal(
            extracted_requirements=payload["extracted_requirements"],
            suggested_rate_usd=float(payload["suggested_rate_usd"]),
            estimated_turnaround_days=int(payload["estimated_turnaround_days"]),
            screening_answer=payload["screening_answer"],
            proposal_text=payload["proposal_text"],
        )
