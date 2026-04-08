/**
 * LongMemEval Benchmark Dataset Loader
 * 
 * LongMemEval: Tests long-form memory retrieval with multi-hop reasoning
 * Based on the LongMemEval paper (achieving 81.6% for Supermemory)
 */

import type { BenchmarkDataset, ConversationSession, BenchmarkQuestion } from '../types/index.js';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

const SAMPLE_LONGMEMEVAL_DATA: { sessions: ConversationSession[]; questions: BenchmarkQuestion[] } = {
  sessions: [
    {
      id: 'lme_session_001',
      turns: [
        { role: 'user' as const, content: 'I need help organizing a conference on AI ethics for my company, TechCorp.', timestamp: '2024-02-01T09:00:00Z' },
        { role: 'assistant' as const, content: 'I\'d be happy to help! What\'s your timeline and expected attendee count?', timestamp: '2024-02-01T09:00:15Z' },
        { role: 'user' as const, content: 'We need it ready by March 15th, expecting about 200 attendees. Budget is $50,000.', timestamp: '2024-02-01T09:00:30Z' },
        { role: 'assistant' as const, content: 'That\'s a tight timeline but doable. Have you secured a venue yet?', timestamp: '2024-02-01T09:00:45Z' },
        { role: 'user' as const, content: 'Yes, we booked the Grand Plaza Hotel downtown. My colleague Mike is handling catering.', timestamp: '2024-02-01T09:01:00Z' },
        { role: 'assistant' as const, content: 'Great choice on the venue. What about speakers? Do you have keynotes confirmed?', timestamp: '2024-02-01T09:01:15Z' },
        { role: 'user' as const, content: 'Dr. Sarah Chen from MIT agreed to keynote. We\'re still looking for two more panelists.', timestamp: '2024-02-01T09:01:30Z' },
        { role: 'assistant' as const, content: 'Dr. Chen is excellent! For panelists, consider inviting ethicists from major tech companies.', timestamp: '2024-02-01T09:01:45Z' },
        { role: 'user' as const, content: 'Good idea. My manager Jennifer suggested we livestream the event for remote employees.', timestamp: '2024-02-01T09:02:00Z' },
        { role: 'assistant' as const, content: 'Livestreaming is smart for inclusion. You\'ll need AV equipment and a platform. Have you allocated budget for that?', timestamp: '2024-02-01T09:02:15Z' },
        { role: 'user' as const, content: 'Not specifically. Our CFO, Robert, said we might go 10% over budget if needed.', timestamp: '2024-02-01T09:02:30Z' },
        { role: 'assistant' as const, content: 'That flexibility helps. I recommend hiring a professional AV team for both in-person and streaming quality.', timestamp: '2024-02-01T09:02:45Z' },
        { role: 'user' as const, content: 'I\'ll look into that. By the way, the conference theme is "Responsible AI: Building Trust".', timestamp: '2024-02-01T09:03:00Z' },
        { role: 'assistant' as const, content: 'Strong theme! Make sure your marketing materials reflect it consistently. Have you started promotion?', timestamp: '2024-02-01T09:03:15Z' },
        { role: 'user' as const, content: 'Our marketing lead, Lisa, is creating a website and social campaign launching next week.', timestamp: '2024-02-01T09:03:30Z' },
        { role: 'assistant' as const, content: 'Perfect timing. Ensure the registration system can handle both in-person and virtual attendees.', timestamp: '2024-02-01T09:03:45Z' },
        { role: 'user' as const, content: 'Will do. I also want to include a workshop on bias detection in ML models.', timestamp: '2024-02-01T09:04:00Z' },
        { role: 'assistant' as const, content: 'Excellent addition! Consider reaching out to organizations like AI Now Institute for workshop materials.', timestamp: '2024-02-01T09:04:15Z' },
        { role: 'user' as const, content: 'Thanks! My intern Tom will be helping with registration and logistics on the day.', timestamp: '2024-02-01T09:04:30Z' },
        { role: 'assistant' as const, content: 'Having dedicated logistics support is crucial. Make sure Tom has a detailed run-of-show schedule.', timestamp: '2024-02-01T09:04:45Z' },
      ],
      metadata: { 
        topic: 'event_planning', 
        company: 'TechCorp',
        event: 'AI Ethics Conference',
        people: ['Mike', 'Jennifer', 'Dr. Sarah Chen', 'Robert', 'Lisa', 'Tom']
      },
    },
  ],
  questions: [
    {
      id: 'lme_q001',
      sessionId: 'lme_session_001',
      question: 'What is the name of the company, what event are they planning, and what is the date?',
      groundTruth: 'The company is TechCorp, planning an AI Ethics Conference with the theme "Responsible AI: Building Trust", scheduled for March 15th.',
      answerType: 'fact',
      difficulty: 'easy',
      requiresContext: true,
    },
    {
      id: 'lme_q002',
      sessionId: 'lme_session_001',
      question: 'What is the budget and who mentioned flexibility on going over budget?',
      groundTruth: 'The budget is $50,000, and CFO Robert mentioned they can go 10% over budget if needed.',
      answerType: 'fact',
      difficulty: 'medium',
      requiresContext: true,
    },
    {
      id: 'lme_q003',
      sessionId: 'lme_session_001',
      question: 'Who is handling different aspects of the conference (venue, catering, marketing, AV, logistics)?',
      groundTruth: 'Venue: booked at Grand Plaza Hotel (user), Catering: Mike, Marketing: Lisa (launching next week), AV: needs professional team, Logistics: intern Tom on the day.',
      answerType: 'summary',
      difficulty: 'hard',
      requiresContext: true,
    },
    {
      id: 'lme_q004',
      sessionId: 'lme_session_001',
      question: 'Who is the keynote speaker and what workshop was suggested?',
      groundTruth: 'Keynote: Dr. Sarah Chen from MIT. Workshop: bias detection in ML models (suggested by user, with materials potentially from AI Now Institute).',
      answerType: 'fact',
      difficulty: 'medium',
      requiresContext: true,
    },
    {
      id: 'lme_q005',
      sessionId: 'lme_session_001',
      question: 'Who suggested livestreaming and what was the advice given about it?',
      groundTruth: 'Manager Jennifer suggested livestreaming. The advice was to hire a professional AV team for quality, ensure the registration system handles both types of attendees, and allocate specific budget for AV equipment.',
      answerType: 'summary',
      difficulty: 'medium',
      requiresContext: true,
    },
  ],
};

