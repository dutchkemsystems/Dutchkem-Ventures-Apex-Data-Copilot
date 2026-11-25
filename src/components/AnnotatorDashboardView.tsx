import React, { useEffect, useState } from "react";
import { CheckCircle2, Clock3, FolderCheck, Send } from "lucide-react";
import type { Task, WorkspacePayload } from "../types/tenant";
import { AutoBidderTutorialEmptyState } from "./AutoBidderTutorialEmptyState";
import { MobileMediaRecorder } from "./MobileMediaRecorder";

interface AnnotatorDashboardViewProps {
  data: WorkspacePayload;
  onSubmitTask: (taskId: string, notes: string) => Promise<void>;
  onBrowseJobBoard?: () => void;
  onOpenCaptureWorkspace?: () => void;
}

export function AnnotatorDashboardView({
  data,
  onSubmitTask,
  onBrowseJobBoard,
  onOpenCaptureWorkspace,
}: AnnotatorDashboardViewProps) {
  const [selectedTask, setSelectedTask] = useState<Task | null>(
    data.tasks.find((t) => t.status === "in_progress" || t.status === "pending") ??
      data.tasks[0] ??
      null
  );
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  useEffect(() => {
    setSelectedTask((prev) => {
      if (!data.tasks.length) return null;
      if (prev) {
        const refreshed = data.tasks.find((t) => t.id === prev.id);
        if (refreshed) return refreshed;
      }
      return (
        data.tasks.find((t) => t.status === "in_progress" || t.status === "pending") ??
        data.tasks[0]
      );
    });
  }, [data.tasks]);

  const totalEarned = data.escrowLedger
    .filter((e) => e.status === "released")
    .reduce((acc, e) => acc + e.annotator_payout, 0);
  const pendingEscrow = data.escrowLedger
    .filter((e) => e.status === "held")
    .reduce((acc, e) => acc + e.annotator_payout, 0);

  async function handleSubmitWork(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedTask) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      await onSubmitTask(selectedTask.id, notes);
      setNotes("");
    } catch (err) {
      setSubmitError(
        err instanceof Error ? err.message : "Failed to submit task output."
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-8">
      {/* Annotator Scoped Header */}
      <div className="rounded-2xl border border-emerald-200/70 bg-gradient-to-r from-white via-sky-50/40 to-emerald-50/50 p-6 sm:p-7 flex flex-col sm:flex-row sm:items-end justify-between gap-4 shadow-xs">
        <div>
          <p className="text-xs font-mono font-semibold text-emerald-700">
            Annotator Workbench · {data.organization.name}
          </p>
          <h1 className="mt-1.5 text-2xl sm:text-3xl 2xl:text-4xl font-bold tracking-tight text-slate-950">
            Welcome back, {data.currentUser.full_name}
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            RLS Policy Active: viewing only tasks assigned to{" "}
            <span className="font-mono text-xs text-slate-800">
              {data.currentUser.id.slice(0, 8)}...
            </span>{" "}
            · Organization billing & agency margins are hidden
          </p>
        </div>

        <div className="text-left sm:text-right">
          <p className="text-xs font-semibold text-slate-500">Contracted Rate</p>
          <p className="text-2xl 2xl:text-3xl font-bold font-mono tabular-nums text-blue-700">
            ${data.currentUser.hourly_rate.toFixed(2)}/hr
          </p>
        </div>
      </div>

      {/* 3-Column Annotator Metrics */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
        <div className="rounded-2xl border border-slate-200/80 bg-white p-6 2xl:p-7 shadow-xs relative overflow-hidden">
          <div className="absolute top-0 inset-x-0 h-1 bg-gradient-to-r from-blue-600 to-sky-500" />
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold text-slate-500">My Assigned Tasks</p>
            <FolderCheck className="w-4 h-4 text-blue-600" />
          </div>
          <p className="mt-3 text-2xl 2xl:text-3xl font-bold font-mono tabular-nums text-slate-950">
            {data.tasks.length}
          </p>
          <p className="mt-1.5 text-xs text-slate-500">
            {data.tasks.filter((t) => t.status === "in_progress" || t.status === "pending").length}{" "}
            ready for submission
          </p>
        </div>

        <div className="rounded-2xl border border-slate-200/80 bg-white p-6 2xl:p-7 shadow-xs relative overflow-hidden">
          <div className="absolute top-0 inset-x-0 h-1 bg-gradient-to-r from-emerald-500 to-teal-500" />
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold text-slate-500">Released Net Payouts</p>
            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
          </div>
          <p className="mt-3 text-2xl 2xl:text-3xl font-bold font-mono tabular-nums text-emerald-700">
            ${totalEarned.toFixed(2)}
          </p>
          <p className="mt-1.5 text-xs text-slate-500">
            Verified & settled via Kora Pay escrow
          </p>
        </div>

        <div className="rounded-2xl border border-slate-200/80 bg-white p-6 2xl:p-7 shadow-xs relative overflow-hidden">
          <div className="absolute top-0 inset-x-0 h-1 bg-gradient-to-r from-amber-500 to-orange-400" />
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold text-slate-500">Held Pending QA</p>
            <Clock3 className="w-4 h-4 text-amber-600" />
          </div>
          <p className="mt-3 text-2xl 2xl:text-3xl font-bold font-mono tabular-nums text-amber-600">
            ${pendingEscrow.toFixed(2)}
          </p>
          <p className="mt-1.5 text-xs text-slate-500">
            Releases upon admin approval
          </p>
        </div>
      </div>

      {/* Phase 20D Empty State: Show Auto-Bidder Video Tutorial when Dashboard has 0 tasks */}
      {data.tasks.length === 0 && (
        <AutoBidderTutorialEmptyState onOpenAutoBidder={onBrowseJobBoard} />
      )}

      {/* Assigned Queue + Payload Workbench */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6 2xl:gap-8">
        <section className="lg:col-span-3 border border-slate-200/80 bg-white rounded-2xl overflow-hidden shadow-xs">
          <div className="px-6 py-4 border-b border-slate-200/80 bg-gradient-to-r from-white to-blue-50/40">
            <h2 className="text-base font-bold text-slate-950">
              My Task Queue
            </h2>
            <p className="text-xs text-slate-500">
              Select a task to inspect its input payload and submit QA output
            </p>
          </div>

          <div className="divide-y divide-slate-100">
            {data.tasks.length === 0 ? (
              <p className="p-8 text-sm text-center text-slate-500">
                No tasks currently assigned to your user ID.
              </p>
            ) : (
              data.tasks.map((task) => {
                const project = data.projects.find((p) => p.id === task.project_id);
                const escrow = data.escrowLedger.find((e) => e.task_id === task.id);
                const isSelected = selectedTask?.id === task.id;

                return (
                  <button
                    key={task.id}
                    type="button"
                    onClick={() => setSelectedTask(task)}
                    className={`w-full min-h-[56px] text-left px-4 sm:px-6 py-4 transition-colors flex items-start justify-between gap-4 ${
                      isSelected ? "bg-blue-50/60" : "hover:bg-slate-50/70"
                    }`}
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-slate-900 truncate">
                        {task.title}
                      </p>
                      <p className="mt-1 text-xs text-slate-500 capitalize">
                        {project?.name} · {task.status.replace("_", " ")}
                      </p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-sm font-mono tabular-nums font-bold text-emerald-700">
                        ${escrow ? escrow.annotator_payout.toFixed(2) : "0.00"}
                      </p>
                      <p className="text-xs text-slate-500">Net payout</p>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </section>

        <section className="lg:col-span-2 border border-slate-200/80 bg-white rounded-2xl p-6 space-y-4 shadow-xs">
          {selectedTask ? (
            <>
              <div>
                <p className="text-xs font-mono font-semibold text-blue-700">
                  Task {selectedTask.id.slice(0, 14)}
                </p>
                <h3 className="mt-1 text-base font-bold text-slate-950">
                  {selectedTask.title}
                </h3>
              </div>

              <div>
                <p className="text-xs font-semibold text-slate-700 mb-1.5">
                  Input Payload (JSONB)
                </p>
                <pre className="p-3.5 bg-slate-950 text-sky-100 rounded-xl text-xs font-mono overflow-x-auto leading-relaxed">
                  {JSON.stringify(selectedTask.input_payload, null, 2)}
                </pre>
              </div>

              {selectedTask.status === "in_progress" ||
              selectedTask.status === "pending" ? (
                <div className="space-y-4 pt-2">
                  <MobileMediaRecorder
                    compact
                    orgId={data.organization.id}
                    userId={data.currentUser.id}
                    taskId={selectedTask.id}
                    taskTitle={selectedTask.title}
                    onAudioQaResult={(report) => {
                      setNotes((prev) =>
                        prev
                          ? prev
                          : `Mobile Audio Capture (${report.fileName}): ${
                              report.passed ? "QA PASSED" : "QA FLAGGED"
                            } · SNR ${report.snrDb.toFixed(1)} dB`
                      );
                    }}
                    onVideoQaResult={(report) => {
                      setNotes((prev) =>
                        prev
                          ? prev
                          : `Mobile Video Capture (${report.fileName}): ${
                              report.passed ? "QA PASSED" : "QA FLAGGED"
                            } · ${report.containerFormat}`
                      );
                    }}
                  />

                  {onOpenCaptureWorkspace && (
                    <button
                      type="button"
                      onClick={onOpenCaptureWorkspace}
                      className="w-full min-h-[44px] px-3 py-2 text-xs font-semibold border border-slate-200 bg-slate-50 text-slate-700 rounded-xl hover:bg-slate-100 transition-colors"
                    >
                      Open Full Capture Workspace (/dashboard/workspace)
                    </button>
                  )}

                  <form onSubmit={handleSubmitWork} className="space-y-3">
                    {submitError && (
                      <div className="p-3 border border-red-200 bg-red-50 text-red-900 rounded-lg text-xs">
                        {submitError}
                      </div>
                    )}
                    <div>
                      <label
                        htmlFor="annotator-output-notes"
                        className="block text-xs font-semibold text-slate-700 mb-1"
                      >
                        Submission Output & QA Notes
                      </label>
                      <textarea
                        id="annotator-output-notes"
                        rows={3}
                        required
                        value={notes}
                        onChange={(e) => setNotes(e.target.value)}
                        placeholder="Document verification findings, SNR measurements, or prompt jailbreak results..."
                        className="w-full min-h-[88px] px-3 py-2.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500"
                      />
                    </div>
                    <button
                      type="submit"
                      disabled={submitting}
                      className="w-full min-h-[44px] inline-flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-semibold bg-gradient-to-r from-blue-600 via-sky-500 to-emerald-500 text-white rounded-xl hover:brightness-105 disabled:opacity-50 shadow-sm"
                    >
                      <Send className="w-4 h-4" />
                      <span>
                        {submitting ? "Submitting..." : "Submit for Admin Review"}
                      </span>
                    </button>
                  </form>
                </div>
              ) : (
                <div className="pt-2 border-t border-slate-200">
                  <p className="text-xs font-semibold text-slate-700 mb-1">
                    Submitted Output Payload
                  </p>
                  <pre className="p-3 bg-slate-100 text-slate-800 rounded-xl text-xs font-mono overflow-x-auto">
                    {JSON.stringify(selectedTask.output_payload, null, 2)}
                  </pre>
                </div>
              )}
            </>
          ) : (
            <p className="text-sm text-slate-500">Select a task to view details.</p>
          )}
        </section>
      </div>
    </div>
  );
}
