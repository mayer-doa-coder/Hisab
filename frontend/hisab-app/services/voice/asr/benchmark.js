import { createOfflineAsrEngine } from './index';

const percentile = (values, p) => {
  if (!Array.isArray(values) || values.length === 0) {
    return 0;
  }

  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[idx];
};

export const runLatencyBenchmark = async ({
  utterances = [],
  state = 'WAIT_INTENT',
  knownNames = [],
} = {}) => {
  const engine = createOfflineAsrEngine();
  await engine.initialize({ quantization: 'int8' });

  const e2eValues = [];
  const inferValues = [];
  const outputs = [];

  for (const text of utterances) {
    const result = await engine.stopAndTranscribe({
      fsmState: state,
      knownNames,
      hintedText: text,
    });
    e2eValues.push(Number(result?.timing?.end_to_end_ms) || Number(result.latency_ms) || 0);
    inferValues.push(Number(result?.timing?.inference_ms) || 0);
    outputs.push(result);
  }

  return {
    sampleCount: utterances.length,
    e2e_ms: {
      p50: percentile(e2eValues, 50),
      p95: percentile(e2eValues, 95),
      max: percentile(e2eValues, 100),
    },
    inference_ms: {
      p50: percentile(inferValues, 50),
      p95: percentile(inferValues, 95),
      max: percentile(inferValues, 100),
    },
    meetsTargetP95Lt1500: percentile(e2eValues, 95) < 1500,
    outputs,
  };
};

export default {
  runLatencyBenchmark,
};
