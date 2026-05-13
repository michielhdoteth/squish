import { describe, it, expect } from "bun:test";
import { ebbinghausRetention, ebbinghausScore, getDefaultDecayParams, ebbinghausRetentionHours } from "../../../core/decay/ebbinghaus.ts";

describe("Ebbinghaus decay", () => {
  it("should retain 100% at t=0", () => {
    const retention = ebbinghausRetention({
      tau: 1.0,
      beta: 0.3,
      lastDecayAt: new Date(),
      createdAt: new Date()
    });
    expect(retention).toBeCloseTo(1.0, 2);
  });

  it("should decay over time", () => {
    const pastDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000); // 7 days ago
    const retention = ebbinghausRetention({
      tau: 1.0,
      beta: 0.3,
      lastDecayAt: pastDate,
      createdAt: pastDate
    });
    expect(retention).toBeLessThan(1.0);
    expect(retention).toBeGreaterThan(0.5); // Should retain >50% after 7 days
  });

  it("should calculate ebbinghausScore correctly", () => {
    const pastDate = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000); // 3 days ago
    const score = ebbinghausScore(100, {
      tau: 1.0,
      beta: 0.3,
      lastDecayAt: pastDate,
      createdAt: pastDate
    });
    expect(score).toBeLessThan(100);
    expect(score).toBeGreaterThan(0);
  });

  it("should have higher retention with higher tau (slower decay)", () => {
    const pastDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000); // 7 days ago
    
    const retentionLowTau = ebbinghausRetention({
      tau: 1.0,
      beta: 0.3,
      lastDecayAt: pastDate,
      createdAt: pastDate
    });
    
    const retentionHighTau = ebbinghausRetention({
      tau: 5.0,
      beta: 0.3,
      lastDecayAt: pastDate,
      createdAt: pastDate
    });
    
    expect(retentionHighTau).toBeGreaterThan(retentionLowTau);
  });

  it("should have higher retention with lower beta (slower decay)", () => {
    const pastDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000); // 7 days ago
    
    const retentionHighBeta = ebbinghausRetention({
      tau: 1.0,
      beta: 0.5,
      lastDecayAt: pastDate,
      createdAt: pastDate
    });
    
    const retentionLowBeta = ebbinghausRetention({
      tau: 1.0,
      beta: 0.1,
      lastDecayAt: pastDate,
      createdAt: pastDate
    });
    
    expect(retentionLowBeta).toBeGreaterThan(retentionHighBeta);
  });

  it("should clamp retention between 0 and 1", () => {
    // Very far in the past - should approach 0 but not go below
    const farPastDate = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000); // 1 year ago
    const retention = ebbinghausRetention({
      tau: 0.1,
      beta: 1.0,
      lastDecayAt: farPastDate,
      createdAt: farPastDate
    });
    expect(retention).toBeGreaterThanOrEqual(0);
    expect(retention).toBeLessThanOrEqual(1);
  });

  it("should get default decay params for different memory types", () => {
    const episodicParams = getDefaultDecayParams("episodic");
    expect(episodicParams.beta).toBe(0.07);
    
    const semanticParams = getDefaultDecayParams("semantic");
    expect(semanticParams.beta).toBe(0.02);
    
    const proceduralParams = getDefaultDecayParams("procedural");
    expect(proceduralParams.beta).toBe(0.03);
    
    const selfModelParams = getDefaultDecayParams("self-model");
    expect(selfModelParams.beta).toBe(0.01);
    
    const introspectiveParams = getDefaultDecayParams("introspective");
    expect(introspectiveParams.beta).toBe(0.02);
    
    const defaultParams = getDefaultDecayParams("unknown");
    expect(defaultParams.beta).toBe(0.3);
  });

  it("should calculate retention using hours-based function", () => {
    // 24 hours = 1 day, should give same result as days-based with tau=1
    const retentionDays = ebbinghausRetention({
      tau: 1.0,
      beta: 0.3,
      lastDecayAt: new Date(Date.now() - 24 * 60 * 60 * 1000), // 1 day ago
      createdAt: new Date(Date.now() - 24 * 60 * 60 * 1000)
    });
    
    const retentionHours = ebbinghausRetentionHours(24, 24, 0.3); // 24 hours, tau=24h, beta=0.3
    
    expect(retentionDays).toBeCloseTo(retentionHours, 5);
  });
});
