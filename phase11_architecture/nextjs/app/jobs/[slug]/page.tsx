import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

interface JobSeoRecord {
  slug: string;
  title: string;
  metaTitle: string;
  metaDescription: string;
  primaryKeyword: string;
  platformFocus: string;
  hourlyRateRange: string;
  qaGateSpec: string;
  headline: string;
  summary: string;
  deliverables: string[];
  checklist: string[];
}

const JOB_SEO_CATALOG: JobSeoRecord[] = [
  {
    slug: "tts-audio-qa",
    title: "TTS Audio QA Automation",
    metaTitle: "TTS Audio QA Automation | 24kHz Mono SNR Verification",
    metaDescription: "Automate TTS voice dataset QA with librosa 24kHz mono checks, > 35 dB SNR gates, and Whisper WER scoring.",
    primaryKeyword: "tts audio qa",
    platformFocus: "TELUS Digital · ElevenLabs · Mercor Voice",
    hourlyRateRange: "$35 – $65 / hr",
    qaGateSpec: "Mono · 24,000 Hz · Peak -6 to -3 dBFS · Noise < -70 dBFS · SNR > 35 dB",
    headline: "Pass Every TTS Audio QA Rubric on the First Submission.",
    summary: "Run deterministic librosa acoustics and Whisper WER verification before client upload.",
    deliverables: ["WAV DSP acoustic gate", "Noise floor < -70 dBFS enforcement", "Whisper WER <= 5% verification"],
    checklist: ["Record in treated booth <= -72 dBFS", "Export 24kHz Mono PCM WAV", "Normalize peaks inside -6 to -3 dBFS"],
  },
  {
    slug: "multilingual-prompt-engineering",
    title: "Multilingual Prompt Engineering QA",
    metaTitle: "Multilingual Prompt Engineering Jobs & Rubric QA",
    metaDescription: "Scale ES-ES, FR-FR, Yoruba, Igbo, and Hausa LLM prompt engineering contracts with deterministic rubric grading.",
    primaryKeyword: "multilingual prompt engineering",
    platformFocus: "AfterQuery · Scale AI · Mercor",
    hourlyRateRange: "$40 – $85 / hr",
    qaGateSpec: "1–5 Integer Rubric · Semantic Accuracy · Idiomatic Tone · Format Lock",
    headline: "Win & Scale High-Ticket Multilingual Prompt Engineering Contracts.",
    summary: "Standardize native rubric grading across distributed linguists inside a tenant-isolated workspace.",
    deliverables: ["1–5 deterministic rubric scoring", "Non-English red-team prompt checks", "Automated 80/20 escrow payout"],
    checklist: ["Anchor idioms to regional locale", "Preserve JSON/Markdown formatting", "Audit numeric conversions"],
  },
  {
    slug: "video-annotation-qa",
    title: "Video Annotation QA (YOLOv8 IoU)",
    metaTitle: "Video Annotation QA | Automated YOLOv8 IoU >= 0.70 Gate",
    metaDescription: "Eliminate bounding box rejection fees on robotics and dashcam contracts with automated YOLOv8 IoU >= 0.70 verification.",
    primaryKeyword: "video annotation qa",
    platformFocus: "Upwork Computer Vision · Robotics OEMs",
    hourlyRateRange: "$30 – $75 / hr",
    qaGateSpec: "Mean IoU >= 0.70 · Zero Class Mismatch · Temporal Track Continuity",
    headline: "Zero Rejected Frames: Automate Computer Vision Bounding Box QA.",
    summary: "Compare annotator bounding boxes against YOLOv8 detections automatically before client delivery.",
    deliverables: ["Per-box IoU >= 0.70 gate", "Instant class mismatch detection", "Rework queue routing"],
    checklist: ["Keep box edges within 2px", "Preserve track_id on occlusion", "Run IoU audit before COCO export"],
  },
  {
    slug: "voice-cloning-rubric-qa",
    title: "Voice Cloning Rubric QA",
    metaTitle: "Voice Cloning Project QA & TELUS Digital Prep",
    metaDescription: "Verify studio voice cloning recordings for TELUS Digital and neural TTS labs with automated SNR checks.",
    primaryKeyword: "voice cloning rubric qa",
    platformFocus: "TELUS Digital · Defined.ai · LXT",
    hourlyRateRange: "$35 – $60 / hr",
    qaGateSpec: "Noise Floor < -70 dBFS · Zero Plosives · Prosody Variance Check",
    headline: "Pass Strict Neural Voice Cloning Audits Without Retakes.",
    summary: "Audit breathiness, plosives, room reverb, and transcript adherence before buyer QA.",
    deliverables: ["Crest factor & room floor audit", "Multi-accent comparison tracks", "Per-batch compliance certificate"],
    checklist: ["6-inch off-axis mic distance", "400ms clean silence tails", "Verify script emotional valence"],
  },
  {
    slug: "yolo-bounding-box-auditor",
    title: "YOLO Bounding Box Auditor",
    metaTitle: "YOLO Bounding Box Auditor for Annotation Agencies",
    metaDescription: "Inspect polygon and 2D bounding box submissions against YOLOv8 baselines to safeguard client SLAs.",
    primaryKeyword: "yolo bounding box auditor",
    platformFocus: "Upwork Enterprise · Manufacturing Vision",
    hourlyRateRange: "$45 – $90 / hr",
    qaGateSpec: "IoU >= 0.70 · Label Integrity · Zero Crowd Clutter Drift",
    headline: "Protect Agency Vision SLAs with Deterministic IoU Audits.",
    summary: "Score every annotator submission against reference boxes with single-click rework tracking.",
    deliverables: ["Box-by-box IoU ledger", "Side-by-side bounding overlay", "Annotator accuracy telemetry"],
    checklist: ["Audit occlusion edges", "Align custom class ontology", "Hold escrow below 0.70 IoU"],
  },
  {
    slug: "rlhf-reasoning-evaluation",
    title: "RLHF Reasoning & STEM Evaluation",
    metaTitle: "RLHF STEM Reasoning Evaluation & Rubric Platform",
    metaDescription: "Manage expert PhD/software annotators on RLHF reasoning, code grading, and chain-of-thought verification.",
    primaryKeyword: "rlhf reasoning evaluation",
    platformFocus: "Mercor · Scale AI · Toloka",
    hourlyRateRange: "$60 – $120 / hr",
    qaGateSpec: "Step-by-Step Verification · Unit-Test Grounding",
    headline: "Coordinate High-Skill RLHF Reasoning Teams at Agency Margin.",
    summary: "Track preference rankings, rubric citations, and split client milestones 80/20 cleanly.",
    deliverables: ["Multi-criterion rubric engine", "Sealed prompt vault security", "80/20 escrow payout ledger"],
    checklist: ["Verify math derivations", "Cite preference justifications", "Enforce RLS tenant isolation"],
  },
  {
    slug: "asr-whisper-wer-verification",
    title: "ASR Whisper WER Verification",
    metaTitle: "ASR Transcription & Whisper WER Verification Pipeline",
    metaDescription: "Benchmark speech transcriptions against Whisper STT to enforce <= 5% Word Error Rate before delivery.",
    primaryKeyword: "asr whisper wer verification",
    platformFocus: "Deepgram · Speechmatics · Appen",
    hourlyRateRange: "$30 – $55 / hr",
    qaGateSpec: "WER <= 5.0% · Punctuation Alignment",
    headline: "Eliminate Transcription Rejections with Automated WER Benchmarking.",
    summary: "Compare reference transcripts against acoustic waveforms with instant mismatch highlights.",
    deliverables: ["Per-utterance WER computation", "Combined SNR + STT QA badge", "Flagged clip queue"],
    checklist: ["Standardize disfluency rules", "Check VAD silence bounds", "Verify speaker diarization"],
  },
  {
    slug: "synthetic-speech-dataset-factory",
    title: "Synthetic Speech Dataset Factory",
    metaTitle: "Synthetic Speech Dataset Factory | 10,000-Sample Scaling",
    metaDescription: "Generate and audit 10,000+ multilingual synthetic speech utterances with controllable prosody and QA proof.",
    primaryKeyword: "synthetic speech dataset factory",
    platformFocus: "Voice AI Startups · Automotive IVR",
    hourlyRateRange: "$2,500 – $15,000 / contract",
    qaGateSpec: "Multi-Locale Accents · Real Acoustic QA Pass",
    headline: "Scale Custom Voice Datasets to 10,000+ Samples in Hours.",
    summary: "Package multilingual speech corpora with deterministic SNR and WER delivery manifests.",
    deliverables: ["Utterance permutation matrices", "Auditable > 35 dB SNR proof", "Fine-tuning manifest JSON"],
    checklist: ["Balance dialect phonemes", "Include edge prosody takes", "Attach batch QA manifests"],
  },
  {
    slug: "telus-digital-ai-rater-prep",
    title: "TELUS Digital AI Rater Prep",
    metaTitle: "TELUS Digital Voice & AI Rater Qualification Guide",
    metaDescription: "Practice live spoken interview drills and pass strict acoustic & rubric qualification tests.",
    primaryKeyword: "telus digital ai rater prep",
    platformFocus: "TELUS Digital AI Community",
    hourlyRateRange: "$25 – $55 / hr",
    qaGateSpec: "Mock Interview Readiness · Rubric Accuracy >= 90%",
    headline: "Train & Certify Your Annotators Before Qualification Exams.",
    summary: "Simulate live vendor screening questions and verify studio audio hardware before official tests.",
    deliverables: ["AI Interview Coach drills", "Specificity & rubric critique", "Pre-flight mic verification"],
    checklist: ["Run 5-second room-tone test", "Review locale rubric guides", "Practice STAR metric answers"],
  },
  {
    slug: "mercor-expert-interview-prep",
    title: "Mercor Expert Interview Prep",
    metaTitle: "Mercor AI Expert Interview Simulator & Readiness",
    metaDescription: "Prepare domain experts for Mercor technical interviews with real-time AI voice simulation.",
    primaryKeyword: "mercor expert interview prep",
    platformFocus: "Mercor · Upwork Talent Cloud",
    hourlyRateRange: "$65 – $150 / hr",
    qaGateSpec: "Domain Depth Score >= 85%",
    headline: "Help Senior Specialists Ace Automated AI Technical Screenings.",
    summary: "Practice domain interviews with structured technical follow-ups and instant scoring.",
    deliverables: ["Role-tailored interviewer probes", "Quantified critique feedback", "Verified marketplace onboarding"],
    checklist: ["Prepare 3 edge-case stories", "Cite IoU/WER/SNR metrics", "Use noise-free headset audio"],
  },
  {
    slug: "multimodal-red-teaming-qa",
    title: "Multimodal Red-Teaming & Safety QA",
    metaTitle: "Adversarial LLM Red-Teaming & Safety Audit Service",
    metaDescription: "Detect jailbreaks, PII leaks, and refusal bypasses systematically with automated red-team scorecards.",
    primaryKeyword: "multimodal red teaming qa",
    platformFocus: "Foundation Model Labs · Enterprise Fintech",
    hourlyRateRange: "$70 – $140 / hr",
    qaGateSpec: "OWASP LLM Top 10 · PII Leak Zero",
    headline: "Deliver Repeatable Adversarial Red-Teaming Audits for AI Labs.",
    summary: "Combine automated adversarial probe suites with human bypass specialists rigorously.",
    deliverables: ["Reproducible jailbreak logs", "Severity policy mapping", "Verified remediation checks"],
    checklist: ["Test multi-turn roleplay", "Audit multilingual parity", "Check JSON PII boundaries"],
  },
  {
    slug: "automotive-lidar-bbox-qa",
    title: "Automotive & Robotics Perception QA",
    metaTitle: "Automotive Perception & Dashcam Annotation QA",
    metaDescription: "Maintain sub-pixel lane and vulnerable road user accuracy with automated IoU gates.",
    primaryKeyword: "automotive lidar bbox qa",
    platformFocus: "ADAS Suppliers · Autonomous Mobility",
    hourlyRateRange: "$40 – $85 / hr",
    qaGateSpec: "IoU >= 0.70 · Critical VRU Recall 99.5%+",
    headline: "Enforce ADAS Perception Quality Before Batches Ship.",
    summary: "Automate geometry overlap verification across dashcam datasets prior to milestone escrow.",
    deliverables: ["Per-class IoU compliance", "Rejection routing", "Escrow gate protection"],
    checklist: ["Check <12px traffic signals", "Eliminate sky box padding", "Audit occluded pedestrian tracks"],
  },
];

