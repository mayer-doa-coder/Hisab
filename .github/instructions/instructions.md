---
description: Master project context and implementation workflow for HISAB. Load for all tasks in this repository.
applyTo: "**/*"
---

# HISAB Agent Instructions (Project Master Context)

These instructions define the full project context for HISAB and must be treated as always-on guidance for coding, planning, reviews, architecture decisions, and documentation.

## Mandatory Reference Documents

Always use ALL documents below together:

1. This file: `.github/instructions/instructions.md` (high-level product + execution rules)
2. `SOFTWARE_SOLUTION_DOCUMENT.md` (full software solution baseline and scope)
3. `HISAB_Project_Workflow.md` (full systems workflow, architecture, sprints, testing, models, and delivery)

If there is any ambiguity:

- Follow product goals and constraints in this file first.
- Then follow detailed execution steps and engineering breakdown in `HISAB_Project_Workflow.md`.
- Then align with the existing repository code patterns.

---

## 1) Product Vision

**Project:** Hisab – Smart Retail Assistant for Small Stores in Bangladesh.

Hisab is an offline-first, mobile-first intelligent retail assistant for low-literate small দোকান owners. It replaces handwritten খাতা workflows with fast Bengali-first digital operations.

### Core Outcomes

- Reduce errors in baki (credit) and daily হিসাব.
- Prevent inventory loss (stockout + expiry).
- Support data-driven restocking decisions.
- Enable low-friction use with voice-first Bengali interaction.
- Work reliably without internet.

---

## 2) Problem Context (Must Preserve)

The system is designed to solve:

- Manual credit management errors in handwritten ledgers.
- Missing stock visibility and expiry losses.
- Lack of transaction traceability and receipts.
- Cognitive overload on shop owners.
- Typing friction and low digital literacy.
- Weak trust/risk assessment for credit customers.
- Unreliable internet in rural/low-connectivity contexts.

---

## 3) Solution Scope (Functional)

### Core Modules (Must-Have)

1. Inventory Management
	- Product CRUD
	- Stock tracking
	- Expiry alerts
	- Reorder suggestions

2. Baki Management
	- Add credit entries
	- Record repayments
	- Daily/weekly/monthly summaries
	- Reminder-ready flows

3. Voice Assistant (Bangla-first)
	- Voice command processing for retail actions
	- Example intents: add baki, payment, stock query, sales entry

4. Transaction System
	- Silent transaction logging
	- Optional receipt generation
	- Barcode/scanning-ready flow when applicable

5. Analytics & Prediction
	- Sales trends and seasonal insights
	- Markov Chain-based demand forecasting

6. Trust Score
	- Based on payment behavior and delay profile
	- Transparent and explainable logic (no opaque scoring)

7. Payment Integration
	- bKash / Nagad integration path (as rollout phase)

8. Offline-First Sync
	- Full local functionality without internet
	- Queue/conflict-aware sync when online

---

## 4) Non-Functional Targets

- App response target: < 2s for standard actions.
- Voice processing target: < 3s (prefer near 1s where possible).
- Offline guarantee for core flows.
- Secure local/cloud data handling and encrypted sensitive data.
- Bangla-first accessibility and minimal typing UX.
- Modular design with scalable services.

---

## 5) Architecture Baseline

Use the architecture in `HISAB_Project_Workflow.md` as the primary blueprint.

High-level system:

- Mobile App (Offline first)
- Local SQLite storage
- Sync engine
- Cloud backend
- Voice module (on-device prioritized)
- ML prediction engine (Markov Chain + contextual factors)

In this repository, default implementation choices should align with the existing React Native / Expo / TypeScript stack unless a task explicitly requires otherwise.

---

## 6) Complete Workflow & Breakdown (Always Apply)

### A. Requirement-to-Delivery Flow

1. Map request to module(s): Baki / Inventory / Voice / OCR / Prediction / Reports / Sync.
2. Trace requirement type: FR / NFR / UIR / MLR / CR (as defined in workflow doc).
3. Design minimal implementation with clear interface boundaries.
4. Implement in small, testable increments.
5. Validate with unit/integration/manual device checks.
6. Document decisions and update related docs when behavior changes.

### B. Sprint-Oriented Delivery Reference

Follow the detailed 8-week plan in `HISAB_Project_Workflow.md`:

- Week 1: Foundation + setup
- Week 2: Baki core + customer flows
- Week 3: Voice v1
- Week 4: OCR v1
- Week 5: Sales + inventory + real data
- Week 6: Model fine-tuning + prediction
- Week 7: Reports + optimization
- Week 8: QA, documentation, release readiness

When building features, keep them compatible with this progression.

### C. Definition of Done (Minimum)

- Code compiles and follows project conventions.
- No avoidable lint/type errors introduced.
- Relevant tests/manual verification completed.
- Edge/error states handled.
- Documentation updated when behavior/contracts change.

---

## 7) Engineering Rules for Agents

### Design & Code Quality

- Prefer clean, modular architecture and small focused files.
- Reuse existing components/hooks/services before adding new abstractions.
- Keep Bangla-first UX in mind for labels, voice flows, and confirmations.
- Preserve offline-first behavior; do not introduce internet dependency for core actions.

### Data & State

- Use deterministic data models and typed interfaces.
- Keep local persistence resilient (no destructive schema changes without migration path).
- Treat sync/conflict logic as a first-class concern.

### ML/Voice/OCR

- Favor on-device execution and lightweight model usage.
- Keep command parsing robust for noisy retail environments.
- Support human confirmation/edit loop for uncertain outputs.

### Security & Trust

- Avoid exposing sensitive data.
- Keep trust score rules transparent and auditable.
- Integrations with payment APIs must use secure patterns and minimal privilege.

---

## 8) Research & Publication Alignment (Keep Track)

System changes should preserve measurable outcomes that support publication themes:

- Offline-first AI-driven retail management for developing economies.
- Markov Chain demand forecasting for small retail.
- Voice-enabled financial tracking for low-literacy users.

Where feasible, keep implementation measurable for:

- Accuracy, latency, model size, app performance, usability outcomes.

---

## 9) Repository Context Rule

For every substantial feature or refactor, consult `HISAB_Project_Workflow.md` for:

- Requirement mapping
- Architecture layer placement
- Pattern selection (Repository, Adapter, Strategy, Facade, Command, Observer)
- Test scope and acceptance expectations

This ensures the system remains aligned with the full HISAB document and workflow.