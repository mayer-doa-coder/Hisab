# Trust Promotion Gates Lock (v1)

Status: LOCKED
Date: 2026-04-11
Owner: ML + Product Analytics
Applies to: Challenger promotion workflow for trust scoring

## Purpose

Define fixed, versioned promotion gates for segment-level challenger rollout.

## Source of Truth

- backend/artifacts/trustPromotionGates.v1.json

## Governance Rules

1. Gates are immutable under version 1.0.0.
2. Any threshold update requires:
   - ML review
   - Product Analytics sign-off
   - New gate version file
3. Promotion decisions must be produced by rolling-window backtesting only.
4. Promotion is segment-level only. No global promotion switch is allowed.

## Mandatory Gate Categories

- Statistical lift
- Calibration guardrails
- Business lift
- Stability across windows

## Promotion Principle

Promote challenger only for segments where all gate categories pass.
Else keep champion.
