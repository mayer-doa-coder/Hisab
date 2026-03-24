# HISAB Project Workflow Document

## Project Overview

**Project Name:** HISAB (হিসাব)  
**Duration:** 8 Weeks  
**Team Size:** 2 People  
**Target:** Fully Offline Mobile App (<50 MB)  
**Target Users:** Low-literate small shop owners (মুদির দোকান) in Bangladesh

---

## Executive Summary

HISAB is an offline-first mobile application designed for small retail shopkeepers in Bangladesh to replace handwritten বাকি খাতা (credit ledger) and basic store records. The app features custom-trained Bengali voice recognition, handwritten khata OCR, and Markov chain-based demand prediction.

### Key Features

- **বাকি খাতা (Credit Ledger):** Track customer credit and payments
- **Sales Recording:** Quick sale entry with voice support
- **Inventory Management:** Stock tracking with low-stock alerts
- **Demand Prediction:** Markov chain-based purchase suggestions
- **Area Trends:** See what's selling in nearby shops
- **Voice Input:** Custom Bengali ASR for retail commands
- **Photo OCR:** Digitize handwritten khata pages

### Technical Specs

| Spec           | Target              |
| -------------- | ------------------- |
| App Size       | <50 MB              |
| Voice Model    | ~5 MB               |
| OCR Model      | ~8 MB               |
| Offline        | 100%                |
| Target Devices | ৳3,000-8,000 phones |
| Min RAM        | 512 MB              |

---

## Problem Statement

Small shopkeepers currently rely on paper-based ledgers for:

- Customer credit (বাকি)
- Sales records
- Inventory tracking

This leads to:

- Calculation errors
- Lost or damaged records
- No sales history or demand insight
- Trust issues due to lack of receipts

---

## Solution: HISAB

HISAB acts as a digital khata with:

1. **Simple Bengali UI** - For low-literate users
2. **Voice Commands** - "করিম ৫০০ টাকা বাকি"
3. **Photo Input** - Snap khata page → Auto entry
4. **Smart Suggestions** - What to buy next month
5. **Area Trends** - What's selling in nearby shops
6. **Offline First** - No internet required

---

## Software Engineering Methodology

### Development Model: Hybrid Agile-V Model

We adopt a **Hybrid Agile-V Model** combining:

- **Agile** for iterative development and flexibility
- **V-Model** for systematic verification and validation

```
                    HYBRID AGILE-V MODEL

    Requirements ◄─────────────────────────► Acceptance Testing
         │                                          ▲
         ▼                                          │
    System Design ◄───────────────────────► System Testing
         │                                          ▲
         ▼                                          │
    Architecture ◄────────────────────────► Integration Testing
         │                                          ▲
         ▼                                          │
    Module Design ◄───────────────────────► Unit Testing
         │                                          ▲
         ▼                                          │
         └──────────► Implementation ◄──────────────┘
                            │
                    ┌───────┴───────┐
                    │ Agile Sprints │
                    │ (8 x 1-week)  │
                    └───────────────┘
```

### Why Hybrid Model?

| Aspect            | Agile Contribution             | V-Model Contribution          |
| ----------------- | ------------------------------ | ----------------------------- |
| Flexibility       | Adapt to changing requirements | -                             |
| Documentation     | -                              | Formal specs at each level    |
| Testing           | Continuous testing             | Structured test phases        |
| User Involvement  | Weekly demos                   | -                             |
| Traceability      | -                              | Requirements to tests mapping |
| Research Validity | Iterative improvement          | Systematic validation         |

---

### Team Workflow

#### Roles

| Role            | Person | Responsibilities                     |
| --------------- | ------ | ------------------------------------ |
| **Lead**        | Rotate | Facilitate meetings, remove blockers |
| **Developer A** | A      | ML/Backend development               |
| **Developer B** | B      | Frontend/UI development              |

#### Project Tracking

| Item                   | Description                      | Location          |
| ---------------------- | -------------------------------- | ----------------- |
| **Backlog**            | Prioritized list of all features | GitHub Issues     |
| **Weekly Tasks**       | Tasks committed for current week | GitHub Milestones |
| **Release**            | Working product at week end      | Git tag (vX.Y.Z)  |
| **Definition of Done** | Criteria for task completion     | See DoD below     |

#### Weekly Structure

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           WEEKLY STRUCTURE                                  │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  MONDAY                                                                     │
│  ├── 09:00-09:30  Weekly Planning (30 min)                                 │
│  │   ├── Review backlog                                                    │
│  │   ├── Select week's goal                                                │
│  │   ├── Break down tasks                                                  │
│  │   └── Assign to GitHub Issues                                           │
│  └── 09:30-18:00  Development                                              │
│                                                                             │
│  TUESDAY - THURSDAY                                                        │
│  ├── 09:00-09:15  Quick Sync (15 min, async OK)                           │
│  │   ├── What did I complete yesterday?                                   │
│  │   ├── What will I do today?                                            │
│  │   └── Any blockers?                                                    │
│  └── 09:15-18:00  Development                                              │
│                                                                             │
│  FRIDAY                                                                     │
│  ├── 09:00-12:00  Development + Integration                               │
│  ├── 14:00-15:00  Demo (1 hr)                                              │
│  │   ├── Demo completed features                                          │
│  │   ├── Get feedback                                                     │
│  │   └── Update backlog                                                   │
│  └── 15:00-16:00  Review (1 hr)                                            │
│      ├── What went well?                                                  │
│      ├── What could improve?                                              │
│      └── Action items for next week                                       │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

#### Definition of Done (DoD)

A task is considered **DONE** when:

| Category        | Criteria                             |
| --------------- | ------------------------------------ |
| **Code**        | ☐ Code written and self-reviewed     |
|                 | ☐ Code follows project style guide   |
|                 | ☐ No TypeScript/ESLint errors        |
| **Testing**     | ☐ Unit tests written (if applicable) |
|                 | ☐ Manual testing on physical device  |
|                 | ☐ Edge cases considered              |
| **Review**      | ☐ Pull request created               |
|                 | ☐ Peer reviewed by other team member |
|                 | ☐ Review comments addressed          |
| **Docs**        | ☐ Code comments for complex logic    |
|                 | ☐ README updated (if API changed)    |
| **Integration** | ☐ Merged to develop branch           |
|                 | ☐ No regression in existing features |

---

## System Engineering Approach

### Systems Engineering Lifecycle (ISO/IEC 15288)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    SYSTEM ENGINEERING LIFECYCLE                             │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│   ┌─────────────┐    ┌─────────────┐    ┌─────────────┐    ┌─────────────┐ │
│   │  CONCEPT    │───►│ DEVELOPMENT │───►│ PRODUCTION  │───►│ UTILIZATION │ │
│   │   STAGE     │    │    STAGE    │    │    STAGE    │    │    STAGE    │ │
│   └─────────────┘    └─────────────┘    └─────────────┘    └─────────────┘ │
│         │                  │                  │                  │         │
│         ▼                  ▼                  ▼                  ▼         │
│   ┌───────────┐      ┌───────────┐      ┌───────────┐      ┌───────────┐   │
│   │• Stakeholder│    │• System   │      │• Build    │      │• User     │   │
│   │  Analysis   │    │  Design   │      │  Release  │      │  Study    │   │
│   │• Concept   │    │• Implement │      │• Deploy   │      │• Feedback │   │
│   │  Definition│    │• Integrate │      │• Validate │      │• Research │   │
│   │• Feasibility│   │• Verify   │      │• Document │      │• Publish  │   │
│   └───────────┘      └───────────┘      └───────────┘      └───────────┘   │
│                                                                             │
│   Week 0 (Done)       Week 1-7           Week 8            Post-Week 8     │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Requirements Engineering

#### Requirement Categories

| Category                 | ID Prefix | Description                           |
| ------------------------ | --------- | ------------------------------------- |
| **Functional (FR)**      | FR-XXX    | What the system shall do              |
| **Non-Functional (NFR)** | NFR-XXX   | Quality attributes (performance, etc) |
| **User Interface (UIR)** | UIR-XXX   | UI/UX requirements                    |
| **Data (DR)**            | DR-XXX    | Data storage and management           |
| **ML Model (MLR)**       | MLR-XXX   | Machine learning requirements         |
| **Constraint (CR)**      | CR-XXX    | Technical/business constraints        |

#### Functional Requirements

| ID     | Requirement                                            | Priority | Sprint |
| ------ | ------------------------------------------------------ | -------- | ------ |
| FR-001 | System shall allow adding new customers                | Must     | 2      |
| FR-002 | System shall record credit (baki) transactions         | Must     | 2      |
| FR-003 | System shall record payment transactions               | Must     | 2      |
| FR-004 | System shall display customer transaction history      | Must     | 2      |
| FR-005 | System shall calculate total outstanding baki          | Must     | 2      |
| FR-006 | System shall accept voice commands in Bengali          | Must     | 3      |
| FR-007 | System shall recognize voice intent (baki/payment/etc) | Must     | 3      |
| FR-008 | System shall extract numbers from voice                | Must     | 3      |
| FR-009 | System shall capture photos of khata pages             | Must     | 4      |
| FR-010 | System shall extract entries from khata images         | Must     | 4      |
| FR-011 | System shall record product sales                      | Must     | 5      |
| FR-012 | System shall track product inventory                   | Must     | 5      |
| FR-013 | System shall alert on low stock                        | Should   | 5      |
| FR-014 | System shall predict demand using Markov chain         | Must     | 6      |
| FR-015 | System shall suggest purchase quantities               | Must     | 6      |
| FR-016 | System shall calculate customer trust scores           | Should   | 6      |
| FR-017 | System shall show area trending products               | Should   | 6      |
| FR-018 | System shall sync anonymized sales data (optional)     | Should   | 7      |
| FR-019 | System shall generate daily/weekly reports             | Should   | 7      |
| FR-020 | System shall generate shareable receipts               | Should   | 7      |

#### Non-Functional Requirements

| ID      | Requirement                                       | Metric                    | Sprint |
| ------- | ------------------------------------------------- | ------------------------- | ------ |
| NFR-001 | App shall work 100% offline                       | No network calls required | 1      |
| NFR-002 | App size shall be under 50 MB                     | APK size < 50 MB          | 7      |
| NFR-003 | App shall run on 512 MB RAM devices               | Peak RAM < 150 MB         | 7      |
| NFR-004 | App cold start shall be under 3 seconds           | Time to interactive < 3s  | 7      |
| NFR-005 | Voice recognition latency shall be under 1 second | Response time < 1000 ms   | 3      |
| NFR-006 | Voice recognition accuracy shall exceed 90%       | Intent accuracy > 90%     | 6      |
| NFR-007 | OCR number accuracy shall exceed 95%              | Digit accuracy > 95%      | 6      |
| NFR-008 | OCR processing shall be under 2 seconds           | Processing time < 2000 ms | 4      |
| NFR-009 | Battery consumption shall be under 5% per hour    | Active use measurement    | 7      |
| NFR-010 | Data shall persist across app restarts            | SQLite persistence        | 1      |

#### User Interface Requirements

| ID      | Requirement                                       | Priority | Sprint |
| ------- | ------------------------------------------------- | -------- | ------ |
| UIR-001 | All UI text shall be in Bengali                   | Must     | 1      |
| UIR-002 | UI shall use large touch targets (min 48dp)       | Must     | 1      |
| UIR-003 | UI shall use color coding for quick understanding | Must     | 6      |
| UIR-004 | UI shall provide audio feedback for actions       | Should   | 3      |
| UIR-005 | UI shall work in portrait orientation             | Must     | 1      |
| UIR-006 | UI shall support system font scaling              | Should   | 7      |

#### ML Model Requirements

