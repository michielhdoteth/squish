# MemoryBench for Squish

A pluggable benchmarking framework for evaluating memory and context systems, adapted from [supermemoryai/memorybench](https://github.com/supermemoryai/memorybench) for testing Squish.

## Features

- 🔌 **Interoperable**: Mix and match any provider with any benchmark
- 🧩 **Bring your own benchmarks**: Plug in custom datasets
- ♻️ **Checkpointed runs**: Resume from any pipeline stage
- 📊 **Structured reports**: Export run status, failures, and metrics
- 🖥️ **Web UI**: Inspect runs, questions, and failures interactively

## Supported Benchmarks

| Benchmark | Description | Questions |
|-----------|-------------|-----------|
| **LoCoMo** | Long Context Memory for conversations | 8 (sample) |
| **LongMemEval** | Long-form memory with multi-hop reasoning | 5 (sample) |
| **ConvoMem** | Conversational memory with temporal understanding | 5 (sample) |

## Quick Start

```bash
# Install dependencies
bun install

# Copy environment variables
cp .env.example .env.local
# Add your API keys (OpenAI, Anthropic, or Google)

# Run benchmark
bun run bench

# Run specific benchmark
bun run bench:longmem

# Compare all benchmarks
bun run bench:all
```

## Usage

### Run Full Benchmark

```bash
bun run src/index.ts run -p squish -b locomo
```

Options:
- `-p, --provider`: Memory provider (default: squish)
- `-b, --benchmark`: Benchmark dataset (locomo, longmemeval, convomem)
- `-j, --judge`: Judge model (gpt-4o, claude-sonnet)
- `-m, --answering-model`: Model for answer generation
- `-l, --limit`: Limit number of questions
- `-r, --run-id`: Custom run identifier
- `--force`: Clear checkpoint and restart

### Compare Benchmarks

```bash
bun run src/index.ts compare -p squish -b locomo,longmemeval -s 10
```

### Test Single Question

```bash
bun run src/index.ts test -p squish -b locomo -q locomo_q001
```

### Web UI

```bash
bun run serve
# or
bun run src/index.ts serve -p 8080
```

Then open http://localhost:8080

### Check Status

```bash
bun run src/index.ts status -r <run-id>
bun run src/index.ts show-failures -r <run-id>
```

## Pipeline

```
INGEST → INDEX → SEARCH → ANSWER → EVALUATE → REPORT
```

Each phase checkpoints independently. Failed runs resume from the last successful point.

## Project Structure

```
benchmark/
├── src/
│   ├── index.ts           # CLI entry point
│   ├── types/             # TypeScript types
│   ├── providers/         # Memory providers (Squish)
│   ├── benchmarks/        # Dataset loaders (LoCoMo, LongMemEval, ConvoMem)
│   ├── judges/            # Evaluation judges (OpenAI, Anthropic)
│   ├── pipeline/          # Benchmark pipeline stages
│   └── web/               # Web UI server
├── data/
│   ├── benchmarks/        # Dataset files
│   └── runs/              # Run results and checkpoints
└── package.json
```

## Configuration

Environment variables (in `.env.local`):

```env
# Required: At least one judge API key
OPENAI_API_KEY=sk-...
ANTHROPIC_API_KEY=sk-ant-...
GOOGLE_API_KEY=...

# Squish configuration
SQUISH_API_URL=http://localhost:3000
SQUISH_API_KEY=optional

# Benchmark paths
BENCHMARK_DATA_DIR=./data/benchmarks
RUNS_DIR=./data/runs
```

## Adding Custom Benchmarks

1. Create a new dataset file in `src/benchmarks/`:

```typescript
export class MyBenchmark implements BenchmarkDataset {
  name = 'mybenchmark';
  description = 'Description';
  sessions: ConversationSession[] = [...];
  questions: BenchmarkQuestion[] = [...];
}
```

2. Register in `src/benchmarks/index.ts`

3. Run with `bun run src/index.ts run -b mybenchmark`

## Interpreting Results

Example report:
```json
{
  "summary": {
    "totalQuestions": 8,
    "answered": 8,
    "correct": 6,
    "accuracy": 0.75,
    "avgLatency": 245,
    "totalTime": 12050
  }
}
```

Comparison with Supermemory:
- Supermemory achieves **81.6%** on LongMemEval
- Most RAG systems score **40-60%** on memory-specific benchmarks

## License

MIT (same as MemoryBench and Squish)
