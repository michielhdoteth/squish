/**
 * LoCoMo Benchmark Dataset Loader
 * 
 * LoCoMo: Long Context Memory benchmark for conversational AI
 * Tests ability to recall facts from long conversation histories
 */

import type { BenchmarkDataset, ConversationSession, BenchmarkQuestion } from '../types/index.js';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

// Sample LoCoMo data structure (subset for testing)
const SAMPLE_LOCOMO_DATA: { sessions: ConversationSession[]; questions: BenchmarkQuestion[] } = {
  sessions: [
    {
      id: 'locomo_session_001',
      turns: [
        { role: 'user' as const, content: 'Hi, I\'m John. I work as a software engineer at Google.', timestamp: '2024-01-01T10:00:00Z' },
        { role: 'assistant' as const, content: 'Hello John! Nice to meet you. How can I help you today?', timestamp: '2024-01-01T10:00:05Z' },
        { role: 'user' as const, content: 'I\'m working on a project using TensorFlow for image recognition. I need help optimizing my model.', timestamp: '2024-01-01T10:00:30Z' },
        { role: 'assistant' as const, content: 'I can help with that. What kind of images are you working with, and what accuracy are you currently getting?', timestamp: '2024-01-01T10:00:45Z' },
        { role: 'user' as const, content: 'Medical images, specifically X-rays. Currently at 85% accuracy but I need to get to 92%.', timestamp: '2024-01-01T10:01:00Z' },
        { role: 'assistant' as const, content: 'For medical imaging, data augmentation and transfer learning with pretrained models like ResNet can help significantly. Have you tried those approaches?', timestamp: '2024-01-01T10:01:15Z' },
        { role: 'user' as const, content: 'I\'ve tried ResNet50 but not extensive augmentation. What techniques do you recommend?', timestamp: '2024-01-01T10:01:30Z' },
        { role: 'assistant' as const, content: 'For X-rays, try rotation, zoom, and horizontal flip. Also consider using class weights if your dataset is imbalanced.', timestamp: '2024-01-01T10:01:45Z' },
        { role: 'user' as const, content: 'Thanks! I\'ll implement those changes. My dog Max also needs a walk soon, so I\'ll get back to this later.', timestamp: '2024-01-01T10:02:00Z' },
        { role: 'assistant' as const, content: 'You\'re welcome! Enjoy your walk with Max. Feel free to come back if you have more questions.', timestamp: '2024-01-01T10:02:15Z' },
      ],
      metadata: { topic: 'ml_optimization', user: 'john', has_pet: true },
    },
    {
      id: 'locomo_session_002',
      turns: [
        { role: 'user' as const, content: 'Hey, it\'s Sarah. I\'m planning a trip to Japan next month.', timestamp: '2024-01-05T14:00:00Z' },
        { role: 'assistant' as const, content: 'Hi Sarah! Japan is amazing. What cities are you planning to visit?', timestamp: '2024-01-05T14:00:10Z' },
        { role: 'user' as const, content: 'Tokyo, Kyoto, and Osaka. I have 10 days total.', timestamp: '2024-01-05T14:00:25Z' },
        { role: 'assistant' as const, content: 'That\'s a great itinerary! I\'d suggest 4 days in Tokyo, 3 in Kyoto, and 2 in Osaka, with 1 day for travel.', timestamp: '2024-01-05T14:00:40Z' },
        { role: 'user' as const, content: 'Sounds good. I\'m especially interested in food - I love ramen and sushi.', timestamp: '2024-01-05T14:01:00Z' },
        { role: 'assistant' as const, content: 'Perfect! Tokyo has amazing sushi at Tsukiji Outer Market, and Kyoto is known for kaiseki dining.', timestamp: '2024-01-05T14:01:15Z' },
        { role: 'user' as const, content: 'I\'m also a vegetarian, so I need to find good plant-based options.', timestamp: '2024-01-05T14:01:30Z' },
        { role: 'assistant' as const, content: 'Japan has become more vegetarian-friendly. Look for shojin ryori (Buddhist cuisine) in Kyoto - it\'s naturally vegetarian.', timestamp: '2024-01-05T14:01:45Z' },
        { role: 'user' as const, content: 'My sister Emma might join me for part of the trip. She\'s flying in from London.', timestamp: '2024-01-05T14:02:00Z' },
        { role: 'assistant' as const, content: 'That\'ll be wonderful! If Emma joins from London, make sure to coordinate arrival times at Narita or Haneda.', timestamp: '2024-01-05T14:02:15Z' },
        { role: 'user' as const, content: 'I\'m also bringing my camera - I\'m an amateur photographer and want to capture the cherry blossoms.', timestamp: '2024-01-05T14:02:30Z' },
        { role: 'assistant' as const, content: 'Cherry blossom season is beautiful! Best spots in Tokyo are Ueno Park and Chidorigafuchi.', timestamp: '2024-01-05T14:02:45Z' },
      ],
      metadata: { topic: 'travel', user: 'sarah', has_sister: true, interest: 'photography' },
    },
  ],
  questions: [
    {
      id: 'locomo_q001',
      sessionId: 'locomo_session_001',
      question: 'What is the user\'s name and where do they work?',
      groundTruth: 'The user\'s name is John, and he works as a software engineer at Google.',
      answerType: 'fact',
      difficulty: 'easy',
      requiresContext: true,
    },
    {
      id: 'locomo_q002',
      sessionId: 'locomo_session_001',
      question: 'What project is John working on and what accuracy does he need to achieve?',
      groundTruth: 'John is working on an image recognition project using TensorFlow with medical X-rays, and he needs to achieve 92% accuracy (currently at 85%).',
      answerType: 'fact',
      difficulty: 'easy',
      requiresContext: true,
    },
    {
      id: 'locomo_q003',
      sessionId: 'locomo_session_001',
      question: 'What is the name of John\'s dog?',
      groundTruth: 'John\'s dog is named Max.',
      answerType: 'fact',
      difficulty: 'easy',
      requiresContext: true,
    },
    {
      id: 'locomo_q004',
      sessionId: 'locomo_session_001',
      question: 'What recommendations were given for improving the model accuracy?',
      groundTruth: 'The recommendations include: data augmentation (rotation, zoom, horizontal flip), using class weights for imbalanced datasets, and transfer learning with pretrained models.',
      answerType: 'summary',
      difficulty: 'medium',
      requiresContext: true,
    },
    {
      id: 'locomo_q005',
      sessionId: 'locomo_session_002',
      question: 'What is Sarah\'s travel itinerary and how many days in each city?',
      groundTruth: 'Sarah plans to visit Tokyo (4 days), Kyoto (3 days), and Osaka (2 days), with 1 day for travel, totaling 10 days.',
      answerType: 'fact',
      difficulty: 'easy',
      requiresContext: true,
    },
    {
      id: 'locomo_q006',
      sessionId: 'locomo_session_002',
      question: 'What dietary restriction does Sarah have and what cuisine was recommended?',
      groundTruth: 'Sarah is vegetarian, and she was recommended shojin ryori (Buddhist cuisine) in Kyoto, which is naturally vegetarian.',
      answerType: 'fact',
      difficulty: 'medium',
      requiresContext: true,
    },
    {
      id: 'locomo_q007',
      sessionId: 'locomo_session_002',
      question: 'Who might join Sarah on the trip and where are they flying from?',
      groundTruth: 'Sarah\'s sister Emma might join her, flying in from London.',
      answerType: 'fact',
      difficulty: 'easy',
      requiresContext: true,
    },
    {
      id: 'locomo_q008',
      sessionId: 'locomo_session_002',
      question: 'What are Sarah\'s interests mentioned in the conversation?',
      groundTruth: 'Sarah is interested in food (ramen and sushi), photography (especially cherry blossoms), and she is a vegetarian.',
      answerType: 'summary',
      difficulty: 'medium',
      requiresContext: true,
    },
  ],
};

