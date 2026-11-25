import type { EscrowLedgerEntry, MarketplaceJobPosting, Task } from "../types/tenant";

export const OFFLINE_SCRIPTS_STORAGE_KEY = "apex_offline_assigned_scripts_v1";
const OFFLINE_SCRIPTS_CACHE_NAME = "apex-assigned-scripts-v1";
const OFFLINE_SCRIPTS_SNAPSHOT_URL = "/offline-scripts-snapshot.json";

export interface OfflineAssignedScript {
  id: string;
  source: "workspace_task" | "job_board";
  title: string;
  orgOrClient: string;
  qaType: "audio" | "vision" | "text" | "general";
  status: string;
  scriptBody: string;
  qaRubric: string;
  payoutUsd: number;
  cachedAt: string;
}

function defaultQaRubric(qaType: OfflineAssignedScript["qaType"]): string {
  if (qaType === "audio") {
    return "24kHz Mono WAV · SNR > 35 dB · Peak -6 to -3 dBFS · Noise floor < -70 dBFS";
  }
  if (qaType === "vision") {
    return "YOLOv8 bounding-box IoU >= 0.85 · Zero unblurred PII faces/plates";
  }
  if (qaType === "text") {
    return "Native dialect fluency · PromptGuard clean · Zero PII leakage";
  }
  return "Pass automated multi-modal QA rubric before escrow release";
}

function inferQaType(text: string): OfflineAssignedScript["qaType"] {
  const lower = text.toLowerCase();
  if (lower.includes("24khz") || lower.includes("audio") || lower.includes("utterance") || lower.includes("snr")) {
    return "audio";
  }
  if (lower.includes("yolo") || lower.includes("iou") || lower.includes("vision") || lower.includes("bounding")) {
    return "vision";
  }
  if (lower.includes("text") || lower.includes("translation") || lower.includes("prompt")) {
    return "text";
  }
  return "general";
}

function persistSnapshot(scripts: OfflineAssignedScript[]): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(OFFLINE_SCRIPTS_STORAGE_KEY, JSON.stringify(scripts));
  } catch {
    // Ignore storage quota errors
  }

  if ("caches" in window) {
    window.caches
      .open(OFFLINE_SCRIPTS_CACHE_NAME)
      .then((cache) =>
        cache.put(
          OFFLINE_SCRIPTS_SNAPSHOT_URL,
          new Response(JSON.stringify({ cachedAt: new Date().toISOString(), scripts }), {
            headers: { "Content-Type": "application/json" },
          })
        )
      )
      .catch(() => {});
  }
}

export function getCachedOfflineScripts(): OfflineAssignedScript[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(OFFLINE_SCRIPTS_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as OfflineAssignedScript[]) : [];
  } catch {
    return [];
  }
}

export async function hydrateCachedOfflineScripts(): Promise<OfflineAssignedScript[]> {
  const local = getCachedOfflineScripts();
  if (local.length > 0) return local;
  if (typeof window !== "undefined" && "caches" in window) {
    try {
      const cache = await window.caches.open(OFFLINE_SCRIPTS_CACHE_NAME);
      const res = await cache.match(OFFLINE_SCRIPTS_SNAPSHOT_URL);
      if (res) {
        const data = (await res.json()) as { scripts?: OfflineAssignedScript[] };
        if (Array.isArray(data.scripts)) {
          return data.scripts;
        }
      }
    } catch {
      // Ignore cache read error
    }
  }
  return [];
}

function mergeScripts(incoming: OfflineAssignedScript[]): OfflineAssignedScript[] {
  const existing = getCachedOfflineScripts();
  const map = new Map<string, OfflineAssignedScript>();
  for (const item of existing) {
    map.set(item.id, item);
  }
  for (const item of incoming) {
    map.set(item.id, item);
  }
  const merged = Array.from(map.values()).slice(0, 50);
  persistSnapshot(merged);
  return merged;
}

export function cacheWorkspaceScripts(
  tasks: Task[],
  orgName: string,
  escrowLedger: EscrowLedgerEntry[] = []
): OfflineAssignedScript[] {
  if (!Array.isArray(tasks) || tasks.length === 0) {
    return getCachedOfflineScripts();
  }
  const now = new Date().toISOString();
  const payoutByTaskId = new Map<string, number>();
  for (const entry of escrowLedger) {
    payoutByTaskId.set(entry.task_id, Number(entry.annotator_payout ?? entry.amount ?? 0));
  }

  const entries: OfflineAssignedScript[] = tasks.map((task) => {
    const payload = task.input_payload ?? {};
    const scriptTextRaw =
      (typeof payload.script_note === "string" && payload.script_note) ||
      (typeof payload.script === "string" && payload.script) ||
      (typeof payload.prompt === "string" && payload.prompt) ||
      (typeof payload.instructions === "string" && payload.instructions) ||
      "";
    const combinedText = `${task.title} ${scriptTextRaw}`;
    const qaType = inferQaType(combinedText);
    const payloadAmount = typeof payload.amount === "number" ? payload.amount : 0;
    return {
      id: `task:${task.id}`,
      source: "workspace_task",
      title: task.title,
      orgOrClient: orgName || "Apex Workspace",
      qaType,
      status: task.status,
      scriptBody:
        scriptTextRaw.trim() ||
        `Assigned script for "${task.title}". Record cleanly in a quiet booth following QA rubric targets.`,
      qaRubric: defaultQaRubric(qaType),
      payoutUsd: payoutByTaskId.get(task.id) ?? payloadAmount,
      cachedAt: now,
    };
  });
  return mergeScripts(entries);
}

export function cacheJobBoardScripts(jobs: MarketplaceJobPosting[]): OfflineAssignedScript[] {
  if (!Array.isArray(jobs) || jobs.length === 0) {
    return getCachedOfflineScripts();
  }
  const now = new Date().toISOString();
  const entries: OfflineAssignedScript[] = jobs.map((job) => {
    const qaType: OfflineAssignedScript["qaType"] =
      job.qa_type === "audio" || job.qa_type === "vision" || job.qa_type === "text"
        ? job.qa_type
        : inferQaType(`${job.title} ${job.description}`);
    return {
      id: `job:${job.id}`,
      source: "job_board",
      title: job.title,
      orgOrClient: job.client_org_name || "Marketplace Client",
      qaType,
      status: job.status,
      scriptBody: job.description,
      qaRubric: defaultQaRubric(qaType),
      payoutUsd: Number(job.budget_usd ?? 0),
      cachedAt: now,
    };
  });
  return mergeScripts(entries);
}
