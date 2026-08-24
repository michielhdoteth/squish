/**
 * Global bun-test preload (Batch 4, extended Batch 5).
 *
 * Pins network-dependent features OFF for the whole suite so runs stay
 * deterministic and offline:
 *
 * - SQUISH_LOCAL_BUNDLED_MODEL=off: the local embedding provider's background
 *   bundled-model loader would attempt a network download during tests and -
 *   on machines with a warm HF cache - silently switch the corpus to 384-dim
 *   vectors mid-run, making dimension-sensitive assertions nondeterministic.
 *
 * - SQUISH_RERANKER_ENABLED=false: the cross-encoder reranker is default-ON
 *   in production since Batch 5; left enabled it would attempt an ~80MB model
 *   download inside every search-using test. Default-flip tests exercise the
 *   production defaults via explicit env objects instead.
 *
 * Individual tests that exercise these paths can override the variables
 * explicitly before importing product modules.
 */
process.env.SQUISH_LOCAL_BUNDLED_MODEL ||= 'off';
process.env.SQUISH_RERANKER_ENABLED ||= 'false';
