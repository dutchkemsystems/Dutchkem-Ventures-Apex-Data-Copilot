import React, { useState } from "react";
import { ShieldAlert, ShieldCheck } from "lucide-react";
import type { RlsProbeResult, WorkspacePayload } from "../types/tenant";

interface RlsIsolationLabProps {
  data: WorkspacePayload;
  onRunProbe: (targetTaskId: string) => Promise<RlsProbeResult>;
}

export function RlsIsolationLab({ data, onRunProbe }: RlsIsolationLabProps) {
  const defaultCrossTarget =
    data.crossTenantTargetHints[0]?.sampleTaskId ?? data.tasks[0]?.id ?? "";
  const [targetTaskId, setTargetTaskId] = useState(defaultCrossTarget);
  const [probeResult, setProbeResult] = useState<RlsProbeResult | null>(null);
  const [running, setRunning] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  async function executeProbe(taskId: string) {
    setTargetTaskId(taskId);
    setRunning(true);
    setErrorMsg(null);
    try {
      const result = await onRunProbe(taskId);
      setProbeResult(result);
    } catch (err) {
      setErrorMsg(
        err instanceof Error ? err.message : "Failed to run RLS isolation probe."
      );
    } finally {
      setRunning(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="border-b border-slate-200 pb-6">
        <p className="text-xs font-medium text-slate-500">
          Multi-Tenancy Verification · PostgreSQL Row-Level Security
        </p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight text-slate-900">
          RLS Isolation Lab
        </h1>
        <p className="mt-1 text-sm text-slate-600">
          Verify that session{" "}
          <span className="font-mono text-xs text-slate-900">
            app.current_org_id = {data.organization.id}
          </span>{" "}
          cannot read or mutate tasks belonging to another agency organization.
        </p>
      </div>

      {errorMsg && (
        <div className="p-4 border border-red-200 bg-red-50 text-red-900 rounded-md text-sm">
          {errorMsg}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left: Target Selector */}
        <section className="border border-slate-200 bg-white rounded-lg p-6 space-y-5">
          <div>
            <h2 className="text-base font-semibold text-slate-900">
              1. Select Target Record to Query
            </h2>
            <p className="text-xs text-slate-500 mt-1">
              Test both an authorized intra-tenant task and an unauthorized cross-tenant task ID.
            </p>
          </div>

          <div className="space-y-3">
            <p className="text-xs font-medium text-slate-700">
              Cross-Tenant Targets (Other Organizations)
            </p>
            {data.crossTenantTargetHints.map((hint) => (
              <div
                key={hint.orgId}
                className="p-3.5 border border-slate-200 rounded-md flex items-center justify-between gap-4"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium text-slate-900 truncate">
                    {hint.sampleTaskTitle}
                  </p>
                  <p className="text-xs text-slate-500 font-mono truncate">
                    Owner: {hint.orgName} · {hint.sampleTaskId.slice(0, 14)}
                  </p>
                </div>
                <button
                  type="button"
                  disabled={running}
                  onClick={() => executeProbe(hint.sampleTaskId)}
                  className="px-3 py-1.5 text-xs font-medium bg-[#0F172A] text-white rounded hover:bg-slate-800 whitespace-nowrap shrink-0"
                >
                  Probe Cross-Tenant
                </button>
              </div>
            ))}
          </div>

          {data.tasks.length > 0 && (
            <div className="space-y-3 pt-2 border-t border-slate-200">
              <p className="text-xs font-medium text-slate-700">
                Same-Tenant Target ({data.organization.name})
              </p>
              <div className="p-3.5 border border-slate-200 rounded-md flex items-center justify-between gap-4">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-slate-900 truncate">
                    {data.tasks[0].title}
                  </p>
                  <p className="text-xs text-slate-500 font-mono truncate">
                    {data.tasks[0].id.slice(0, 14)}
                  </p>
                </div>
                <button
                  type="button"
                  disabled={running}
                  onClick={() => executeProbe(data.tasks[0].id)}
                  className="px-3 py-1.5 text-xs font-medium border border-slate-200 text-slate-800 rounded hover:bg-slate-100 whitespace-nowrap shrink-0"
                >
                  Probe Same-Tenant
                </button>
              </div>
            </div>
          )}

          <div className="pt-2 border-t border-slate-200">
            <label
              htmlFor="custom-probe-id"
              className="block text-xs font-medium text-slate-700 mb-1.5"
            >
              Or enter any Task UUID manually
            </label>
            <div className="flex gap-2">
              <input
                id="custom-probe-id"
                type="text"
                value={targetTaskId}
                onChange={(e) => setTargetTaskId(e.target.value)}
                className="flex-1 px-3 py-2 text-xs font-mono border border-slate-200 rounded-md focus:outline-none focus:ring-2 focus:ring-slate-900"
              />
              <button
                type="button"
                disabled={running || !targetTaskId.trim()}
                onClick={() => executeProbe(targetTaskId.trim())}
                className="px-4 py-2 text-xs font-medium bg-[#0F172A] text-white rounded-md hover:bg-slate-800 whitespace-nowrap"
              >
                Run Query
              </button>
            </div>
          </div>
        </section>

        {/* Right: Execution Result */}
        <section className="border border-slate-200 bg-white rounded-lg p-6 space-y-4">
          <h2 className="text-base font-semibold text-slate-900">
            2. PostgreSQL RLS Execution Trace
          </h2>

          {probeResult ? (
            <div className="space-y-4">
              <div
                className={`p-4 border rounded-md flex items-start gap-3 ${
                  probeResult.allowed
                    ? "border-emerald-200 bg-emerald-50/60 text-emerald-900"
                    : "border-amber-200 bg-amber-50/60 text-amber-950"
                }`}
              >
                {probeResult.allowed ? (
                  <ShieldCheck className="w-5 h-5 text-emerald-700 shrink-0 mt-0.5" />
                ) : (
                  <ShieldAlert className="w-5 h-5 text-amber-700 shrink-0 mt-0.5" />
                )}
                <div className="text-sm">
                  <p className="font-semibold">
                    {probeResult.allowed
                      ? "1 Row Returned (Same-Tenant Authorized)"
                      : "0 Rows Returned (Cross-Tenant Blocked by RLS)"}
                  </p>
                  <p className="mt-1 text-xs opacity-90">{probeResult.summary}</p>
                </div>
              </div>

              <div className="text-xs space-y-2 text-slate-600">
                <div className="flex justify-between gap-4 py-1.5 border-b border-slate-100">
                  <span>Session Org ID</span>
                  <span className="font-mono text-slate-900">
                    {probeResult.sessionOrgId}
                  </span>
                </div>
                <div className="flex justify-between gap-4 py-1.5 border-b border-slate-100">
                  <span>Target Owner Org ID</span>
                  <span className="font-mono text-slate-900">
                    {probeResult.targetOwnerOrgId}
                  </span>
                </div>
                <div className="flex justify-between gap-4 py-1.5 border-b border-slate-100">
                  <span>Session Role</span>
                  <span className="font-mono text-slate-900">
                    {probeResult.sessionRole}
                  </span>
                </div>
              </div>

              <div>
                <p className="text-xs font-medium text-slate-700 mb-1.5">
                  Executed Transaction SQL
                </p>
                <pre className="p-3.5 bg-slate-950 text-slate-100 rounded-md text-xs font-mono overflow-x-auto leading-relaxed">
                  {probeResult.sqlExecuted}
                </pre>
              </div>

              <div>
                <p className="text-xs font-medium text-slate-700 mb-1">
                  Evaluated RLS Policy
                </p>
                <p className="p-3 bg-slate-100 text-slate-800 rounded-md text-xs font-mono">
                  {probeResult.policyEvaluated}
                </p>
              </div>
            </div>
          ) : (
            <div className="py-16 text-center text-sm text-slate-500">
              Run a probe on the left to inspect live PostgreSQL RLS session isolation.
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
