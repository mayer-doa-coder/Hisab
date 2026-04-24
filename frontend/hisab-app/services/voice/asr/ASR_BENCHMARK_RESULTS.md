# Phase 3 Latency Benchmark Results

Date: 2026-04-21

## Method

Executed local benchmark harness in `benchmark.js` with 9 short utterances (1-4s target command style).

- Scenario: `WAIT_INTENT` grammar
- Quantization mode: `int8` (runner config)
- Known names: Rahim, Karim

## Results

- End-to-end latency:
  - p50: 167 ms
  - p95: 227 ms
  - max: 227 ms
- Inference latency:
  - p50: 1 ms
  - p95: 1 ms
  - max: 1 ms
- Target check (`p95 < 1500 ms`): PASS

## Example I/O

Input utterance: `baki rahim 500 aj`

Output:

```json
{
  "text": "baki",
  "tokens": ["baki"],
  "acceptedToken": "baki",
  "confidence": 0.684,
  "latency_ms": 227,
  "ok": true,
  "reason": "OK"
}
```

## Notes

- These numbers are from the current offline fallback pipeline and grammar gate.
- Device benchmarks (low-end and mid-range Android) should be run after native ONNX runtime bridge is enabled.