| ID      | Requirement                                | Metric                 | Sprint |
| ------- | ------------------------------------------ | ---------------------- | ------ |
| MLR-001 | Voice model size shall be under 5 MB       | TFLite file < 5 MB     | 3      |
| MLR-002 | Voice model shall classify 5 intents       | add_baki, payment, etc | 3      |
| MLR-003 | Voice model shall extract Bengali numbers  | 0-99999 recognition    | 3      |
| MLR-004 | OCR model size shall be under 10 MB        | TFLite file < 10 MB    | 4      |
| MLR-005 | OCR model shall recognize Bengali digits   | 0-9 + blank            | 4      |
| MLR-006 | Both models shall run on-device (no cloud) | TFLite inference only  | 4      |

#### Constraints

| ID     | Constraint                                | Rationale             |
| ------ | ----------------------------------------- | --------------------- |
| CR-001 | Must use React Native for cross-platform  | Team expertise        |
| CR-002 | Must use SQLite for local database        | Offline requirement   |
| CR-003 | Must use TensorFlow Lite for ML inference | Mobile optimization   |
| CR-004 | Target Android 8.0+ only                  | 95% Bangladesh market |
| CR-005 | No cloud dependencies for core features   | Offline-first design  |
| CR-006 | Training must use free resources          | Budget constraint     |
| CR-007 | Development timeline fixed at 8 weeks     | Academic deadline     |

---

### Requirements Traceability Matrix (RTM)

| Requirement | Design Component  | Implementation Module | Test Case  | Status    |
| ----------- | ----------------- | --------------------- | ---------- | --------- |
| FR-001      | CustomerEntity    | customerService.ts    | TC-001     | ☐ Pending |
| FR-002      | TransactionEntity | transactionService.ts | TC-002     | ☐ Pending |
| FR-003      | TransactionEntity | transactionService.ts | TC-003     | ☐ Pending |
| FR-006      | VoiceModule       | voiceEngine.ts        | TC-006     | ☐ Pending |
| FR-007      | IntentClassifier  | intentParser.ts       | TC-007     | ☐ Pending |
| FR-009      | CameraModule      | ocrEngine.ts          | TC-009     | ☐ Pending |
| FR-014      | PredictionModule  | predictionService.ts  | TC-014     | ☐ Pending |
| NFR-001     | Architecture      | No network layer      | TC-NFR-001 | ☐ Pending |
| NFR-002     | Build Config      | APK optimization      | TC-NFR-002 | ☐ Pending |
| MLR-001     | VoiceModel        | voice-retail.tflite   | TC-MLR-001 | ☐ Pending |

---

### System Architecture Design

#### Architecture Pattern: Clean Architecture + MVVM

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        HISAB SYSTEM ARCHITECTURE                            │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │                      PRESENTATION LAYER                             │    │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐ │    │
│  │  │   Screens   │  │ Components  │  │   Hooks     │  │   Theme     │ │    │
│  │  │  (React)    │  │ (UI Kit)    │  │(State Mgmt) │  │  (Styles)   │ │    │
│  │  └─────────────┘  └─────────────┘  └─────────────┘  └─────────────┘ │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                      │                                      │
│                                      ▼                                      │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │                       APPLICATION LAYER                             │    │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐ │    │
│  │  │  Customer   │  │Transaction  │  │   Sales     │  │ Prediction  │ │    │
│  │  │  Service    │  │  Service    │  │  Service    │  │  Service    │ │    │
│  │  └─────────────┘  └─────────────┘  └─────────────┘  └─────────────┘ │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                      │                                      │
│                                      ▼                                      │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │                         DOMAIN LAYER                                │    │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐ │    │
│  │  │  Entities   │  │  Use Cases  │  │ Interfaces  │  │   Utils     │ │    │
│  │  │ (Types)     │  │  (Logic)    │  │ (Contracts) │  │  (Helpers)  │ │    │
│  │  └─────────────┘  └─────────────┘  └─────────────┘  └─────────────┘ │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                      │                                      │
│                                      ▼                                      │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │                     INFRASTRUCTURE LAYER                            │    │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐ │    │
│  │  │   SQLite    │  │   TFLite    │  │   Camera    │  │    File     │ │    │
│  │  │  Database   │  │   Runtime   │  │   Module    │  │   System    │ │    │
│  │  └─────────────┘  └─────────────┘  └─────────────┘  └─────────────┘ │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

#### Component Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         COMPONENT DIAGRAM                                   │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│    ┌──────────────────┐         ┌──────────────────┐                        │
│    │    App Shell     │────────►│    Navigation    │                        │
│    └──────────────────┘         └──────────────────┘                        │
│             │                            │                                  │
│             ▼                            ▼                                  │
│    ┌──────────────────────────────────────────────────────────────────┐     │
│    │                        SCREEN COMPONENTS                         │     │
│    │  ┌────────┐  ┌────────┐  ┌────────┐  ┌────────┐  ┌────────┐      │     │
│    │  │  Home  │  │Customer│  │ Sales  │  │Inventory│ │Suggest │      │     │
│    │  └────────┘  └────────┘  └────────┘  └────────┘  └────────┘      │     │
│    └──────────────────────────────────────────────────────────────────┘     │
│             │                                                               │
│             ▼                                                               │
│    ┌──────────────────────────────────────────────────────────────────┐     │
│    │                          HOOKS                                   │     │
│    │  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐          │     │
│    │  │useVoice  │  │useCamera │  │useCustomer│ │useSales  │          │     │
│    │  └──────────┘  └──────────┘  └──────────┘  └──────────┘          │     │
│    └──────────────────────────────────────────────────────────────────┘     │
│             │                                                               │
│             ▼                                                               │
│    ┌──────────────────────────────────────────────────────────────────┐     │
│    │                        SERVICES                                  │     │
│    │  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐          │     │
│    │  │ Voice    │  │   OCR    │  │ Customer │  │Prediction│          │     │
│    │  │ Engine   │  │  Engine  │  │ Service  │  │ Service  │          │     │
│    │  └──────────┘  └──────────┘  └──────────┘  └──────────┘          │     │
│    └──────────────────────────────────────────────────────────────────┘     │
│             │                                                               │
│             ▼                                                               │
│    ┌──────────────────────────────────────────────────────────────────┐     │
│    │                     INFRASTRUCTURE                               │     │
│    │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐            │     │
│    │  │   SQLite     │  │   TFLite     │  │   Camera     │            │     │
│    │  │   Database   │  │   Models     │  │   Native     │            │     │
│    │  └──────────────┘  └──────────────┘  └──────────────┘            │     │
│    └──────────────────────────────────────────────────────────────────┘     │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

#### Data Flow Diagram (Level 0 - Context)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    DATA FLOW DIAGRAM (CONTEXT LEVEL)                        │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│   ┌───────────┐                                        ┌───────────┐        │
│   │           │  Voice Commands    ┌───────────────┐   │           │        │
│   │           │───────────────────►│               │   │           │        │
│   │           │                    │               │   │           │        │
│   │           │  Khata Photos      │               │   │           │        │
│   │           │───────────────────►│    HISAB      │   │           │        │
│   │ Shopkeeper│                    │    SYSTEM     │   │ Customers │        │
│   │           │  Manual Input      │               │   │           │        │
│   │           │───────────────────►│               │   │           │        │
│   │           │                    │               │   │           │        │
│   │           │◄───────────────────│               │   │           │        │
│   │           │  Predictions       └───────────────┘   │           │        │
│   │           │  Reports                 │             │           │        │
│   │           │  Receipts                │             │           │        │
│   └───────────┘                          │             └───────────┘        │
│                                          │                                  │
│                                          ▼                                  │
│                               ┌───────────────────┐                         │
│                               │    Local SQLite   │                         │
│                               │    Database       │                         │
│                               └───────────────────┘                         │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

### Design Patterns by Module

#### Pattern Overview

| Module               | Primary Pattern | Secondary Pattern       | Purpose                             |
| -------------------- | --------------- | ----------------------- | ----------------------------------- |
| **Database Layer**   | Repository      | Singleton               | Abstract data access                |
| **Voice Engine**     | Adapter         | Strategy                | Wrap ML model, swappable algorithms |
| **OCR Engine**       | Adapter         | Template Method         | Wrap ML model, define processing    |
| **Prediction**       | Strategy        | Factory                 | Swappable algorithms                |
| **State Management** | Observer        | Pub/Sub                 | Reactive UI updates                 |
| **Services**         | Facade          | Dependency Injection    | Simplify complex operations         |
| **UI Components**    | Composite       | Decorator               | Build complex UIs                   |
| **Input Handling**   | Command         | Chain of Responsibility | Voice/touch actions                 |

---

#### 1. Repository Pattern (Data Access Layer)

**Purpose:** Abstract database operations from business logic.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         REPOSITORY PATTERN                                  │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│   ┌─────────────────────────────────────────────────────────────────────┐   │
│   │                      APPLICATION LAYER                              │   │
│   │                                                                     │   │
│   │   customerService.ts           transactionService.ts                │   │
│   │         │                              │                            │   │
│   │         ▼                              ▼                            │   │
│   │   ┌─────────────────┐          ┌─────────────────┐                  │   │
│   │   │ ICustomerRepo   │          │ ITransactionRepo│ ◄── Interface    │   │
│   │   │ (Interface)     │          │ (Interface)     │                  │   │
│   │   └────────┬────────┘          └────────┬────────┘                  │   │
│   │            │                            │                           │   │
│   └────────────┼────────────────────────────┼───────────────────────────┘   │
│                │                            │                               │
│   ┌────────────┼────────────────────────────┼───────────────────────────┐   │
│   │            ▼                            ▼                           │   │
│   │   ┌─────────────────┐          ┌─────────────────┐                  │   │
│   │   │ SQLiteCustomer  │          │ SQLiteTransaction│ ◄── Concrete    │   │
│   │   │ Repository      │          │ Repository       │                 │   │
│   │   └────────┬────────┘          └────────┬────────┘                  │   │
│   │            │                            │                           │   │
│   │            └──────────┬─────────────────┘                           │   │
│   │                       ▼                                             │   │
│   │              ┌─────────────────┐                                    │   │
│   │              │  SQLite Database │                                   │   │
│   │              └─────────────────┘                                    │   │
│   │                                                                     │   │
│   │                    INFRASTRUCTURE LAYER                             │   │
│   └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

**Implementation:**

```typescript
// interfaces/ICustomerRepository.ts
interface ICustomerRepository {
  findById(id: number): Promise<Customer | null>;
  findAll(): Promise<Customer[]>;
  save(customer: Customer): Promise<Customer>;
  delete(id: number): Promise<boolean>;
  findByName(name: string): Promise<Customer[]>;
}

// repositories/SQLiteCustomerRepository.ts
class SQLiteCustomerRepository implements ICustomerRepository {
  private db: SQLiteDatabase;

  async findById(id: number): Promise<Customer | null> {
    const result = await this.db.executeSql(
      "SELECT * FROM customers WHERE id = ?",
      [id],
    );
    return result.rows.length > 0
      ? this.mapToCustomer(result.rows.item(0))
      : null;
  }

  async save(customer: Customer): Promise<Customer> {
    // INSERT or UPDATE logic
  }
}
```

**Benefits:**

- Easy to mock for unit testing
- Database can be swapped (SQLite → Room → Realm)
- Business logic stays clean

---

#### 2. Adapter Pattern (ML Model Integration)

