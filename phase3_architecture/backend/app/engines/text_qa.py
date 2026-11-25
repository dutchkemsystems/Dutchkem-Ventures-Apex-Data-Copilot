from __future__ import annotations

import json
import os
from dataclasses import dataclass

from google import genai
from google.genai import types


@dataclass(slots=True)
class CriterionScore:
    criterion: str
    score: int
    justification: str


@dataclass(slots=True)
class TextLocalizationReport:
    overall_score: float
    passed: bool
    criteria_scores: list[CriterionScore]
    revision_suggestion: str


class TextLocalizationQaEngine:
    """
    Grades translations and LLM outputs against a custom 1-5 evaluation rubric.
    """

    def __init__(self) -> None:
        self._client = genai.Client(api_key=os.environ["GEMINI_API_KEY"])

    def grade_output(
        self,
        source_text: str,
        candidate_output: str,
        target_locale: str,
        rubric_criteria: list[str],
    ) -> TextLocalizationReport:
        prompt = (
            f"Target Locale: {target_locale}\n"
            f"Source Text:\n{source_text}\n\n"
            f"Candidate Output / Translation:\n{candidate_output}\n\n"
            f"Grade each rubric criterion strictly on an integer scale from 1 (critical failure) "
            f"to 5 (native/production ready): {', '.join(rubric_criteria)}.\n"
            "Provide an exact justification per criterion and a concise revision suggestion."
        )

        response = self._client.models.generate_content(
            model="gemini-4-hydrogen",
            contents=prompt,
            config=types.GenerateContentConfig(
                response_mime_type="application/json",
                response_schema={
                    "type": "OBJECT",
                    "properties": {
                        "criteria_scores": {
                            "type": "ARRAY",
                            "items": {
                                "type": "OBJECT",
                                "properties": {
                                    "criterion": {"type": "STRING"},
                                    "score": {"type": "INTEGER"},
                                    "justification": {"type": "STRING"},
                                },
                                "required": ["criterion", "score", "justification"],
                            },
                        },
                        "revision_suggestion": {"type": "STRING"},
                    },
                    "required": ["criteria_scores", "revision_suggestion"],
                },
            ),
        )

        data = json.loads(response.text or "{}")
        scores = [
            CriterionScore(
                criterion=item["criterion"],
                score=max(1, min(5, int(item["score"]))),
                justification=item["justification"],
            )
            for item in data.get("criteria_scores", [])
        ]
        overall = sum(s.score for s in scores) / len(scores) if scores else 0.0
        return TextLocalizationReport(
            overall_score=round(overall, 2),
            passed=overall >= 4.0 and all(s.score >= 3 for s in scores),
            criteria_scores=scores,
            revision_suggestion=data.get("revision_suggestion", ""),
        )
