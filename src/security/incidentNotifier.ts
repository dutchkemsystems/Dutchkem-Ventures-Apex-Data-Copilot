import crypto from "node:crypto";

export type SecurityIncidentType =
  | "cross_plane_attempt"
  | "repeated_failed_logins"
  | "rls_violation_attempt"
  | "invalid_jwt_audience"
  | "session_hijack_suspect"
  | "moderation_auto_ban"
  | "cost_circuit_breaker_tripped"
  | "prompt_injection_attempt"
  | "tampered_api_key"
  | "anomaly_blocked_ip"
  | "impossible_travel_detected"
  | "passkey_phishing_origin_mismatch"
  | "passkey_replay_detected"
  | "merkle_chain_tamper_detected"
  | "worm_mirror_failure";

export interface SecurityIncidentNotificationInput {
  id: string;
  timestamp: string;
  incident_type: SecurityIncidentType;
  severity: "low" | "medium" | "high" | "critical";
  source_plane: "public" | "user" | "admin" | null;
  target_plane: "public" | "user" | "admin" | null;
  user_id: string | null;
  admin_id: string | null;
  route: string;
  ip_address: string;
  user_agent: string;
  details: Record<string, unknown>;
}

export interface SuperAdminAlertDispatch {
  id: string;
  incident_id: string;
  channel: "email" | "slack";
  recipient: string;
  subject: string;
  delivery_mode: "live_api" | "sandbox_logged";
  status: "sent" | "queued" | "failed";
  dispatched_at: string;
  payload: Record<string, unknown>;
}

const alertDispatchLog: SuperAdminAlertDispatch[] = [];

export function getSuperAdminAlertDispatches(limit = 100): SuperAdminAlertDispatch[] {
  return alertDispatchLog.slice(0, limit);
}

export function dispatchSuperAdminIncidentAlerts(
  incident: SecurityIncidentNotificationInput
): {
  dispatchedAt: string;
  channels: Array<"email" | "slack">;
  dispatches: SuperAdminAlertDispatch[];
} {
  const dispatchedAt = new Date().toISOString();
  const superAdminEmail =
    process.env.SUPER_ADMIN_ALERT_EMAIL || "superadmin@dutchkemventures.com";
  const slackWebhookUrl = (process.env.SLACK_SECURITY_WEBHOOK_URL || "").trim();
  const resendApiKey = (process.env.RESEND_API_KEY || "").trim();

  const subject = `[Apex Security ${incident.severity.toUpperCase()}] ${incident.incident_type} on ${incident.route}`;
  const textBody = [
    `Security Incident ID: ${incident.id}`,
    `Timestamp: ${incident.timestamp}`,
    `Type: ${incident.incident_type} (Severity: ${incident.severity})`,
    `Planes: ${incident.source_plane || "unknown"} -> ${incident.target_plane || "unknown"}`,
    `Route: ${incident.route}`,
    `IP Address: ${incident.ip_address}`,
    `User Agent: ${incident.user_agent}`,
    `User ID: ${incident.user_id || "none"} | Admin ID: ${incident.admin_id || "none"}`,
    `Details: ${JSON.stringify(incident.details)}`,
  ].join("\n");

  const emailDispatch: SuperAdminAlertDispatch = {
    id: `alrt-${crypto.randomUUID().slice(0, 12)}`,
    incident_id: incident.id,
    channel: "email",
    recipient: superAdminEmail,
    subject,
    delivery_mode: resendApiKey ? "live_api" : "sandbox_logged",
    status: "sent",
    dispatched_at: dispatchedAt,
    payload: {
      to: superAdminEmail,
      from: process.env.ALERT_FROM_EMAIL || "security-alerts@dutchkemventures.com",
      subject,
      text: textBody,
    },
  };

  if (resendApiKey) {
    void fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${resendApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(emailDispatch.payload),
      signal: AbortSignal.timeout(4000),
    }).catch(() => {
      emailDispatch.status = "failed";
    });
  }

  const slackPayload = {
    text: subject,
    blocks: [
      {
        type: "header",
        text: {
          type: "plain_text",
          text: `Apex Security Incident: ${incident.incident_type}`,
        },
      },
      {
        type: "section",
        fields: [
          { type: "mrkdwn", text: `*Severity:*\n${incident.severity.toUpperCase()}` },
          { type: "mrkdwn", text: `*Route:*\n\`${incident.route}\`` },
          {
            type: "mrkdwn",
            text: `*Plane Transition:*\n${incident.source_plane || "unknown"} -> ${incident.target_plane || "unknown"}`,
          },
          { type: "mrkdwn", text: `*Source IP:*\n\`${incident.ip_address}\`` },
        ],
      },
    ],
  };

  const slackDispatch: SuperAdminAlertDispatch = {
    id: `alrt-${crypto.randomUUID().slice(0, 12)}`,
    incident_id: incident.id,
    channel: "slack",
    recipient: slackWebhookUrl ? "configured-slack-webhook" : "#apex-security-alerts",
    subject,
    delivery_mode: slackWebhookUrl.startsWith("https://") ? "live_api" : "sandbox_logged",
    status: "sent",
    dispatched_at: dispatchedAt,
    payload: slackPayload,
  };

  if (slackWebhookUrl.startsWith("https://")) {
    void fetch(slackWebhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(slackPayload),
      signal: AbortSignal.timeout(4000),
    }).catch(() => {
      slackDispatch.status = "failed";
    });
  }

  alertDispatchLog.unshift(slackDispatch, emailDispatch);
  if (alertDispatchLog.length > 500) {
    alertDispatchLog.length = 500;
  }

  return {
    dispatchedAt,
    channels: ["email", "slack"],
    dispatches: [emailDispatch, slackDispatch],
  };
}
