import { expect, test } from "@playwright/test";

test.describe("Apex Data Copilot Mobile E2E", () => {
  test("signs up, records mocked audio, uploads to QA Agent, and submits task", async ({
    page,
  }) => {
    await page.addInitScript(() => {
      const fakeTrack = {
        kind: "audio",
        stop() {},
        getSettings: () => ({ channelCount: 1, sampleRate: 24000 }),
      };
      Object.defineProperty(navigator, "mediaDevices", {
        configurable: true,
        value: {
          getUserMedia: async () => ({
            getTracks: () => [fakeTrack],
            getAudioTracks: () => [fakeTrack],
            getVideoTracks: () => [],
          }),
        },
      });
    });

    await page.goto("/signup");
    await page.locator("#signup-name").fill("Alex Mercer");
    await page.locator("#signup-org").fill("Apex Mobile Studio");
    await page.locator("#login-email").fill(`mobile.${Date.now()}@dutchkem.test`);
    await page.locator("#login-password").fill("ApexMobile2026!");
    await page.getByRole("button", { name: /Create 14-Day Trial Workspace/i }).click();

    await page.getByRole("button", { name: /Connect Kora Pay & Continue/i }).click();
    await page.getByRole("button", { name: /Start 14-Day Free Trial & Continue/i }).click();
    await page.getByRole("button", { name: /Run QA Test & Unlock Dashboard/i }).click();

    await page.goto("/dashboard/workspace");
    await page.getByRole("button", { name: /^Record Audio$/i }).click();
    await page.getByRole("button", { name: /Stop Audio Recording/i }).click();
    await page.getByRole("button", { name: /Upload \.WAV Audio Directly to QA Agent/i }).click();
    await expect(page.getByText(/Audio QA Verdict: PASSED/i)).toBeVisible();
    await page.getByRole("button", { name: /Submit Recording & Task for Review/i }).click();
  });
});
