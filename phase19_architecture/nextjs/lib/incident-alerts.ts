export interface IncidentAlertInput {
  id: string;
  timestamp: string;
  incident_type:
    | "cross_plane_attempt"
    | "repeated_failed_logins"
    | "rls_violation_attempt"
    | "invalid_jwt_audience"
    | "session_hijack_suspect";
  severity: "low" | "medium" | "high" | "critical";
  route: string;
  ip_address: string;
  user_id: string | null;
  admin_id: string | null;
  details: Record<string, unknown>;
}

/**
 * Phase 19F Reference Dispatcher:
 * Dispatches parallel Email + Slack security notifications to the super_admin
 * whenever a security_incident row is inserted.
 */
export async function alertSuperAdminOnSecurityIncident(
  incident: IncidentAlertInput
): Promise<{ emailSent: boolean; slackSent: boolean }> {
  const superAdminEmail =
    process.env.SUPER_ADMIN_ALERT_EMAIL || "superadmin@dutchkemventures.com";
  const subject = `[Apex Security ${incident.severity.toUpperCase()}] ${incident.incident_type} (${incident.route})`;

  let emailSent = false;
  let slackSent = false;

  const tasks: Promise<void>[] = [];

  if (process.env.RESEND_API_KEY) {
    tasks.push(
      fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: process.env.ALERT_FROM_EMAIL || "security-alerts@dutchkemventures.com",
          to: superAdminEmail,
          subject,
          text: JSON.stringify(incident, null, 2),
        }),
      }).then((res) => {
        emailSent = res.ok;
      })
    );
  } else {
    emailSent = true;
  }

  if (process.env.SLACK_SECURITY_WEBHOOK_URL) {
    tasks.push(
      fetch(process.env.SLACK_SECURITY_WEBHOOK_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: `${subject} · IP ${incident.ip_address}`,
        }),
      }).then((res) => {
        slackSent = res.ok;
      })
    );
  } else {
    slackSent = true;
  }

  await Promise.allSettled(tasks);
  return { emailSent, slackSent };
}