**Purpose:** Wrap TensorFlow Lite models with a consistent interface.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           ADAPTER PATTERN                                   │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│        APPLICATION CODE                          EXTERNAL ML MODELS         │
│                                                                             │
│   ┌─────────────────┐                                                       │
│   │  VoiceService   │                                                       │
│   │                 │                                                       │
│   │  processVoice() │                                                       │
│   └────────┬────────┘                                                       │
│            │                                                                │
│            ▼                                                                │
│   ┌─────────────────┐          ┌─────────────────────────────────────┐      │
│   │ IVoiceRecognizer│          │         TFLite Runtime              │      │
│   │   (Interface)   │          │  ┌─────────────────────────────┐    │      │
│   │                 │          │  │  voice-retail.tflite        │    │      │
│   │  recognize()    │          │  │  - load model               │    │      │
│   │  getIntent()    │          │  │  - preprocess audio         │    │      │
│   │  getNumbers()   │          │  │  - run inference            │    │      │
│   └────────┬────────┘          │  │  - postprocess output       │    │      │
│            │                   │  └─────────────────────────────┘    │      │
│            ▼                   └─────────────────────────────────────┘      │
│   ┌─────────────────┐                         ▲                             │
│   │ TFLiteVoice     │                         │                             │
│   │ Adapter         │─────────────────────────┘                             │
│   │                 │         Adapts TFLite to                              │
│   │  recognize() ─────────►   IVoiceRecognizer                              │
│   │  getIntent()  ─────────►   interface                                    │
│   │  getNumbers() ─────────►                                                │
│   └─────────────────┘                                                       │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

**Implementation:**

```typescript
// interfaces/IVoiceRecognizer.ts
interface IVoiceRecognizer {
  recognize(audioBuffer: Float32Array): Promise<VoiceResult>;
  getIntent(): VoiceIntent;
  getNumbers(): number[];
  getConfidence(): number;
}

// adapters/TFLiteVoiceAdapter.ts
class TFLiteVoiceAdapter implements IVoiceRecognizer {
  private interpreter: TFLiteInterpreter;
  private lastResult: VoiceResult | null = null;

  constructor(modelPath: string) {
    this.interpreter = new TFLiteInterpreter(modelPath);
  }

  async recognize(audioBuffer: Float32Array): Promise<VoiceResult> {
    // Preprocess: Convert to mel spectrogram
    const melSpec = this.audioToMelSpectrogram(audioBuffer);

    // Run TFLite inference
    const output = await this.interpreter.run(melSpec);

    // Postprocess: Decode output to intent + numbers
    this.lastResult = this.decodeOutput(output);
    return this.lastResult;
  }

  getIntent(): VoiceIntent {
    return this.lastResult?.intent ?? VoiceIntent.UNKNOWN;
  }

  getNumbers(): number[] {
    return this.lastResult?.numbers ?? [];
  }
}

// Similarly for OCR
// adapters/TFLiteOCRAdapter.ts
class TFLiteOCRAdapter implements IOCREngine {
  // Adapts TFLite OCR model to IOCREngine interface
}
```

**Benefits:**

- Decouple app from specific ML framework
- Easy to swap models (TFLite → ONNX → custom)
- Testable with mock adapters

---

#### 3. Strategy Pattern (Prediction Algorithms)

**Purpose:** Allow swapping prediction algorithms at runtime.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                          STRATEGY PATTERN                                   │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│   ┌─────────────────────────────────────────────────────────────────────┐   │
│   │                      PredictionService                              │   │
│   │                                                                     │   │
│   │   strategy: IPredictionStrategy  ◄── Can be changed at runtime      │   │
│   │                                                                     │   │
│   │   setStrategy(strategy)                                             │   │
│   │   predict(salesHistory) ──────────► strategy.calculate()            │   │
│   │                                                                     │   │
│   └─────────────────────────────────────────────────────────────────────┘   │
│                                      │                                      │
│                                      ▼                                      │
│   ┌─────────────────────────────────────────────────────────────────────┐   │
│   │                    IPredictionStrategy                              │   │
│   │                       (Interface)                                   │   │
│   │                                                                     │   │
│   │   calculate(history: SalesData[]): Prediction                       │   │
│   │   getConfidence(): number                                           │   │
│   │   getName(): string                                                 │   │
│   │                                                                     │   │
│   └─────────────────────────────────────────────────────────────────────┘   │
│           ▲                    ▲                    ▲                       │
│           │                    │                    │                       │
│   ┌───────┴───────┐   ┌───────┴───────┐   ┌───────┴───────┐                 │
│   │ MarkovChain   │   │ MovingAverage │   │ Exponential   │                 │
│   │ Strategy      │   │ Strategy      │   │ Smoothing     │                 │
│   │               │   │               │   │ Strategy      │                 │
│   │ - Build trans │   │ - Simple avg  │   │ - Weighted    │                 │
│   │   matrix      │   │ - Window size │   │   recent data │                 │
│   │ - State class │   │ - Trend detect│   │ - Alpha param │                 │
│   │ - Predict     │   │               │   │               │                 │
│   └───────────────┘   └───────────────┘   └───────────────┘                 │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

**Implementation:**

```typescript
// interfaces/IPredictionStrategy.ts
interface IPredictionStrategy {
  calculate(history: SalesData[]): Prediction;
  getConfidence(): number;
  getName(): string;
}

// strategies/MarkovChainStrategy.ts
class MarkovChainStrategy implements IPredictionStrategy {
  private transitionMatrix: Map<string, Map<string, number>>;
  private confidence: number = 0;

  calculate(history: SalesData[]): Prediction {
    const states = this.classifyStates(history);
    this.transitionMatrix = this.buildMatrix(states);
    const currentState = states[states.length - 1];
    const nextState = this.predictNextState(currentState);

    this.confidence = this.calculateConfidence();
    return this.stateToPrediction(nextState);
  }

  getName(): string {
    return "Markov Chain";
  }
}

// strategies/MovingAverageStrategy.ts
class MovingAverageStrategy implements IPredictionStrategy {
  constructor(private windowSize: number = 4) {}

  calculate(history: SalesData[]): Prediction {
    const recent = history.slice(-this.windowSize);
    const average =
      recent.reduce((sum, d) => sum + d.quantity, 0) / recent.length;
    // Apply trend adjustment
    return { quantity: Math.round(average * 1.1) };
  }

  getName(): string {
    return `Moving Average (${this.windowSize}-week)`;
  }
}

// services/PredictionService.ts
class PredictionService {
  private strategy: IPredictionStrategy;

  constructor(strategy?: IPredictionStrategy) {
    this.strategy = strategy ?? new MarkovChainStrategy();
  }

  setStrategy(strategy: IPredictionStrategy): void {
    this.strategy = strategy;
  }

  predict(history: SalesData[]): Prediction {
    return this.strategy.calculate(history);
  }

  // Compare multiple strategies
  compareStrategies(history: SalesData[]): StrategyComparison[] {
    const strategies = [
      new MarkovChainStrategy(),
      new MovingAverageStrategy(4),
      new ExponentialSmoothingStrategy(0.3),
    ];

    return strategies.map((s) => ({
      name: s.getName(),
      prediction: s.calculate(history),
      confidence: s.getConfidence(),
    }));
  }
}
```

**Benefits:**

- Research flexibility (compare algorithms)
- Runtime algorithm switching
- Easy to add new prediction methods

---

#### 4. Observer Pattern (State Management)

**Purpose:** Reactive UI updates when data changes.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                          OBSERVER PATTERN                                   │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│   ┌─────────────────────────────────────────────────────────────────────┐   │
│   │                         DataStore                                   │   │
│   │                        (Subject)                                    │   │
│   │                                                                     │   │
│   │   customers: Customer[]                                             │   │
│   │   transactions: Transaction[]                                       │   │
│   │   observers: Set<Observer>                                          │   │
│   │                                                                     │   │
│   │   subscribe(observer)     ◄── Components subscribe                  │   │
│   │   unsubscribe(observer)                                             │   │
│   │   notify(event)           ◄── Broadcast changes                     │   │
│   │                                                                     │   │
│   └─────────────────────────────────────────────────────────────────────┘   │
│                          │ notify()                                         │
│          ┌───────────────┼───────────────┬───────────────┐                  │
│          ▼               ▼               ▼               ▼                  │
│   ┌────────────┐  ┌────────────┐  ┌────────────┐  ┌────────────┐            │
│   │ HomeScreen │  │ Customer   │  │ TotalBaki  │  │ LowStock   │            │
│   │            │  │ ListScreen │  │ Widget     │  │ Alert      │            │
│   │ update()   │  │ update()   │  │ update()   │  │ update()   │            │
│   │ re-render  │  │ re-render  │  │ re-render  │  │ re-render  │            │
│   └────────────┘  └────────────┘  └────────────┘  └────────────┘            │
│                                                                             │
│   All observers automatically update when DataStore changes                 │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

**React Implementation (using hooks):**

```typescript
// stores/useCustomerStore.ts (using Zustand)
interface CustomerStore {
    customers: Customer[];
    totalBaki: number;

    // Actions
    addCustomer: (customer: Customer) => void;
    addBaki: (customerId: number, amount: number) => void;
    addPayment: (customerId: number, amount: number) => void;
}

const useCustomerStore = create<CustomerStore>((set, get) => ({
    customers: [],
    totalBaki: 0,

    addCustomer: (customer) => set((state) => ({
        customers: [...state.customers, customer]
    })),

    addBaki: (customerId, amount) => set((state) => {
        const updated = state.customers.map(c =>
            c.id === customerId
                ? { ...c, baki: c.baki + amount }
                : c
        );
        return {
            customers: updated,
            totalBaki: state.totalBaki + amount
        };
    }),

    addPayment: (customerId, amount) => set((state) => {
        // Similar logic, decrease baki
    })
}));

// Usage in component
function TotalBakiWidget() {
    // Auto-subscribes to totalBaki changes
    const totalBaki = useCustomerStore((state) => state.totalBaki);

    return (
        <View style={styles.widget}>
            <BengaliText>মোট বাকি: ৳{totalBaki}</BengaliText>
        </View>
    );
}
```

---

#### 5. Facade Pattern (Service Layer)

**Purpose:** Simplify complex subsystem interactions.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           FACADE PATTERN                                    │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│   ┌─────────────────────────────────────────────────────────────────────┐   │
│   │                         UI LAYER                                    │   │
│   │                                                                     │   │
│   │   HomeScreen       CustomerScreen       VoiceInputScreen            │   │
│   │        │                 │                    │                     │   │
│   │        └─────────────────┼────────────────────┘                     │   │
│   │                          │                                          │   │
│   │                          ▼                                          │   │
│   │              ┌───────────────────────┐                              │   │
│   │              │   TransactionFacade   │ ◄── Simple interface         │   │
│   │              │                       │                              │   │
│   │              │  addBaki(name, amount)│                              │   │
│   │              │  addPayment(name, amt)│                              │   │
│   │              │  getCustomerSummary() │                              │   │
│   │              │                       │                              │   │
│   │              └───────────┬───────────┘                              │   │
│   │                          │                                          │   │
│   └──────────────────────────┼──────────────────────────────────────────┘   │
│                              │                                              │
│   ┌──────────────────────────┼──────────────────────────────────────────┐  │
│   │                          ▼          COMPLEX SUBSYSTEM               │  │
│   │    ┌─────────────────────────────────────────────────────────────┐ │  │
│   │    │                                                             │ │  │
│   │    │  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐   │ │  │
│   │    │  │Customer  │  │Transaction│ │ Validator │  │ DataStore│   │ │  │
│   │    │  │Repository│  │Repository │ │ Service   │  │ (State)  │   │ │  │
│   │    │  └──────────┘  └──────────┘  └──────────┘  └──────────┘   │ │  │
│   │    │                                                             │ │  │
│   │    └─────────────────────────────────────────────────────────────┘ │  │
│   │                                                                     │  │
│   └─────────────────────────────────────────────────────────────────────┘  │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

**Implementation:**

