/**
 * Async Summarization Worker
 * Processes observations asynchronously for summarization and relevance scoring
 */
import Queue from 'bull';
const REDIS_CONFIG = {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379'),
    maxRetriesPerRequest: null
};
const QUEUE_SETTINGS = {
    maxStalledCount: 2,
    lockRenewTime: 5000,
    lockDuration: 30000
};
const summaryQueue = new Queue('squish-summaries', {
    redis: REDIS_CONFIG,
    settings: QUEUE_SETTINGS
});
const TYPE_SCORES = {
    error: 0.8,
    insight: 0.85,
    decision: 0.75,
    tool_use: 0.6,
    file_change: 0.5,
    pattern: 0.7,
    user_prompt: 0.4
};
function generateBasicSummary(observation) {
    if (observation.summary)
        return observation.summary;
    const parts = [];
    const details = observation.details;
    if (observation.action) {
        parts.push(`Action: ${observation.action}`);
    }
    if (details?.arguments) {
        parts.push(`Args: ${JSON.stringify(details.arguments).substring(0, 100)}`);
    }
    if (details?.result) {
        const resultStr = typeof details.result === 'string'
            ? details.result
            : JSON.stringify(details.result);
        parts.push(`Result: ${resultStr.substring(0, 100)}`);
    }
    return parts.length > 0 ? parts.join(' | ') : 'Observation recorded';
}
function calculateRelevanceScore(observation) {
    const type = observation.type;
    let score = TYPE_SCORES[type] || 0.5;
    if (observation.createdAt) {
        const ageHours = (Date.now() - observation.createdAt.getTime()) / (1000 * 60 * 60);
        const recencyBoost = Math.max(0, 0.3 * (1 - ageHours / (24 * 30)));
        score = Math.min(1, score + recencyBoost);
    }
    if (observation.hasSecrets) {
        score *= 0.5;
    }
    return Math.round(score * 100) / 100;
}
async function processSummarizationJob(job) {
    console.error(`[squish-worker] Processed observation ${job.observationId}`);
}
export async function processWorkerQueue() {
    console.error('[squish-worker] Starting summarization worker');
    summaryQueue.process(async (job) => {
        await processSummarizationJob(job.data);
        return { success: true };
    });
    summaryQueue.on('failed', (job, err) => {
        console.error(`[squish-worker] Job ${job.id} failed:`, err.message);
    });
    summaryQueue.on('completed', (job) => {
        console.error(`[squish-worker] Job ${job.id} completed`);
    });
    summaryQueue.on('stalled', (job) => {
        console.error(`[squish-worker] Job ${job.id} stalled`);
    });
}
export async function queueForSummarization(observationId, projectPath) {
    await summaryQueue.add({ observationId, projectPath }, {
        attempts: 3,
        backoff: { type: 'exponential', delay: 2000 },
        removeOnComplete: true,
        removeOnFail: false
    }).catch(err => console.error('[squish] Queue error:', err));
    console.error(`[squish] Queued observation for summarization: ${observationId}`);
}
export async function getWorkerStats() {
    return summaryQueue.getJobCounts();
}
export async function drainWorkerQueue() {
    await summaryQueue.close().catch(err => console.error('[squish-worker] Error closing queue:', err));
    console.error('[squish-worker] Queue drained and closed');
}
export async function checkWorkerHealth() {
    try {
        await getWorkerStats();
        return true;
    }
    catch {
        return false;
    }
}
export { summaryQueue };
//# sourceMappingURL=worker.js.map