export class LongMemEvalDataset implements BenchmarkDataset {
  name = 'longmemeval';
  description = 'Long-form memory evaluation with multi-hop reasoning';
  sessions: ConversationSession[] = [];
  questions: BenchmarkQuestion[] = [];

  constructor() {
    this.loadData();
  }

  private loadData(): void {
    const dataPath = process.env.BENCHMARK_DATA_DIR || './data/benchmarks';
    const filePath = join(dataPath, 'longmemeval.json');

    if (existsSync(filePath)) {
      try {
        const raw = readFileSync(filePath, 'utf-8');
        const data = JSON.parse(raw);
        this.sessions = data.sessions;
        this.questions = data.questions;
        console.log(`Loaded LongMemEval dataset from ${filePath}`);
        return;
      } catch (e) {
        console.warn(`Failed to load LongMemEval from file: ${e}`);
      }
    }

    this.sessions = SAMPLE_LONGMEMEVAL_DATA.sessions;
    this.questions = SAMPLE_LONGMEMEVAL_DATA.questions;
    console.log('Using sample LongMemEval dataset (5 questions)');
  }

  getSessionById(id: string): ConversationSession | undefined {
    return this.sessions.find(s => s.id === id);
  }

  getQuestionsForSession(sessionId: string): BenchmarkQuestion[] {
    return this.questions.filter(q => q.sessionId === sessionId);
  }
}

export function loadLongMemEval(): LongMemEvalDataset {
  return new LongMemEvalDataset();
}