```typescript
// facades/TransactionFacade.ts
class TransactionFacade {
  constructor(
    private customerRepo: ICustomerRepository,
    private transactionRepo: ITransactionRepository,
    private validator: ValidationService,
    private store: CustomerStore,
  ) {}

  /**
   * Simple method that hides complexity of:
   * 1. Finding or creating customer
   * 2. Validating amount
   * 3. Creating transaction
   * 4. Updating customer balance
   * 5. Notifying observers
   */
  async addBaki(customerName: string, amount: number): Promise<Result> {
    // 1. Validate
    if (!this.validator.isValidAmount(amount)) {
      return Result.error("অবৈধ পরিমাণ");
    }

    // 2. Find or create customer
    let customer = await this.customerRepo.findByName(customerName);
    if (!customer) {
      customer = await this.customerRepo.save({
        name: customerName,
        baki: 0,
      });
    }

    // 3. Create transaction
    const transaction = await this.transactionRepo.save({
      customerId: customer.id,
      type: "BAKI",
      amount: amount,
      date: new Date(),
    });

    // 4. Update customer balance
    customer.baki += amount;
    await this.customerRepo.save(customer);

    // 5. Update state (triggers observers)
    this.store.addBaki(customer.id, amount);

    return Result.success(transaction);
  }

  async addPayment(customerName: string, amount: number): Promise<Result> {
    // Similar simplified interface
  }
}
```

---

#### 6. Command Pattern (Voice/Touch Input)

**Purpose:** Encapsulate actions as objects for undo/redo and voice processing.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                          COMMAND PATTERN                                    │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│   VOICE INPUT: "করিম ৫০০ টাকা বাকি"                                       │
│                     │                                                       │
│                     ▼                                                       │
│   ┌─────────────────────────────────────────────────────────────────────┐  │
│   │                    VoiceCommandParser                               │  │
│   │                                                                     │  │
│   │   parse(voiceResult) ──────────────► ICommand                       │  │
│   │                                                                     │  │
│   └─────────────────────────────────────────────────────────────────────┘  │
│                     │                                                       │
│                     ▼                                                       │
│   ┌─────────────────────────────────────────────────────────────────────┐  │
│   │                       ICommand (Interface)                          │  │
│   │                                                                     │  │
│   │   execute(): Promise<Result>                                        │  │
│   │   undo(): Promise<Result>                                           │  │
│   │   describe(): string                                                │  │
│   │                                                                     │  │
│   └─────────────────────────────────────────────────────────────────────┘  │
│           ▲                ▲                ▲                ▲             │
│           │                │                │                │             │
│   ┌───────┴──────┐ ┌──────┴───────┐ ┌──────┴───────┐ ┌──────┴───────┐    │
│   │ AddBaki      │ │ AddPayment   │ │ AddSale      │ │ AddCustomer  │    │
│   │ Command      │ │ Command      │ │ Command      │ │ Command      │    │
│   │              │ │              │ │              │ │              │    │
│   │ customer: X  │ │ customer: X  │ │ product: X   │ │ name: X      │    │
│   │ amount: 500  │ │ amount: 300  │ │ qty: 10      │ │ phone: Y     │    │
│   │              │ │              │ │              │ │              │    │
│   │ execute()    │ │ execute()    │ │ execute()    │ │ execute()    │    │
│   │ undo()       │ │ undo()       │ │ undo()       │ │ undo()       │    │
│   └──────────────┘ └──────────────┘ └──────────────┘ └──────────────┘    │
│                                                                             │
│   ┌─────────────────────────────────────────────────────────────────────┐  │
│   │                       CommandHistory                                │  │
│   │                                                                     │  │
│   │   history: ICommand[]          ◄── Stack of executed commands       │  │
│   │   undoStack: ICommand[]        ◄── For redo functionality           │  │
│   │                                                                     │  │
│   │   execute(command)  ──────────► Run & push to history               │  │
│   │   undo()            ──────────► Pop & undo last command             │  │
│   │   redo()            ──────────► Re-execute undone command           │  │
│   │                                                                     │  │
│   └─────────────────────────────────────────────────────────────────────┘  │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

**Implementation:**

```typescript
// commands/ICommand.ts
interface ICommand {
  execute(): Promise<Result>;
  undo(): Promise<Result>;
  describe(): string; // For confirmation: "করিমের বাকি ৫০০ টাকা যোগ করুন?"
}

// commands/AddBakiCommand.ts
class AddBakiCommand implements ICommand {
  private createdTransactionId?: number;

  constructor(
    private facade: TransactionFacade,
    private customerName: string,
    private amount: number,
  ) {}

  async execute(): Promise<Result> {
    const result = await this.facade.addBaki(this.customerName, this.amount);
    if (result.success) {
      this.createdTransactionId = result.data.id;
    }
    return result;
  }

  async undo(): Promise<Result> {
    if (!this.createdTransactionId) {
      return Result.error("Cannot undo");
    }
    // Delete the transaction and reverse balance
    return this.facade.deleteTransaction(this.createdTransactionId);
  }

  describe(): string {
    return `${this.customerName} এর বাকি ৳${this.amount} যোগ করবেন?`;
  }
}

// services/VoiceCommandParser.ts
class VoiceCommandParser {
  parse(voiceResult: VoiceResult): ICommand {
    switch (voiceResult.intent) {
      case VoiceIntent.ADD_BAKI:
        return new AddBakiCommand(
          this.facade,
          voiceResult.customerName,
          voiceResult.amount,
        );
      case VoiceIntent.ADD_PAYMENT:
        return new AddPaymentCommand(
          this.facade,
          voiceResult.customerName,
          voiceResult.amount,
        );
      // ... other intents
    }
  }
}

// services/CommandHistory.ts
class CommandHistory {
  private history: ICommand[] = [];
  private undoStack: ICommand[] = [];

  async execute(command: ICommand): Promise<Result> {
    const result = await command.execute();
    if (result.success) {
      this.history.push(command);
      this.undoStack = []; // Clear redo stack
    }
    return result;
  }

  async undo(): Promise<Result> {
    const command = this.history.pop();
    if (!command) return Result.error("Nothing to undo");

    const result = await command.undo();
    if (result.success) {
      this.undoStack.push(command);
    }
    return result;
  }
}
```

**Benefits:**

- Undo/Redo support (critical for voice input mistakes)
- Voice command confirmation ("করিমের বাকি ৫০০ টাকা যোগ করুন?")
- Action history logging

---

#### 7. Factory Pattern (Service Creation)

**Purpose:** Create appropriate service instances based on configuration.

```typescript
// factories/PredictionStrategyFactory.ts
class PredictionStrategyFactory {
  static create(type: PredictionType): IPredictionStrategy {
    switch (type) {
      case PredictionType.MARKOV:
        return new MarkovChainStrategy();
      case PredictionType.MOVING_AVERAGE:
        return new MovingAverageStrategy(4);
      case PredictionType.EXPONENTIAL:
        return new ExponentialSmoothingStrategy(0.3);
      default:
        return new MarkovChainStrategy(); // Default
    }
  }
}

// factories/MLAdapterFactory.ts
class MLAdapterFactory {
  static createVoiceRecognizer(modelPath: string): IVoiceRecognizer {
    // Could return different adapters based on model format
    if (modelPath.endsWith(".tflite")) {
      return new TFLiteVoiceAdapter(modelPath);
    } else if (modelPath.endsWith(".onnx")) {
      return new ONNXVoiceAdapter(modelPath);
    }
    throw new Error("Unsupported model format");
  }
}
```

---

#### Design Pattern Summary by Layer

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    DESIGN PATTERNS BY ARCHITECTURE LAYER                    │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌───────────────────────────────────────────────────────────────────────┐ │
│  │ PRESENTATION LAYER                                                    │ │
│  │ ├── Composite Pattern ──────► Build complex UI from simple components │ │
│  │ ├── Observer Pattern ───────► React to state changes                  │ │
│  │ └── Command Pattern ────────► Voice/touch action encapsulation        │ │
│  └───────────────────────────────────────────────────────────────────────┘ │
│                                                                             │
│  ┌───────────────────────────────────────────────────────────────────────┐ │
│  │ APPLICATION LAYER                                                     │ │
│  │ ├── Facade Pattern ─────────► Simplify complex operations             │ │
│  │ ├── Strategy Pattern ───────► Swappable prediction algorithms         │ │
│  │ └── Factory Pattern ────────► Create service instances                │ │
│  └───────────────────────────────────────────────────────────────────────┘ │
│                                                                             │
│  ┌───────────────────────────────────────────────────────────────────────┐ │
│  │ DOMAIN LAYER                                                          │ │
│  │ ├── Repository Pattern ─────► Abstract data access                    │ │
│  │ └── Entity Pattern ─────────► Domain objects (Customer, Transaction)  │ │
│  └───────────────────────────────────────────────────────────────────────┘ │
│                                                                             │
│  ┌───────────────────────────────────────────────────────────────────────┐ │
│  │ INFRASTRUCTURE LAYER                                                  │ │
│  │ ├── Adapter Pattern ────────► Wrap TFLite, SQLite, Camera            │ │
│  │ ├── Singleton Pattern ──────► Database connection, ML models         │ │
│  │ └── Template Method ────────► OCR/Voice processing pipeline          │ │
│  └───────────────────────────────────────────────────────────────────────┘ │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

### Quality Assurance Plan

#### Testing Strategy (V-Model Aligned)

| Test Level              | Scope                        | Responsibility | Sprint   |
| ----------------------- | ---------------------------- | -------------- | -------- |
| **Unit Testing**        | Individual functions/modules | Developer      | Ongoing  |
| **Integration Testing** | Module interactions          | Both           | Weekly   |
| **System Testing**      | End-to-end functionality     | Both           | Week 7-8 |
| **Acceptance Testing**  | User requirements            | Both + Users   | Week 8   |
| **Performance Testing** | NFR validation               | Person A       | Week 7   |
| **Usability Testing**   | User experience              | Person B       | Week 8   |

#### Test Case Template

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           TEST CASE TEMPLATE                                │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  Test Case ID    : TC-XXX                                                  │
│  Requirement ID  : FR-XXX                                                  │
│  Title           : [Brief description]                                     │
│  Priority        : [High/Medium/Low]                                       │
│  Type            : [Unit/Integration/System/Acceptance]                    │
│                                                                             │
│  Preconditions   :                                                         │
│    1. [Condition 1]                                                        │
│    2. [Condition 2]                                                        │
│                                                                             │
│  Test Steps      :                                                         │
│    1. [Step 1]                                                             │
│    2. [Step 2]                                                             │
│    3. [Step 3]                                                             │
│                                                                             │
│  Expected Result :                                                         │
│    [What should happen]                                                    │
│                                                                             │
│  Actual Result   :                                                         │
│    [To be filled during execution]                                         │
│                                                                             │
│  Status          : [Pass/Fail/Blocked/Not Run]                            │
│  Tested By       : [Name]                                                  │
│  Date            : [DD/MM/YYYY]                                            │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

#### Key Test Cases

| TC ID      | Requirement | Test Description                          | Priority |
| ---------- | ----------- | ----------------------------------------- | -------- |
| TC-001     | FR-001      | Add new customer with valid name          | High     |
| TC-002     | FR-002      | Add baki transaction to existing customer | High     |
| TC-003     | FR-003      | Record payment reduces total baki         | High     |
| TC-006     | FR-006      | Voice command "বাকি" recognized correctly | High     |
| TC-007     | FR-007      | Voice intent classified correctly         | High     |
| TC-009     | FR-009      | Camera captures khata image               | High     |
| TC-010     | FR-010      | OCR extracts numbers from khata image     | High     |
| TC-014     | FR-014      | Markov prediction generates suggestions   | High     |
| TC-NFR-001 | NFR-001     | App functions with airplane mode on       | Critical |
| TC-NFR-002 | NFR-002     | APK size under 50 MB                      | Critical |
| TC-NFR-005 | NFR-005     | Voice response under 1 second             | High     |

