import { expect, test } from "@playwright/test";

/**
 * Generates a browser-side mock for navigator.mediaDevices.getUserMedia & MediaRecorder
 * that outputs a clean 24kHz Mono PCM-16 .wav Blob (speech-modulated 440Hz tone at -4.5 dBFS
 * with quiet intervals so DSP SNR & noise floor checks pass deterministically on headless devices).
 */
async function installMockMobileAudioRecorder(page: import("@playwright/test").Page) {
  await page.addInitScript(() => {
    function buildClean24kWavBytes(durationSec = 0.75): ArrayBuffer {
      const sampleRate = 24000;
      const numSamples = Math.floor(sampleRate * durationSec);
      const dataBytes = numSamples * 2;
      const buffer = new ArrayBuffer(44 + dataBytes);
      const view = new DataView(buffer);

      const writeAscii = (offset: number, text: string) => {
        for (let i = 0; i < text.length; i++) {
          view.setUint8(offset + i, text.charCodeAt(i));
        }
      };

      writeAscii(0, "RIFF");
      view.setUint32(4, 36 + dataBytes, true);
      writeAscii(8, "WAVE");
      writeAscii(12, "fmt ");
      view.setUint32(16, 16, true);
      view.setUint16(20, 1, true);
      view.setUint16(22, 1, true);
      view.setUint32(24, sampleRate, true);
      view.setUint32(28, sampleRate * 2, true);
      view.setUint16(32, 2, true);
      view.setUint16(34, 16, true);
      writeAscii(36, "data");
      view.setUint32(40, dataBytes, true);

      // -4.5 dBFS peak (~0.5956) for voiced segments, ultra-quiet floor during leading/trailing pauses
      const amplitude = Math.pow(10, -4.5 / 20);
      for (let i = 0; i < numSamples; i++) {
        const t = i / sampleRate;
        const isPause = t < 0.12 || t > durationSec - 0.12;
        const sample = isPause
          ? 0.00008 * Math.sin(2 * Math.PI * 120 * t)
          : amplitude * Math.sin(2 * Math.PI * 440 * t);
        const clamped = Math.max(-1, Math.min(1, sample));
        view.setInt16(
          44 + i * 2,
          clamped < 0 ? Math.round(clamped * 0x8000) : Math.round(clamped * 0x7fff),
          true
        );
      }

      return buffer;
    }

    const fakeTrack = {
      kind: "audio",
      label: "Mocked Mobile Condenser Mic",
      stop() {},
      getSettings() {
        return { channelCount: 1, sampleRate: 24000 };
      },
    };

    const fakeStream = {
      getTracks: () => [fakeTrack],
      getAudioTracks: () => [fakeTrack],
      getVideoTracks: () => [],
    };

    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: {
        getUserMedia: async () => fakeStream,
      },
    });

    class MockMediaRecorder {
      public state: "inactive" | "recording" | "paused" = "inactive";
      public mimeType = "audio/wav";
      public ondataavailable: ((ev: { data: Blob }) => void) | null = null;
      public onstop: (() => void) | null = null;

      static isTypeSupported() {
        return true;
      }

      start() {
        this.state = "recording";
      }

      stop() {
        if (this.state === "inactive") return;
        this.state = "inactive";
        const wavBuffer = buildClean24kWavBytes(0.75);
        const wavBlob = new Blob([wavBuffer], { type: "audio/wav" });
        setTimeout(() => {
          this.ondataavailable?.({ data: wavBlob });
          this.onstop?.();
        }, 40);
      }
    }

    Object.defineProperty(window, "MediaRecorder", {
      configurable: true,
      writable: true,
      value: MockMediaRecorder,
    });
  });
}

