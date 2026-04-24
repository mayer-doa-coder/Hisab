# Phase 0 KPI Definition

Status: LOCKED
Version: 1.0.0
Last Updated: 2026-04-21

## KPI Definitions

1. Transcription Availability
- Definition: successful transcription responses / transcription attempts.
- Numerator: events with transcription status SUCCESS.
- Denominator: events with transcription status SUCCESS or FAILED.

2. Intent Accuracy
- Definition: correctly detected intent / total intent-evaluable commands.
- Source: command outcome labels and evaluation pipeline reports.

3. Slot Accuracy
- Name Accuracy: correct name slot / name-evaluable commands.
- Amount Accuracy: correct amount slot / amount-evaluable commands.

4. False Execution Rate
- Definition: incorrect actions executed / total executed actions.
- Proxy in telemetry: failed command outcomes among execution attempts.

5. p95 End-to-End Latency
- Definition: 95th percentile of transcription + command parsing end-to-end latency.
- Unit: milliseconds.

6. Monthly STT Spend
- Definition: total cloud STT spend for current month in USD.
- Source: provider billing export or estimated usage telemetry.

## Locked Thresholds

```json
{
  "transcription_availability": 0.95,
  "intent_accuracy": 0.9,
  "slot_accuracy": {
    "name_accuracy": 0.9,
    "amount_accuracy": 0.95
  },
  "false_execution_rate": 0.01,
  "p95_latency_ms": 1500,
  "monthly_stt_spend_usd": 100
}
```

## Baseline Snapshot Contract

baselineMetrics.json fields:

```json
{
  "date": "ISO_TIMESTAMP",
  "transcription_availability": 0.0,
  "intent_accuracy": 0.0,
  "slot_accuracy": {
    "name_accuracy": 0.0,
    "amount_accuracy": 0.0
  },
  "latency_p95": 0,
  "error_rate": 0.0,
  "cancellation_rate": 0.0,
  "stt_monthly_spend_usd": 0.0,
  "sample_size": {
    "events": 0,
    "transcriptions": 0,
    "commands": 0
  }
}
```

## Telemetry Standard

Event naming:
- voice_transcription
- voice_command_outcome
- voice_flow_cancellation
- voice_latency_sample

Structured event envelope:

```json
{
  "event": "voice_transcription",
  "status": "SUCCESS",
  "latency_ms": 1200,
  "confidence": 0.92,
  "createdAt": "ISO_TIMESTAMP",
  "payload": {}
}
```

## Approval Gate

Phase 0 is complete only when:
1. goals.md exists and matches production scope.
2. kpiDefinition.md exists with thresholds.
3. baselineMetrics.json is generated from real telemetry extraction logic.
