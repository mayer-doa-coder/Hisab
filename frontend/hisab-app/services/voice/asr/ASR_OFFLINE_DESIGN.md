# Offline ASR Engine Integration (Phase 3)

## Overview

Pipeline in app:

1. VAD boundary detection (`vad.js`)
2. Push-to-talk recording (`audioRecorder.js`)
3. Whisper-style log-Mel preprocessing (`melSpectrogram.js`)
4. Quantized ONNX inference wrapper (`onnxRunner.js`)
5. Grammar constrained token accept (`decoder.js`)
6. FSM token handoff (`VoiceAssistantScreen.js`)

## Offline-first behavior

- The module avoids any network calls.
- Audio capture is local (`expo-audio`).
- ONNX layer is currently adapter-based and deterministic fallback is active if native ORT bridge is not present.
- Grammar constraints are deterministic and state-dependent.

## Grammar by FSM state

- `WAIT_INTENT`: `baki`, `joma`, `becha`, `kinbo`
- `WAIT_NAME`: lexicon from known customers
- `WAIT_AMOUNT`: numeric tokens
- `WAIT_DATE`: `aj`, `kal`, ISO date
- `CONFIRM`: `confirm`, `yes`, `na`, `cancel`

## Output contract

```json
{
  "text": "...",
  "tokens": ["..."],
  "confidence": 0.84,
  "latency_ms": 420
}
```

Additional metadata currently returned:

- `acceptedToken`
- `reason`
- `timing.inference_ms`
- `timing.end_to_end_ms`
- `vad` boundary stats

## Latency benchmark harness

Use `benchmark.js` with a local utterance list. It reports p50, p95, max and target pass (`p95 < 1500ms`).

## Production notes

- For WebRTC VAD/Silero VAD, replace `detectSpeechBoundaries` implementation with native module calls.
- For ONNX runtime, connect `onnxRunner` to encoder/decoder sessions from native bridge.
- Keep utterances capped to <=4s for low-end devices.
