import React, { useMemo, useState } from "react";
import { CheckCircle2, FileText, Mic, Send, Smartphone } from "lucide-react";
import type { AudioQaReport, VideoQaReport, WorkspacePayload } from "../types/tenant";
import { MobileMediaRecorder } from "./MobileMediaRecorder";

interface MobileWorkspaceViewProps {
  data: WorkspacePayload;
  onSubmitTask: (taskId: string, notes: string) => Promise<void>;
  onTaskUpdated: () => Promise<void>;
}

export function MobileWorkspaceView({
  data,
  onSubmitTask,
  onTaskUpdated,
}: MobileWorkspaceViewProps) {
  const [selectedTaskId, setSelectedTaskId] = useState<string>(() => {
    const preferred =
      data.tasks.find((t) => t.status === "in_progress" || t.status === "pending") ??
      data.tasks[0];
    return preferred?.id ?? "";
  });
  const [lastQaSummary, setLastQaSummary] = useState<string | null>(null);
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitMessage, setSubmitMessage] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const selectedTask = useMemo(
    () => data.tasks.find((t) => t.id === selectedTaskId) ?? data.tasks[0] ?? null,
    [data.tasks, selectedTaskId]
  );

  const activeScript = useMemo(() => {
    const payload = selectedTask?.input_payload as Record<string, unknown> | undefined;
    if (!payload) return "";
    const candidate =
      payload.script ||
      payload.script_note ||
      payload.prompt ||
      payload.utterance ||
      payload.source_text;
    return typeof candidate === "string" ? candidate : "";
  }, [selectedTask]);

  async function handleAudioQaResult(report: AudioQaReport) {
    setLastQaSummary(
      `Mobile WAV Capture (${report.fileName}): ${
        report.passed ? "QA PASSED" : "QA FLAGGED"
      } · ${report.sampleRateHz}Hz Mono · SNR ${report.snrDb.toFixed(1)} dB · Peak ${report.peakDbfs.toFixed(1)} dBFS`
    );
    await onTaskUpdated();
  }

  async function handleVideoQaResult(report: VideoQaReport) {
    setLastQaSummary(
      `Mobile Video Capture (${report.fileName}): ${
        report.passed ? "QA PASSED" : "QA FLAGGED"
      } · ${report.containerFormat} · ${(report.fileSizeBytes / 1024).toFixed(1)} KB`
    );
    await onTaskUpdated();
  }

  async function handleSubmitWorkspaceTask(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedTask) return;
    setSubmitting(true);
    setSubmitError(null);
    setSubmitMessage(null);
    try {
      const compiledNotes = [lastQaSummary, notes.trim()].filter(Boolean).join(" | ");
      await onSubmitTask(
        selectedTask.id,
        compiledNotes || "Mobile browser audio/video capture uploaded and verified."
      );
      setNotes("");
      setSubmitMessage(`Submitted "${selectedTask.title}" for review.`);
    } catch (err) {
      setSubmitError(
        err instanceof Error ? err.message : "Failed to submit captured task output."
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="rounded-2xl border border-slate-200/80 bg-gradient-to-r from-[#0B1F3A] via-[#122d52] to-[#0f3443] text-white p-5 sm:p-7 shadow-xs">
        <div className="flex flex-wrap items-center gap-2 text-xs font-mono text-sky-200">
          <Smartphone className="w-4 h-4 shrink-0" />
          <span>/dashboard/workspace · Mobile Capture Studio</span>
        </div>
        <h1 className="mt-2 text-xl sm:text-2xl lg:text-3xl font-bold tracking-tight">
          Mobile Audio &amp; Video Capture Workspace
        </h1>
        <p className="mt-1.5 text-xs sm:text-sm text-slate-200 max-w-2xl">
          Record studio-grade spoken audio (.wav) or field video directly from your phone
          browser and submit straight into the QA Agent pipeline.
        </p>
      </div>

      {/* Task Selector + Script Card */}
      <section className="rounded-2xl border border-slate-200/80 bg-white p-4 sm:p-6 space-y-4 shadow-xs">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-end">
          <div className="lg:col-span-7">
            <label
              htmlFor="mobile-workspace-task-select"
              className="block text-xs font-semibold text-slate-700 mb-1.5"
            >
              Active Assignment
            </label>
            <select
              id="mobile-workspace-task-select"
              value={selectedTask?.id ?? ""}
              onChange={(e) => setSelectedTaskId(e.target.value)}
              className="w-full min-h-[44px] px-3 py-2 text-sm border border-slate-200 rounded-xl bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500/30"
            >
              {data.tasks.length === 0 ? (
                <option value="">Standalone Mobile QA Capture (No Assigned Task)</option>
              ) : (
                data.tasks.map((task) => (
                  <option key={task.id} value={task.id}>
                    {task.title} ({task.status.replace("_", " ")})
                  </option>
                ))
              )}
            </select>
          </div>

          <div className="lg:col-span-5 flex items-center justify-between lg:justify-end gap-3 text-xs text-slate-600">
            <span className="inline-flex items-center gap-1.5 font-mono">
              <Mic className="w-3.5 h-3.5 text-emerald-600" />
              <span>Target: 24kHz Mono WAV</span>
            </span>
            {selectedTask && (
              <span className="font-mono font-semibold text-blue-700 capitalize">
                {selectedTask.status.replace("_", " ")}
              </span>
            )}
          </div>
        </div>

        {selectedTask && (
          <div className="p-3.5 sm:p-4 rounded-xl bg-slate-50 border border-slate-200/80 space-y-2">
            <div className="flex items-center gap-2 text-xs font-bold text-slate-800">
              <FileText className="w-3.5 h-3.5 text-blue-700 shrink-0" />
              <span>Task Brief &amp; Recording Script</span>
            </div>
            {activeScript ? (
              <p className="text-sm text-slate-900 leading-relaxed font-medium">
                {activeScript}
              </p>
            ) : (
              <pre className="text-xs font-mono text-slate-700 overflow-x-auto leading-relaxed">
                {JSON.stringify(selectedTask.input_payload, null, 2)}
              </pre>
            )}
          </div>
        )}
      </section>

      {/* MediaRecorder + Native Mobile File Capture */}
      <MobileMediaRecorder
        orgId={data.organization.id}
        userId={data.currentUser.id}
        taskId={selectedTask?.id}
        taskTitle={selectedTask?.title}
        defaultScript={activeScript}
        onAudioQaResult={handleAudioQaResult}
        onVideoQaResult={handleVideoQaResult}
      />

      {/* Task Submission Form after QA */}
      {selectedTask && (
        <section className="rounded-2xl border border-slate-200/80 bg-white p-4 sm:p-6 space-y-4 shadow-xs">
          <h2 className="text-base font-bold text-slate-950">
            Finalize &amp; Submit Task Output
          </h2>

          {submitMessage && (
            <div className="p-3.5 rounded-xl border border-emerald-200 bg-emerald-50 text-emerald-900 text-xs font-medium flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0" />
              <span>{submitMessage}</span>
            </div>
          )}

          {submitError && (
            <div className="p-3.5 rounded-xl border border-red-200 bg-red-50 text-red-900 text-xs font-medium">
              {submitError}
            </div>
          )}

          <form onSubmit={handleSubmitWorkspaceTask} className="space-y-3">
            <div>
              <label
                htmlFor="mobile-workspace-notes"
                className="block text-xs font-semibold text-slate-700 mb-1.5"
              >
                Annotator Notes (optional if QA capture attached)
              </label>
              <textarea
                id="mobile-workspace-notes"
                rows={2}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Add recording environment details or edge-case notes..."
                className="w-full min-h-[72px] px-3 py-2 text-sm border border-slate-200 rounded-xl bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500/30"
              />
            </div>

            <button
              type="submit"
              disabled={
                submitting ||
                (selectedTask.status !== "in_progress" && selectedTask.status !== "pending")
              }
              className="w-full min-h-[48px] inline-flex items-center justify-center gap-2 px-4 py-3 text-sm font-bold bg-[#0B1F3A] text-white rounded-xl hover:bg-slate-800 disabled:opacity-50 transition-colors"
            >
              <Send className="w-4 h-4" />
              <span>
                {submitting
                  ? "Submitting Task..."
                  : selectedTask.status === "in_progress" || selectedTask.status === "pending"
                    ? "Submit Recording & Task for Review"
                    : `Task Status: ${selectedTask.status.replace("_", " ")}`}
              </span>
            </button>
          </form>
        </section>
      )}
    </div>
  );
}
