import React from "react";

export default function AdminControlPlanePage() {
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold text-white">Platform Admin &amp; DPO Control Plane</h1>
      <p className="text-sm text-slate-400">
        Dedicated /admin route group with TOTP enforcement, KEK_ADMIN envelope decryption, and
        security incident monitoring.
      </p>
    </div>
  );
}
