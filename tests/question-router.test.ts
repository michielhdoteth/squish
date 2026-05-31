import { describe, it, expect } from 'bun:test';
import { detectQuestionType, questionPlaceType, getAdjacentPlaces } from '../core/places/question-router.js';

describe('questionPlaceType', () => {
  it('routes temporal questions to ref', () => {
    expect(questionPlaceType('When did we decide on pricing?')).toBe('ref');
  });
  
  it('routes preference questions to board', () => {
    expect(questionPlaceType('What do we prefer for the frontend?')).toBe('board');
  });
  
  it('routes active work questions to wip', () => {
    expect(questionPlaceType('What are we currently building?')).toBe('wip');
  });
  
  it('routes idea questions to sparks', () => {
    expect(questionPlaceType('What if we added a dream mode?')).toBe('sparks');
  });
  
  it('routes multi-hop questions to inbox', () => {
    expect(questionPlaceType('Across sessions, what did we discuss?')).toBe('inbox');
  });
  
  it('routes factual questions to ref', () => {
    expect(questionPlaceType('What is the architecture?')).toBe('ref');
  });
  
  it('routes event questions to wip', () => {
    expect(questionPlaceType('What did we do yesterday?')).toBe('wip');
  });
  
  it('routes unknown questions to inbox', () => {
    expect(questionPlaceType('tell me something')).toBe('inbox');
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
});