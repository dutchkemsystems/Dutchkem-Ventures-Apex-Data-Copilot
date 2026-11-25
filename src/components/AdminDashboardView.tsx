import React, { useState } from "react";
import {
  Check,
  CheckCircle2,
  Coins,
  FolderKanban,
  Plus,
  Sparkles,
  TrendingUp,
  X,
} from "lucide-react";
import type { WorkspacePayload } from "../types/tenant";
import { AutoBidderTutorialEmptyState } from "./AutoBidderTutorialEmptyState";

interface AdminDashboardViewProps {
  data: WorkspacePayload;
  mode: "overview" | "tasks";
  onCreateTask: (payload: {
    project_id: string;
    assignee_id: string;
    title: string;
    amount: number;
    script_note: string;
  }) => Promise<void>;
  onVerifyTask: (
    taskId: string,
    action: "approve" | "reject",
    verifierScore: number
  ) => Promise<void>;
  onOpenAutoBidder?: () => void;
}

const STATUS_LABELS: Record<string, { label: string; className: string }> = {
  pending: { label: "Pending", className: "text-slate-600 font-medium" },
  in_progress: { label: "In Progress", className: "text-blue-700 font-semibold" },
  in_review: { label: "In Review", className: "text-amber-700 font-semibold" },
  approved: { label: "Approved", className: "text-emerald-700 font-semibold" },
  rejected: { label: "Rejected", className: "text-red-700 font-semibold" },
};

