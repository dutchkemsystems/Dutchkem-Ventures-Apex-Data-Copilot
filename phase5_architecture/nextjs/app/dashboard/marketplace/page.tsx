import React from "react";
import { headers } from "next/headers";

interface ExpertProfile {
  id: string;
  full_name: string;
  native_locale: string;
  dialect: string;
  hourly_rate: number;
  payout_rail: "kora_pay" | "kora_pay_global";
  vetting_status: string;
}

export default async function ExpertMarketplacePage() {
  const reqHeaders = await headers();
  const orgId = reqHeaders.get("x-org-id") ?? "";
  const userId = reqHeaders.get("x-user-id") ?? "";

  const res = await fetch(`${process.env.API_URL}/marketplace/experts`, {
    headers: { "x-org-id": orgId, "x-user-id": userId },
    cache: "no-store",
  });
  const data = (await res.json()) as { experts: ExpertProfile[] };

  return (
    <section className="space-y-6 p-8">
      <header className="border-b border-slate-200 pb-5">
        <p className="text-xs font-medium text-slate-500">
          Human-in-the-Loop · Vetted Native Speakers & Automated Audio QA Escrow
        </p>
        <h1 className="mt-1 text-2xl font-semibold text-slate-900">
          Expert Marketplace
        </h1>
      </header>

      <div className="border border-slate-200 bg-white rounded-lg overflow-hidden">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50 text-xs font-medium text-slate-500">
              <th className="py-3 px-4">Expert</th>
              <th className="py-3 px-4">Locale & Dialect</th>
              <th className="py-3 px-4">Payout Rail</th>
              <th className="py-3 px-4 text-right">Hourly Rate</th>
              <th className="py-3 px-4">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200 text-sm">
            {data.experts.map((expert) => (
              <tr key={expert.id}>
                <td className="py-3 px-4 font-medium text-slate-900">
                  {expert.full_name}
                </td>
                <td className="py-3 px-4 text-slate-600">
                  {expert.native_locale} · {expert.dialect}
                </td>
                <td className="py-3 px-4 font-mono text-xs text-slate-600">
                  {expert.payout_rail}
                </td>
                <td className="py-3 px-4 text-right font-mono tabular-nums text-slate-900">
                  ${Number(expert.hourly_rate).toFixed(2)}/hr
                </td>
                <td className="py-3 px-4 text-xs text-slate-700">
                  {expert.vetting_status}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
