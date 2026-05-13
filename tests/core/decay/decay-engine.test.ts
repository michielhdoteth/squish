import { describe, it, expect, beforeEach, afterEach, mock } from "bun:test";
import { applyEbbinghausDecay, updateAllDecayScores, previewRetention, type MemoryForDecay } from "../../../core/decay/decay-engine.ts";

describe("Decay Engine", () => {
  describe("applyEbbinghausDecay", () => {
    it("should apply decay to a memory", () => {
      const memory: MemoryForDecay = {
        id: "mem-1",
        score: 100,
        memoryType: "episodic",
        lastDecayAt: new Date(),
        createdAt: new Date()
      };
      
      const newScore = applyEbbinghausDecay(memory);
      expect(newScore).toBeCloseTo(100, 0); // Should be ~100 at t=0
    });

    it("should decay memory over time", () => {
      const pastDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000); // 7 days ago
      const memory: MemoryForDecay = {
        id: "mem-1",
        score: 100,
        memoryType: "episodic",
        lastDecayAt: pastDate,
        createdAt: pastDate
      };
      
      const newScore = applyEbbinghausDecay(memory);
      expect(newScore).toBeLessThan(100);
      expect(newScore).toBeGreaterThan(0);
    });

    it("should use custom tau and beta if provided", () => {
      const pastDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
      const memory: MemoryForDecay = {
        id: "mem-1",
        score: 100,
        lastDecayAt: pastDate,
        createdAt: pastDate,
        tau: 5.0, // Slower decay
        beta: 0.1  // Slower decay
      };
      
      const newScore = applyEbbinghausDecay(memory);
      
      // Compare with default episodic decay (beta=0.07)
      const memoryDefault: MemoryForDecay = {
        id: "mem-2",
        score: 100,
        memoryType: "episodic",
        lastDecayAt: pastDate,
        createdAt: pastDate
      };
      const newScoreDefault = applyEbbinghausDecay(memoryDefault);
      
      expect(newScore).toBeGreaterThan(newScoreDefault); // Custom should decay slower
    });
  });

  describe("previewRetention", () => {
    it("should preview retention at a future date", () => {
      const memory: MemoryForDecay = {
        id: "mem-1",
        score: 100,
        memoryType: "episodic",
        lastDecayAt: new Date(),
        createdAt: new Date()
      };
      
      const futureDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days in future
      const retention = previewRetention(memory, futureDate);
      
      expect(retention).toBeLessThan(1.0);
      expect(retention).toBeGreaterThan(0);
    });

    it("should return 1.0 retention at current time", () => {
      const memory: MemoryForDecay = {
        id: "mem-1",
        score: 100,
        memoryType: "episodic",
        lastDecayAt: new Date(),
        createdAt: new Date()
      };
      
      const retention = previewRetention(memory);
      expect(retention).toBeCloseTo(1.0, 2);
    });
  });

  describe("memory type decay rates", () => {
    it("should apply slower decay for semantic memories", () => {
      const pastDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000); // 30 days ago
      
      const episodic: MemoryForDecay = {
        id: "mem-1",
        score: 100,
        memoryType: "episodic",
        lastDecayAt: pastDate,
        createdAt: pastDate
      };
      
      const semantic: MemoryForDecay = {
        id: "mem-2",
        score: 100,
        memoryType: "semantic",
        lastDecayAt: pastDate,
        createdAt: pastDate
      };
      
      const episodicScore = applyEbbinghausDecay(episodic);
      const semanticScore = applyEbbinghausDecay(semantic);
      
      // Semantic has beta=0.02 (very slow), episodic has beta=0.07 (slow)
      // So semantic should retain more after 30 days
      expect(semanticScore).toBeGreaterThan(episodicScore);
    });

    it("should apply very slow decay for self-model memories", () => {
      const pastDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000); // 30 days ago
      
      const selfModel: MemoryForDecay = {
        id: "mem-1",
        score: 100,
        memoryType: "self-model",
        lastDecayAt: pastDate,
        createdAt: pastDate
      };
      
      const episodic: MemoryForDecay = {
        id: "mem-2",
        score: 100,
        memoryType: "episodic",
        lastDecayAt: pastDate,
        createdAt: pastDate
      };
      
      const selfModelScore = applyEbbinghausDecay(selfModel);
      const episodicScore = applyEbbinghausDecay(episodic);
      
      // Self-model has beta=0.01 (very slow), episodic has beta=0.07 (slow)
      expect(selfModelScore).toBeGreaterThan(episodicScore);
    });
  });
});