export function AdminDashboardView({
  data,
  mode,
  onCreateTask,
  onVerifyTask,
  onOpenAutoBidder,
}: AdminDashboardViewProps) {
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [title, setTitle] = useState("");
  const [projectId, setProjectId] = useState(data.projects[0]?.id ?? "");
  const [assigneeId, setAssigneeId] = useState(
    data.users.find((u) => u.role === "annotator")?.id ?? ""
  );
  const [amount, setAmount] = useState("200");
  const [scriptNote, setScriptNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [busyTaskId, setBusyTaskId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const annotators = data.users.filter((u) => u.role === "annotator");
  const grossEscrow = data.escrowLedger.reduce((acc, e) => acc + e.amount, 0);
  const agencyRevenue = data.escrowLedger.reduce(
    (acc, e) => acc + (e.platform_fee ?? 0),
    0
  );
  const scoredTasks = data.tasks.filter((t) => t.verifier_score !== null);
  const avgScore =
    scoredTasks.length > 0
      ? scoredTasks.reduce((acc, t) => acc + (t.verifier_score ?? 0), 0) /
        scoredTasks.length
      : 0;

  const filteredTasks = data.tasks.filter((task) =>
    statusFilter === "all" ? true : task.status === statusFilter
  );

  async function handleSubmitNewTask(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim() || !projectId) return;
    setSubmitting(true);
    setActionError(null);
    try {
      await onCreateTask({
        project_id: projectId,
        assignee_id: assigneeId,
        title: title.trim(),
        amount: Number(amount) || 200,
        script_note: scriptNote.trim(),
      });
      setTitle("");
      setScriptNote("");
      setShowCreateForm(false);
    } catch (err) {
      setActionError(
        err instanceof Error ? err.message : "Failed to provision task."
      );
    } finally {
      setSubmitting(false);
    }
  }

  async function handleVerifyTaskAction(
    taskId: string,
    action: "approve" | "reject",
    verifierScore: number
  ) {
    setBusyTaskId(taskId);
    setActionError(null);
    try {
      await onVerifyTask(taskId, action, verifierScore);
    } catch (err) {
      setActionError(
        err instanceof Error ? err.message : "Failed to update task verdict."
      );
    } finally {
      setBusyTaskId(null);
    }
  }

  return (
    <div className="space-y-8">
      {/* Organization Header Banner */}
      <div className="rounded-2xl border border-blue-200/70 bg-gradient-to-r from-white via-blue-50/40 to-emerald-50/40 p-6 sm:p-7 flex flex-col sm:flex-row sm:items-end justify-between gap-4 shadow-xs">
        <div>
          <p className="text-xs font-mono font-semibold text-blue-700 capitalize">
            White-Label Organization Console · {data.organization.subscription_tier.replace("_", " ")}
          </p>
          <h1 className="mt-1.5 text-2xl sm:text-3xl 2xl:text-4xl font-bold tracking-tight text-slate-950">
            {data.organization.name}
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            Billing Ref{" "}
            <span className="font-mono text-xs text-slate-800">
              {data.organization.korapay_customer_ref ?? "unassigned"}
            </span>{" "}
            · {data.projects.length} active projects · {annotators.length} vetted annotators
          </p>
        </div>

        <button
          type="button"
          onClick={() => setShowCreateForm((prev) => !prev)}
          className="min-h-[44px] inline-flex items-center justify-center gap-2 px-5 py-2.5 text-sm font-semibold rounded-xl bg-gradient-to-r from-blue-600 via-sky-500 to-emerald-500 text-white shadow-[0_8px_22px_rgba(37,99,235,0.22)] hover:brightness-105 transition-all whitespace-nowrap shrink-0"
        >
          {showCreateForm ? <X className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
          <span>{showCreateForm ? "Close Task Form" : "Provision Task"}</span>
        </button>
      </div>

      {actionError && (
        <div className="p-4 border border-red-200 bg-red-50 text-red-900 rounded-xl text-sm font-medium">
          {actionError}
        </div>
      )}

      {/* 4-Column Vibrant 4K KPI Strip (Single Elevation, Tabular Numerals) */}
      {mode === "overview" && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
          <div className="rounded-2xl border border-slate-200/80 bg-white p-6 2xl:p-7 shadow-xs relative overflow-hidden">
            <div className="absolute top-0 inset-x-0 h-1 bg-gradient-to-r from-blue-600 to-sky-500" />
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold text-slate-500">Gross Escrow Volume</p>
              <Coins className="w-4 h-4 text-blue-600" />
            </div>
            <p className="mt-3 text-2xl 2xl:text-3xl font-bold font-mono tabular-nums text-slate-950">
              ${grossEscrow.toFixed(2)}
            </p>
            <p className="mt-1.5 text-xs text-slate-500">
              {data.escrowLedger.length} tracked ledger entries
            </p>
          </div>

          <div className="rounded-2xl border border-slate-200/80 bg-white p-6 2xl:p-7 shadow-xs relative overflow-hidden">
            <div className="absolute top-0 inset-x-0 h-1 bg-gradient-to-r from-emerald-500 to-teal-500" />
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold text-slate-500">Agency Margin (20%)</p>
              <TrendingUp className="w-4 h-4 text-emerald-600" />
            </div>
            <p className="mt-3 text-2xl 2xl:text-3xl font-bold font-mono tabular-nums text-emerald-700">
              ${agencyRevenue.toFixed(2)}
            </p>
            <p className="mt-1.5 text-xs text-slate-500">
              Deterministic 20/80 Kora Pay split
            </p>
          </div>

          <div className="rounded-2xl border border-slate-200/80 bg-white p-6 2xl:p-7 shadow-xs relative overflow-hidden">
            <div className="absolute top-0 inset-x-0 h-1 bg-gradient-to-r from-sky-500 to-cyan-400" />
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold text-slate-500">Tenant Task Queue</p>
              <FolderKanban className="w-4 h-4 text-sky-600" />
            </div>
            <p className="mt-3 text-2xl 2xl:text-3xl font-bold font-mono tabular-nums text-slate-950">
              {data.tasks.length}
            </p>
            <p className="mt-1.5 text-xs text-slate-500">
              {data.tasks.filter((t) => t.status === "in_review").length} awaiting admin review
            </p>
          </div>

          <div className="rounded-2xl border border-slate-200/80 bg-white p-6 2xl:p-7 shadow-xs relative overflow-hidden">
            <div className="absolute top-0 inset-x-0 h-1 bg-gradient-to-r from-amber-500 to-orange-400" />
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold text-slate-500">Mean Verifier Score</p>
              <Sparkles className="w-4 h-4 text-amber-600" />
            </div>
            <p className="mt-3 text-2xl 2xl:text-3xl font-bold font-mono tabular-nums text-amber-600">
              {scoredTasks.length > 0 ? avgScore.toFixed(3) : "—"}
            </p>
            <p className="mt-1.5 text-xs text-slate-500">
              Across {scoredTasks.length} verified outputs
            </p>
          </div>
        </div>
      )}

      {/* Inline Provision Task Panel */}
      {showCreateForm && (
        <form
          onSubmit={handleSubmitNewTask}
          className="p-6 2xl:p-7 border border-blue-200/80 bg-white rounded-2xl space-y-4 shadow-xs"
        >
          <div className="flex items-center justify-between">
            <h2 className="text-base font-bold text-slate-950">
              Provision Tenant-Scoped Task & Escrow Hold
            </h2>
            <span className="text-xs font-mono font-semibold text-blue-700">
              Split: 20% Agency / 80% Annotator
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="lg:col-span-2">
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Task Title
              </label>
              <input
                type="text"
                required
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g., ES-MX Batch 21 · 24kHz SNR & Plosive Check"
                className="w-full min-h-[44px] px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Project
              </label>
              <select
                value={projectId}
                onChange={(e) => setProjectId(e.target.value)}
                className="w-full min-h-[44px] px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500"
              >
                {data.projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Assign Expert
              </label>
              <select
                value={assigneeId}
                onChange={(e) => setAssigneeId(e.target.value)}
                className="w-full min-h-[44px] px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500"
              >
                {annotators.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.full_name} (${u.hourly_rate}/hr)
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Gross Escrow Amount (USD)
              </label>
              <input
                type="number"
                min={20}
                step="10"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="w-full min-h-[44px] px-3 py-2 text-sm font-mono tabular-nums border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500"
              />
            </div>

            <div className="md:col-span-2">
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Input Payload Instructions
              </label>
              <input
                type="text"
                value={scriptNote}
                onChange={(e) => setScriptNote(e.target.value)}
                placeholder="Validate mono 24kHz WAV, noise floor < -70 dB"
                className="w-full min-h-[44px] px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500"
              />
            </div>

            <button
              type="submit"
              disabled={submitting}
              className="min-h-[44px] px-4 py-2.5 text-sm font-semibold bg-gradient-to-r from-blue-600 to-emerald-500 text-white rounded-lg hover:brightness-105 disabled:opacity-50 whitespace-nowrap"
            >
              {submitting ? "Provisioning..." : "Create & Hold Escrow"}
            </button>
          </div>
        </form>
      )}

      {/* Phase 20D Empty State: Show Auto-Bidder Video Tutorial when Dashboard has 0 tasks */}
      {data.tasks.length === 0 && (
        <AutoBidderTutorialEmptyState
          onOpenAutoBidder={onOpenAutoBidder}
          onCreateFirstTask={() => setShowCreateForm(true)}
        />
      )}

      {/* Task Orchestration Table */}
      <section className="border border-slate-200/80 bg-white rounded-2xl overflow-hidden shadow-xs">
        <div className="px-6 py-4 border-b border-slate-200/80 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-gradient-to-r from-white to-slate-50/70">
          <div>
            <h2 className="text-base font-bold text-slate-950">
              Organization Task Queue
            </h2>
            <p className="text-xs text-slate-500">
              Scoped strictly to {data.organization.name} via Neon PostgreSQL RLS
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-1 p-1 bg-slate-100 rounded-lg self-start">
            {["all", "in_review", "in_progress", "approved"].map((key) => (
              <button
                key={key}
                type="button"
                onClick={() => setStatusFilter(key)}
                className={`min-h-[44px] px-3 py-1.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap capitalize ${
                  statusFilter === key
                    ? "bg-white text-blue-700 shadow-xs"
                    : "text-slate-600 hover:text-slate-950"
                }`}
              >
                {key === "all" ? "All" : key.replace("_", " ")}
              </button>
            ))}
          </div>
        </div>

        {/* Mobile (<md) Task Queue Cards */}
        <div className="md:hidden divide-y divide-slate-200">
          {filteredTasks.length === 0 ? (
            <p className="p-6 text-center text-sm text-slate-500">
              No tasks match the selected status filter.
            </p>
          ) : (
            filteredTasks.map((task) => {
              const project = data.projects.find((p) => p.id === task.project_id);
              const assignee = data.users.find((u) => u.id === task.assignee_id);
              const escrow = data.escrowLedger.find((e) => e.task_id === task.id);
              const statusMeta = STATUS_LABELS[task.status] ?? {
                label: task.status,
                className: "text-slate-600",
              };
              return (
                <article key={task.id} className="p-4 space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-semibold text-sm text-slate-950">{task.title}</p>
                      <p className="text-xs text-slate-500 mt-0.5">
                        {project?.name} · {project?.role_type}
                      </p>
                    </div>
                    <span className={`text-xs shrink-0 ${statusMeta.className}`}>
                      {statusMeta.label}
                    </span>
                  </div>
                  <dl className="grid grid-cols-3 gap-2 text-xs pt-2 border-t border-slate-100">
                    <div>
                      <dt className="text-slate-500">Assignee</dt>
                      <dd className="font-medium text-slate-900 truncate">
                        {assignee ? assignee.full_name : "Unassigned"}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-slate-500">Score</dt>
                      <dd className="font-mono tabular-nums text-slate-800">
                        {task.verifier_score !== null ? task.verifier_score.toFixed(3) : "—"}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-slate-500">Escrow</dt>
                      <dd className="font-mono tabular-nums font-semibold text-slate-950">
                        {escrow ? `$${escrow.amount.toFixed(2)}` : "—"}
                      </dd>
                    </div>
                  </dl>
                  {task.status === "in_review" ? (
                    <div className="grid grid-cols-2 gap-2 pt-1">
                      <button
                        type="button"
                        disabled={busyTaskId === task.id}
                        onClick={() => void handleVerifyTaskAction(task.id, "approve", 0.975)}
                        className="min-h-[44px] inline-flex items-center justify-center gap-1 px-3 py-2 text-xs font-semibold bg-gradient-to-r from-emerald-600 to-teal-500 text-white rounded-xl hover:brightness-105 disabled:opacity-60"
                      >
                        <Check className="w-3.5 h-3.5" />
                        <span>Approve &amp; Release</span>
                      </button>
                      <button
                        type="button"
                        disabled={busyTaskId === task.id}
                        onClick={() => void handleVerifyTaskAction(task.id, "reject", 0.42)}
                        className="min-h-[44px] px-3 py-2 text-xs font-semibold text-slate-700 border border-slate-200 rounded-xl hover:bg-slate-100 disabled:opacity-60"
                      >
                        Reject
                      </button>
                    </div>
                  ) : (
                    <p className="text-xs font-medium text-emerald-700">
                      {escrow?.status === "released" ? "Escrow Released" : "Managed"}
                    </p>
                  )}
                </article>
              );
            })
          )}
        </div>

        {/* Desktop (md+) Task Orchestration Table */}
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-200 text-xs font-semibold text-slate-500 bg-slate-50/80">
                <th className="py-3 px-6">Task & Project</th>
                <th className="py-3 px-4">Assignee</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4 text-right">Score</th>
                <th className="py-3 px-4 text-right">Escrow</th>
                <th className="py-3 px-6 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-sm">
              {filteredTasks.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-10 px-6 text-center text-slate-500">
                    No tasks match the selected status filter.
                  </td>
                </tr>
              ) : (
                filteredTasks.map((task) => {
                  const project = data.projects.find((p) => p.id === task.project_id);
                  const assignee = data.users.find((u) => u.id === task.assignee_id);
                  const escrow = data.escrowLedger.find((e) => e.task_id === task.id);
                  const statusMeta = STATUS_LABELS[task.status] ?? {
                    label: task.status,
                    className: "text-slate-600",
                  };

                  return (
                    <tr key={task.id} className="hover:bg-blue-50/30 transition-colors">
                      <td className="py-3.5 px-6">
                        <p className="font-semibold text-slate-900">{task.title}</p>
                        <p className="text-xs text-slate-500 mt-0.5">
                          {project?.name} · {project?.role_type} ·{" "}
                          <span className="font-mono">{task.id.slice(0, 12)}</span>
                        </p>
                      </td>
                      <td className="py-3.5 px-4 text-slate-700 whitespace-nowrap">
                        {assignee ? (
                          <span>
                            {assignee.full_name}{" "}
                            <span className="text-xs font-mono tabular-nums text-slate-500">
                              (${assignee.hourly_rate}/hr)
                            </span>
                          </span>
                        ) : (
                          <span className="text-slate-400">Unassigned</span>
                        )}
                      </td>
                      <td className={`py-3.5 px-4 whitespace-nowrap ${statusMeta.className}`}>
                        {statusMeta.label}
                      </td>
                      <td className="py-3.5 px-4 text-right font-mono tabular-nums text-slate-700">
                        {task.verifier_score !== null ? task.verifier_score.toFixed(3) : "—"}
                      </td>
                      <td className="py-3.5 px-4 text-right font-mono tabular-nums font-semibold text-slate-900">
                        {escrow ? `$${escrow.amount.toFixed(2)}` : "—"}
                      </td>
                      <td className="py-3.5 px-6 text-right whitespace-nowrap">
                        {task.status === "in_review" ? (
                          <div className="inline-flex items-center gap-2">
                            <button
                              type="button"
                              disabled={busyTaskId === task.id}
                              onClick={() => void handleVerifyTaskAction(task.id, "approve", 0.975)}
                              className="min-h-[44px] inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold bg-gradient-to-r from-emerald-600 to-teal-500 text-white rounded-lg hover:brightness-105 disabled:opacity-60 transition-all"
                            >
                              <Check className="w-3.5 h-3.5" />
                              <span>Approve & Release</span>
                            </button>
                            <button
                              type="button"
                              disabled={busyTaskId === task.id}
                              onClick={() => void handleVerifyTaskAction(task.id, "reject", 0.42)}
                              className="min-h-[44px] px-3 py-1.5 text-xs font-semibold text-slate-700 border border-slate-200 rounded-lg hover:bg-slate-100 disabled:opacity-60 transition-colors"
                            >
                              Reject
                            </button>
                          </div>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700">
                            {escrow?.status === "released" && (
                              <CheckCircle2 className="w-3.5 h-3.5" />
                            )}
                            <span>
                              {escrow?.status === "released" ? "Escrow Released" : "Managed"}
                            </span>
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* Organization Roster & Projects Summary (Overview Mode) */}
      {mode === "overview" && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 2xl:gap-8">
          <section className="border border-slate-200/80 bg-white rounded-2xl overflow-hidden shadow-xs">
            <div className="px-6 py-4 border-b border-slate-200/80 bg-gradient-to-r from-white to-blue-50/40">
              <h2 className="text-base font-bold text-slate-950">
                Tenant Expert Roster
              </h2>
              <p className="text-xs text-slate-500">
                Visible only to {data.organization.name} administrators
              </p>
            </div>
            <div className="md:hidden divide-y divide-slate-100 text-sm">
              {data.users.map((member) => (
                <div key={member.id} className="p-4 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-semibold text-slate-900 truncate">{member.full_name}</p>
                    <p className="text-xs text-slate-500 truncate">{member.email}</p>
                    <p className="mt-1 text-xs capitalize text-slate-600 font-medium">{member.role}</p>
                  </div>
                  <p className="font-mono tabular-nums font-semibold text-blue-700 shrink-0">
                    ${member.hourly_rate.toFixed(2)}/hr
                  </p>
                </div>
              ))}
            </div>
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-left border-collapse text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-xs font-semibold text-slate-500 bg-slate-50/70">
                    <th className="py-2.5 px-6">Member</th>
                    <th className="py-2.5 px-4">Role</th>
                    <th className="py-2.5 px-6 text-right">Hourly Rate</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {data.users.map((member) => (
                    <tr key={member.id} className="hover:bg-slate-50/60">
                      <td className="py-3 px-6">
                        <p className="font-semibold text-slate-900">{member.full_name}</p>
                        <p className="text-xs text-slate-500">{member.email}</p>
                      </td>
                      <td className="py-3 px-4 text-slate-600 capitalize font-medium">{member.role}</td>
                      <td className="py-3 px-6 text-right font-mono tabular-nums font-semibold text-blue-700">
                        ${member.hourly_rate.toFixed(2)}/hr
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="border border-slate-200/80 bg-white rounded-2xl overflow-hidden shadow-xs">
            <div className="px-4 sm:px-6 py-4 border-b border-slate-200/80 bg-gradient-to-r from-white to-emerald-50/40">
              <h2 className="text-base font-bold text-slate-950">
                Active Projects
              </h2>
              <p className="text-xs text-slate-500">
                Isolated workstreams across TTS QA, Prompt Engineering, and Red-Teaming
              </p>
            </div>
            <div className="md:hidden divide-y divide-slate-100 text-sm">
              {data.projects.map((project) => (
                <div key={project.id} className="p-4 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-semibold text-slate-900 truncate">{project.name}</p>
                    <p className="mt-1 font-mono text-xs text-sky-700 font-medium">{project.role_type}</p>
                  </div>
                  <span className="text-xs capitalize font-semibold text-emerald-700 shrink-0">
                    {project.status}
                  </span>
                </div>
              ))}
            </div>
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-left border-collapse text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-xs font-semibold text-slate-500 bg-slate-50/70">
                    <th className="py-2.5 px-6">Project</th>
                    <th className="py-2.5 px-4">Type</th>
                    <th className="py-2.5 px-6 text-right">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {data.projects.map((project) => (
                    <tr key={project.id} className="hover:bg-slate-50/60">
                      <td className="py-3 px-6 font-semibold text-slate-900">
                        {project.name}
                      </td>
                      <td className="py-3 px-4 font-mono text-xs text-sky-700 font-medium">
                        {project.role_type}
                      </td>
                      <td className="py-3 px-6 text-right capitalize font-semibold text-emerald-700">
                        {project.status}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
