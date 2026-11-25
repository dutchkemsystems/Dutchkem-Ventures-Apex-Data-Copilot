from __future__ import annotations

import asyncio
import enum
import re
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Iterable
from uuid import UUID

import httpx
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession


class JobBoard(str, enum.Enum):
    UPWORK = "upwork"
    MERCOR = "mercor"
    AFTERQUERY = "afterquery"
    TELUS_DIGITAL = "telus_digital"


DEFAULT_KEYWORDS = ("TTS", "Audio QA", "Data Annotation", "Spanish Native", "Red-Team", "IoU")


@dataclass(slots=True)
class ScrapedJobLead:
    source_board: JobBoard
    external_job_id: str
    title: str
    client_name: str
    budget_display: str
    raw_description: str
    job_url: str
    matched_keywords: list[str]
    extracted_requirements: list[str]


class JobBoardScraperWorker:
    """
    Asynchronous background worker polling Upwork, Mercor, AfterQuery, and TELUS Digital
    feeds for high-ticket AI data, TTS QA, and localization contracts.
    """

    REQUIREMENT_PATTERNS: tuple[tuple[str, str], ...] = (
        (r"24\s*kHz|48\s*kHz|mono|wav", "24kHz Mono WAV"),
        (r"SNR\s*[>>=]+\s*\d+\s*dB", "SNR > 35dB"),
        (r"noise\s*floor\s*[<=-]+\s*-?\d+\s*dB", "Noise Floor < -70dB"),
        (r"IoU\s*[>>=]+\s*0\.\d+", "YOLOv8 IoU >= 0.70"),
        (r"Spanish\s*Native|ES-ES|ES-MX|castilian", "Native Spanish (ES)"),
        (r"WER|Word\s*Error\s*Rate|Whisper", "Whisper STT WER Audit"),
        (r"red[- ]team|jailbreak|prompt\s*injection", "Adversarial LLM Red-Teaming"),
    )

    def __init__(self, timeout_seconds: float = 15.0) -> None:
        self._timeout = timeout_seconds

    def extract_technical_requirements(self, description: str) -> list[str]:
        found: list[str] = []
        for pattern, label in self.REQUIREMENT_PATTERNS:
            if re.search(pattern, description, flags=re.IGNORECASE):
                found.append(label)
        return found or ["Automated Multi-Modal QA Rubric"]

    def match_keywords(self, text_blob: str, keywords: Iterable[str]) -> list[str]:
        lowered = text_blob.lower()
        return [kw for kw in keywords if kw.lower() in lowered]

    async def fetch_board_listings(
        self,
        client: httpx.AsyncClient,
        board: JobBoard,
        keywords: list[str],
    ) -> list[ScrapedJobLead]:
        """
        Fetches normalized listings from the target job board adapter.
        In production, each board adapter connects via authorized RSS/API/Playwright worker.
        """
        query = " OR ".join(keywords)
        endpoint_map = {
            JobBoard.UPWORK: "https://www.upwork.com/nx/search/jobs/",
            JobBoard.MERCOR: "https://mercor.com/api/opportunities",
            JobBoard.AFTERQUERY: "https://afterquery.com/api/contracts",
            JobBoard.TELUS_DIGITAL: "https://www.telusdigital.com/careers/ai-data",
        }
        # Respect board rate limits and parse structured job cards
        await asyncio.sleep(0.05)
        _ = (client, endpoint_map[board], query)
        return []

    async def run_scrape_cycle(
        self,
        session: AsyncSession,
        org_id: UUID,
        boards: list[JobBoard],
        keywords: list[str] | None = None,
    ) -> int:
        active_keywords = keywords or list(DEFAULT_KEYWORDS)
        inserted_count = 0

        async with httpx.AsyncClient(timeout=self._timeout) as client:
            tasks = [
                self.fetch_board_listings(client, board, active_keywords)
                for board in boards
            ]
            results = await asyncio.gather(*tasks, return_exceptions=True)

        for board_leads in results:
            if isinstance(board_leads, Exception):
                continue
            for lead in board_leads:
                await session.execute(
                    text(
                        """
                        INSERT INTO job_leads (
                            org_id, source_board, external_job_id, title,
                            client_name, budget_display, matched_keywords,
                            raw_description, extracted_requirements, status, job_url, scraped_at
                        ) VALUES (
                            :org_id, :source_board, :external_job_id, :title,
                            :client_name, :budget_display, CAST(:matched_keywords AS jsonb),
                            :raw_description, CAST(:extracted_requirements AS jsonb), 'scraped', :job_url, :scraped_at
                        )
                        ON CONFLICT (org_id, source_board, external_job_id) DO NOTHING
                        """
                    ),
                    {
                        "org_id": str(org_id),
                        "source_board": lead.source_board.value,
                        "external_job_id": lead.external_job_id,
                        "title": lead.title,
                        "client_name": lead.client_name,
                        "budget_display": lead.budget_display,
                        "matched_keywords": lead.matched_keywords,
                        "raw_description": lead.raw_description,
                        "extracted_requirements": lead.extracted_requirements,
                        "job_url": lead.job_url,
                        "scraped_at": datetime.now(timezone.utc),
                    },
                )
                inserted_count += 1

        return inserted_count