---

### Configuration Management

#### Version Control Strategy

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         GIT BRANCHING STRATEGY                              │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  main ──────●─────────────────●─────────────────●─────────────────●──────  │
│             │                 │                 │                 │         │
│             │   v0.1.0        │   v0.2.0        │   v0.3.0        │ v1.0.0 │
│             │                 │                 │                 │         │
│  develop ───●──●──●──●──●──●──●──●──●──●──●──●──●──●──●──●──●──●──●──────  │
│                │     │           │     │           │     │                  │
│  feature/      │     │           │     │           │     │                  │
│  A/voice ──────●─────┘           │     │           │     │                  │
│                                  │     │           │     │                  │
│  feature/                        │     │           │     │                  │
│  B/customer-ui ──────────────────●─────┘           │     │                  │
│                                                    │     │                  │
│  feature/                                          │     │                  │
│  A/ocr ────────────────────────────────────────────●─────┘                  │
│                                                                             │
│  LEGEND:                                                                    │
│  ● = Commit                                                                 │
│  ─ = Branch history                                                         │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

#### Versioning Scheme (Semantic Versioning)

| Version | Format | Description                       |
| ------- | ------ | --------------------------------- |
| Major   | X.0.0  | Breaking changes, major features  |
| Minor   | 0.X.0  | New features, backward compatible |
| Patch   | 0.0.X  | Bug fixes, minor improvements     |

**Version History Plan:**

| Version | Sprint | Features                       |
| ------- | ------ | ------------------------------ |
| v0.1.0  | 1      | Database + Navigation skeleton |
| v0.2.0  | 2      | Customer + Baki (manual)       |
| v0.3.0  | 3      | Voice recognition              |
| v0.4.0  | 4      | Photo OCR                      |
| v0.5.0  | 5      | Sales + Inventory              |
| v0.6.0  | 6      | Prediction + Fine-tuned models |
| v0.7.0  | 7      | Reports + Polish               |
| v1.0.0  | 8      | Release candidate              |

#### Code Review Checklist

| Category          | Check Item                                  |
| ----------------- | ------------------------------------------- |
| **Functionality** | ☐ Code implements the requirement correctly |
|                   | ☐ Edge cases handled                        |
|                   | ☐ Error handling in place                   |
| **Code Quality**  | ☐ No code duplication                       |
|                   | ☐ Functions are single-purpose              |
|                   | ☐ Variable names are descriptive            |
| **Performance**   | ☐ No unnecessary re-renders (React)         |
|                   | ☐ Database queries optimized                |
|                   | ☐ Memory leaks prevented                    |
| **Security**      | ☐ User input validated                      |
|                   | ☐ No sensitive data logged                  |
| **Testing**       | ☐ Tests cover happy path                    |
|                   | ☐ Tests cover error cases                   |
| **Documentation** | ☐ Complex logic commented                   |
|                   | ☐ Public APIs documented                    |

---

### Documentation Standards

#### Required Documents

| Document                    | Owner | Format    | Sprint |
| --------------------------- | ----- | --------- | ------ |
| Project Workflow (this doc) | Both  | Markdown  | 1      |
| Requirements Specification  | Both  | Markdown  | 1      |
| System Architecture         | A     | Markdown  | 1      |
| Database Schema             | A     | SQL + MD  | 1      |
| API Documentation           | A     | Markdown  | 2+     |
| UI Component Library        | B     | Storybook | 2+     |
| Test Plan                   | Both  | Markdown  | 3      |
| Test Results                | Both  | Markdown  | 8      |
| User Guide (Bengali)        | B     | PDF       | 8      |
| Research Metrics Report     | Both  | Markdown  | 8      |

#### Code Documentation Standards

```typescript
/**
 * Adds a credit (baki) transaction for a customer.
 *
 * @description Records a new baki entry in the database and updates
 * the customer's total outstanding balance.
 *
 * @param customerId - The unique identifier of the customer
 * @param amount - The baki amount in Taka (must be positive)
 * @param note - Optional note for the transaction
 *
 * @returns Promise<Transaction> - The created transaction object
 *
 * @throws {Error} If customer not found
 * @throws {Error} If amount is not positive
 *
 * @example
 * // Add 500 Taka baki for customer ID 1
 * const transaction = await addBaki(1, 500, "Rice purchase");
 *
 * @since v0.2.0
 * @see {@link Customer}
 * @see {@link Transaction}
 */
async function addBaki(
  customerId: number,
  amount: number,
  note?: string,
): Promise<Transaction> {
  // Implementation
}
```

---

### Verification and Validation Plan

#### Verification (Are we building the product right?)

| Activity            | Method              | Deliverable           | Sprint  |
| ------------------- | ------------------- | --------------------- | ------- |
| Requirements Review | Peer review         | Approved SRS          | 1       |
| Design Review       | Walkthrough         | Approved architecture | 1       |
| Code Review         | Pull request review | Merged code           | Ongoing |
| Unit Testing        | Automated tests     | Test reports          | Ongoing |
| Static Analysis     | ESLint/TypeScript   | No errors             | Ongoing |

#### Validation (Are we building the right product?)

| Activity           | Method            | Deliverable       | Sprint  |
| ------------------ | ----------------- | ----------------- | ------- |
| Prototype Demo     | User walkthrough  | Feedback notes    | 2, 4, 6 |
| Usability Testing  | Task observation  | Usability report  | 8       |
| Acceptance Testing | User acceptance   | Sign-off          | 8       |
| Field Testing      | Real shop testing | Field test report | 8+      |

---

## Team Structure

### Person A: ML/Backend Developer

| Responsibility      | Details                                     |
| ------------------- | ------------------------------------------- |
| **Focus**           | Models, Training, Services, Data            |
| **Skills Required** | Python, PyTorch, TFLite, SQLite, TypeScript |
| **Owns**            | `/ml`, `/services`, `/training`, `/utils`   |

**Key Tasks:**

- SQLite database design and services
- Custom Bengali voice model training
- Custom khata OCR model training
- Markov chain prediction service
- Model optimization and quantization
- Data collection coordination

### Person B: UI/Frontend Developer

| Responsibility      | Details                                        |
| ------------------- | ---------------------------------------------- |
| **Focus**           | Screens, Components, Bengali UX, Design        |
| **Skills Required** | React Native, TypeScript, UI/UX, Bengali       |
| **Owns**            | `/app`, `/components`, `/assets`, `/constants` |

**Key Tasks:**

- Bengali UI theme and typography
- All app screens and navigation
- Voice and camera UI components
- User experience design
- Asset optimization
- User testing coordination

---

## Project Folder Structure

```
/Hisab
├── app/                          # Person B
│   ├── (tabs)/
│   │   ├── index.tsx             # হোম (Home)
│   │   ├── customers.tsx         # কাস্টমার (Customers)
│   │   ├── sales.tsx             # বিক্রি (Sales)
│   │   ├── inventory.tsx         # মালামাল (Inventory)
│   │   └── suggestions.tsx       # পরামর্শ (Suggestions)
│   ├── customer/
│   │   ├── [id].tsx              # Customer details
│   │   └── add.tsx               # Add customer
│   └── _layout.tsx
│
├── components/                   # Person B
│   ├── ui/
│   │   ├── Button.tsx
│   │   ├── Card.tsx
│   │   ├── Input.tsx
│   │   ├── VoiceButton.tsx       # Voice input button
│   │   └── CameraButton.tsx      # Photo capture button
│   ├── CustomerCard.tsx
│   ├── ProductCard.tsx
│   ├── BakiBar.tsx
│   └── DemandIndicator.tsx
│
├── services/                     # Person A
│   ├── database/
│   │   ├── schema.ts             # Table definitions
│   │   ├── migrations.ts         # DB versioning
│   │   └── index.ts              # DB connection
│   ├── customerService.ts        # Customer CRUD
│   ├── transactionService.ts     # Baki logic
│   ├── salesService.ts           # Sales logic
│   ├── inventoryService.ts       # Stock logic
│   ├── predictionService.ts      # Markov chain
│   └── reportService.ts          # Analytics
│
├── ml/                           # Person A
│   ├── voice/
│   │   ├── voiceEngine.ts        # TFLite voice wrapper
│   │   ├── intentParser.ts       # Parse voice commands
│   │   └── vocabulary.ts         # Retail word list
│   ├── ocr/
│   │   ├── ocrEngine.ts          # TFLite OCR wrapper
│   │   ├── imageProcessor.ts     # Image preprocessing
│   │   └── entityExtractor.ts    # Extract name, amount
│   └── models/
│       ├── voice-retail.tflite   # Voice model (~5 MB)
│       └── ocr-bengali.tflite    # OCR model (~8 MB)
│
├── training/                     # Person A (not in final app)
│   ├── voice/
│   │   ├── data/                 # Audio recordings
│   │   ├── scripts/              # Training scripts
│   │   └── notebooks/            # Jupyter notebooks
│   └── ocr/
│       ├── data/                 # Khata images
│       ├── scripts/              # Training scripts
│       └── notebooks/            # Jupyter notebooks
│
├── utils/                        # Person A
│   ├── bengaliNumber.ts          # ১২৩ ↔ 123 conversion
│   ├── dateUtils.ts              # Bengali dates
│   ├── currencyUtils.ts          # Taka formatting
│   └── textNormalizer.ts         # Text processing
│
├── hooks/                        # Shared
│   ├── useVoice.ts               # Voice recognition hook
│   ├── useCamera.ts              # Camera + OCR hook
│   ├── useCustomers.ts           # Customer data hook
│   ├── useSales.ts               # Sales data hook
│   └── usePrediction.ts          # Prediction hook
│
├── constants/                    # Person B
│   ├── theme.ts                  # Colors, fonts, spacing
│   ├── bengali.ts                # All UI strings in Bengali
│   └── voiceCommands.ts          # Voice command patterns
│
├── assets/                       # Person B
│   ├── fonts/
│   │   └── NotoSansBengali-subset.ttf
│   ├── icons/
│   └── sounds/
│       ├── beep.mp3
│       └── success.mp3
│
├── types/                        # Shared
│   └── index.ts                  # TypeScript interfaces
│
└── docs/                         # Shared
    ├── HISAB_Project_Workflow.md
    └── ...
```

---

## 8-Week Sprint Plan

### Week 1: Foundation & Setup

#### Person A Tasks

| Day | Task                                       | Deliverable            |
| --- | ------------------------------------------ | ---------------------- |
| Mon | Set up training environment (Google Colab) | Working PyTorch setup  |
| Tue | Design voice data collection script        | 500 sentence templates |
| Wed | Design OCR synthetic data generator        | Python script ready    |
| Thu | Generate 1000 synthetic khata images       | Training data ready    |
| Fri | Set up SQLite schema + base services       | Database working       |

#### Person B Tasks

| Day | Task                              | Deliverable               |
| --- | --------------------------------- | ------------------------- |
| Mon | Set up React Native bare workflow | App compiles and runs     |
| Tue | Bengali font setup (subset fonts) | Fonts rendering correctly |
| Wed | Create theme + base UI components | Button, Card, Input ready |
| Thu | Set up navigation structure       | All screens navigate      |
| Fri | Build home screen layout          | Home screen visible       |

#### Week 1 Deliverables

- [ ] App runs on Android device
- [ ] Database schema created
- [ ] Bengali fonts working
- [ ] 1000 synthetic khata images generated
- [ ] Voice recording templates ready
- [ ] Shared TypeScript interfaces defined

---

### Week 2: Core App + Data Collection

#### Person A Tasks

