## Phase 0: Scope and Success Criteria (1 day)

Lock goals: real Bengali transcription, step-based command safety, production reliability, controlled cloud cost.
Define KPIs: transcription availability, intent/slot accuracy, false execution rate, p95 latency, monthly STT spend ceiling.
Freeze baseline from current voice telemetry in voiceAnalyticsLogger.js.
Exit criteria

KPI/threshold document approved.
Baseline metrics captured.
## Phase 1: Cloud STT Contract and Provider Adapter (2-3 days)

Choose provider and create one backend STT endpoint that hides vendor lock-in.
Define request/response contract:
Request: audio file, locale bn-BD, optional hints.
Response: transcript text, confidence, provider latency, request id.
Add frontend STT client service using your backend request style from commandExecutionApi.js.
Exit criteria

One audio file roundtrip returns transcript in staging.
No provider SDK directly exposed in mobile app.
## Phase 2: Replace Placeholder ASR Path in App (2-4 days)

In index.js, stop using hint-derived synthetic PCM for primary decode.
Use recorded uri from audioRecorder.js, upload to backend STT, receive transcript.
Keep decoder.js as the step-based grammar gate after transcript.
Keep FSM authority in voiceFSM.js.
Exit criteria

Speaking with empty hinted text still produces transcript.
FSM step progression works from real transcript, not typed hint.
## Phase 3: Bengali Accuracy Hardening (3-5 days)

Expand Bengali/Banglish phrases and noisy variants in utterances.json.
Tune aliases and thresholds in voiceTuningConfig.js.
Expand names/hotwords in hotwordDictionary.json.
Re-run evaluation and parser regression via runVoiceEvaluation.cjs and runBnParserRegression.cjs.
Exit criteria

Bengali parser regression remains passing.
Accuracy KPIs hit pilot threshold.
## Phase 4: Safety, Auth, and Data Integrity (2-3 days)

Keep command execution path strictly structured via commandExecutor.js.
Ensure no raw transcript directly triggers writes.
Preserve confirm/high-risk gates and idempotency behavior.
Add backend auth/rate-limit on STT endpoint.
Exit criteria

Zero direct-execute path from transcript.
Duplicate submissions do not produce duplicate writes.
## Phase 5: Reliability and Fallback Behavior (2-3 days)

Add deterministic fallback ordering in index.js:
Cloud STT success -> grammar/FSM.
Cloud timeout/error -> actionable retry/correction path.
Improve user feedback and retry UX in VoiceAssistantScreen.js.
Capture STT-specific failure reasons in analytics.
Exit criteria

No silent failures.
Clear retry/recovery path for all STT failure classes.
## Phase 6: Cost and Performance Controls (2 days)

Enforce utterance length cap and audio compression policy before upload.
Add per-user/session request throttling.
Track provider latency and cost proxies in voiceAnalyticsLogger.js.
Exit criteria

Monthly cost projection under target.
p95 end-to-end latency under target.
## Phase 7: Pilot Rollout and GO/NO_GO (1-2 weeks)

Keep cohort gating in pilotRolloutManager.js.
Weekly decision reviews with generatePilotGoNoGo.cjs.
Tighten thresholds based on blocker patterns.
Exit criteria

Stable KPI cycles.
No critical safety or integrity blocker.
## Phase 8: Production Launch and Continuous Improvement (ongoing)

Gradually expand cohort stages 5% -> 25% -> 50% -> 100% via pilotRolloutManager.js.
Expand command coverage with ADD_DEBT, PAYMENT, SALE first, then inventory/supplier intents behind rollout gates.
Keep regression gates mandatory on every release via runVoiceReleaseGate.cjs.
Run evaluation checks on every release candidate: runVoiceEvaluation.cjs and runBnParserRegression.cjs.
Generate weekly production ops summary via generateVoiceOpsReport.cjs.
Perform weekly/bi-weekly Bengali confusion analysis and update hotwordDictionary.json + utterances.json.
Tune thresholds in voiceTuningConfig.js from KPI + reliability + cost trends.
Use immediate rollback controls when KPI/safety/cost blockers appear.
Exit criteria

Sustained KPI compliance in production.
Controlled costs with stable reliability.
No regression-gate release failures.
Suggested execution order

Phase 1 and Phase 2 first to make transcription truly real.
Phase 3 and Phase 4 next to ensure Bengali quality plus safety.
Phase 5 and Phase 6 before large pilot.
Phase 7 and Phase 8 for rollout.

Phase 8 execution checklist

1. Expand cohort to next stage only after GO decision and required stable cycles.
2. Monitor KPIs continuously and run weekly GO/NO_GO + ops report.
3. Run release gate before every production release.
4. Analyze confusion patterns and patch hotwords/dataset.
5. Tune thresholds/config and re-run evaluations.
6. Deploy next iteration or rollback immediately if blockers trigger.