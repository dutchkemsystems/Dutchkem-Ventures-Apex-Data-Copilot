# Dutchkem Ventures Apex Data Copilot — 72-Hour NDPA Data Breach & Tamper Response Playbook

**Document ID:** `SEC-PLAYBOOK-NDPA-021D`  
**Effective Scope:** Public Plane (`/`), User/Dashboard Plane (`/dashboard`), Admin Control Plane (`/admin`), PostgreSQL RLS Vault, S3 Object Lock WORM Mirror, and `audit_merkle_chain`  
**Regulatory Anchor:** **Nigeria Data Protection Act (NDPA) 2023 · Section 40** (72-Hour Statutory Notification to the Nigeria Data Protection Commission — NDPC) and GDPR Article 33 alignment  
**Accountable Roles:** Data Protection Officer (`dpo`), Super Administrator (`super_admin`), Finance Controller (`finance`)

---

## 1. Fail-Closed Security Principle & Mandatory Escalation Triggers

Every security subsystem in Dutchkem Ventures Apex Data Copilot operates on a **fail-closed (deny-by-default)** architecture. When any of the following **Critical / High** triggers fire, system execution halts immediately, an entry is written to `security_incidents` (and `audit_merkle_chain` where uncompromised), and Super Admin + DPO alerts are dispatched via Email + Slack:

1. **`merkle_chain_tamper_detected` (CRITICAL — Immediate 72h Clock Start):**
   - `audit_merkle_chain` pre-write SHA-256 verification fails (`sha256(entry_data + previous_hash) !== entry_hash` or broken `previous_hash` chain link).
   - **Automatic Action:** Fail closed immediately (`HTTP 423 LOCKED`), freeze all subsequent ledger appends, preserve WORM S3 `COMPLIANCE` mirror snapshots, and page `dpo` + `super_admin`.
2. **`worm_mirror_failure` (HIGH):**
   - S3 Object Lock (`COMPLIANCE` mode) upload rejected or altered under strict WORM enforcement (`AUDIT_WORM_STRICT_S3=true`).
3. **`cross_plane_attempt` / `rls_violation_attempt` (CRITICAL):**
   - Unauthorized User Plane cookie/JWT attempting `/admin/*` access or PostgreSQL `app.current_org_id` tenant boundary probe.
4. **`passkey_phishing_origin_mismatch` / `passkey_replay_detected` (CRITICAL):**
   - Cloned YubiKey counter anomaly or non-allowlisted WebAuthn origin/RP ID during Admin/User authentication.
5. **`prompt_injection_attempt` / `impossible_travel_detected` / `anomaly_blocked_ip` (HIGH):**
   - Confirmed compromise attempt against HashiCorp Vault prompts or anomalous session hijack (>500 km in ≤60 min).
6. **Unauthorized PII / Kora Pay Payout / Audio Corpus Exposure:**
   - Unmasked export of `users.kora_recipient_id`, `escrow_ledger`, or NDA-protected `.wav` voice corpora outside `KEK_USER`/`KEK_ADMIN` isolation.

---

## 2. 72-Hour NDPA Statutory Notification Timeline

Under **Section 40(2) of the Nigeria Data Protection Act (NDPA) 2023**, where a personal data breach is likely to result in a risk to the rights and freedoms of individuals, the Data Controller (Dutchkem Ventures) **MUST notify the Nigeria Data Protection Commission (NDPC) within 72 hours** of becoming aware of the breach.

### Phase 1 · T + 0h to T + 2h — Immediate Containment & WORM Forensic Freeze
**Owners:** On-Call Security Engineer, `super_admin`, `dpo`

- [ ] **Start the Statutory 72-Hour Timer:** Record exact UTC detection timestamp (`T0`) in the DPO Incident War Room (`/admin/audit-ledger`).
- [ ] **Verify Cryptographic Integrity:** Inspect `/admin/api/audit-ledger/verify` and compare `merkle_root` against the latest sealed **S3 Object Lock (`COMPLIANCE`)** manifest (`x-amz-object-lock-mode: COMPLIANCE`).
- [ ] **Revoke Compromised Credentials (Fail Closed):**
  - Revoke active JWT sessions via `jwtBlocklist.revokeToken(...)` (Upstash Redis remaining-TTL blocklist).
  - Revoke affected per-tenant `sk_live_org_...` API keys in `/admin/prompt-vault`.
  - Revoke affected YubiKey / WebAuthn passkeys in `/admin/passkeys` and disable compromised user/admin accounts.
- [ ] **Preserve Immutable Evidence:** Do NOT overwrite logs or drop database tables. Export S3 Object Lock WORM keys (`worm_s3_key`, `Content-MD5`, `worm_retain_until`) for the impacted time window (`T0 - 24h` to `T0 + 2h`).
- [ ] **Pause Automated Pipelines if Needed:** Engage the AI Cost/Agent manual pause switch in `/admin/cost-controls` to halt automated QA/Payout releases while containment completes.

### Phase 2 · T + 2h to T + 12h — Forensic Scope, Blast Radius & NDPA Threshold Assessment
**Owners:** `dpo` (Lead), Platform Cryptography Engineer

