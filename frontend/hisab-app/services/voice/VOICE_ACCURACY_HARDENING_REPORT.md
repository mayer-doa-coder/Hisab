# Phase 6: Accuracy and Reliability Hardening Report

## Dataset

- File: services/voice/dataset/utterances.json
- Samples: 330
- Coverage:
  - Bengali primary
  - Banglish and mixed utterances
  - noisy and interrupted styles
  - common shop-floor command patterns

## Evaluation Pipeline

- Script: services/voice/evaluation/runVoiceEvaluation.cjs
- Generator: services/voice/evaluation/generateUtteranceDataset.cjs
- Output:
  - services/voice/evaluation/metricsReport.json
  - services/voice/evaluation/metricsReport.md

## Metrics

- Intent Accuracy: 1.0000
- Slot Accuracy:
  - Name: 1.0000
  - Amount: 1.0000
  - Date: 0.8364
- False Execution Rate: 0.0000
- Cancellation Rate: 0.0000

## Tuned Config Values

Source: services/voice/config/voiceTuningConfig.js

- normalizationOverall: 0.82
- nameMatchMin: 0.72
- productMatchMin: 0.74
- branchMatchMin: 0.75
- nameAmbiguityDelta: 0.06
- asrAcceptance: 0.62
- executionMinConfidence: 0.78
- highRiskExecutionMinConfidence: 0.90

## Grammar and Hotword Tuning

- Grammar rules are defined per state in services/voice/config/voiceTuningConfig.js
- Intent aliases expanded for noisy and mixed input
- Hotword dictionary expanded in services/voice/config/hotwordDictionary.json
  - customer variants
  - product variants
  - branch aliases

## Reliability and Edge Cases

Implemented hardening includes:

- Unicode-safe Bengali normalization (combining marks preserved)
- interrupted/noisy utterance flags in normalization output
- clarification prompts for ambiguity and low confidence
- execution safety hard-gates on confidence and risk class
- high-risk actions require explicit CONFIRMED state

## Logging and Analytics

Voice event logger: services/voice/voiceAnalyticsLogger.js

Captured event types:

- raw_asr_output
- normalized_output
- user_correction
- flow_cancellation
- execution_blocked

## Failure Analysis

- Top mismatch samples in current report: 0
- Remaining risk area: date variability in open spoken forms beyond aj/kal and explicit formatted dates
- Recommended next iteration:
  - add month-name Bengali date parsing
  - add weekday colloquial variants from production logs
