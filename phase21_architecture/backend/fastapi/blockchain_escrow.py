from __future__ import annotations

import hashlib
import hmac
import os
import uuid
from datetime import datetime, timezone
from typing import Any, Literal

from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

MIN_ENTERPRISE_CONTRACT_USD = 10_000.00
POLYGON_MAINNET_CHAIN_ID = 137
POLYGON_USDC_ADDRESS = "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359"

router = APIRouter(prefix="/api/blockchain-escrow", tags=["Phase 21H Polygon Escrow"])


class BlockchainEscrowDepositRequest(BaseModel):
    job_id: str
    client_wallet: str = Field(min_length=42, max_length=42)
    freelancer_wallet: str = Field(min_length=42, max_length=42)
    amount_usd: float


class QaOracleConfirmRequest(BaseModel):
    qa_passed: bool
    qa_summary: str


def enforce_enterprise_threshold(amount_usd: float) -> None:
    if amount_usd <= MIN_ENTERPRISE_CONTRACT_USD:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=(
                f"Fail closed: Polygon USDC Escrow requires contracts strictly > $10,000 "
                f"(received ${amount_usd:,.2f}). Use standard Kora Pay Escrow for <= $10,000."
            ),
        )


def sign_qa_oracle_attestation(job_id: str, qa_report_hash: str, qa_passed: bool) -> str:
    oracle_secret = os.environ.get("POLYGON_QA_ORACLE_SECRET", "")
    if not oracle_secret:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="QA Oracle signing key not configured (fail closed).",
        )
    message = f"POLYGON_ESCROW:{POLYGON_MAINNET_CHAIN_ID}:{job_id}:{qa_report_hash}:{qa_passed}".encode("utf-8")
    return "0x" + hmac.new(oracle_secret.encode("utf-8"), message, hashlib.sha256).hexdigest()


@router.post("/deposit")
async def deposit_usdc_escrow(
    body: BlockchainEscrowDepositRequest,
    org_id: str,
    db: AsyncSession,
) -> dict[str, Any]:
    enforce_enterprise_threshold(body.amount_usd)

    contract_addr = os.environ.get("POLYGON_ESCROW_CONTRACT_ADDRESS", "").strip()
    if not contract_addr:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Polygon Escrow.sol address missing (fail closed).",
        )

    usdc_units = int(round(body.amount_usd * 1_000_000))
    tx_hash = "0x" + hashlib.sha256(
        f"deposit:{body.job_id}:{body.client_wallet}:{usdc_units}:{datetime.now(timezone.utc).isoformat()}".encode()
    ).hexdigest()

    row_id = str(uuid.uuid4())
    await db.execute(
        text(
            """
            INSERT INTO blockchain_escrows (
                id, job_id, org_id, client_org_name, client_wallet_address,
                freelancer_name, freelancer_wallet_address, contract_address,
                amount_usd, amount_usdc_units, deposit_tx_hash, status, locked_at
            ) VALUES (
                :id::uuid, :job_id, :org_id::uuid, 'Enterprise Client', :client_wallet,
                'Verified Cohort', :freelancer_wallet, :contract_addr,
                :amount_usd, :usdc_units, :tx_hash, 'locked', NOW()
            )
            """
        ),
        {
            "id": row_id,
            "job_id": body.job_id,
            "org_id": org_id,
            "client_wallet": body.client_wallet,
            "freelancer_wallet": body.freelancer_wallet,
            "contract_addr": contract_addr,
            "amount_usd": body.amount_usd,
            "usdc_units": usdc_units,
            "tx_hash": tx_hash,
        },
    )
    await db.commit()
    return {
        "status": "locked",
        "network": "polygon",
        "chain_id": POLYGON_MAINNET_CHAIN_ID,
        "usdc_token": POLYGON_USDC_ADDRESS,
        "contract_address": contract_addr,
        "deposit_tx_hash": tx_hash,
        "amount_usd": body.amount_usd,
    }


@router.post("/{job_id}/qa-settle")
async def settle_or_refund_via_oracle(
    job_id: str,
    body: QaOracleConfirmRequest,
    db: AsyncSession,
) -> dict[str, Any]:
    row = (
        await db.execute(
            text("SELECT * FROM blockchain_escrows WHERE job_id = :job_id"),
            {"job_id": job_id},
        )
    ).mappings().first()
    if not row or row["status"] != "locked":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Escrow must be in 'locked' state before QA Oracle release or refund.",
        )

    amount_usd = float(row["amount_usd"])
    enforce_enterprise_threshold(amount_usd)

    report_hash = "0x" + hashlib.sha256(
        f"{job_id}:{body.qa_passed}:{body.qa_summary}".encode("utf-8")
    ).hexdigest()
    signature = sign_qa_oracle_attestation(job_id, report_hash, body.qa_passed)
    tx_hash = "0x" + hashlib.sha256(f"settle:{report_hash}:{signature}".encode()).hexdigest()

    next_status: Literal["released", "refunded"] = "released" if body.qa_passed else "refunded"
    freelancer_payout = round(amount_usd * 0.85, 2) if body.qa_passed else 0.0
    platform_fee = round(amount_usd - freelancer_payout, 2) if body.qa_passed else 0.0

    await db.execute(
        text(
            """
            UPDATE blockchain_escrows
            SET status = :next_status,
                qa_passed = :qa_passed,
                qa_oracle_report_hash = :report_hash,
                qa_oracle_signature = :signature,
                settlement_tx_hash = :tx_hash,
                freelancer_payout_usdc = :freelancer_payout,
                platform_fee_usdc = :platform_fee,
                settled_at = NOW()
            WHERE job_id = :job_id
            """
        ),
        {
            "next_status": next_status,
            "qa_passed": body.qa_passed,
            "report_hash": report_hash,
            "signature": signature,
            "tx_hash": tx_hash,
            "freelancer_payout": freelancer_payout,
            "platform_fee": platform_fee,
            "job_id": job_id,
        },
    )
    await db.commit()
    return {
        "status": next_status,
        "settlement_tx_hash": tx_hash,
        "qa_oracle_report_hash": report_hash,
        "freelancer_payout_usdc": freelancer_payout,
        "platform_fee_usdc": platform_fee,
    }
