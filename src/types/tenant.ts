export type SubscriptionTier =
  | "trial"
  | "starter"
  | "pro"
  | "agency"
  | "growth"
  | "enterprise_whitelabel";
export type UserRole = "admin" | "annotator" | "client";
export type ProjectRoleType = "tts_qa" | "prompt_eng" | "red_team";
export type ProjectStatus = "draft" | "active" | "paused" | "completed";
export type TaskStatus =
  | "pending"
  | "in_progress"
  | "in_review"
  | "approved"
  | "rejected";
export type EscrowStatus = "held" | "released" | "disputed" | "refunded";

export type JobBoard = "upwork" | "mercor" | "afterquery" | "telus_digital";
export type LeadStatus =
  | "scraped"
  | "proposal_drafted"
  | "submitted"
  | "won"
  | "archived";

export interface Organization {
  id: string;
  name: string;
  slug: string;
  subscription_tier: SubscriptionTier;
  korapay_customer_ref: string | null;
  trial_ends_at?: string | null;
  subscription_ends_at?: string | null;
  subscription_locked?: boolean;
  monthly_task_count?: number;
  monthly_task_limit?: number | null;
  created_at: string;
}

export interface TenantUser {
  id: string;
  org_id: string;
  full_name: string;
  email: string;
  role: UserRole;
  hourly_rate: number;
  is_active: boolean;
  avatar_url?: string | null;
  two_factor_enabled?: boolean;
  kora_recipient_id?: string | null;
  moderation_strikes?: number;
  is_suspended?: boolean;
  suspended_at?: string | null;
  suspension_reason?: string | null;
  onboarding_completed?: boolean;
  onboarding_step?: number;
}

export interface Project {
  id: string;
  org_id: string;
  name: string;
  role_type: ProjectRoleType;
  status: ProjectStatus;
  created_at: string;
}

export interface Task {
  id: string;
  org_id: string;
  project_id: string;
  assignee_id: string | null;
  title: string;
  input_payload: Record<string, unknown>;
  output_payload: Record<string, unknown> | null;
  status: TaskStatus;
  verifier_score: number | null;
  created_at: string;
}

export interface EscrowLedgerEntry {
  id: string;
  org_id: string;
  task_id: string;
  amount: number;
  platform_fee: number | null;
  annotator_payout: number;
  status: EscrowStatus;
  released_at: string | null;
  created_at: string;
}

export interface BidSubmission {
  id: string;
  org_id: string;
  lead_id: string;
  proposal_text: string;
  proposed_rate: number;
  turnaround_days: number;
  screening_answer: string;
  auto_submitted: boolean;
  submitted_at: string | null;
}

export interface JobLead {
  id: string;
  org_id: string;
  source_board: JobBoard;
  external_job_id: string;
  title: string;
  client_name: string;
  budget_display: string;
  matched_keywords: string[];
  raw_description: string;
  extracted_requirements: string[];
  status: LeadStatus;
  job_url: string;
  scraped_at: string;
  submission: BidSubmission | null;
}

export interface WorkspacePayload {
  organization: Organization;
  currentUser: TenantUser;
  users: TenantUser[];
  projects: Project[];
  tasks: Task[];
  escrowLedger: EscrowLedgerEntry[];
  crossTenantTargetHints: Array<{
    orgId: string;
    orgName: string;
    sampleTaskId: string;
    sampleTaskTitle: string;
  }>;
}

export interface RlsProbeResult {
  allowed: boolean;
  rowsReturned: number;
  sessionOrgId: string;
  sessionUserId: string;
  sessionRole: UserRole;
  targetResourceId: string;
  targetOwnerOrgId: string;
  sqlExecuted: string;
  policyEvaluated: string;
  summary: string;
}

export interface AudioQaReport {
  fileName: string;
  isMono: boolean;
  channels: number;
  sampleRateHz: number;
  bitsPerSample: number;
  durationSec: number;
  peakDbfs: number;
  noiseFloorDbfs: number;
  snrDb: number;
  transcript: string | null;
  wordErrorRate: number | null;
  checks: {
    mono: boolean;
    sampleRate24kHz: boolean;
    peakRange: boolean;
    noiseFloor: boolean;
    snr: boolean;
    wer: boolean;
  };
  passed: boolean;
  failureReasons: string[];
}

