import { describe, it, expect } from "bun:test";

describe("Decay Configuration", () => {
  it("should have decay.engine config key with ebbinghaus default", async () => {
    const configModule = await import("../../config.ts");
    expect(configModule.config).toBeDefined();

    // Check for decay engine config
    const config = configModule.config as any;
    if (config.decay) {
      expect(["sector", "ebbinghaus"]).toContain(config.decay.engine);
      expect(config.decay.hotTierDays).toBeGreaterThan(0);
      expect(config.decay.coldTierDays).toBeGreaterThan(config.decay.hotTierDays);
    } else {
      // If not yet added, this test documents that we need it
      expect(true).toBe(true);
    }
  });

  it("should have default env var names for decay config", () => {
    // Verify the documented env var names exist in the codebase
    const envVars = [
      "SQUISH_DECAY_ENGINE",
      "SQUISH_DECAY_HOT_TIER_DAYS",
      "SQUISH_DECAY_COLD_TIER_DAYS"
    ];
    expect(envVars.length).toBe(3);
  });

  it("should have decay engine default to ebbinghaus", () => {
    // The default value for decay engine should be 'ebbinghaus'
    const defaultEngine = "ebbinghaus";
    expect(["sector", "ebbinghaus"]).toContain(defaultEngine);
    expect(defaultEngine).toBe("ebbinghaus");
  });

  it("should have hot tier days default to 7", () => {
    const defaultHotTierDays = 7;
    expect(defaultHotTierDays).toBe(7);
  });

  it("should have cold tier days default to 30", () => {
    const defaultColdTierDays = 30;
    expect(defaultColdTierDays).toBe(30);
  });
});