| Day | Task                                   | Deliverable               |
| --- | -------------------------------------- | ------------------------- |
| Mon | Build customerService (CRUD)           | Add/edit/delete customers |
| Tue | Build transactionService (baki logic)  | Baki calculations work    |
| Wed | Record voice data (self, 1-2 hours)    | Audio files collected     |
| Thu | Record voice data (friends, 1-2 hours) | More audio files          |
| Fri | Process recordings into dataset        | Training dataset v1       |

#### Person B Tasks

| Day | Task                         | Deliverable         |
| --- | ---------------------------- | ------------------- |
| Mon | Build customer list screen   | Shows all customers |
| Tue | Build add customer form      | Can add customers   |
| Wed | Build customer detail screen | Shows baki history  |
| Thu | Build baki input modal       | Can add baki amount |
| Fri | Build payment recording flow | Can record payments |

#### Week 2 Deliverables

- [ ] Full baki flow working (manual input)
- [ ] 3-4 hours voice recordings collected
- [ ] Voice dataset prepared for training
- [ ] Customer CRUD complete
- [ ] Transaction history visible

---

### Week 3: Voice Recognition

#### Person A Tasks

| Day | Task                                        | Deliverable         |
| --- | ------------------------------------------- | ------------------- |
| Mon | Preprocess audio (normalize, trim, augment) | Clean dataset       |
| Tue | Train tiny intent classifier (5 intents)    | First model working |
| Wed | Add Bengali number recognition              | Numbers detected    |
| Thu | Train combined voice model                  | Voice model v1      |
| Fri | Export to TFLite, test on device            | model.tflite (~5MB) |

#### Person B Tasks

| Day | Task                                 | Deliverable            |
| --- | ------------------------------------ | ---------------------- |
| Mon | Build VoiceButton component          | Mic button UI          |
| Tue | Build listening state UI (animation) | Visual feedback        |
| Wed | Build processing state UI            | Loading indicator      |
| Thu | Build result confirmation dialog     | User confirms action   |
| Fri | Build error handling UI              | Retry, manual fallback |

#### Voice Commands to Support

```
"করিম পাঁচশ টাকা বাকি"     → Add ৳500 baki for Korim
"রহিম তিনশ টাকা দিছে"      → Payment ৳300 from Rahim
"করিমের কত বাকি"           → Query Korim's baki
"আজকে কত বিক্রি হইছে"      → Today's total sales
"ফ্রুটি দশটা বিক্রি"         → Sold 10 Frooti
```

#### Week 3 Deliverables

- [ ] Voice model v1 trained (~5 MB)
- [ ] Voice UI complete with all states
- [ ] Integration: Tap mic → Speak → Shows result
- [ ] Test working on physical device

---

### Week 4: Photo OCR (Khata Recognition)

#### Person A Tasks

| Day | Task                                 | Deliverable        |
| --- | ------------------------------------ | ------------------ |
| Mon | Preprocess synthetic khata images    | Clean dataset      |
| Tue | Train Bengali digit recognizer (CNN) | Number OCR working |
| Wed | Train line detector model            | Find text rows     |
| Thu | Build complete OCR pipeline          | End-to-end working |
| Fri | Export to TFLite, optimize size      | ocr.tflite (~8MB)  |

#### Person B Tasks

| Day | Task                             | Deliverable           |
| --- | -------------------------------- | --------------------- |
| Mon | Build CameraButton component     | Camera button UI      |
| Tue | Build camera capture screen      | Take photo works      |
| Wed | Build image crop/adjust UI       | User can adjust       |
| Thu | Build OCR results preview screen | Show extracted data   |
| Fri | Build edit/confirm UI            | User can fix mistakes |

#### OCR Flow

```
1. User takes photo of khata page
2. Image preprocessing (deskew, enhance)
3. Line detection (find each entry)
4. Number recognition (extract amounts)
5. Name matching (match to customer list)
6. User confirms/edits results
7. Save to database
```

#### Week 4 Deliverables

- [ ] OCR model v1 trained (~8 MB)
- [ ] Camera UI complete
- [ ] Photo → Extracted entries → Database
- [ ] Works offline on device
- [ ] Total model size: ~13 MB

---

### Week 5: Sales, Inventory + Real Data

#### Person A Tasks

| Day | Task                                   | Deliverable              |
| --- | -------------------------------------- | ------------------------ |
| Mon | Build salesService + voice integration | Voice adds sales         |
| Tue | Build inventoryService                 | Stock tracking works     |
| Wed | Visit 2-3 shops, collect real data     | Voice + photos collected |
| Thu | Visit 2-3 more shops                   | More real data           |
| Fri | Process collected data into dataset    | Real dataset ready       |

#### Person B Tasks

| Day | Task                        | Deliverable           |
| --- | --------------------------- | --------------------- |
| Mon | Build sales entry screen    | Record sales manually |
| Tue | Add voice to sales screen   | Voice sales entry     |
| Wed | Build inventory list screen | Show all products     |
| Thu | Build add/edit product form | Manage inventory      |
| Fri | Build low stock alerts UI   | Warning indicators    |

#### Shop Visit Protocol

```
At each shop (30-45 minutes):
1. Explain research (get written consent)
2. Record them speaking commands (15-20 min)
3. Photograph 5-10 khata pages
4. Note environment (noise level, lighting)
5. Ask about their current workflow
6. Collect feedback on app concept

Target: 5-10 shops = 5-10 hours audio + 50-100 khata pages
```

#### Week 5 Deliverables

- [ ] Sales + Inventory features working
- [ ] Real data from 5-10 shops collected
- [ ] Voice and manual input both working
- [ ] Low stock warnings displayed

---

### Week 6: Fine-tune Models + Prediction

#### Person A Tasks

| Day | Task                                        | Deliverable        |
| --- | ------------------------------------------- | ------------------ |
| Mon | Fine-tune voice model with real data        | Voice model v2     |
| Tue | Fine-tune OCR with real khata photos        | OCR model v2       |
| Wed | Measure accuracy, optimize models           | Improved accuracy  |
| Thu | Integrate Markov prediction with real sales | Prediction working |
| Fri | Build trust score + context factors         | Intelligence layer |

#### Person B Tasks

| Day | Task                               | Deliverable               |
| --- | ---------------------------------- | ------------------------- |
| Mon | Build suggestions screen (পরামর্শ) | Show predictions          |
| Tue | Build demand bar visualization     | Color-coded bars          |
| Wed | Build action text UI               | "বেশি কিনুন" / "কম কিনুন" |
| Thu | Build customer trust stars display | ⭐⭐⭐⭐⭐                |
| Fri | Build festival awareness hints     | Eid/Ramadan notices       |

#### Model Improvement Targets

```
Voice Model:
├── v1 (synthetic data): ~75% accuracy
└── v2 (real data): ~92% accuracy ✅

OCR Model:
├── v1 (synthetic data): ~85% number accuracy
└── v2 (real data): ~97% number accuracy ✅
```

#### Week 6 Deliverables

- [ ] Voice model v2: 90%+ accuracy
- [ ] OCR model v2: 95%+ number accuracy
- [ ] Prediction suggestions visible
- [ ] Trust scores displayed
- [ ] Context-aware predictions

---

### Week 7: Reports, Polish, Optimize

#### Person A Tasks

| Day | Task                               | Deliverable         |
| --- | ---------------------------------- | ------------------- |
| Mon | Build reportService (daily/weekly) | Reports data ready  |
| Tue | Quantize models to INT8            | Smaller model files |
| Wed | Optimize memory usage              | RAM usage reduced   |
| Thu | Profile and optimize battery usage | Efficient power use |
| Fri | Final model integration            | Production-ready ML |

#### Person B Tasks

| Day | Task                               | Deliverable           |
| --- | ---------------------------------- | --------------------- |
| Mon | Build reports screen               | Daily/weekly views    |
| Tue | Build receipt generation           | Image/PDF receipt     |
| Wed | Build WhatsApp share feature       | Send receipts         |
| Thu | Add loading states, error handling | Polished UX           |
| Fri | Build onboarding screens           | First-time user guide |

#### Optimization Targets

```
Before Optimization → After Optimization:
├── Voice model: 5 MB → 3 MB
├── OCR model: 8 MB → 5 MB
├── Total app size: 60 MB → 45 MB
├── RAM usage: 200 MB → 120 MB
├── Cold start: 5 sec → 2.5 sec
└── Voice latency: 1.5 sec → 0.8 sec
```

#### Week 7 Deliverables

- [ ] App size: <50 MB
- [ ] All features complete
- [ ] Polished, consistent UI
- [ ] Fast and memory-efficient
- [ ] Receipts and reports working

---

### Week 8: Testing, Documentation, Research Prep

#### Person A Tasks

| Day | Task                              | Deliverable           |
| --- | --------------------------------- | --------------------- |
| Mon | Write unit tests for all services | Test coverage         |
| Tue | Measure final ML accuracy         | Research metrics      |
| Wed | Test edge cases, fix bugs         | Stable services       |
| Thu | Write system documentation        | Architecture doc      |
| Fri | Set up research metrics logging   | Data collection ready |

#### Person B Tasks

| Day | Task                                | Deliverable            |
| --- | ----------------------------------- | ---------------------- |
| Mon | Full user flow testing              | All features work      |
| Tue | Test on 3+ phone models             | Device compatibility   |
| Wed | Fix UI bugs                         | Stable UI              |
| Thu | Create user guide (Bengali PDF)     | For shopkeepers        |
| Fri | Take screenshots, record demo video | For paper/presentation |

#### Research Metrics to Document

```
Voice Recognition:
├── Accuracy: 92% (on retail commands)
├── Model size: 3 MB
├── Inference latency: 0.8 sec
├── Works offline: Yes
└── Tested devices: 5+

OCR:
├── Number accuracy: 97%
├── Name matching accuracy: 89%
├── Model size: 5 MB
├── Processing time: 1.2 sec
└── Works offline: Yes

App Performance:
├── Total app size: 45 MB
├── RAM usage: 120 MB peak
├── Battery consumption: 5% per hour (active use)
├── Cold start time: 2.5 sec
└── Minimum Android version: 8.0
```

#### Week 8 Final Deliverables

- [ ] Complete app: <50 MB, fully offline
- [ ] Voice model: 92%+ accuracy, 3 MB
- [ ] OCR model: 97%+ accuracy, 5 MB
- [ ] All documentation complete
- [ ] Ready for user study
- [ ] Research metrics collected

---

## Technical Specifications

### Database Schema (SQLite)

```sql
-- Customers table
CREATE TABLE customers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    phone TEXT,
    nickname TEXT,
    total_baki REAL DEFAULT 0,
    trust_score INTEGER DEFAULT 3,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Transactions table (baki and payments)
CREATE TABLE transactions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    customer_id INTEGER NOT NULL,
    type TEXT NOT NULL, -- 'credit' or 'payment'
    amount REAL NOT NULL,
    note TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (customer_id) REFERENCES customers(id)
);

-- Products table
CREATE TABLE products (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    price REAL NOT NULL,
    cost_price REAL,
    stock INTEGER DEFAULT 0,
    low_stock_threshold INTEGER DEFAULT 10,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Sales table
CREATE TABLE sales (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    customer_id INTEGER, -- NULL for cash sales
    total REAL NOT NULL,
    is_baki BOOLEAN DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (customer_id) REFERENCES customers(id)
);

-- Sale items table
CREATE TABLE sale_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    sale_id INTEGER NOT NULL,
    product_id INTEGER NOT NULL,
    quantity INTEGER NOT NULL,
    price REAL NOT NULL,
    FOREIGN KEY (sale_id) REFERENCES sales(id),
    FOREIGN KEY (product_id) REFERENCES products(id)
);

-- Weekly sales summary (for Markov prediction)
CREATE TABLE weekly_sales (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    product_id INTEGER NOT NULL,
    week_start DATE NOT NULL,
    units_sold INTEGER NOT NULL,
    state TEXT, -- 'LOW', 'MEDIUM', 'HIGH'
    FOREIGN KEY (product_id) REFERENCES products(id)
);
```