- [ ] **Identify Affected Planes & Tenants:** Enumerate impacted `org_id` values, `user_id` records, and whether `KEK_USER` or `KEK_ADMIN` envelope keys were touched.
- [ ] **Verify Encryption-at-Rest Protection:** Confirm whether exposed payloads remained AES-256-GCM encrypted with non-compromised KMS KEKs (critical mitigation factor under NDPA risk assessment).
- [ ] **Determine Notification Obligation:**
  - *Likely Risk to Rights & Freedoms?* → **Mandatory NDPC Filing within 72h (Section 40(2)).**
  - *High Risk to Rights & Freedoms (unencrypted financial/KYC/biometric audio)?* → **Mandatory Direct Notification to Affected Data Subjects without undue delay (Section 40(3)).**
- [ ] **Document Root Cause:** Correlate `audit_merkle_chain` sequence indices, `anomaly_detector` scores, `impossible_travel_detected` geo logs, and `PromptGuard` incidents.

### Phase 3 · T + 12h to T + 48h — NDPC Formal Filing Preparation & Phased Submission
**Owners:** `dpo`, Legal Counsel, `super_admin`

Prepare and submit the statutory **NDPC Data Breach Notification Dossier** containing all required NDPA Section 40(4) elements:

1. **Nature of the Breach:** Attack vector, timeline (`T0`, discovery time, containment time), categories and approximate number of data subjects affected, and categories/volume of personal data records (e.g., emails, encrypted Kora Pay references, annotated `.wav` files).
2. **DPO Contact Details:** Name, verified email, and emergency hotline of the Dutchkem Ventures Data Protection Officer.
3. **Likely Consequences:** Concrete risk assessment covering identity theft, financial fraud, or confidentiality loss.
4. **Measures Taken or Proposed:** Immediate fail-closed containment, KMS KEK rotation, WebAuthn hardware re-binding, S3 WORM forensic preservation, and customer mitigation guidance.
5. **Phased Filing Clause (NDPA Section 40(5)):** If full forensic details remain under investigation at `T+48h`, submit the **Initial Notification** before `T+72h` and provide supplemental updates as new evidence is validated against S3 Object Lock records.

### Phase 4 · T + 48h to T + 72h — Data Subject Notification & Regulatory Confirmation
**Owners:** `dpo`, Support Lead, `super_admin`

- [ ] **Confirm NDPC Receipt Before `T+72h` Deadline:** Archive the NDPC submission acknowledgement reference hash inside a fresh sealed `audit_merkle_chain` entry (once chain integrity is verified/restored).
- [ ] **Notify Affected Data Subjects (if High Risk):** Dispatch clear, plain-language notices detailing:
  - What happened and when.
  - Specific data categories involved.
  - Mandatory security actions taken (forced session revocation, password/passkey reset).
  - Recommended protective steps (YubiKey/Passkey enrollment, bank monitoring if payouts were impacted) + DPO support contact.
- [ ] **Lock External Communications:** Ensure all user/public messaging is approved by `dpo` and Legal Counsel.

### Phase 5 · Post-72h — Cryptographic Recovery, KEK Rotation & Audit Closure
**Owners:** Cryptography Engineer, `dpo`, `super_admin`

- [ ] **Rotate Cryptographic Roots:**
  - Rotate `KEK_USER` and `KEK_ADMIN` via `/admin/api/encryption/rotate` (`kms-kek-*-vN+1`).
  - Rotate HashiCorp Vault prompt versions via `/admin/api/prompt-vault/rotate`.
  - Rotate `ADMIN_JWT_SECRET`, `USER_JWT_SECRET`, and `KORA_WEBHOOK_SECRET`.
- [ ] **Re-Anchor Verified Merkle Ledger:** Verify restoration against S3 Object Lock (`COMPLIANCE`) objects and record post-incident closure metadata (`NDPC-REF`, `postmortem_digest`) in `audit_merkle_chain`.
- [ ] **Complete 14-Day Post-Mortem:** Update automated AnomalyScore thresholds, PromptGuard rules, and moderation gates to permanently close the exploited vector.

---

## 3. Command & Escalation Contacts (Internal Matrix)

| Role | Scope | Required Auth Factor | Primary Action |
| :--- | :--- | :--- | :--- |
| **Data Protection Officer (`dpo`)** | NDPA Section 40 compliance, breach classification, NDPC filing | Admin Passkey (YubiKey) + TOTP | Leads 72h regulatory clock & subject notices |
| **Super Admin (`super_admin`)** | Full infrastructure revocation, KEK rotation, S3 WORM custody | Hardware YubiKey (`userVerification=required`) + TOTP | Executes containment & key rotations |
| **Finance Admin (`finance`)** | Kora Pay escrow freeze, split ledger audit | Admin Passkey + TOTP | Freezes high-value releases during containment |
| **External Regulator** | Nigeria Data Protection Commission (NDPC) | Statutory Portal / Formal DPO Filing | Must receive notification `<= 72 hours` from `T0` |

---

## 4. Technical Evidence Verification Commands

1. **Verify Full `audit_merkle_chain` Integrity (Admin API):**
   `POST /admin/api/audit-ledger/verify` — recomputes `SHA-256(entry_data + previous_hash)` across every row from Genesis (`0x000...000`) and validates the cumulative Merkle Root.
2. **Verify S3 Object Lock (WORM) Immutability:**
   Every sealed object carries `x-amz-object-lock-mode: COMPLIANCE`, a fixed `x-amz-object-lock-retain-until-date` (default 2,555 days / 7 years), and `Content-MD5` integrity digest preventing deletion or alteration even by AWS root accounts.
