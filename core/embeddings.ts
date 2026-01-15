import { config } from '../config.js';

export type EmbeddingProvider = 'openai' | 'ollama' | 'none';

export async function getEmbedding(input: string): Promise<number[] | null> {
  const provider = config.embeddingsProvider;
  if (provider === 'none') return null;
  if (provider === 'openai') return await getOpenAiEmbedding(input);
  if (provider === 'ollama') return await getOllamaEmbedding(input);
  return null;
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