export interface BoundingBox {
  id: string;
  label: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export interface BoxEvaluation {
  boxId: string;
  label: string;
  matchedReferenceLabel: string | null;
  iou: number;
  flagged: boolean;
  reason: string | null;
}

export interface VisionQaReport {
  iouThreshold: number;
  totalBoxes: number;
  flaggedCount: number;
  meanIou: number;
  passed: boolean;
  evaluations: BoxEvaluation[];
}

export interface VideoQaReport {
  fileName: string;
  mimeType: string;
  containerFormat: string;
  fileSizeBytes: number;
  durationSec: number | null;
  width: number | null;
  height: number | null;
  hasAudioTrack: boolean;
  moderationAllowed: boolean;
  checks: {
    validContainer: boolean;
    durationValid: boolean;
    resolutionOk: boolean;
    moderationPassed: boolean;
  };
  passed: boolean;
  failureReasons: string[];
}

export interface CriterionScore {
  criterion: string;
  score: number;
  justification: string;
}

export interface TextLocalizationReport {
  overallScore: number;
  passed: boolean;
  criteriaScores: CriterionScore[];
  revisionSuggestion: string;
}

export type VoiceEngine = "gemini_tts" | "elevenlabs_v2" | "coqui_xtts";

export interface SyntheticSample {
  id: string;
  locale: string;
  accent: string;
  tone: string;
  phoneticComplexity: string;
  scriptText: string;
  ipaHint: string;
  voiceName: string;
  audioBase64: string | null;
}

export interface SyntheticDataset {
  id: string;
  org_id: string;
  name: string;
  voiceEngine: VoiceEngine;
  targetCount: number;
  locales: string[];
  accents: string[];
  tones: string[];
  createdAt: string;
  samples: SyntheticSample[];
}

export type AttackVector =
  | "prompt_injection"
  | "roleplay_jailbreak"
  | "logic_trap"
  | "system_exfiltration";

export interface RedTeamProbeOutcome {
  probeId: string;
  vector: AttackVector;
  adversarialPrompt: string;
  targetResponse: string;
  compromised: boolean;
  severity: "low" | "medium" | "high" | "critical";
  rationale: string;
}

export interface RedTeamBreakdown {
  vector: AttackVector;
  probes: number;
  failed: number;
  failureRatePct: number;
}

export interface RedTeamCampaign {
  id: string;
  org_id: string;
  targetModel: string;
  targetSystemPrompt: string;
  totalProbes: number;
  failedCount: number;
  vulnerabilityRatePct: number;
  executiveSummary: string;
  breakdown: RedTeamBreakdown[];
  outcomes: RedTeamProbeOutcome[];
  createdAt: string;
}

export type PayoutRail = "kora_pay" | "kora_pay_global";
export type VettingStatus = "pending_vetting" | "vetted" | "suspended";
export type MarketplaceBatchStatus =
  | "open"
  | "assigned"
  | "qa_failed"
  | "delivered_and_paid";

export interface ExpertProfile {
  id: string;
  org_id: string;
  user_id: string | null;
  full_name: string;
  email: string;
  native_locale: string;
  dialect: string;
  specialty: string;
  hourly_rate: number;
  payout_rail: PayoutRail;
  payout_account_ref: string;
  vetting_status: VettingStatus;
  sample_snr_db: number;
  completed_batches: number;
  created_at: string;
}

export interface MarketplaceBatch {
  id: string;
  org_id: string;
  client_name: string;
  title: string;
  target_locale: string;
  script_text: string;
  budget_amount: number;
  assigned_expert_id: string;
  status: MarketplaceBatchStatus;
  last_qa_report: AudioQaReport | null;
  delivered_at: string | null;
  created_at: string;
}

export interface PayoutTransaction {
  id: string;
  org_id: string;
  batch_id: string;
  expert_id: string;
  escrow_entry_id: string | null;
  payout_rail: PayoutRail;
  gross_amount: number;
  platform_fee_20pct: number | null;
  expert_payout_80pct: number;
  external_transfer_id: string;
  status: "settled" | "failed";
  created_at: string;
}

export interface TelemetryEvent {
  id: string;
  org_id: string;
  event_type:
    | "ws:connected"
    | "presence:joined"
    | "presence:left"
    | "task:created"
    | "task:updated"
    | "sales:scraped"
    | "sales:bid_submitted"
    | "qa:audio_evaluated"
    | "qa:vision_evaluated"
    | "qa:text_evaluated"
    | "qa:video_verified"
    | "factory:dataset_generated"
    | "redteam:audit_completed"
    | "marketplace:payout_settled"
    | "marketplace:qa_rejected"
    | "interview:practiced"
    | "health:probe_verified"
    | "b2b:api_key_created"
    | "b2b:api_call_metered"
    | "b2b:metered_invoice_settled"
    | "jobboard:job_posted"
    | "jobboard:bid_submitted"
    | "jobboard:escrow_funded"
    | "jobboard:escrow_split_released"
    | "affiliate:click_tracked"
    | "affiliate:signup_attributed"
    | "affiliate:commission_credited"
    | "affiliate:payout_withdrawn"
    | "pricing:surge_updated"
    | "insights:report_exported"
    | "kora_escrow:split_rule_configured"
    | "kora_escrow:recipient_onboarded"
    | "kora_escrow:fund_initialized"
    | "kora_escrow:funded"
    | "kora_escrow:released"
    | "kora_escrow:settled"
    | "kora_escrow:disputed"
    | "kora_escrow:refunded"
    | "kora_escrow:partial_released"
    | "kora_escrow:failed"
    | "onboarding:completed"
    | "certification:badge_issued"
    | "certification:priority_notified"
    | "data_marketplace:dataset_listed"
    | "data_marketplace:purchase_settled"
    | "coach:subscription_activated"
    | "coach:preflight_analyzed"
    | "blockchain_escrow:deposited"
    | "blockchain_escrow:released"
    | "blockchain_escrow:refunded";
  actor_name: string;
  summary: string;
  metric_label: string | null;
  created_at: string;
}

export interface LiveHealthSnapshot {
  org_id: string;
  connected_peers: number;
  rls_isolation_verified: boolean;
  active_tasks_count: number;
  approved_tasks_count: number;
  in_review_tasks_count: number;
  mean_verifier_score: number | null;
  escrow_held_usd: number;
  escrow_released_usd: number;
  qa_pass_rate_pct: number;
  marketplace_settled_count: number;
  mock_interviews_completed: number;
  last_updated_at: string;
}

export type InterviewTrack =
  | "tts_audio_qa"
  | "prompt_engineering"
  | "ai_red_teaming"
  | "bilingual_localization";

export interface MockInterviewQuestion {
  sessionId: string;
  track: InterviewTrack;
  voiceName: string;
  questionText: string;
  interviewerContext: string;
  keyRubricPoints: string[];
  questionAudioBase64: string | null;
}

export interface MockInterviewEvaluation {
  sessionId: string;
  track: InterviewTrack;
  questionText: string;
  candidateTranscript: string;
  toneScore: number;
  clarityScore: number;
  technicalAccuracyScore: number;
  overallScore: number;
  strengths: string[];
  coachingNotes: string;
  sampleImprovedAnswer: string;
  evaluatedAt: string;
}

export type B2BApiScope = "audio" | "vision" | "text";
export type B2BApiKeyStatus = "active" | "revoked" | "past_due";

export interface B2BApiKey {
  id: string;
  org_id: string;
  created_by_user_id: string;
  label: string;
  key_prefix: string;
  scopes: B2BApiScope[];
  total_calls: number;
  unbilled_calls: number;
  unit_price_usd: number;
  status: B2BApiKeyStatus;
  last_used_at: string | null;
  created_at: string;
}

export interface B2BApiUsageLog {
  id: string;
  org_id: string;
  api_key_id: string;
  key_prefix: string;
  endpoint: "/api/v1/qa/audio" | "/api/v1/qa/vision" | "/api/v1/qa/text";
  http_status: number;
  passed_gate: boolean;
  latency_ms: number;
  cost_usd: number;
  billed_invoice_id: string | null;
  created_at: string;
}

export interface B2BMeteredInvoice {
  id: string;
  org_id: string;
  kora_reference: string;
  billing_period: string;
  total_calls: number;
  amount_usd: number;
  charge_currency: "NGN" | "USD" | "GBP";
  charge_amount: number;
  checkout_url: string | null;
  provider_mode: "korapay_live" | "korapay_sandbox";
  status: "pending" | "paid" | "failed";
  paid_at: string | null;
  created_at: string;
}

export type ClientJobStatus = "awaiting_listing_fee" | "open" | "in_progress" | "completed";
export type ClientJobQaType = "audio" | "vision" | "text";
export type ClientJobEscrowStatus = "unfunded" | "funded" | "released" | "qa_rejected";

export type BlockchainEscrowStatus =
  | "pending_deposit"
  | "locked"
  | "released"
  | "refunded";

export interface BlockchainEscrowRecord {
  id: string;
  job_id: string;
  org_id: string;
  client_org_name: string;
  client_wallet_address: string;
  freelancer_name: string;
  freelancer_wallet_address: string;
  network: "polygon" | "polygon_amoy";
  chain_id: 137 | 80002;
  contract_address: string;
  usdc_token_address: string;
  amount_usd: number;
  amount_usdc_units: string;
  freelancer_payout_usdc: number | null;
  platform_fee_usdc: number | null;
  estimated_gas_usd: number;
  deposit_tx_hash: string | null;
  settlement_tx_hash: string | null;
  qa_oracle_report_hash: string | null;
  qa_oracle_signature: string | null;
  qa_passed: boolean | null;
  status: BlockchainEscrowStatus;
  block_number: number | null;
  locked_at: string | null;
  settled_at: string | null;
  created_at: string;
}

export interface MarketplaceJobPosting {
  id: string;
  org_id: string | null;
  client_org_name: string;
  client_email: string;
  title: string;
  description: string;
  qa_type: ClientJobQaType;
  budget_usd: number;
  listing_fee_usd: number;
  listing_fee_paid: boolean;
  listing_currency: "NGN" | "USD" | "GBP";
  kora_listing_ref: string;
  status: ClientJobStatus;
  escrow_status: ClientJobEscrowStatus;
  kora_escrow_ref: string | null;
  accepted_bid_id: string | null;
  last_qa_summary: string | null;
  last_qa_passed: boolean | null;
  freelancer_payout_85pct: number | null;
  platform_fee_15pct: number | null;
  kora_disbursement_ref: string | null;
  blockchain_escrow_eligible?: boolean;
  blockchain_escrow?: BlockchainEscrowRecord | null;
  created_at: string;
  completed_at: string | null;
}

export interface MarketplaceJobBid {
  id: string;
  job_id: string;
  applicant_org_id: string | null;
  freelancer_name: string;
  freelancer_email: string;
  bid_amount_usd: number;
  turnaround_days: number;
  pitch: string;
  status: "pending" | "accepted" | "rejected";
  created_at: string;
  is_verified?: boolean;
  certification_tier?: CertificationTier | null;
  certification_score?: number | null;
  credential_id?: string | null;
}

export interface ReferralClick {
  id: string;
  referrer_user_id: string;
  visitor_fingerprint: string;
  landing_path: string;
  user_agent: string;
  clicked_at: string;
}

export interface ReferralAttribution {
  id: string;
  referrer_user_id: string;
  referred_org_id: string;
  referred_org_name: string;
  referred_user_email: string;
  subscription_tier: SubscriptionTier;
  cookie_value: string;
  attributed_at: string;
  converted_at: string | null;
}

export interface ReferralCommission {
  id: string;
  referrer_user_id: string;
  referred_org_id: string;
  referred_org_name: string;
  kora_subscription_ref: string;
  plan_tier: "pro" | "agency";
  gross_subscription_usd: number;
  commission_rate: number;
  commission_usd: number;
  billing_cycle_month: string;
  status: "credited" | "paid_out";
  payout_reference: string | null;
  payout_currency: "NGN" | "USD" | "GBP" | null;
  created_at: string;
  paid_out_at: string | null;
}

export interface AffiliatePayout {
  id: string;
  referrer_user_id: string;
  payout_reference: string;
  currency: "NGN" | "USD" | "GBP";
  amount_usd: number;
  settled_amount: number;
  commissions_count: number;
  provider_mode: "korapay_live" | "korapay_sandbox";
  status: "settled";
  created_at: string;
}

export interface AffiliateSummary {
  referralLink: string;
  referralCode: string;
  commissionRatePct: number;
  cookieMaxAgeDays: number;
  clicks: number;
  signups: number;
  conversions: number;
  totalEarnedUsd: number;
  availableUsd: number;
  withdrawnUsd: number;
  recentClicks: ReferralClick[];
  attributions: ReferralAttribution[];
  commissions: ReferralCommission[];
  payouts: AffiliatePayout[];
}

export interface LanguageSurgeRule {
  locale: string;
  label: string;
  activeJobsCount: number;
  demandLevel: "normal" | "high_demand" | "surge";
  multiplier: number;
  autoSurge: boolean;
  effectiveAudioRateUsd: number;
}

export interface SurgePricingConfig {
  baseUnitPriceUsd: number;
  audio_qa_multiplier: number;
  vision_qa_multiplier: number;
  text_qa_multiplier: number;
  auto_language_surge_enabled: boolean;
  effectiveRatesUsd: {
    audio: number;
    vision: number;
    text: number;
  };
  languageRules: LanguageSurgeRule[];
  updatedAt: string;
  updatedBy: string;
}

export interface AnonymizedQaFailureMetric {
  checkName: string;
  module: "audio" | "vision" | "text";
  thresholdSpec: string;
  failedCount: number;
  shareOfFailuresPct: number;
}

export interface ModuleBenchmarkMetric {
  module: "audio" | "vision" | "text";
  label: string;
  totalProcessedUnits: number;
  unitLabel: string;
  passRatePct: number;
  effectivePricePerCallUsd: number;
}

export interface AdminInsightsOverview {
  totalAudioHoursProcessed: number;
  totalEvaluationsAcrossModules: number;
  topFailedQaCheck: string;
  topFailedCheckRatePct: number;
  globalQaPassRatePct: number;
  surgeRevenueUpliftMonthlyUsd: number;
  activeSurgeLanguagesCount: number;
  failureBreakdown: AnonymizedQaFailureMetric[];
  moduleBenchmarks: ModuleBenchmarkMetric[];
  generatedAt: string;
}

export type KoraEscrowCurrency = "NGN" | "USD";

export type KoraEscrowStatus =
  | "pending_funding"
  | "funded"
  | "released"
  | "settled"
  | "disputed"
  | "refunded"
  | "failed";

export interface KoraMarketplaceSplitRule {
  name: string;
  freelancerSharePct: number;
  platformSharePct: number;
  platformSettlementAccount: string;
  supportedCurrencies: KoraEscrowCurrency[];
  settlementWindowDays: number;
  vatRateOnPlatformFeePct: number;
  active: boolean;
  updatedAt: string;
}

export interface TaxReceiptRecord {
  id: string;
  receipt_number: string;
  escrow_id: string;
  freelancer_name: string;
  kora_recipient_id: string;
  currency: KoraEscrowCurrency;
  gross_amount: number;
  platform_fee: number;
  vat_on_fee: number;
  net_payout: number;
  kora_transaction_id: string;
  split_rule_name: string;
  generated_at: string;
}

export interface KoraEscrowLedgerItem {
  id: string;
  task_id: string;
  task_title: string;
  client_id: string;
  client_name: string;
  freelancer_id: string;
  freelancer_name: string;
  freelancer_recipient_id: string | null;
  gross_amount: number;
  currency: KoraEscrowCurrency;
  platform_fee: number;
  freelancer_payout: number;
  kora_transaction_reference: string;
  kora_split_reference: string | null;
  status: KoraEscrowStatus;
  created_at: string;
  expected_settlement_at: string | null;
  settled_at: string | null;
  tax_receipt_id: string | null;
  tax_receipt_url: string | null;
  qa_passed?: boolean | null;
  qa_report_summary?: string | null;
  failure_rate_pct?: number | null;
  kora_refund_reference?: string | null;
  partial_split_pct?: number | null;
  failure_reason?: string | null;
  failed_at?: string | null;
}

export interface KoraWebhookEventRecord {
  id: string;
  event_id: string;
  event_type:
    | "charge.success"
    | "transfer.completed"
    | "transfer.failed"
    | "transfer.refunded"
    | string;
  signature_valid: boolean;
  payload_sha256: string;
  escrow_id: string | null;
  reference: string | null;
  raw_summary: string;
  processed_at: string;
}

export interface KoraAdminWebhookAlert {
  id: string;
  escrow_id: string;
  event_id: string;
  event_type: "transfer.failed";
  reference: string;
  freelancer_name: string;
  amount: number;
  currency: KoraEscrowCurrency;
  reason: string;
  acknowledged: boolean;
  created_at: string;
}

export interface KoraEnvReadiness {
  KORA_PUBLIC_KEY: boolean;
  KORA_SECRET_KEY: boolean;
  KORA_WEBHOOK_SECRET: boolean;
  KORA_ENCRYPTION_KEY: boolean;
}

export interface KoraEscrowSetupOverview {
  splitRule: KoraMarketplaceSplitRule;
  envReadiness: KoraEnvReadiness;
  currentUserRecipientId: string | null;
  freelancers: Array<{
    id: string;
    full_name: string;
    email: string;
    role: UserRole;
    kora_recipient_id: string | null;
  }>;
  escrowLedger: KoraEscrowLedgerItem[];
  taxReceipts: TaxReceiptRecord[];
  webhookEvents: KoraWebhookEventRecord[];
  adminWebhookAlerts: KoraAdminWebhookAlert[];
  usdToNgnRate: number;
}

export interface KoraFundEscrowResponse {
  escrow_id: string;
  task_id: string;
  reference: string;
  amount: number;
  currency: KoraEscrowCurrency;
  checkout_url: string;
  status: "pending_funding";
  split_triggered: false;
  provider_mode: "korapay_live" | "korapay_sandbox";
  provider_message?: string | null;
}

export interface ModerationEventRecord {
  id: string;
  org_id: string;
  user_id: string;
  user_email: string;
  user_name: string;
  asset_type: "image" | "video" | "audio" | "text";
  file_name: string | null;
  scanner: string;
  verdict: "approved" | "blocked";
  categories: string[];
  confidence: number;
  reason: string | null;
  strike_number: number;
  auto_banned: boolean;
  created_at: string;
}

export interface ModerationStatusResponse {
  moderationStrikes: number;
  maxStrikes: number;
  strikesRemaining: number;
  isSuspended: boolean;
  suspendedAt: string | null;
  suspensionReason: string | null;
  recentEvents: ModerationEventRecord[];
}

export interface CostControlUserStatus {
  circuitOpen: boolean;
  highTrafficMessage: string | null;
  tier: SubscriptionTier;
  qaHourlyLimit: number;
  qaRemainingThisHour: number;
  b2bHourlyLimit: number;
  backend: "upstash_redis_rest" | "in_memory_sliding_window";
}

export type CertificationTier = "verified" | "expert";
export type CertificationCurrency = "USD" | "NGN" | "GBP";

export interface CertificationExamQuestionPublic {
  id: string;
  category: string;
  prompt: string;
  options: string[];
}

export interface CertificationAttempt {
  id: string;
  user_id: string;
  org_id: string;
  full_name: string;
  email: string;
  payment_reference: string;
  payment_currency: CertificationCurrency;
  charge_amount: number;
  amount_usd: number;
  payment_status: "pending" | "paid" | "failed";
  latest_score: number | null;
  passed: boolean | null;
  created_at: string;
  graded_at: string | null;
}

export interface FreelancerCertification {
  id: string;
  user_id: string;
  org_id: string;
  full_name: string;
  email: string;
  specialty: string;
  locale: string;
  tier: CertificationTier;
  score: number;
  exam_session_id: string;
  payment_reference: string;
  payment_currency: CertificationCurrency;
  payment_amount_usd: number;
  payment_verified: boolean;
  badge_svg: string;
  credential_json: Record<string, unknown>;
  credential_sha256: string;
  issued_at: string;
}

export interface PriorityJobNotification {
  id: string;
  user_id: string;
  certification_id: string;
  job_id: string;
  job_title: string;
  client_org_name: string;
  budget_usd: number;
  tier: CertificationTier;
  priority_window_minutes: number;
  read_at: string | null;
  created_at: string;
}

export interface VerifiedFreelancerDirectoryEntry {
  user_id: string;
  org_id: string;
  full_name: string;
  email: string;
  specialty: string;
  locale: string;
  hourly_rate: number;
  is_verified: boolean;
  tier: CertificationTier | null;
  score: number | null;
  credential_id: string | null;
  issued_at: string | null;
  priority_rank: number;
}

export type DatasetCategory =
  | "audio_speech"
  | "vision_bbox"
  | "multilingual_text"
  | "red_team_eval";

export interface MarketplaceDataset {
  id: string;
  seller_id: string;
  seller_name: string;
  seller_email: string;
  org_id: string;
  org_name: string;
  title: string;
  description: string;
  category: DatasetCategory;
  sample_count: number;
  price: number;
  anonymized: boolean;
  qa_validated: boolean;
  qa_score: number;
  qa_report_summary: string;
  source_ref: string;
  locale: string;
  format_spec: string;
  preview_samples: string[];
  purchases_count: number;
  status: "listed" | "archived";
  created_at: string;
}

export interface DatasetPurchaseRecord {
  id: string;
  dataset_id: string;
  dataset_title: string;
  seller_id: string;
  seller_name: string;
  buyer_org_name: string;
  buyer_email: string;
  gross_price_usd: number;
  platform_commission_10pct: number;
  seller_payout_90pct: number;
  currency: CertificationCurrency;
  charge_amount: number;
  kora_reference: string;
  kora_split_reference: string;
  payment_status: "pending" | "paid" | "failed";
  download_token: string | null;
  created_at: string;
  paid_at: string | null;
}

export type CoachModality = "audio" | "vision" | "text";

export interface CoachProSubscription {
  id: string;
  user_id: string;
  org_id: string;
  full_name: string;
  email: string;
  tier_name: "coach_pro";
  tier_label: "Coach Pro";
  monthly_price_usd: number;
  currency: CertificationCurrency;
  charge_amount: number;
  kora_reference: string;
  kora_subscription_code: string | null;
  status: "pending" | "active" | "canceled" | "past_due";
  current_period_start: string | null;
  current_period_end: string | null;
  created_at: string;
}

export interface CoachIssueItem {
  item: string;
  severity: "critical" | "high" | "medium";
  metric: string;
  measured: string;
  target: string;
  summary: string;
}

export interface CoachAudioFileReport {
  fileName: string;
  isMono: boolean;
  channels: number;
  sampleRateHz: number;
  durationSec: number;
  peakDbfs: number;
  noiseFloorDbfs: number;
  snrDb: number;
  passed: boolean;
}

export interface CoachPreflightReport {
  id: string;
  user_id: string;
  org_id: string;
  subscription_id: string;
  modality: CoachModality;
  files_count: number;
  predicted_pass_rate_pct: number;
  verdict: "ready_for_job" | "needs_remediation";
  issues: CoachIssueItem[];
  suggestions: string[];
  audio_files?: CoachAudioFileReport[];
  created_at: string;
}
