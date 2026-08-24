/**
 * Global bun-test preload (Batch 4).
 *
 * Pins the local embedding provider to deterministic offline TF-IDF for the
 * whole suite. Without this, the Batch 4 bundled-model background loader
 * would attempt a network download during tests and - on machines with a
 * warm HF cache - silently switch the corpus to 384-dim vectors mid-run,
 * making dimension-sensitive assertions nondeterministic.
 *
 * Individual tests that exercise the bundled-model path can override the
 * variable explicitly before importing product modules.
 */
process.env.SQUISH_LOCAL_BUNDLED_MODEL ||= 'off';
