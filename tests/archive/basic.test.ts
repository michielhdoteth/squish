import { describe, it, expect } from 'vitest';

describe('basic', () => {
  it('should pass', () => {
    expect(1 + 1).toBe(2);
  });
  
  it('should handle arrays', () => {
    expect([1, 2, 3]).toHaveLength(3);
  });
  
  it('should handle objects', () => {
    expect({ a: 1 }).toHaveProperty('a', 1);
  });
});