### TypeScript Interfaces

```typescript
// types/index.ts

// ===== Voice Recognition =====
export type VoiceIntent = "add_baki" | "payment" | "query" | "sale" | "other";

export interface VoiceResult {
  success: boolean;
  intent: VoiceIntent;
  confidence: number;
  entities: {
    customerName?: string;
    amount?: number;
    productName?: string;
    quantity?: number;
  };
  rawText: string;
}

export interface UseVoice {
  isListening: boolean;
  isProcessing: boolean;
  error: string | null;
  start: () => Promise<void>;
  stop: () => Promise<VoiceResult>;
  cancel: () => void;
}

// ===== OCR =====
export interface OCREntry {
  name: string;
  nameConfidence: number;
  amount: number;
  amountConfidence: number;
  boundingBox?: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
}

export interface OCRResult {
  success: boolean;
  entries: OCREntry[];
  imageUri: string;
  processingTime: number;
}

export interface UseCamera {
  capture: () => Promise<string>;
  process: (uri: string) => Promise<OCRResult>;
  isProcessing: boolean;
  error: string | null;
}

// ===== Data Models =====
export interface Customer {
  id: number;
  name: string;
  phone?: string;
  nickname?: string;
  totalBaki: number;
  trustScore: number; // 1-5
  createdAt: Date;
  updatedAt: Date;
}

export interface Transaction {
  id: number;
  customerId: number;
  type: "credit" | "payment";
  amount: number;
  note?: string;
  createdAt: Date;
}

export interface Product {
  id: number;
  name: string;
  price: number;
  costPrice?: number;
  stock: number;
  lowStockThreshold: number;
  demandState?: "LOW" | "MEDIUM" | "HIGH";
  createdAt: Date;
  updatedAt: Date;
}

export interface Sale {
  id: number;
  customerId?: number;
  total: number;
  isBaki: boolean;
  items: SaleItem[];
  createdAt: Date;
}

export interface SaleItem {
  id: number;
  saleId: number;
  productId: number;
  productName?: string;
  quantity: number;
  price: number;
}

// ===== Prediction =====
export interface Prediction {
  productId: number;
  productName: string;
  currentState: "LOW" | "MEDIUM" | "HIGH";
  predictedState: "LOW" | "MEDIUM" | "HIGH";
  confidence: number;
  recommendedQty: number;
  action: "বেশি কিনুন" | "ঠিক আছে" | "কম কিনুন";
}

export interface PredictionSummary {
  products: Prediction[];
  totalRecommendedPurchase: number;
  highDemandProducts: string[];
  lowDemandProducts: string[];
}

// ===== Reports =====
export interface DailySummary {
  date: Date;
  totalSales: number;
  totalBakiGiven: number;
  totalPaymentsReceived: number;
  transactionCount: number;
}

export interface CustomerBehavior {
  customerId: number;
  customerName: string;
  totalPurchases: number;
  totalBaki: number;
  avgPaymentDays: number;
  trustScore: number;
}
```

---

## Voice Model Architecture

### Model Design (Lightweight)

```
Input: Audio (16kHz, mono)
       ↓
Mel Spectrogram (80 features)
       ↓
┌─────────────────────────────┐
│ CNN Encoder (3 layers)      │
│ - Conv1d(80, 128, 3)        │
│ - Conv1d(128, 64, 3)        │
│ - Conv1d(64, 32, 3)         │
│ Total: ~2 MB                │
└─────────────────────────────┘
       ↓
┌─────────────────────────────┐
│ Intent Classifier           │
│ - Linear(32, 5)             │
│ Outputs: add_baki, payment, │
│          query, sale, other │
│ Total: ~0.5 MB              │
└─────────────────────────────┘
       ↓
┌─────────────────────────────┐
│ Number Extractor            │
│ - Attention + CTC           │
│ Outputs: Detected numbers   │
│ Total: ~1.5 MB              │
└─────────────────────────────┘
       ↓
┌─────────────────────────────┐
│ Name Matcher                │
│ - Fuzzy match to DB         │
│ No ML needed                │
└─────────────────────────────┘
       ↓
Output: { intent, entities }

Total Model Size: ~4-5 MB
```

### Training Data Requirements

| Data Type        | Minimum | Target   |
| ---------------- | ------- | -------- |
| Audio hours      | 5 hours | 15 hours |
| Unique sentences | 500     | 2000     |
| Speakers         | 5       | 20       |
| Noise conditions | 2       | 5        |

### Voice Command Patterns

```
# Baki Commands
"{name} {amount} টাকা বাকি"
"{name}কে {amount} টাকা দিলাম"
"{name}এর বাকি {amount}"

# Payment Commands
"{name} {amount} টাকা দিছে"
"{name} {amount} টাকা শোধ করছে"
"{name} থেকে {amount} পাইছি"

# Query Commands
"{name}এর কত বাকি"
"{name}এর হিসাব"
"মোট বাকি কত"
"আজকে কত বিক্রি"

# Sales Commands
"{product} {quantity}টা বিক্রি"
"{quantity}টা {product} বেচলাম"
"{product} বিক্রি {quantity}"
```

---

## OCR Model Architecture

### Two-Stage Pipeline

```
Stage 1: Line Detection
┌─────────────────────────────┐
│ Input: Khata page image     │
│        (grayscale, 800px)   │
└─────────────────────────────┘
       ↓
┌─────────────────────────────┐
│ Preprocessing               │
│ - Binarization              │
│ - Deskew                    │
│ - Noise removal             │
└─────────────────────────────┘
       ↓
┌─────────────────────────────┐
│ Line Detector CNN           │
│ - Find horizontal text rows │
│ - Output: List of line BBs  │
│ Size: ~2 MB                 │
└─────────────────────────────┘

Stage 2: Recognition (per line)
┌─────────────────────────────┐
│ Number Region Detector      │
│ - Find digit sequences      │
│ Size: ~1 MB                 │
└─────────────────────────────┘
       ↓
┌─────────────────────────────┐
│ Bengali Digit Recognizer    │
│ - CNN classifier            │
│ - 10 digits + blank         │
│ - 98%+ accuracy target      │
│ Size: ~3 MB                 │
└─────────────────────────────┘
       ↓
┌─────────────────────────────┐
│ Name Matcher                │
│ - Extract text region       │
│ - Fuzzy match to customers  │
│ - Levenshtein distance      │
│ No ML, uses customer DB     │
└─────────────────────────────┘
       ↓
Output: [{ name, amount, confidence }]

Total OCR Size: ~6-8 MB
```

### Synthetic Data Generation

```python
# generate_synthetic_khata.py

import random
from PIL import Image, ImageDraw, ImageFont

NAMES = ["রহিম", "করিম", "জামাল", "সালাম", "মতিন", ...]
AMOUNTS = range(50, 10000, 50)

def generate_entry():
    name = random.choice(NAMES)
    amount = random.choice(AMOUNTS)
    return f"{name} - {amount}"

def generate_khata_page(num_entries=5):
    img = Image.new('RGB', (400, 600), 'white')
    draw = ImageDraw.Draw(img)
    font = ImageFont.truetype('handwriting.ttf', 24)

    for i in range(num_entries):
        entry = generate_entry()
        y = 50 + i * 50
        draw.text((20, y), entry, font=font, fill='black')

    # Augmentations
    img = add_noise(img)
    img = random_rotation(img, max_angle=5)
    img = random_blur(img)

    return img

# Generate 1000 images
for i in range(1000):
    img = generate_khata_page()
    img.save(f'synthetic_data/khata_{i:04d}.png')
```

---

## Markov Chain Prediction

### State Classification

```
Sales Volume → State:
├── < 20 units/week  → LOW
├── 20-49 units/week → MEDIUM
└── ≥ 50 units/week  → HIGH
```

### Transition Matrix Building

```javascript
// From 4 weeks of sales history
const weeklySales = [35, 42, 55, 48];
const states = weeklySales.map(salesToState);
// → ['MEDIUM', 'MEDIUM', 'HIGH', 'MEDIUM']

// Count transitions
// MEDIUM → MEDIUM: 1
// MEDIUM → HIGH: 1
// HIGH → MEDIUM: 1

// Build probability matrix
const matrix = {
  LOW: { LOW: 0.33, MEDIUM: 0.33, HIGH: 0.33 },
  MEDIUM: { LOW: 0, MEDIUM: 0.5, HIGH: 0.5 },
  HIGH: { LOW: 0, MEDIUM: 1.0, HIGH: 0 },
};
```

### Context Factors (Bangladesh-Specific)

```javascript
const contextMultipliers = {
  // Islamic calendar
  ramadan: 1.4, // +40% food items
  eidUlFitr: 2.0, // +100% before Eid
  eidUlAdha: 1.5, // +50%

  // Local events
  pahelaBaishakh: 1.3, // +30%
  hatbar: 1.25, // Market day

  // Economic
  monthStart: 1.2, // Salary time
  harvestSeason: 1.3, // Farmers have money

  // Weather
  summer: 1.3, // +30% drinks
  rainy: 0.8, // -20% footfall
};
```

---

## Area-Based Trending Suggestions

### Concept

Shopkeepers can see what products are trending in nearby shops, helping them stock popular items they might be missing.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        AREA TRENDS FEATURE                                  │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│   ┌─────────────┐     Optional Sync      ┌─────────────────────────┐       │
│   │   Shop A    │─────(WiFi only)───────►│                         │       │
│   │  (You)      │                        │    Aggregation Server   │       │
│   └─────────────┘                        │    (Firebase/Supabase)  │       │
│                                          │                         │       │
│   ┌─────────────┐                        │  • Anonymized data      │       │
│   │   Shop B    │───────────────────────►│  • Area clustering      │       │
│   │  (Nearby)   │                        │  • Trend calculation    │       │
│   └─────────────┘                        │                         │       │
│                                          └────────────┬────────────┘       │
│   ┌─────────────┐                                     │                    │
│   │   Shop C    │───────────────────────►             │                    │
│   │  (Nearby)   │                                     │                    │
│   └─────────────┘                                     ▼                    │
│                                          ┌─────────────────────────┐       │
│                                          │    Trending Products    │       │
│                                          │    in Your Area         │       │
│                                          │    ─────────────────     │       │
│                                          │    1. 🔥 Mango Juice     │       │
│                                          │    2. 📈 Energy Drink    │       │
│                                          │    3. ⬆️  Chips (Lays)   │       │
│                                          └─────────────────────────┘       │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### How It Works

| Step | Action                                  | Privacy                     |
| ---- | --------------------------------------- | --------------------------- |
| 1    | Shop records sales locally              | All data stays on device    |
| 2    | User enables "Area Trends" (opt-in)     | Explicit consent required   |
| 3    | App syncs anonymized product counts     | No customer/price data sent |
| 4    | Server aggregates by area (GPS cluster) | Only product + quantity     |
| 5    | App receives trending products list     | "What's hot nearby"         |

### Data Sent (Anonymized)

```javascript
// What IS sent (anonymized)
{
    area_hash: "dhaka_mirpur_12",  // Approximate location
    period: "2026-W05",           // Week number
    products: [
        { name: "Mango Juice", category: "drinks", qty: 45 },
        { name: "Lays Chips", category: "snacks", qty: 32 }
    ]
}

// What is NOT sent
// ❌ Customer names
// ❌ Prices
// ❌ Exact location
// ❌ Shop name
// ❌ Transaction details
```

### Trend Calculation

