import { describe, it, expect } from 'bun:test';
import { findMatchingPlaces, findMatchingPlace, getAdjacentPlaces, ADJACENT_PLACES } from '../core/places/rules.js';
import type { PlaceCandidate } from '../core/places/rules.js';

describe('findMatchingPlaces', () => {
  it('returns ranked candidates for tool-based match', async () => {
    const candidates = await findMatchingPlaces(undefined, {
      toolName: 'Write',
      content: 'implementing the new feature',
    });
    
    expect(candidates.length).toBeGreaterThan(0);
    expect(candidates[0].type).toBe('wip');
    expect(candidates[0].weight).toBeGreaterThan(0);
    expect(candidates[0].source).toBe('heuristic');
  });

  it('returns multiple candidates when content matches multiple rules', async () => {
    const candidates = await findMatchingPlaces(undefined, {
      toolName: 'Write',
      content: 'decided to implement the fix',
    });
    
    // Should match both Write->wip and decided->board
    expect(candidates.length).toBeGreaterThanOrEqual(2);
    const types = candidates.map(c => c.type);
    expect(types).toContain('wip');
    expect(types).toContain('board');
  });

  it('returns inbox when no rules match', async () => {
    const candidates = await findMatchingPlaces(undefined, {
      content: 'random content with no matching keywords',
    });
    
    expect(candidates.length).toBe(1);
    expect(candidates[0].type).toBe('inbox');
  });

  it('deduplicates by place type', async () => {
    const candidates = await findMatchingPlaces(undefined, {
      toolName: 'Write',
      content: 'fix the bug in the write module',
    });
    
    const types = candidates.map(c => c.type);
    const uniqueTypes = [...new Set(types)];
    expect(types.length).toBe(uniqueTypes.length);
  });
});

describe('findMatchingPlace (backward compat)', () => {
  it('returns single place type', async () => {
    const place = await findMatchingPlace(undefined, {
      toolName: 'Write',
    });
    
    expect(place).toBe('wip');
  });

  it('returns null when no match', async () => {
    const place = await findMatchingPlace(undefined, {
      content: 'random stuff',
    });
    
    // Should return inbox (from findMatchingPlaces fallback)
    expect(place).toBe('inbox');
  });
});

describe('getAdjacentPlaces', () => {
  it('board expands to wip and ref', () => {
    expect(getAdjacentPlaces('board')).toEqual(['wip', 'ref']);
  });
  
  it('inbox expands to all active places', () => {
    expect(getAdjacentPlaces('inbox')).toEqual(['board', 'wip', 'sparks', 'ref']);
  });
  
  it('sparks expands to board and wip', () => {
    expect(getAdjacentPlaces('sparks')).toEqual(['board', 'wip']);
  });
  
  it('ref expands to board and wip', () => {
    expect(getAdjacentPlaces('ref')).toEqual(['board', 'wip']);
  });
});
