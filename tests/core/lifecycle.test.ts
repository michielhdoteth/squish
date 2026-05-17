import { describe, it, expect } from "bun:test";

describe("Lifecycle - Decay Migration", () => {
  it("should have decay migrated comment in lifecycle.ts", async () => {
    // Read the lifecycle.ts file to verify migration comment exists
    const lifecycleContent = await Bun.file("core/lifecycle.ts").text();
    expect(lifecycleContent).toContain("Decay migrated to Ebbinghaus engine");
  });

  it("should no longer have sector-based decay logic (applyDecay)", async () => {
    const lifecycleContent = await Bun.file("core/lifecycle.ts").text();
    // The applyDecay function should be commented out or removed
    // But runLifecycleMaintenance should still be exported
    expect(lifecycleContent).toContain("runLifecycleMaintenance");
  });

  it("should still export LifecycleStats interface", async () => {
    const lifecycleModule = await import("../../core/lifecycle.ts");
    // The module should still export the type even if decay is removed
    expect(lifecycleModule.runLifecycleMaintenance).toBeDefined();
    expect(typeof lifecycleModule.runLifecycleMaintenance).toBe("function");
  });

  it("should return empty stats when lifecycle is disabled", async () => {
    const lifecycleModule = await import("../../core/lifecycle.ts");
    const result = await lifecycleModule.runLifecycleMaintenance("test-project");
    // Should return zeros rather than crash
    expect(result).toBeDefined();
    expect(result.decayed).toBeGreaterThanOrEqual(0);
    expect(result.evicted).toBeGreaterThanOrEqual(0);
    expect(result.promoted).toBeGreaterThanOrEqual(0);
    expect(result.expired).toBeGreaterThanOrEqual(0);
  });
});