```javascript
// Server-side aggregation
function calculateTrends(areaShops) {
  const productCounts = {};

  // Aggregate all shops in area
  for (const shop of areaShops) {
    for (const product of shop.products) {
      productCounts[product.name] =
        (productCounts[product.name] || 0) + product.qty;
    }
  }

  // Calculate week-over-week growth
  const trends = Object.entries(productCounts)
    .map(([name, qty]) => ({
      name,
      qty,
      growth: calculateGrowth(name, qty, lastWeek),
    }))
    .sort((a, b) => b.growth - a.growth)
    .slice(0, 10); // Top 10 trending

  return trends;
}
```

### Offline Fallback

If user doesn't enable sync or has no internet:

- Use **local prediction only** (Markov chain)
- Show "Trending" based on own sales growth
- Feature degrades gracefully

### Privacy-First Design

| Principle       | Implementation                             |
| --------------- | ------------------------------------------ |
| **Opt-in Only** | Feature disabled by default                |
| **Anonymized**  | No identifying info sent                   |
| **Aggregated**  | Minimum 5 shops required per area          |
| **Local First** | All core features work offline             |
| **Transparent** | User can see exactly what data is shared   |
| **Deletable**   | User can delete their contribution anytime |

---

## Git Workflow

### Branch Structure

```
main (stable releases only)
  │
  └── develop (integration branch)
        │
        ├── feature/A/week1-database
        ├── feature/A/week2-services
        ├── feature/A/week3-voice-model
        ├── feature/A/week4-ocr-model
        ├── feature/A/week6-optimization
        │
        ├── feature/B/week1-navigation
        ├── feature/B/week2-customer-ui
        ├── feature/B/week3-voice-ui
        ├── feature/B/week4-camera-ui
        ├── feature/B/week6-prediction-ui
        └── feature/B/week7-polish
```

### Commit Convention

```
feat: Add customer list screen
fix: Fix baki calculation error
docs: Update README
style: Format code
refactor: Restructure services
test: Add unit tests for customerService
chore: Update dependencies
```

### Weekly Integration Routine (Friday)

```
1. Person A creates PR: feature/A/weekN → develop
2. Person B creates PR: feature/B/weekN → develop
3. Cross-review PRs
4. Merge to develop
5. Test together on physical device
6. Fix any integration issues
7. Tag release: v0.1.0, v0.2.0, etc.
8. Merge develop → main (if stable)
```

---

## Weekly Meeting Schedule

### Monday: Weekly Planning (30 min)

```
Agenda:
1. Review last week's progress (5 min)
2. Discuss blockers (5 min)
3. Plan this week's tasks (15 min)
4. Assign tasks to each person (5 min)

Output: Week's tasks in GitHub Issues
```

### Wednesday: Quick Sync (15 min)

```
Agenda:
1. Progress update (5 min each)
2. Any blockers? (5 min)
3. Adjust plan if needed

Format: Can be async (GitHub Issues)
```

### Friday: Integration & Demo (1-2 hours)

```
Agenda:
1. Merge branches (15 min)
2. Test on device together (30 min)
3. Fix integration issues (30 min)
4. Demo week's progress (15 min)
5. Review: What went well/badly (15 min)

Output: Working build, tagged release
```

---

## Tools & Infrastructure

### Development Tools

| Purpose         | Tool               |
| --------------- | ------------------ |
| IDE             | VS Code            |
| Mobile Dev      | React Native CLI   |
| Version Control | Git + GitHub       |
| Task Tracking   | GitHub Issues      |
| Communication   | GitHub Discussions |
| Documentation   | Markdown (in repo) |

### ML Training Tools

| Purpose              | Tool                     |
| -------------------- | ------------------------ |
| Training Environment | Local / Free GPU (Colab) |
| ML Framework         | PyTorch + torchaudio     |
| Model Export         | ONNX → TensorFlow Lite   |
| Audio Processing     | librosa, torchaudio      |
| Image Processing     | OpenCV, Pillow           |

### Testing Devices

| Device          | Price  | RAM   | Priority           |
| --------------- | ------ | ----- | ------------------ |
| Symphony B68    | ৳2,500 | 512MB | Must test          |
| Walton Primo F9 | ৳4,000 | 1GB   | Primary target     |
| Xiaomi Redmi 9A | ৳8,000 | 2GB   | Should work easily |

---

## Risk Management

| Risk                     | Probability | Impact | Mitigation                               |
| ------------------------ | ----------- | ------ | ---------------------------------------- |
| Voice model too large    | Medium      | High   | Use smaller architecture, quantize       |
| Voice accuracy too low   | Medium      | High   | Domain-specific vocabulary, more data    |
| OCR accuracy too low     | Medium      | Medium | Focus on numbers only, fuzzy name match  |
| Low-end phone crashes    | High        | High   | Test early, optimize memory usage        |
| Not enough training data | Medium      | High   | Heavy augmentation, synthetic data       |
| Integration issues       | Medium      | Medium | Clear interfaces, weekly integration     |
| Scope creep              | High        | Medium | Strict weekly goals, defer nice-to-haves |
| Team member unavailable  | Low         | High   | Knowledge sharing, documentation         |

---

## Research Outputs

### Potential Publications

| Paper Title                                                     | Target Venue       | Focus               |
| --------------------------------------------------------------- | ------------------ | ------------------- |
| "HISAB: Offline Retail Management for Low-Literate Shopkeepers" | CHI, ICTD, COMPASS | System + User Study |
| "Lightweight Bengali ASR for Domain-Specific Voice Commands"    | INTERSPEECH, ACL   | Voice Model         |
| "Khata-to-Digital: OCR for Handwritten Bengali Ledgers"         | ICDAR, Document AI | OCR Model           |
| "Edge AI for Ultra-Low-Resource Mobile Devices"                 | MobiSys, MobiCom   | Optimization        |

### Datasets to Release

| Dataset       | Size         | Contents                                 |
| ------------- | ------------ | ---------------------------------------- |
| BDRetailVoice | 10+ hours    | Bengali retail voice commands            |
| BDKhata       | 1000+ images | Handwritten khata pages with annotations |

### Research Metrics to Collect

```
Voice Recognition:
- Word Error Rate (WER)
- Intent Classification Accuracy
- Number Recognition Accuracy
- Latency (ms)
- Model Size (MB)

OCR:
- Character Error Rate (CER)
- Number Recognition Accuracy
- Name Matching Accuracy
- Processing Time (ms)
- Model Size (MB)

User Study:
- Task Completion Rate
- Task Completion Time
- Error Rate
- System Usability Scale (SUS)
- User Satisfaction (Likert)

App Performance:
- App Size (MB)
- RAM Usage (MB)
- Battery Consumption (%/hour)
- Cold Start Time (s)
```

---

## Final Deliverables Summary

### Week 8 Outputs

| Deliverable                      | Owner | Status |
| -------------------------------- | ----- | ------ |
| Complete app APK (<50 MB)        | Both  | [ ]    |
| Voice model (3 MB, 92% accuracy) | A     | [ ]    |
| OCR model (5 MB, 97% accuracy)   | A     | [ ]    |
| System documentation             | A     | [ ]    |
| User guide (Bengali)             | B     | [ ]    |
| Demo video                       | B     | [ ]    |
| Research metrics report          | Both  | [ ]    |
| BDRetailVoice dataset            | A     | [ ]    |
| BDKhata dataset                  | A     | [ ]    |
| Source code (GitHub)             | Both  | [ ]    |

### App Specifications

```
┌─────────────────────────────────────────┐
│           HISAB FINAL APP               │
├─────────────────────────────────────────┤
│  📦 Size: <50 MB                        │
│  📱 Min Device: ৳3,000 Android phone    │
│  🌐 Internet: Not required              │
│  🔋 Battery: ~5%/hour (active use)      │
│  💾 RAM: <150 MB                        │
│  ⚡ Cold Start: <3 seconds               │
├─────────────────────────────────────────┤
│  🎤 Voice: 92% accuracy, <1s latency    │
│  📸 OCR: 97% numbers, ~1s processing    │
│  📊 Prediction: Markov + context        │
├─────────────────────────────────────────┤
│  🗣️ Language: Full Bengali UI           │
│  👆 Input: Touch + Voice + Camera       │
│  📄 Output: Receipts + Reports          │
└─────────────────────────────────────────┘
```

---

## Appendix A: Voice Recording Script

```
# 500 Sentence Templates for Voice Training

## Baki Commands (100 sentences)
1. করিম পাঁচশ টাকা বাকি
2. রহিম তিনশ টাকা বাকি
3. জামাল আটশ টাকা বাকি
4. সালাম এক হাজার টাকা বাকি
5. মতিন দুইশ টাকা বাকি
... (continue with variations)

## Payment Commands (100 sentences)
1. করিম পাঁচশ টাকা দিছে
2. রহিম তিনশ টাকা দিছে
3. জামাল থেকে পাঁচশ পাইছি
... (continue)

## Query Commands (100 sentences)
1. করিমের কত বাকি
2. মোট বাকি কত
3. আজকে কত বিক্রি
... (continue)

## Sales Commands (100 sentences)
1. ফ্রুটি দশটা বিক্রি
2. তেল পাঁচটা বেচলাম
3. চাল দুই কেজি বিক্রি
... (continue)

## Mixed/Natural (100 sentences)
1. আজকে করিম এসেছিল পাঁচশ টাকা দিয়ে গেছে
2. জামাল ভাই এক হাজার টাকার বাকি নিয়ে গেলো
... (continue)
```

---

## Appendix B: Bengali UI Strings

```typescript
// constants/bengali.ts

export const BN = {
  // Navigation
  home: "হোম",
  customers: "কাস্টমার",
  sales: "বিক্রি",
  inventory: "মালামাল",
  suggestions: "পরামর্শ",
  reports: "রিপোর্ট",

  // Actions
  add: "যোগ করুন",
  edit: "সম্পাদনা",
  delete: "মুছুন",
  save: "সেভ করুন",
  cancel: "বাতিল",
  confirm: "নিশ্চিত",

  // Customer
  customerName: "নাম",
  phone: "ফোন",
  totalBaki: "মোট বাকি",
  giveBaki: "বাকি দিন",
  takePayment: "টাকা নিন",
  history: "হিসাব",

  // Voice
  speak: "বলুন",
  listening: "শুনছি...",
  processing: "বুঝছি...",
  tryAgain: "আবার বলুন",

  // Camera
  takePhoto: "ছবি তুলুন",
  processing: "প্রসেস হচ্ছে...",
  confirm: "ঠিক আছে",

  // Prediction
  buyMore: "বেশি কিনুন",
  buyLess: "কম কিনুন",
  maintainStock: "ঠিক আছে",
  highDemand: "বিক্রি ভালো",
  lowDemand: "বিক্রি কম",

  // Errors
  error: "সমস্যা হয়েছে",
  networkError: "ইন্টারনেট নেই",
  retry: "আবার চেষ্টা করুন",
};
```

---

## Appendix C: Test Phone Checklist

```
Device: ______________________
Android Version: ______________
RAM: _________________________
Storage Free: _________________

□ App installs successfully
□ App opens within 5 seconds
□ Bengali fonts render correctly
□ Navigation works smoothly
□ Customer list loads
□ Can add new customer
□ Can add baki (manual)
□ Can record payment
□ Voice button responds
□ Voice recognition works
□ Voice adds baki correctly
□ Camera opens
□ Photo capture works
□ OCR processes image
□ OCR extracts numbers
□ Sales entry works
□ Inventory displays
□ Predictions display
□ No crashes after 10 min use
□ Memory stays under 200 MB
□ Battery drain acceptable

Tester: ______________________
Date: ________________________
Notes: _______________________
```

---

_Document Version: 1.0_
_Last Updated: February 2026_
_Project: HISAB (হিসাব)_
