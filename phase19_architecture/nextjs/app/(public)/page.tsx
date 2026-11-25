import React from "react";

export default function PublicHomePage() {
  return (
    <section className="max-w-5xl mx-auto px-6 py-16 space-y-4">
      <p className="text-xs font-semibold text-blue-700">Public Identity Plane</p>
      <h1 className="text-3xl font-bold tracking-tight text-slate-950">
        Dutchkem Ventures Apex Data Copilot
      </h1>
      <p className="text-sm text-slate-600 max-w-2xl">
        Public marketing, pricing, blog, and NDPA legal pages operate on an unauthenticated plane
        with zero access to User or Admin session contexts.
      </p>
    </section>
  );
}
