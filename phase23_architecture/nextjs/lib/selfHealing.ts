/**
 * Phase 23E Reference: Next.js Sentry 5xx Incident Hook, 5-Failure Circuit Breakers & Graceful Degradation
 */

export type ProtectedProvider = "kora_pay" | "openai" | "redis";

export class CircuitBreaker {
  private failures = 0;
  private openUntilMs = 0;

  constructor(
    public readonly provider: ProtectedProvider,
    private readonly threshold = 5,
    private readonly resetTimeoutMs = 30_000
  ) {}

  isOpen(): boolean {
    if (this.openUntilMs > Date.now()) return true;
    if (this.openUntilMs !== 0 && Date.now() >= this.openUntilMs) {
      this.failures = 0;
      this.openUntilMs = 0;
    }
    return false;
  }

  async run<T>(primaryFn: () => Promise<T>, fallbackFn: () => Promise<T>): Promise<T> {
    if (this.isOpen()) {
      return fallbackFn();
    }
    try {
      const result = await primaryFn();
      this.failures = 0;
      this.openUntilMs = 0;
      return result;
    } catch (err) {
      this.failures += 1;
      if (this.failures >= this.threshold) {
        this.openUntilMs = Date.now() + this.resetTimeoutMs;
        await notifySreIncident({
          provider: this.provider,
          message: `Circuit open after ${this.failures} consecutive failures`,
          error: String(err),
        });
      }
      return fallbackFn();
    }
  }
}

export async function notifySreIncident(payload: Record<string, unknown>): Promise<void> {
  const slack = process.env.SLACK_SECURITY_WEBHOOK_URL;
  if (slack && slack.startsWith("https://")) {
    await fetch(slack, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: `[Apex SRE] ${JSON.stringify(payload)}` }),
    }).catch(() => {});
  }
}
