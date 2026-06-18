import { describe, expect, it } from "vitest";

import {
  calculateAiCreditBalance,
  getAiCreditCost,
  readAiCreditAllowance,
  utcMonthWindow
} from "../../src/services/ai/ai-credits";

describe("AI credits", () => {
  it("prices MiDoc AI tasks using the commercial credit catalog", () => {
    expect(getAiCreditCost("SOAP_SUMMARY")).toBe(1);
    expect(getAiCreditCost("PATIENT_INSTRUCTIONS")).toBe(1);
    expect(getAiCreditCost("TRANSCRIPTION")).toBe(1);
    expect(getAiCreditCost("LONGITUDINAL_SUMMARY")).toBe(2);
    expect(getAiCreditCost("CLINICAL_GAP")).toBe(2);
    expect(getAiCreditCost("CONSULTATION_STRUCTURING")).toBe(1);
  });

  it("reads a monthly allowance only when the AI capability is enabled", () => {
    expect(readAiCreditAllowance({ ai: true, aiCreditsMonthly: 900 })).toBe(900);
    expect(readAiCreditAllowance({ ai: true, aiCreditsMonthly: "1800" })).toBe(1800);
    expect(readAiCreditAllowance({ ai: false, aiCreditsMonthly: 900 })).toBe(0);
    expect(readAiCreditAllowance({ ai: true, aiCreditsMonthly: -1 })).toBe(0);
  });

  it("calculates remaining credits, warning threshold and overage without blocking", () => {
    const normal = calculateAiCreditBalance({
      monthlyCredits: 120,
      consumedCredits: 96
    });
    expect(normal.remainingCredits).toBe(24);
    expect(normal.overageCredits).toBe(0);
    expect(normal.usageRatio).toBe(0.8);
    expect(normal.nearLimit).toBe(true);
    expect(normal.shouldBlockUsage).toBe(false);

    const exceeded = calculateAiCreditBalance({
      monthlyCredits: 120,
      consumedCredits: 124
    });
    expect(exceeded.remainingCredits).toBe(0);
    expect(exceeded.overageCredits).toBe(4);
    expect(exceeded.shouldBlockUsage).toBe(false);
  });

  it("builds UTC monthly windows for plan credit renewal", () => {
    const window = utcMonthWindow(new Date("2026-06-17T18:30:00.000Z"));
    expect(window.periodStart.toISOString()).toBe("2026-06-01T00:00:00.000Z");
    expect(window.periodEnd.toISOString()).toBe("2026-07-01T00:00:00.000Z");
    expect(window.periodKey).toBe("2026-06");
  });
});