test.describe("Phase 22E: Mobile E2E Verification", () => {
  test("signs up, records mocked audio in mobile workspace, runs QA Agent, and submits task", async ({
    page,
  }, testInfo) => {
    await installMockMobileAudioRecorder(page);

    const uniqueId = `${Date.now()}-${Math.floor(Math.random() * 10000)}`;
    const projectSlug = testInfo.project.name.toLowerCase().replace(/[^a-z0-9]+/g, "-");
    const testEmail = `mobile.${projectSlug}.${uniqueId}@dutchkem.test`;

    // 1. Open /signup on mobile/tablet viewport & verify no horizontal overflow
    await page.goto("/signup", { waitUntil: "domcontentloaded" });
    await expect(
      page.getByRole("heading", { name: /Start your 14-day free trial/i })
    ).toBeVisible();

    const signupOverflow = await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth
    );
    expect(signupOverflow).toBeLessThanOrEqual(2);

    // Check 44px minimum touch target on signup submit button
    const signupBtn = page.getByRole("button", { name: /Create 14-Day Trial Workspace/i });
    const signupBtnBox = await signupBtn.boundingBox();
    expect(signupBtnBox).not.toBeNull();
    expect(signupBtnBox!.height).toBeGreaterThanOrEqual(44);

    // 2. Complete User Signup form
    await page.locator("#signup-name").fill("Alex Mercer");
    await page.locator("#signup-org").fill(`Apex Mobile Studio ${projectSlug}`);
    await page.locator("#login-email").fill(testEmail);
    await page.locator("#login-password").fill("ApexMobile2026!");
    await signupBtn.click();

    // 3. Complete 3-Step Onboarding Gate
    await expect(page.getByRole("heading", { name: /Connect Kora Pay/i })).toBeVisible();
    await page.getByRole("button", { name: /Connect Kora Pay & Continue/i }).click();

    await expect(page.getByRole("heading", { name: /Choose Subscription Plan/i })).toBeVisible();
    await page.getByRole("button", { name: /Start 14-Day Free Trial & Continue/i }).click();

    await expect(page.getByRole("heading", { name: /Upload First File/i })).toBeVisible();
    await page.getByRole("button", { name: /Run QA Test & Unlock Dashboard/i }).click();

    // 4. Verify Dashboard unlocked & mobile Bottom Navigation Bar is visible on <lg viewports
    const mobileBottomNav = page.getByRole("navigation", { name: /Mobile primary navigation/i });
    await expect(mobileBottomNav).toBeVisible();

    // Navigate to /dashboard/workspace via the shadcn/ui mobile Sheet drawer
    const drawerTrigger = page.getByRole("button", { name: /Open workspace navigation menu/i });
    const drawerBox = await drawerTrigger.boundingBox();
    expect(drawerBox).not.toBeNull();
    expect(drawerBox!.width).toBeGreaterThanOrEqual(44);
    expect(drawerBox!.height).toBeGreaterThanOrEqual(44);

    await drawerTrigger.click();
    await page.getByRole("button", { name: /Capture Workspace/i }).click();

    await expect(
      page.getByRole("heading", { name: /Mobile Audio & Video Capture Workspace/i })
    ).toBeVisible();

    // Verify native mobile file input uses capture="environment"
    const captureInput = page.getByTestId("mobile-native-capture-input");
    await expect(captureInput).toHaveAttribute("accept", "audio/*,video/*");
    await expect(captureInput).toHaveAttribute("capture", "environment");

    // 5. Record Audio (mocked MediaRecorder -> 24kHz Mono WAV)
    const recordBtn = page.getByRole("button", { name: /^Record Audio$/i });
    const recordBtnBox = await recordBtn.boundingBox();
    expect(recordBtnBox).not.toBeNull();
    expect(recordBtnBox!.height).toBeGreaterThanOrEqual(44);

    await recordBtn.click();
    await expect(page.getByText(/REC AUDIO/i)).toBeVisible();

    await page.getByRole("button", { name: /Stop Audio Recording/i }).click();

    // Confirm WAV conversion preview renders & upload directly to QA Agent
    const uploadQaBtn = page.getByRole("button", {
      name: /Upload \.WAV Audio Directly to QA Agent/i,
    });
    await expect(uploadQaBtn).toBeVisible();
    await expect(page.getByText(/24000 Hz · Mono/i)).toBeVisible();

    await uploadQaBtn.click();
    await expect(page.getByText(/Audio QA Verdict: PASSED/i)).toBeVisible();

    // 6. Submit recorded task output on the assigned mobile script
    const submitTaskBtn = page.getByRole("button", {
      name: /Submit Recording & Task for Review/i,
    });
    await expect(submitTaskBtn).toBeEnabled();
    await submitTaskBtn.click();

    await expect(
      page.getByText(/Submitted "Mobile Audio QA Onboarding Script — Pan-African Greeting" for review\./i)
    ).toBeVisible();

    // Confirm zero horizontal overflow across /dashboard/workspace on mobile viewport
    const workspaceOverflow = await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth
    );
    expect(workspaceOverflow).toBeLessThanOrEqual(2);
  });

  test("renders offline fallback page (/offline) cleanly without horizontal overflow", async ({
    page,
  }) => {
    await page.goto("/offline", { waitUntil: "domcontentloaded" });
    await expect(
      page.getByRole("heading", { name: /Offline Assigned Scripts & Job Briefs/i })
    ).toBeVisible();
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth
    );
    expect(overflow).toBeLessThanOrEqual(2);
  });
});
