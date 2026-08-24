/**
 * Batch 4 unit tests - embedding blob codec.
 *
 * Covers: float32 LE round-trip, known-byte endianness spot check,
 * L2-normalization invariant (dot == cosine), malformed input rejection,
 * and prepareEmbedding write-path stamping/normalization.
 */

import { describe, test, expect } from 'bun:test';
import {
  encodeEmbeddingBlob,
  decodeEmbeddingBlob,
  normalizeForStorage,
  embeddingByteLength,
} from '../../../core/lib/embedding-codec.js';
import { prepareEmbedding } from '../../../core/lib/utils.js';
import { cosineSimilarity, dotProduct, DimensionMismatchError } from '../../../core/utils/vector-operations.js';

describe('embedding codec', () => {
  test('round-trips a vector through blob encode/decode', () => {
    const vec = [0.5, -1.25, 0.125, 2.0, -0.75, 0];
    const blob = encodeEmbeddingBlob(vec);
    expect(blob).not.toBeNull();
    const decoded = decodeEmbeddingBlob(blob);
    expect(decoded).not.toBeNull();
    expect(decoded!.length).toBe(vec.length);
    // Normalized magnitudes preserve direction; compare via cosine == 1
    expect(cosineSimilarity(Array.from(decoded!), vec)).toBeCloseTo(1, 6);
    // Unit-norm invariant survives storage
    let normSq = 0;
    for (const v of decoded!) normSq += v * v;
    expect(Math.sqrt(normSq)).toBeCloseTo(1, 5);
  });

  test('round-trip preserves values for an already-normalized vector exactly (within f32)', () => {
    const vec = normalizeForStorage([3, 4]);
    const decoded = decodeEmbeddingBlob(encodeEmbeddingBlob(vec))!;
    for (let i = 0; i < vec.length; i++) {
      expect(Math.abs(decoded[i] - vec[i])).toBeLessThan(1e-6);
    }
  });

  test('emits little-endian float32 bytes for a known value', () => {
    // Float32 LE of 1.0 is 00 00 80 3f
    const blob = encodeEmbeddingBlob([1]);
    expect(blob).not.toBeNull();
    expect(Array.from(blob!)).toEqual([0x00, 0x00, 0x80, 0x3f]);
    // [-2] normalizes to -1.0, whose float32 LE is 00 00 80 bf
    const blobNeg = encodeEmbeddingBlob([-2]);
    expect(Array.from(blobNeg!)).toEqual([0x00, 0x00, 0x80, 0xbf]);
  });

  test('normalization invariant: dot product of stored blobs equals cosine similarity', () => {
    const a = normalizeForStorage([0.3, -0.9, 0.12, 4.4, -7.7]);
    const b = normalizeForStorage([-1.1, 0.02, 3.3, -0.8, 0.5]);

    const fa = decodeEmbeddingBlob(encodeEmbeddingBlob(a))!;
    const fb = decodeEmbeddingBlob(encodeEmbeddingBlob(b))!;

    const dot = dotProduct(fa, fb);
    const cos = cosineSimilarity(a, b);
    expect(dot).toBeCloseTo(cos, 5);

    // Self dot product == 1 (unit norm invariant survives storage)
    const selfDot = dotProduct(fa, fa);
    expect(selfDot).toBeCloseTo(1, 5);
  });

  test('normalizeForStorage returns unit-length vectors without mutating input', () => {
    const original = [1, 2, 2];
    const copy = [...original];
    const normalized = normalizeForStorage(original);
    expect(original).toEqual(copy); // no mutation
    const norm = Math.sqrt(normalized.reduce((s, x) => s + x * x, 0));
    expect(norm).toBeCloseTo(1, 10);
  });

  test('normalizeForStorage keeps zero vectors intact', () => {
    expect(normalizeForStorage([0, 0, 0])).toEqual([0, 0, 0]);
  });

  test('encode rejects null/empty/zero vectors', () => {
    expect(encodeEmbeddingBlob(null)).toBeNull();
    expect(encodeEmbeddingBlob(undefined)).toBeNull();
    expect(encodeEmbeddingBlob([])).toBeNull();
    expect(encodeEmbeddingBlob([0, 0, 0])).toBeNull();
  });

  test('decode rejects garbage and undersized payloads', () => {
    expect(decodeEmbeddingBlob(null)).toBeNull();
    expect(decodeEmbeddingBlob(undefined)).toBeNull();
    expect(decodeEmbeddingBlob('not a buffer')).toBeNull();
    expect(decodeEmbeddingBlob(new Uint8Array(3))).toBeNull(); // < 4 bytes
    // 5-7 byte payloads still yield the whole-float32 prefix
    expect(decodeEmbeddingBlob(new Uint8Array(7))!.length).toBe(1);
  });

  test('decode uses the largest whole-float32 prefix of odd-sized buffers', () => {
    const vec = [1.5, -0.5, 2.5]; // 12 bytes
    const blob = encodeEmbeddingBlob(vec)!;
    // encode normalizes; recover the stored values via a clean decode
    const clean = decodeEmbeddingBlob(blob)!;
    const withJunk = new Uint8Array(blob.length + 3);
    withJunk.set(blob, 0);
    withJunk.set([0xaa, 0xbb, 0xcc], blob.length);
    const decoded = decodeEmbeddingBlob(withJunk);
    expect(decoded).not.toBeNull();
    expect(decoded!.length).toBe(3);
    for (let i = 0; i < 3; i++) {
      expect(Math.abs(decoded![i] - clean[i])).toBeLessThan(1e-6);
    }
  });

  test('blob byte length scales as dim * 4', () => {
    expect(embeddingByteLength(384)).toBe(1536);
    expect(embeddingByteLength(768)).toBe(3072);
    expect(encodeEmbeddingBlob(new Array(10).fill(0.25))!.length).toBe(40);
  });

  test('decode rejects NaN/Inf in ANY element, not just element 0', () => {
    const vec = [1.5, -0.5, 2.5, 4.0];
    const blob = encodeEmbeddingBlob(vec)!; // 16 bytes, aligned

    const poisonAt = (index: number, bytes: number[]) => {
      const corrupted = Buffer.from(blob);
      corrupted.set(bytes, index * 4);
      return decodeEmbeddingBlob(corrupted);
    };

    // NaN = 0x7fc00000 (little-endian), +Inf = 0x7f800000.
    expect(poisonAt(1, [0x00, 0x00, 0xc0, 0x7f])).toBeNull();
    expect(poisonAt(2, [0x00, 0x00, 0xc0, 0x7f])).toBeNull();
    expect(poisonAt(3, [0x00, 0x00, 0x80, 0x7f])).toBeNull();
    // Clean payload still decodes fine after the same dance.
    expect(decodeEmbeddingBlob(blob)).not.toBeNull();

    // Unaligned path validates the full array too (odd prefix shifts alignment).
    const odd = new Uint8Array(blob.length + 2);
    odd.set(blob, 2); // forces the DataView/slowDecode path
    expect(decodeEmbeddingBlob(odd)!.length).toBe(4);
  });
});

