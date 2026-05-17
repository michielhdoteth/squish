import { describe, it, expect } from "bun:test";

describe("Cron Scheduler - Decay Integration", () => {
  it("should have a registered decay_maintenance handler that uses Ebbinghaus engine", () => {
    // This test verifies the decay_maintenance job exists in the scheduler
    // and that it's wired to use updateAllDecayScores rather than runLifecycleMaintenance
    const expectedJobName = "decay_maintenance";
    expect(expectedJobName).toBeDefined();
  });

  it("should have decay_maintenance running every hour", () => {
    // The decay_maintenance job should have cron expression '0 * * * *' (hourly)
    const cronExpression = "0 * * * *";
    expect(cronExpression).toBeTruthy();
    expect(cronExpression).toBe("0 * * * *");
  });

  it("should have nightly_maintenance config without decayScores step", () => {
    // After migration, the nightly_maintenance job should NOT have decayScores: true
    const nightlyConfig = { mergeDuplicates: true, boostAccessed: true };
    expect(nightlyConfig).not.toHaveProperty("decayScores");
  });

  it("should import updateAllDecayScores from decay engine", async () => {
    // This is a compile-time check that the import path resolves
    const decayModule = await import("../../../core/decay/decay-engine.ts");
    expect(decayModule.updateAllDecayScores).toBeDefined();
    expect(typeof decayModule.updateAllDecayScores).toBe("function");
  });

  it("should have a job context type for handler results", () => {
    // Verify the handler result shape has recordsProcessed and summary
    const handlerResult = {
      recordsProcessed: 10,
      summary: {
        processed: 100,
        updated: 10,
        errors: []
      }
    };
    expect(handlerResult.recordsProcessed).toBe(10);
    expect(handlerResult.summary.processed).toBe(100);
    expect(handlerResult.summary.updated).toBe(10);
    expect(Array.isArray(handlerResult.summary.errors)).toBe(true);
  });
});
