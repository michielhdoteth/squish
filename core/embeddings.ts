import { config } from '../config.js';

export type EmbeddingProvider = 'openai' | 'ollama' | 'none';

export async function getEmbedding(input: string): Promise<number[] | null> {
  const provider = config.embeddingsProvider;
  if (provider === 'none') return null;
  if (provider === 'openai') return await getOpenAiEmbedding(input);
  if (provider === 'ollama') return await getOllamaEmbedding(input);
  return null;
}

/**
 * Get embeddings for multiple inputs in parallel batches
 * Processes inputs in batches to respect rate limits while parallelizing
 */
export async function getBatchEmbeddings(
  inputs: string[],
  batchSize: number = 20
): Promise<Array<number[] | null>> {
  if (inputs.length === 0) return [];

  const results: Array<number[] | null> = new Array(inputs.length).fill(null);

  // Process batches sequentially to respect rate limits
  for (let i = 0; i < inputs.length; i += batchSize) {
    const batchEnd = Math.min(i + batchSize, inputs.length);
    const batch = inputs.slice(i, batchEnd);
    const indices = Array.from({ length: batch.length }, (_, idx) => i + idx);

    // Parallelize embeddings within batch using Promise.all
    const batchResults = await Promise.all(
      batch.map((input) => getEmbedding(input))
    );

    // Store results in correct positions
    for (let j = 0; j < batchResults.length; j++) {
      results[indices[j]] = batchResults[j];
    }
  }

  return results;
}

async function getOpenAiEmbedding(input: string): Promise<number[] | null> {
  if (!config.openAiApiKey) return null;
  const response = await fetch(config.openAiApiUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${config.openAiApiKey}`,
    },
    body: JSON.stringify({
      model: config.openAiEmbeddingModel,
      input,
    }),
  });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(`OpenAI embeddings failed: ${response.status} ${message}`);
  }

  const payload = await response.json() as { data?: Array<{ embedding: number[] }> };
  const embedding = payload.data?.[0]?.embedding;
  return embedding ?? null;
}

async function getOllamaEmbedding(input: string): Promise<number[] | null> {
  const response = await fetch(`${config.ollamaUrl}/api/embeddings`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: config.ollamaEmbeddingModel,
      prompt: input,
    }),
  });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(`Ollama embeddings failed: ${response.status} ${message}`);
  }

  const payload = await response.json() as { embedding?: number[] };
  return payload.embedding ?? null;
}
