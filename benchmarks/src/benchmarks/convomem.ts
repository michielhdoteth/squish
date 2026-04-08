/**
 * ConvoMem Benchmark Dataset Loader
 * 
 * ConvoMem: Tests conversational memory with temporal understanding
 * Focuses on tracking changes and updates over time
 */

import type { BenchmarkDataset, ConversationSession, BenchmarkQuestion } from '../types/index.js';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

const SAMPLE_CONVOMEM_DATA: { sessions: ConversationSession[]; questions: BenchmarkQuestion[] } = {
  sessions: [
    {
      id: 'cm_session_001',
      turns: [
        { role: 'user' as const, content: 'I\'m starting a new job as a Product Manager at StartupXYZ next Monday.', timestamp: '2024-03-01T10:00:00Z' },
        { role: 'assistant' as const, content: 'Congratulations! That\'s exciting. What type of product will you be working on?', timestamp: '2024-03-01T10:00:15Z' },
        { role: 'user' as const, content: 'A fintech app for small businesses. My salary is $120k with equity.', timestamp: '2024-03-01T10:00:30Z' },
        { role: 'assistant' as const, content: 'Great opportunity! Fintech is growing fast. Are you moving or staying in your current city?', timestamp: '2024-03-01T10:00:45Z' },
        { role: 'user' as const, content: 'Staying in Austin. But I might need to relocate to San Francisco in 6 months.', timestamp: '2024-03-01T10:01:00Z' },
        { role: 'assistant' as const, content: 'Austin is a great tech hub too. Keep that SF option open - many fintech companies are based there.', timestamp: '2024-03-01T10:01:15Z' },
        // Gap - simulating passage of time
        { role: 'user' as const, content: 'Update: My start date got pushed to next month due to visa processing delays.', timestamp: '2024-03-15T10:00:00Z' },
        { role: 'assistant' as const, content: 'Sorry to hear about the delay. Is it a work visa or something else?', timestamp: '2024-03-15T10:00:15Z' },
        { role: 'user' as const, content: 'H1B transfer. The good news is they increased my salary to $135k because of the delay.', timestamp: '2024-03-15T10:00:30Z' },
        { role: 'assistant' as const, content: 'That\'s a nice gesture from them! So new start date is mid-April?', timestamp: '2024-03-15T10:00:45Z' },
        { role: 'user' as const, content: 'Yes, April 15th. Also, I\'ve decided not to relocate to SF - I\'m staying in Austin permanently.', timestamp: '2024-03-15T10:01:00Z' },
        { role: 'assistant' as const, content: 'Sounds like a solid plan. Austin has a great quality of life and growing fintech scene.', timestamp: '2024-03-15T10:01:15Z' },
        // Another time gap
        { role: 'user' as const, content: 'Quick update: I\'m actually starting this Monday (April 8th) - the visa came through early!', timestamp: '2024-04-05T10:00:00Z' },
        { role: 'assistant' as const, content: 'Fantastic news! Earlier than expected. Are you all prepared?', timestamp: '2024-04-05T10:00:15Z' },
        { role: 'user' as const, content: 'Mostly. But now they want me to split time between Austin and SF - 2 weeks each per month.', timestamp: '2024-04-05T10:00:30Z' },
        { role: 'assistant' as const, content: 'That\'s a significant change. How do you feel about the travel?', timestamp: '2024-04-05T10:00:45Z' },
        { role: 'user' as const, content: 'It\'s okay, they\'re covering all travel costs and bumped my salary to $150k for the inconvenience.', timestamp: '2024-04-05T10:01:00Z' },
        { role: 'assistant' as const, content: 'That\'s generous compensation for the travel. Make sure to negotiate a good apartment in SF.', timestamp: '2024-04-05T10:01:15Z' },
      ],
      metadata: { 
        topic: 'career_change',
        company: 'StartupXYZ',
        role: 'Product Manager',
        location: 'Austin (with SF travel)',
        has_temporal_updates: true
      },
    },
  ],
  questions: [
    {
      id: 'cm_q001',
      sessionId: 'cm_session_001',
      question: 'What is the user\'s job, company, and final salary?',
      groundTruth: 'The user is a Product Manager at StartupXYZ with a final salary of $150k plus equity.',
      answerType: 'fact',
      difficulty: 'easy',
      requiresContext: true,
    },
    {
      id: 'cm_q002',
      sessionId: 'cm_session_001',
      question: 'What were the different start dates mentioned and why did they change?',
      groundTruth: 'Original: next Monday from March 1st. Delayed to April 15th due to H1B visa processing. Final: April 8th (early approval).',
      answerType: 'temporal',
      difficulty: 'hard',
      requiresContext: true,
    },
    {
      id: 'cm_q003',
      sessionId: 'cm_session_001',
      question: 'How did the relocation plans change over time?',
      groundTruth: 'Initially: staying in Austin with possible SF move in 6 months. Then: decided to stay in Austin permanently. Finally: splitting time 50/50 between Austin and SF with company covering travel costs.',
      answerType: 'temporal',
      difficulty: 'hard',
      requiresContext: true,
    },
    {
      id: 'cm_q004',
      sessionId: 'cm_session_001',
      question: 'What were the salary progression and reasons for increases?',
      groundTruth: 'Started at $120k, increased to $135k due to visa delay compensation, final bump to $150k for the inconvenience of splitting time between cities.',
      answerType: 'temporal',
      difficulty: 'medium',
      requiresContext: true,
    },
    {
      id: 'cm_q005',
      sessionId: 'cm_session_001',
      question: 'What type of product is the user working on and what is their current work arrangement?',
      groundTruth: 'A fintech app for small businesses. Current arrangement is splitting time 50/50 between Austin and San Francisco, with the company covering all travel costs.',
      answerType: 'fact',
      difficulty: 'medium',
      requiresContext: true,
    },
  ],
};

export class ConvoMemDataset implements BenchmarkDataset {
  name = 'convomem';
  description = 'Conversational memory with temporal understanding';
  sessions: ConversationSession[] = [];
  questions: BenchmarkQuestion[] = [];

  constructor() {
    this.loadData();
  }

  private loadData(): void {
    const dataPath = process.env.BENCHMARK_DATA_DIR || './data/benchmarks';
    const filePath = join(dataPath, 'convomem.json');

    if (existsSync(filePath)) {
      try {
        const raw = readFileSync(filePath, 'utf-8');
        const data = JSON.parse(raw);
        this.sessions = data.sessions;
        this.questions = data.questions;
        console.log(`Loaded ConvoMem dataset from ${filePath}`);
        return;
      } catch (e) {
        console.warn(`Failed to load ConvoMem from file: ${e}`);
      }
    }

    this.sessions = SAMPLE_CONVOMEM_DATA.sessions;
    this.questions = SAMPLE_CONVOMEM_DATA.questions;
    console.log('Using sample ConvoMem dataset (5 questions)');
  }

  getSessionById(id: string): ConversationSession | undefined {
    return this.sessions.find(s => s.id === id);
  }

  getQuestionsForSession(sessionId: string): BenchmarkQuestion[] {
    return this.questions.filter(q => q.sessionId === sessionId);
  }
}

export function loadConvoMem(): ConvoMemDataset {
  return new ConvoMemDataset();
}