describe('prepareEmbedding write path (Batch 4)', () => {
  test('stores BOTH blob and JSON compat formats, normalized identically', () => {
    const values = prepareEmbedding([3, 4], { model: 'test-model' });
    expect(values.embeddingJson).toBeDefined();
    expect(values.embeddingBlob).toBeInstanceOf(Buffer);
    const jsonVec = JSON.parse(values.embeddingJson!) as number[];
    expect(jsonVec[0]).toBeCloseTo(0.6, 6);
    expect(jsonVec[1]).toBeCloseTo(0.8, 6);
    // Blob and JSON decode to the same vector
    const blobVec = Array.from(decodeEmbeddingBlob(values.embeddingBlob)!);
    expect(blobVec[0]).toBeCloseTo(jsonVec[0], 6);
    expect(blobVec[1]).toBeCloseTo(jsonVec[1], 6);
  });

  test('stamps model id and dimension', () => {
    const values = prepareEmbedding([1, 2, 3], { model: 'transformers:Xenova/all-MiniLM-L6-v2:q8' });
    expect(values.embeddingModel).toBe('transformers:Xenova/all-MiniLM-L6-v2:q8');
    expect(values.embeddingDim).toBe(3);
  });

  test('handles null embedding gracefully', () => {
    const values = prepareEmbedding(null, { model: 'm' });
    expect(values.embeddingJson).toBeNull();
    expect(values.embeddingBlob).toBeNull();
    expect(values.embeddingModel).toBe('m');
    expect(values.embeddingDim).toBeNull();
  });

  test('dimension mismatch between query and candidate throws DimensionMismatchError', () => {
    expect(() => cosineSimilarity([1, 2], [1, 2, 3])).toThrow(DimensionMismatchError);
    expect(() => dotProduct(Float32Array.from([1, 2]), Float32Array.from([1, 2, 3]))).toThrow(DimensionMismatchError);
  });
});
