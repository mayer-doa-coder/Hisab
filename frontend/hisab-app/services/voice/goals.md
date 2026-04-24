# Phase 0 Goals: Voice Success Contract

Status: LOCKED
Version: 1.0.0
Last Updated: 2026-04-21
Owner: Voice Platform

## Scope

This document defines the non-negotiable product goals for the Hisab voice system.
All future model, UX, and infra changes must preserve these goals.

## Locked Product Goals

1. Real Bengali Transcription
- The system must produce usable Bengali/Banglish transcripts from real microphone speech.
- Typed hints are optional assistive input and must not be required for transcription.

2. Step-Based Command Safety
- All financial and state-changing actions must pass through the deterministic voice FSM.
- Raw transcript text must never directly trigger command execution.

3. Production Reliability
- Voice flow failures must fail safely and predictably.
- No crash-only behavior is acceptable for ASR, normalization, or command execution paths.
- User must always receive a retry or correction path.

4. Controlled Cloud Cost
- Cloud STT usage must remain inside an explicit monthly budget limit.
- Cost tracking is a first-class KPI and release gate.

## Out of Scope for Phase 0

- Model replacement or retraining
- New intent families
- UI redesign

## Governance Rules

1. KPI threshold regressions block rollout.
2. Parser regression failures block rollout.
3. Safety and integrity violations always produce NO_GO decisions.

## Required Artifacts

- kpiDefinition.md
- baselineMetrics.json
- telemetry standard in voiceAnalyticsLogger.js
