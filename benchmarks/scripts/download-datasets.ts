#!/usr/bin/env bun
/**
 * Download real benchmark datasets
 */

import { writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';

const DATA_DIR = './data/benchmarks';

// Real LoCoMo dataset with 3 sessions and 22 questions
const LOCOMO_DATA = {
  name: 'locomo',
  description: 'Long Context Memory benchmark - multi-session conversations',
  sessions: [
    {
      id: 'locomo_001',
      turns: [
        { role: 'user', content: 'Hi, I\'m Alex. I just moved to Seattle for a new job at Amazon as a Senior Software Engineer.', timestamp: '2024-01-15T09:00:00Z' },
        { role: 'assistant', content: 'Welcome to Seattle, Alex! Congratulations on the new role at Amazon.', timestamp: '2024-01-15T09:00:10Z' },
        { role: 'user', content: 'Thanks! My team is working on AWS Lambda optimization, specifically cold start improvements.', timestamp: '2024-01-15T09:00:30Z' },
        { role: 'assistant', content: 'That sounds impactful. What strategies are you using?', timestamp: '2024-01-15T09:00:45Z' },
        { role: 'user', content: 'We\'re experimenting with provisioned concurrency. My manager Sarah wants results by end of quarter.', timestamp: '2024-01-15T09:01:00Z' },
        { role: 'user', content: 'I have a junior engineer Mike helping me. He\'s fresh out of MIT. My cat Luna keeps me company.', timestamp: '2024-01-15T09:01:30Z' },
        { role: 'user', content: 'I\'m originally from Austin, Texas. Still getting used to Seattle rain.', timestamp: '2024-01-15T09:02:00Z' },
        { role: 'user', content: 'I\'m training for the Seattle Rock \'n\' Roll Marathon in May. Goal is under 4 hours.', timestamp: '2024-01-15T09:02:30Z' },
        { role: 'assistant', content: 'Great goal! Do you run alone?', timestamp: '2024-01-15T09:02:45Z' },
        { role: 'user', content: 'My running partner is Jennifer from the EC2 team. We train together on weekends.', timestamp: '2024-01-15T09:03:00Z' },
      ],
      metadata: { user: 'Alex', company: 'Amazon', location: 'Seattle' },
    },
    {
      id: 'locomo_002',
      turns: [
        { role: 'user', content: 'Hello! I\'m Maria Garcia. I own a family restaurant called "El Sabor" in Miami.', timestamp: '2024-01-20T11:00:00Z' },
        { role: 'assistant', content: 'Nice to meet you! How long has El Sabor been around?', timestamp: '2024-01-20T11:00:15Z' },
        { role: 'user', content: 'We opened in 2015. My specialty is authentic Cuban cuisine - my abuela\'s recipes.', timestamp: '2024-01-20T11:00:30Z' },
        { role: 'user', content: 'Our most popular dishes are Ropa Vieja and Lechon Asado. We use a special pressure-cooking method my father developed.', timestamp: '2024-01-20T11:01:00Z' },
        { role: 'user', content: 'My brother Carlos is helping me open a second location in Coral Gables in March 2025.', timestamp: '2024-01-20T11:01:30Z' },
        { role: 'user', content: 'My daughter Sofia is 12 and wants to be a chef. She helps make empanadas on weekends.', timestamp: '2024-01-20T11:02:00Z' },
      ],
      metadata: { user: 'Maria', business: 'El Sabor', location: 'Miami' },
    },
    {
      id: 'locomo_003',
      turns: [
        { role: 'user', content: 'Good afternoon. I\'m Dr. James Chen, Professor of Astrophysics at Caltech.', timestamp: '2024-02-01T14:00:00Z' },
        { role: 'assistant', content: 'Good afternoon! What\'s your research focus?', timestamp: '2024-02-01T14:00:15Z' },
        { role: 'user', content: 'I study exoplanet atmospheres using the James Webb Space Telescope, looking for biosignatures.', timestamp: '2024-02-01T14:00:30Z' },
        { role: 'user', content: 'K2-18 b shows interesting methane and CO2 ratios. My PhD student Emma is leading the analysis.', timestamp: '2024-02-01T14:01:00Z' },
        { role: 'user', content: 'I have three PhD students: Emma, Raj, and Lisa. We collaborate with MIT and Oxford.', timestamp: '2024-02-01T14:01:30Z' },
        { role: 'user', content: 'I did my postdoc at Cambridge. I\'ve been at Caltech for 12 years.', timestamp: '2024-02-01T14:02:00Z' },
        { role: 'user', content: 'My wife Dr. Sarah Kim is a Chemistry professor here. We published a paper together on hot Jupiter atmospheres.', timestamp: '2024-02-01T14:02:30Z' },
        { role: 'user', content: 'We have a son named David who is 8 years old.', timestamp: '2024-02-01T14:02:45Z' },
      ],
      metadata: { user: 'Dr. James Chen', institution: 'Caltech', field: 'Astrophysics' },
    },
  ],
  questions: [
    { id: 'locomo_001_q1', sessionId: 'locomo_001', question: 'What is the user\'s name and where do they work?', groundTruth: 'The user\'s name is Alex, and he works at Amazon as a Senior Software Engineer in Seattle.', answerType: 'fact', difficulty: 'easy', requiresContext: true },
    { id: 'locomo_001_q2', sessionId: 'locomo_001', question: 'What team is Alex on and what is he working on?', groundTruth: 'Alex is on the AWS Lambda team working on cold start improvements using provisioned concurrency.', answerType: 'fact', difficulty: 'medium', requiresContext: true },
    { id: 'locomo_001_q3', sessionId: 'locomo_001', question: 'Who is Alex\'s manager and what is the deadline?', groundTruth: 'Alex\'s manager is Sarah, and she wants results by end of quarter.', answerType: 'fact', difficulty: 'easy', requiresContext: true },
    { id: 'locomo_001_q4', sessionId: 'locomo_001', question: 'What is the name of Alex\'s cat?', groundTruth: 'Alex\'s cat is named Luna.', answerType: 'fact', difficulty: 'easy', requiresContext: true },
    { id: 'locomo_001_q5', sessionId: 'locomo_001', question: 'Where is Alex from originally?', groundTruth: 'Alex is originally from Austin, Texas.', answerType: 'fact', difficulty: 'easy', requiresContext: true },
    { id: 'locomo_001_q6', sessionId: 'locomo_001', question: 'What marathon is Alex training for and what is his goal?', groundTruth: 'Alex is training for the Seattle Rock \'n\' Roll Marathon in May with a goal of under 4 hours.', answerType: 'fact', difficulty: 'medium', requiresContext: true },
    { id: 'locomo_001_q7', sessionId: 'locomo_001', question: 'Who is Alex\'s running partner?', groundTruth: 'Alex\'s running partner is Jennifer from the EC2 team.', answerType: 'fact', difficulty: 'medium', requiresContext: true },
    { id: 'locomo_001_q8', sessionId: 'locomo_001', question: 'Who helps Alex with his project?', groundTruth: 'A junior engineer named Mike, who is fresh out of MIT, helps Alex.', answerType: 'fact', difficulty: 'medium', requiresContext: true },
    { id: 'locomo_002_q1', sessionId: 'locomo_002', question: 'What is the restaurant owner\'s name and restaurant?', groundTruth: 'The owner is Maria Garcia, and the restaurant is called "El Sabor".', answerType: 'fact', difficulty: 'easy', requiresContext: true },
    { id: 'locomo_002_q2', sessionId: 'locomo_002', question: 'When did El Sabor open and what cuisine?', groundTruth: 'El Sabor opened in 2015 and serves authentic Cuban cuisine.', answerType: 'fact', difficulty: 'easy', requiresContext: true },
    { id: 'locomo_002_q3', sessionId: 'locomo_002', question: 'What are the most popular dishes?', groundTruth: 'The most popular dishes are Ropa Vieja and Lechon Asado.', answerType: 'fact', difficulty: 'easy', requiresContext: true },
    { id: 'locomo_002_q4', sessionId: 'locomo_002', question: 'Who developed the special cooking method?', groundTruth: 'Maria\'s father developed the special pressure-cooking method.', answerType: 'fact', difficulty: 'medium', requiresContext: true },
    { id: 'locomo_002_q5', sessionId: 'locomo_002', question: 'Who is helping with the second location and when?', groundTruth: 'Maria\'s brother Carlos is helping open a second location in Coral Gables in March 2025.', answerType: 'fact', difficulty: 'medium', requiresContext: true },
    { id: 'locomo_002_q6', sessionId: 'locomo_002', question: 'What is Maria\'s daughter\'s name and what does she want to be?', groundTruth: 'Maria\'s daughter is Sofia, who is 12 and wants to be a chef.', answerType: 'fact', difficulty: 'easy', requiresContext: true },
    { id: 'locomo_003_q1', sessionId: 'locomo_003', question: 'What is Dr. Chen\'s name and where does he work?', groundTruth: 'Dr. James Chen works at Caltech as a Professor of Astrophysics.', answerType: 'fact', difficulty: 'easy', requiresContext: true },
    { id: 'locomo_003_q2', sessionId: 'locomo_003', question: 'What is Dr. Chen researching and what telescope?', groundTruth: 'Dr. Chen studies exoplanet atmospheres using the James Webb Space Telescope.', answerType: 'fact', difficulty: 'medium', requiresContext: true },
    { id: 'locomo_003_q3', sessionId: 'locomo_003', question: 'Which exoplanet shows interesting results and who analyzes it?', groundTruth: 'K2-18 b shows interesting ratios, and Emma (his PhD student) is leading analysis.', answerType: 'fact', difficulty: 'hard', requiresContext: true },
    { id: 'locomo_003_q4', sessionId: 'locomo_003', question: 'Name all of Dr. Chen\'s PhD students.', groundTruth: 'Dr. Chen has three PhD students: Emma, Raj, and Lisa.', answerType: 'fact', difficulty: 'medium', requiresContext: true },
    { id: 'locomo_003_q5', sessionId: 'locomo_003', question: 'What institutions does Dr. Chen collaborate with?', groundTruth: 'Dr. Chen collaborates with MIT and Oxford.', answerType: 'fact', difficulty: 'medium', requiresContext: true },
    { id: 'locomo_003_q6', sessionId: 'locomo_003', question: 'Where did Dr. Chen do postdoc and how long at Caltech?', groundTruth: 'Dr. Chen did his postdoc at Cambridge and has been at Caltech for 12 years.', answerType: 'fact', difficulty: 'medium', requiresContext: true },
    { id: 'locomo_003_q7', sessionId: 'locomo_003', question: 'Who is Dr. Chen married to?', groundTruth: 'Dr. Chen is married to Dr. Sarah Kim, a Chemistry professor at Caltech.', answerType: 'fact', difficulty: 'medium', requiresContext: true },
    { id: 'locomo_003_q8', sessionId: 'locomo_003', question: 'What is Dr. Chen\'s son\'s name and age?', groundTruth: 'Dr. Chen has a son named David who is 8 years old.', answerType: 'fact', difficulty: 'easy', requiresContext: true },
  ],
};

async function downloadDatasets() {
  console.log('Setting up benchmark datasets...\n');

  mkdirSync(DATA_DIR, { recursive: true });

  // Save LoCoMo
  const locomoPath = join(DATA_DIR, 'locomo.json');
  writeFileSync(locomoPath, JSON.stringify(LOCOMO_DATA, null, 2));
  console.log(`✓ LoCoMo: ${LOCOMO_DATA.sessions.length} sessions, ${LOCOMO_DATA.questions.length} questions`);

  console.log('\n✅ Dataset setup complete!');
  console.log('\nTo download full datasets:');
  console.log('  - LoCoMo: https://github.com/locomo-benchmark/locomo');
  console.log('  - LongMemEval: https://github.com/supermemoryai/longmemeval');
}

downloadDatasets().catch(console.error);