export function generateStaticParams() {
  return JOB_SEO_CATALOG.map((job) => ({ slug: job.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const job = JOB_SEO_CATALOG.find((item) => item.slug === slug);
  if (!job) {
    return { title: "AI Data Job Guide | Dutchkem Ventures" };
  }
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "https://apex.dutchkemventures.com";
  return {
    title: job.metaTitle,
    description: job.metaDescription,
    keywords: [job.primaryKeyword, "Dutchkem Ventures", "AI Data Copilot", "Automated QA"],
    alternates: { canonical: `${baseUrl}/jobs/${job.slug}` },
    openGraph: {
      title: job.metaTitle,
      description: job.metaDescription,
      type: "website",
      url: `${baseUrl}/jobs/${job.slug}`,
      images: [`${baseUrl}/api/og?title=${encodeURIComponent(job.title)}`],
    },
    twitter: {
      card: "summary_large_image",
      title: job.metaTitle,
      description: job.metaDescription,
    },
  };
}

export default async function JobLandingPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const job = JOB_SEO_CATALOG.find((item) => item.slug === slug);
  if (!job) notFound();

  return (
    <main className="min-h-screen bg-[#F8FAFC] text-[#0F172A] px-6 py-16">
      <div className="mx-auto max-w-4xl space-y-10">
        <header className="space-y-4 border-b border-slate-200 pb-8">
          <p className="text-xs font-mono text-amber-700">
            {job.platformFocus} · {job.hourlyRateRange}
          </p>
          <h1 className="text-4xl font-semibold tracking-tight text-slate-900 text-balance">
            {job.headline}
          </h1>
          <p className="text-base text-slate-600 leading-relaxed">{job.summary}</p>
          <div className="pt-2 flex flex-wrap gap-3">
            <Link
              href="/pricing"
              className="px-6 py-3 text-sm font-semibold rounded-md bg-gradient-to-r from-amber-400 via-yellow-400 to-amber-500 text-slate-950"
            >
              Start Your Free Trial
            </Link>
            <Link
              href="/"
              className="px-6 py-3 text-sm font-medium rounded-md border border-slate-300 bg-white text-slate-900"
            >
              Explore Apex Copilot
            </Link>
          </div>
        </header>

        <section className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="rounded-xl border border-slate-200 bg-white p-6 space-y-3">
            <h2 className="text-base font-semibold text-slate-900">Automated QA Specification</h2>
            <p className="text-xs font-mono text-amber-700">{job.qaGateSpec}</p>
            <ul className="space-y-2 text-sm text-slate-600 list-disc pl-5">
              {job.deliverables.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-6 space-y-3">
            <h2 className="text-base font-semibold text-slate-900">Pre-Submission Checklist</h2>
            <ul className="space-y-2 text-sm text-slate-600 list-disc pl-5">
              {job.checklist.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>
        </section>
      </div>
    </main>
  );
}