export class LoCoMoDataset implements BenchmarkDataset {
  name = 'locomo';
  description = 'Long Context Memory benchmark for conversational AI';
  sessions: ConversationSession[] = [];
  questions: BenchmarkQuestion[] = [];

  constructor() {
    this.loadData();
  }

  private loadData(): void {
    // Try to load from file first
    const dataPath = process.env.BENCHMARK_DATA_DIR || './data/benchmarks';
    const filePath = join(dataPath, 'locomo.json');

    if (existsSync(filePath)) {
      try {
        const raw = readFileSync(filePath, 'utf-8');
        const data = JSON.parse(raw);
        this.sessions = data.sessions;
        this.questions = data.questions;
        console.log(`Loaded LoCoMo dataset from ${filePath}: ${data.sessions.length} sessions, ${data.questions.length} questions`);
        return;
      } catch (e) {
        console.warn(`Failed to load LoCoMo from file: ${e}`);
      }
    }

    // Fall back to sample data
    this.sessions = SAMPLE_LOCOMO_DATA.sessions;
    this.questions = SAMPLE_LOCOMO_DATA.questions;
    console.log('Using sample LoCoMo dataset (8 questions)');
  }

  getSessionById(id: string): ConversationSession | undefined {
    return this.sessions.find(s => s.id === id);
  }

  getQuestionsForSession(sessionId: string): BenchmarkQuestion[] {
    return this.questions.filter(q => q.sessionId === sessionId);
  }
}

export function loadLoCoMo(): LoCoMoDataset {
  return new LoCoMoDataset();
}
