# Phase 8-9 Voice Rollout Plan

## Phase 8: Pilot Rollout (1-2 weeks)

Scope:

- Restrict voice execution to a small pilot cohort.
- Track local observability for each flow:
  - command outcomes
  - correction events
  - cancellation/block rates
  - ASR latency samples
- Run weekly KPI review and apply threshold or grammar tightening before broader exposure.

Implemented controls:

- Pilot cohort gate in voice runtime:
  - services/voice/pilot/pilotConfig.js
  - services/voice/pilot/pilotRolloutManager.js
- Observability and KPI decision engine:
  - services/voice/voiceAnalyticsLogger.js
  - command_outcome and latency_sample events added
  - computePilotKpis(), buildGoNoGoDecision(), getPilotSnapshot()
- Runtime event instrumentation wired from wizard execution path:
  - screens/VoiceAssistantScreen.js

Weekly review flow:

1. Pull pilot snapshot via getPilotSnapshot({ cycleDays: 7 }).
2. Review KPI blockers from buildGoNoGoDecision().
3. Tighten grammar and thresholds when blockers exist:
   - adjust confidence thresholds in services/voice/config/voiceTuningConfig.js
   - expand intent aliases and hotword dictionary from observed corrections
4. Re-run Bengali parser regression suite before changing rollout state.

Pilot exit criteria:

- Pilot KPIs are stable for at least one full 7-day cycle.
- No critical safety issue.
- No data-integrity issue.
- Decision output = GO.

Decision output contract:

- GO: eligible for wider cohort rollout.
- NO_GO: keep pilot-only and resolve blockers first.

## Phase 9: Production Launch and Continuous Improvement

Rollout strategy:

- Expand command coverage in controlled increments (intent-by-intent).
- Keep idempotent secure execution and confidence gates unchanged as a safety baseline.

Personalization path:

- Per-user hotword resources and command shortcuts:
  - services/voice/personalization/userVoicePersonalization.js
- Runtime personalization applied before normalization:
  - user shortcut expansion
  - user-specific entity hotword merge

Regression guardrails:

- Strict Bengali parser regression suite:
  - services/voice/evaluation/runBnParserRegression.cjs
- Required before threshold/grammar updates and each production promotion.

Long-term roadmap output:

1. Cohort expansion milestones by role and branch size.
2. Monthly parser accuracy audits (amount/date/name).
3. Personalization quality scoring and fallback safety checks.
4. Quarterly review of grammar, thresholds, and command coverage backlog.

## Go/No-Go Checklist

- [ ] 7-day pilot snapshot generated
- [ ] All KPI thresholds met
- [ ] Zero critical safety issues
- [ ] Zero integrity issues
- [ ] Bengali parser regression suite passes
- [ ] Rollout decision documented as GO
