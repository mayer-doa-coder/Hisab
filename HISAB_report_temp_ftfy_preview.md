# HISAB (হিসাব): An Offline-First AI-Powered Retail Management System for Low-Literate Small Shop Owners in Bangladesh

---

## Title Page

| Field | Details |
|---|---|
| **Project Title** | HISAB (হিসাব): An Offline-First AI-Powered Retail Management System for Small Shop Owners in Bangladesh |
| **Course** | CSE 3200 – System Development Project |
| **Department** | Department of Computer Science and Engineering |
| **University** | Khulna University of Engineering & Technology (KUET), Khulna-9203, Bangladesh |
| **Submitted By** | Author 1: [Student Name], Roll No: [Roll], Author 2: [Student Name], Roll No: [Roll] |
| **Supervised By** | [Supervisor Name], [Designation], Department of CSE, KUET |
| **Submission Date** | [Date] |

---

## Acknowledgment

All praises are due to Allah, the Most Gracious and the Most Merciful, for giving us the strength, patience, and intellect to complete this project successfully.

We would like to express our deepest gratitude and sincere appreciation to our respected supervisor, **[Supervisor Name]**, **[Designation]**, Department of Computer Science and Engineering, Khulna University of Engineering & Technology (KUET), for his/her invaluable guidance, continuous encouragement, constructive feedback, and generous support throughout the entire development and documentation process of this project. Without his/her scholarly insights and patient mentorship, this work would not have reached its current form.

We extend our heartfelt thanks to the **Department of Computer Science and Engineering, KUET**, for providing the academic framework, laboratory facilities, and the intellectual environment that made this system development project possible.

We are also grateful to all the faculty members who have directly or indirectly contributed to our academic growth during the course of our undergraduate studies. Their teachings formed the theoretical foundation upon which this project was built.

Special thanks are due to the local small shop owners and retailers in Bangladesh who generously participated in our informal surveys and usability discussions, and whose real-world challenges inspired the design of every feature in this system.

Finally, we remain indebted to our families and friends for their unconditional moral support, patience, and encouragement throughout the demanding period of development and writing.

---

## Abstract

Small retail shop owners in Bangladesh — popularly known as *মুদির দোকানদার* (general store proprietors) — represent one of the most economically significant yet digitally underserved demographics in the country. The overwhelming majority of these shopkeepers rely on handwritten credit ledgers (locally called *বাকি খাতা* or *baki khata*), memory-based stock tracking, and informal verbal accounting methods to manage their daily business operations. This approach is fraught with challenges: calculation errors, record loss due to physical damage, an inability to generate historical insights, and chronic trust issues between shopkeepers and their credit customers arising from the absence of formal receipts or verifiable records.

This report presents **HISAB (হিসাব)**, an offline-first, AI-powered mobile retail management system designed specifically to address these challenges for low-literate shopkeepers in Bangladesh. The core motivation for HISAB lies in the recognition that existing digital retail solutions are designed for literate, smartphone-proficient users, and are either too expensive, too complex, or entirely unavailable in the Bengali language — making them inaccessible to the target demographic.

HISAB's approach centers on five key pillars. First, an *offline-first architecture* ensures that the application operates with full functionality on devices without internet connectivity — a critical requirement given the unreliable network conditions prevalent in many areas of Bangladesh. Second, a *Bengali-first user interface* with large touch targets and minimal text entry requirements dramatically reduces the digital literacy barrier. Third, an *AI-powered Bengali voice assistant* enables shopkeepers to record baki (credit) transactions, sales, and payment receipts using natural spoken Bengali commands such as *"করিম পাঁচশো টাকা বাকি"* (Karim owes five hundred taka). Fourth, a *handwritten khata OCR system* enables shopkeepers to digitize their existing paper ledgers by simply photographing them. Fifth, a *Markov Chain-based stochastic demand forecasting engine* — augmented with Bangladesh-specific contextual multipliers (e.g., Ramadan, Eid, harvest season) — provides actionable weekly and monthly purchase recommendations.

The system is implemented using **React Native** with **Expo** for the cross-platform mobile frontend, **SQLite** for local persistent data storage, and **Node.js with Express** and **MongoDB** for the cloud backend. The application follows **Clean Architecture** combined with the **MVVM** design pattern, and was developed over an eight-week sprint using a **Hybrid Agile-V Model**. The currently implemented core features include a complete digital baki ledger, inventory and stock movement tracking, a customer management system with risk-based trust scoring, a comprehensive audit trail, a KPI dashboard, and a fully implemented hybrid authentication system. Advanced features including the Bengali voice command pipeline, OCR ingestion workflow, and the complete Markov forecasting frontend integration are architecturally designed and partially implemented. HISAB represents a meaningful contribution toward making data-driven retail management accessible to the millions of small shop owners who constitute the backbone of Bangladesh's informal economy.

---

## CHAPTER I: Introduction

### 1.1 Introduction

The retail economy of Bangladesh is characterized by a vast network of small, owner-operated general stores scattered across urban neighbourhoods, semi-urban market areas, and rural villages. According to estimates, there are over 3.5 million small retail shops in Bangladesh, making this sector one of the largest sources of self-employment in the country [1]. These shops, commonly referred to as *মুদির দোকান* or general stores, serve as the primary point of commerce for a significant portion of the population, supplying daily necessities ranging from food staples and household goods to medicines and mobile top-up services.

Despite their economic importance, these shops are almost entirely managed through manual and informal processes. The *বাকি খাতা* (baki khata) — a handwritten credit ledger — serves as the primary financial record for tracking customer debts and repayments. Inventory is managed from memory or at best through informal paper lists. There exists no systematic mechanism for analyzing sales patterns, forecasting demand, or generating business reports.

The proliferation of affordable smartphones in Bangladesh — particularly low-cost Android devices in the ৳3,000–৳8,000 price range with 512 MB to 2 GB of RAM — presents an unprecedented opportunity to bridge this gap through mobile technology. However, existing retail management applications are designed for formally educated, digitally proficient users, and they do not account for the constraints of low literacy, limited technical familiarity, poor internet connectivity, and extreme resource-constrained hardware that characterize the operating environment of Bangladeshi small shop owners.

**HISAB (হিসাব)** — the Bengali word for "accounts" or "calculation" — is a system development project that directly responds to this gap. It is an offline-first, AI-assisted mobile application specifically engineered for the Bangladeshi small retail context, combining a Bengali-language interface, voice-driven interaction, handwritten ledger digitization, and predictive analytics within a package small enough to run on a ৳3,000 smartphone without any internet dependency for core operations.

### 1.2 Background / Problem Statement

The operational challenges faced by small shopkeepers in Bangladesh can be systematically identified across five dimensions:

**1. Manual Credit Management (বাকি System):**
The baki khata is the cornerstone of trust-based credit commerce in Bangladesh. A shopkeeper extends credit to known customers and manually records debts and repayments in a handwritten notebook. This method is inherently fragile — notebooks can be lost, damaged, or destroyed; entries can be ambiguous or illegible; calculations are frequently erroneous; and there is no automated mechanism to remind customers of outstanding dues or flag accounts with excessive unpaid balances. Disputes arising from discrepancies in paper records are common and can damage long-standing business relationships.

**2. Inventory Management Failures:**
Without systematic stock tracking, shopkeepers routinely face two equally costly problems: overstocking perishable or slow-moving goods (leading to expiry losses) and understocking fast-moving items (leading to lost sales). The cognitive burden of mentally tracking dozens or hundreds of SKUs while simultaneously serving customers is immense and unsustainable.

**3. Absence of Transaction Records and Business Insight:**
The lack of systematic sales records means that shopkeepers have no mechanism to understand which products sell best in which seasons, what their daily or monthly profit margins are, or how individual customer purchasing patterns evolve over time. This prevents any form of data-driven business decision-making.

**4. Cognitive and Digital Accessibility Barriers:**
Many small shop proprietors have limited formal education, which makes reading-heavy interfaces, complex navigation structures, and keyboards difficult to use. The shop environment is often noisy, fast-paced, and demanding of continuous attention, making any system that requires prolonged manual data entry impractical.

**5. Connectivity and Hardware Constraints:**
Rural and semi-urban areas in Bangladesh often experience unstable or entirely absent mobile internet connectivity. Any solution that relies on continuous network access is fundamentally incompatible with this operating environment.

In summary, the problem is not a shortage of technology, but a shortage of *appropriate* technology designed from first principles for this specific demographic and context.

### 1.3 Objectives

The primary objectives of the HISAB project are as follows:

- **OBJ-1:** Design and implement an offline-first mobile application that provides full retail management functionality without requiring internet connectivity.
- **OBJ-2:** Develop a Bengali-first user interface with large touch targets, color-coded visual cues, and minimal text input requirements to accommodate low-literate users.
- **OBJ-3:** Implement a digital *বাকি খাতা* (credit ledger) system that accurately tracks customer credit, payment transactions, running balances, and generates automated summaries.
- **OBJ-4:** Build a comprehensive inventory management module with real-time stock tracking, low-stock alerting, expiry monitoring, and stock movement audit trails.
- **OBJ-5:** Design and architect a Bengali voice command recognition pipeline capable of processing spoken retail commands (e.g., credit entry, payment recording, balance queries) with an intent classification accuracy exceeding 90%.
- **OBJ-6:** Design a two-stage OCR pipeline for digitizing handwritten khata pages, targeting a digit recognition accuracy exceeding 95%.
- **OBJ-7:** Implement a Markov Chain-based stochastic demand forecasting engine augmented with Bangladesh-specific contextual factors to provide actionable weekly purchase recommendations.
- **OBJ-8:** Develop a customer trust scoring system that evaluates customer creditworthiness based on payment history and behavioral patterns.
- **OBJ-9:** Implement a hybrid authentication system that supports both online and fully offline operation, with secure session management and token rotation.
- **OBJ-10:** Produce a production-grade MLOps infrastructure for the forecasting engine, including model versioning, drift monitoring, staged rollout, and automated recalibration.

### 1.4 Scope

The HISAB project encompasses the following technical scope:

**Frontend:**
- **Framework:** React Native (v0.81.5) with Expo SDK 54 for cross-platform Android development
- **Navigation:** React Navigation (bottom tabs + native stacks)
- **Local Database:** expo-sqlite (SQLite) for offline-first persistent data storage
- **State Management:** React Context API with custom hooks
- **UI:** Custom component library with Bengali language support

**Backend:**
- **Runtime:** Node.js with Express.js v5
- **Database:** MongoDB with Mongoose ODM for cloud data persistence
- **Authentication:** JWT-based access/refresh token system with bcrypt password hashing, OTP email verification, and PIN-based login
- **Security:** Helmet.js, CORS, rate limiting middleware, and security event auditing
- **PDF Generation:** PDFKit for receipt and report generation
- **Email:** Nodemailer for OTP and notification delivery

**Machine Learning & Analytics:**
- **Demand Forecasting:** Markov Chain stochastic model with queueing-theoretic market microstructure signals
- **Voice Recognition:** Lightweight CNN-based Bengali ASR pipeline (TFLite target, <5 MB)
- **OCR:** Two-stage CNN pipeline for Bengali digit and handwritten ledger recognition (TFLite target, <10 MB)
- **MLOps:** Model registry, drift detector, stability checker, walk-forward evaluation, stress testing, and staged rollout infrastructure

**Development Tooling:**
- Version Control: Git with GitHub (feature branching + weekly integration)
- Task Management: GitHub Issues and Milestones
- Development Environment: VS Code
- ML Training: Python with PyTorch, Google Colab (free GPU tier)
- Target Platform: Android 8.0+ (API level 26+)

**Out of Scope (Current Version):**
- iOS platform support
- bKash/Nagad mobile payment gateway integration (designed, not implemented)
- Area-based trending/networked product insights (designed, not implemented)
- Full production deployment to Google Play Store

### 1.5 Novelty and Uniqueness

HISAB differentiates itself from existing retail management solutions through a combination of design decisions that, taken together, constitute a novel contribution to the field of Human-Computer Interaction (HCI) for developing economies:

1. **Demographic-First Design:** Unlike general-purpose retail software (e.g., Square POS, QuickBooks, Shopify), HISAB is designed from the ground up for a user who may have limited formal education, owns a sub-à§³8,000 Android device, operates in a noisy shop environment, and lives in an area with unreliable internet. No existing commercial product targets this profile comprehensively.

2. **Domain-Specific Bengali Voice ASR:** Existing Bengali voice solutions (e.g., Google Speech-to-Text) are general-purpose and cloud-dependent. HISAB's planned voice model is a lightweight, offline, domain-specific CNN-based ASR system trained exclusively on retail voice commands in Bangladeshi Bengali dialects, operating on-device within a 5 MB footprint.

3. **Handwritten Khata OCR:** The specific problem of digitizing handwritten Bengali ledger pages (*baki khata*) with their characteristic format (customer name followed by an amount) has not been addressed by any publicly known commercial or research application. HISAB's OCR pipeline uses a two-stage detection-and-recognition architecture with synthetic data augmentation to solve this niche but high-impact problem.

4. **Contextually Augmented Markov Forecasting:** The Markov Chain demand forecasting engine incorporates Bangladesh-specific cultural and economic context multipliers — including Ramadan (+40%), Eid ul-Fitr (+100%), harvest season (+30%), and market day effects (+25%) — producing recommendations that are calibrated to local purchasing behavior rather than generic retail patterns.

5. **MLOps-Grade Forecasting Infrastructure at Micro-Business Scale:** The implementation of production-grade MLOps patterns (model registry, drift detection, staged rollout, walk-forward evaluation with leakage prevention) within the context of a micro-business retail application represents a novel application of enterprise ML governance principles to a resource-constrained, low-income market context.

6. **Privacy-Preserving Area Trend Intelligence:** The area-based trending feature (designed) employs a privacy-first architecture in which only anonymized, aggregated product volume data is shared — never customer names, prices, or exact GPS coordinates — requiring a minimum of five participating shops per area cluster before any trend is exposed.

### 1.6 Project Planning and Work Distribution

HISAB was developed over an **8-week sprint cycle** following a **Hybrid Agile-V Model** that combines the iterative flexibility of Agile with the structured verification and validation discipline of the V-Model.

**Development Model Rationale:**
The V-Model component ensures that each development stage is paired with a corresponding testing phase (unit testing ↔ module design, integration testing ↔ architecture, system testing ↔ system design, acceptance testing ↔ requirements), providing traceability from requirements to test outcomes. The Agile component enables weekly sprint cycles with a demo-and-review cadence, allowing requirements to be refined based on observed implementation behavior.

**Team Structure:**

| Role | Person | Primary Responsibilities |
|---|---|---|
| ML / Backend Developer | Developer A | Voice model training pipeline, OCR model design, Markov forecasting engine, backend Node.js APIs, MongoDB schema, MLOps infrastructure, security middleware |
| UI / Frontend Developer | Developer B | React Native screen development, SQLite schema and query layer, navigation structure, dashboard KPIs, UI components, offline sync queue, authentication UX |

**Eight-Week Sprint Plan Summary:**

| Week | Theme | Key Deliverables |
|---|---|---|
| Week 1 | Foundation & Setup | Repo structure, SQLite schema, navigation skeleton, auth scaffolding |
| Week 2 | Core App + Data | Customer CRUD, baki ledger, basic inventory, dashboard shell |
| Week 3 | Voice Recognition | Voice ASR architecture, command pattern design, voice UI screens |
| Week 4 | Photo OCR | Two-stage OCR pipeline design, camera capture UI, synthetic data generation |
| Week 5 | Sales & Inventory | Sales recording, stock movement, reorder suggestions, real data collection |
| Week 6 | Model Refinement | Markov forecasting engine, trust scoring, prediction UI, model optimization |
| Week 7 | Reports & Polish | PDF export, audit UI, backup/restore, performance optimization |
| Week 8 | Testing & Documentation | QA verification matrix, smoke tests, academic documentation, research prep |

**Weekly Coordination Structure:**
- **Monday (30 min):** Sprint planning — backlog review, goal selection, task assignment to GitHub Issues
- **Wednesday (15 min):** Mid-week sync — progress update, blocker identification, plan adjustment
- **Friday (1–2 hrs):** Integration and demo — branch merge, physical device testing, weekly demo, retrospective, tagged release

**RACI Matrix (Representative):**

| Activity | Dev A (ML/Backend) | Dev B (Frontend) | Supervisor |
|---|---|---|---|
| ML Model Design | **R, A** | C | I |
| SQLite Schema | C | **R, A** | I |
| Backend API Development | **R, A** | C | I |
| Screen Implementation | C | **R, A** | I |
| Integration Testing | C | **R, A** | I |
| Weekly Demo | R | R | **A** |
| Documentation | **R** | **R** | **A** |

*R = Responsible, A = Accountable, C = Consulted, I = Informed*

### 1.7 Applications

HISAB has direct and indirect application across multiple domains:

- **Retail Sector:** Primary application — management of small general stores, pharmacies, hardware shops, and grocery outlets across Bangladesh's urban, semi-urban, and rural market areas.
- **Microfinance & Credit Monitoring:** The trust scoring and baki ledger system provides a structured foundation for future integration with microfinance institutions to assess the creditworthiness of informal business owners using behavioral transactional data.
- **Supply Chain Optimization:** Aggregated anonymized demand prediction data from multiple shops in an area could provide valuable insight to distributors and wholesalers about regional demand trends, improving supply chain efficiency at the last mile.
- **Financial Inclusion Research:** The structured digital records generated by HISAB convert previously unrecorded informal economic activity into structured data, enabling academic research into informal retail economics in Bangladesh.
- **Government Policy:** Aggregate, anonymized data from HISAB deployments could inform government programs targeting the small business sector, including subsidy targeting, digital commerce initiatives, and economic impact assessment.
- **Academic Research:** The Bengali retail voice dataset and handwritten khata image dataset planned for release as open datasets would support further research in low-resource Bengali NLP and document intelligence.

### 1.8 Organization of the Report

The remainder of this report is organized as follows:

- **Chapter II (Related Work):** Surveys existing retail management systems, mobile accounting applications, and relevant research in Bengali ASR, handwritten OCR, and demand forecasting for developing economies, identifying their limitations in the context addressed by HISAB.
- **Chapter III (Methodology):** Describes the system architecture, data flow design, applied algorithms (Markov Chain, CNN-based voice and OCR models), design patterns employed, and justification of the technology stack.
- **Chapter IV (Implementation, Results & Discussion):** Details the implementation of each module, the experimental setup for evaluation, feature breakdown, qualitative and quantitative results, and maps outcomes to stated objectives.
- **Chapter V (Impact Analysis):** Analyzes the ethical, legal, safety, environmental, and societal implications of the HISAB system.
- **Chapter VI (Complex Engineering Problems):** Identifies and discusses the complex engineering challenges encountered during the project and the solutions devised to address them.
- **Chapter VII (Conclusion):** Summarizes the work, acknowledges current limitations, and outlines directions for future development.

---

## CHAPTER II: Related Work

### 2.1 Existing Retail Management Systems

The market for retail management and point-of-sale (POS) software is mature in high-income and middle-income markets. However, solutions designed specifically for the low-literacy, low-connectivity, and low-resource context of Bangladeshi small retailers are virtually absent. This section surveys the most relevant existing systems and their limitations.

**2.1.1 Commercial POS and Retail Software**

*Square POS* [2] and *Shopify POS* [3] represent the global standard for mobile point-of-sale systems. Both offer robust inventory management, sales tracking, customer profiles, and reporting. However, they require a stable internet connection for most operations, are priced in USD (making them economically inaccessible to small Bangladeshi retailers), provide no Bengali language support, and assume a baseline of formal education and digital literacy that many target users do not possess.

*QuickBooks* [4] and similar accounting software platforms offer comprehensive financial management but are designed for formally educated business operators, require subscription-based pricing, and are entirely cloud-dependent. Their complexity makes them unsuitable for a shopkeeper with primary-level education managing a single-room shop.

**2.1.2 Bangladesh-Specific Informal Solutions**

Several simple mobile apps have been developed targeting Bangladeshi small businesses, including basic ledger applications and SMS-based accounting tools. These solutions typically provide: (a) digital credit entry with minimal UI, (b) basic summaries, and (c) optional SMS reminders. However, they universally suffer from the following limitations:
- No offline-first guarantee: loss of functionality when connectivity is absent
- No voice input: requiring typed Bengali which is a significant barrier
- No OCR or image input: no path to digitize existing paper records
- No predictive analytics: no demand forecasting or purchase recommendations
- No trust scoring or customer risk classification

**2.1.3 Bengali Voice Recognition Research**

Research into Bengali Automatic Speech Recognition (ASR) has been an active area. Alam et al. [5] developed a Bengali ASR system using Hidden Markov Models (HMM) trained on broadcast speech, achieving word error rates in the 20–30% range on read speech. More recent approaches using deep learning, such as those leveraging wav2vec 2.0 fine-tuned on Bengali data [6], have achieved significant improvements but rely on large model sizes (>100 MB) and cloud inference, making them incompatible with the HISAB constraint of on-device inference within 5 MB. The specific sub-task of domain-specific Bengali retail voice command recognition for low-resource on-device deployment has not been addressed in published literature.

**2.1.4 Handwritten Bengali Document Recognition**

Optical Character Recognition (OCR) for handwritten Bengali has received considerable academic attention [7][8]. Existing work largely focuses on printed or semi-printed Bengali characters and digits in standard document formats. The specific challenge of recognizing handwritten Bengali numerals and informal name abbreviations in the unstructured format of a *baki khata* — characterized by variable spacing, mixed script, ink bleed, and physical damage — represents a gap not addressed by current published systems.

**2.1.5 Demand Forecasting for Small Retail**

Demand forecasting research has predominantly focused on large retail chains with structured point-of-sale data [9]. Markov Chain models have been applied to model customer purchasing behavior in formal retail contexts [10], but their application to predict demand for micro-businesses in developing economies with highly irregular, culturally modulated demand patterns is underexplored. Roy et al. [11] applied time-series forecasting to small-scale retail in South Asia but assumed structured weekly data that is rarely available in the informal sector.

### 2.2 Limitations of Existing Solutions

| Dimension | Commercial POS | Simple Bengali Apps | Research Prototypes |
|---|---|---|---|
| Offline-first | ✗ | Partial | Varies |
| Bengali UI | ✗ | Partial | Research-only |
| Voice Input (Bengali) | ✗ | ✗ | Lab-only, large model |
| Handwritten OCR | ✗ | ✗ | Limited scope |
| Demand Forecasting | Basic | ✗ | Formal retail only |
| Trust Scoring | ✗ | ✗ | ✗ |
| Low-resource device support | ✗ | Partial | ✗ |
| Price accessible | ✗ | Partial | N/A |
| Bangladesh cultural context | ✗ | Partial | ✗ |

### 2.3 Positioning of HISAB

HISAB addresses the intersection of limitations identified above by providing an integrated, offline-first, voice-enabled, and predictive retail management system specifically calibrated for Bangladeshi small retail context. The system is the first known implementation to combine: (1) offline Bengali voice command recognition, (2) handwritten baki khata OCR, (3) culturally-augmented Markov demand forecasting, and (4) a customer trust scoring system — within a single mobile application targeting sub-৳8,000 Android devices.

---

## CHAPTER III: Methodology

### 3.1 Introduction

This chapter describes the complete methodology adopted for the design, development, and evaluation of the HISAB system. The methodology encompasses the software engineering process model, requirements engineering approach, problem decomposition and analysis, overall system framework, architectural design decisions, data flow design, core algorithms and decision logic, technology stack justification, security design, and MLOps pipeline design. Presenting the methodology in full detail demonstrates the systematic, principled approach taken to ensure that the final system satisfies both functional and non-functional requirements while remaining feasible within the eight-week development timeline and the severe resource constraints of the target deployment environment.

The chapter proceeds as follows: Section 3.2 presents the detailed development methodology and process model. Section 3.3 provides structured problem design and analysis, including use case decomposition, entity-relationship analysis, and constraint analysis. Section 3.4 presents the overall system framework and architectural flowcharts. Section 3.5 details the system architecture design and patterns. Section 3.6 describes the data flow and workflow for each major subsystem. Section 3.7 explains the core algorithms and decision logic. Section 3.8 justifies the technology stack selections. Section 3.9 describes the security design. Section 3.10 outlines the MLOps pipeline design. A chapter conclusion is provided in Section 3.11.

---

### 3.2 Detailed Methodology

#### 3.2.1 Development Process Model: Hybrid Agile-V Model

HISAB is developed using a **Hybrid Agile-V Model**, which combines the iterative, user-centered flexibility of Agile with the structured verification and validation discipline of the V-Model (also known as the Verification and Validation Model). This hybrid approach is adopted because neither model alone is sufficient for the project's requirements:

- **Pure Agile** risks insufficient documentation and traceability — both critical for an academic submission and for a financial data system that must meet auditability requirements.
- **Pure V-Model** is too rigid for a two-person team building a novel product in eight weeks where requirements evolve as prototype feedback is incorporated.

The combined model is structured as follows:

```
REQUIREMENTS GATHERING ◄─────────────────────────► ACCEPTANCE TESTING
        │                                                   ▲
        ▼                                                   │
SYSTEM DESIGN          ◄─────────────────────────► SYSTEM TESTING
        │                                                   ▲
        ▼                                                   │
ARCHITECTURE DESIGN    ◄─────────────────────────► INTEGRATION TESTING
        │                                                   ▲
        ▼                                                   │
MODULE DESIGN          ◄─────────────────────────► UNIT TESTING
        │                                                   ▲
        ▼                                                   │
        └──────────────► AGILE SPRINTS (8 × 1-week) ◄──────┘
                                     │
                         ┌───────────┴────────────┐
                         │  Monday:  Sprint Plan   │
                         │  Wed:     Mid-sync      │
                         │  Friday:  Demo + Merge  │
                         └────────────────────────┘
```

Each weekly sprint produces a working, testable increment. The V-Model component ensures that every design artifact has a corresponding test artifact, providing full requirements-to-test traceability as mandated by the project's quality assurance plan. At the close of each sprint, the Friday integration session merges feature branches, runs physical device tests, performs a team retrospective, and produces a tagged Git release (v0.1.0, v0.2.0, etc.).

#### 3.2.2 Requirements Engineering Process

Requirements for HISAB were gathered through the following structured five-step process:

**Step 1 — Stakeholder Analysis:** The primary stakeholder is the small shop owner (*মুদির দোকানদার*). Secondary stakeholders include the shop's customers (affected by the baki ledger's accuracy and transparency) and potentially microfinance institutions (who may leverage trust scoring data in future versions). Informal semi-structured interviews were conducted with shopkeepers to understand their current workflow, pain points, and existing comfort with mobile technology.

**Step 2 — Problem Domain Modeling:** A domain model was constructed mapping the core business entities (Customer, Product, Transaction, Sale, Stock Movement, Audit Log) and their relationships, providing the logical basis for the SQLite database schema.

**Step 3 — Requirement Classification:** Requirements were classified into six categories — Functional (FR), Non-Functional (NFR), User Interface (UIR), Data (DR), ML Model (MLR), and Constraint (CR) — with unique identifiers enabling traceability throughout the project lifecycle.

**Step 4 — Requirements Prioritization:** MoSCoW prioritization (Must, Should, Could, Won't) was applied to determine which features must be delivered in the eight-week sprint and which can be deferred to future development phases. Features tagged "Must" in all categories were guaranteed delivery; "Should" features were targeted pending sprint velocity.

**Step 5 — Traceability Matrix (RTM):** Each requirement was linked to a design component, implementation module, and test case in a Requirements Traceability Matrix, ensuring that no requirement is orphaned from its verification evidence and that all implemented features can be traced back to a stakeholder need.

#### 3.2.3 Definition of Done

A development task is considered fully complete only when all of the following criteria are simultaneously satisfied:

| Category | Criteria |
|---|---|
| **Code** | Written and self-reviewed; follows project style guide; no ESLint errors |
| **Testing** | Unit tests written (where applicable); manual testing on physical device; edge cases considered |
| **Review** | Pull request created; peer-reviewed by other team member; review comments addressed |
| **Documentation** | Complex logic commented inline; README updated if API changed |
| **Integration** | Merged to `develop` branch; no regression in existing features confirmed by re-test |

---

### 3.3 Problem Design and Analysis

#### 3.3.1 Problem Decomposition

The central problem — *"small Bangladeshi shopkeepers cannot effectively manage their business using current manual methods"* — is formally decomposed into five atomic sub-problems, each with a distinct root cause and a corresponding HISAB module response:

| ID | Sub-Problem | Root Cause | HISAB Response Module |
|---|---|---|---|
| P1 | Inaccurate, losable credit tracking | Manual handwritten ledger prone to errors and physical damage | Digital Baki Ledger + Audit Trail |
| P2 | Inefficient, opaque inventory control | No systematic stock tracking; memory-based management | Inventory Management + Alert System |
| P3 | No business insight or demand visibility | No historical sales data; no analytical tools | Markov Demand Forecasting + Dashboard |
| P4 | Digital literacy and interaction barrier | Keyboard text entry unsuitable for target demographic | Voice ASR + Bengali-First UI + OCR |
| P5 | Connectivity and device resource constraint | Unreliable rural internet; low-RAM hardware | Offline-First Architecture + Lightweight ML |

#### 3.3.2 Use Case Analysis

The following primary use cases define the system's functional scope from the shopkeeper's perspective, following the IEEE 830 use case template:

**UC-01: Record Customer Credit (Baki)**
- **Actor:** Shopkeeper
- **Trigger:** Customer takes goods on credit
- **Precondition:** Customer profile exists in the system; user is authenticated
- **Main Flow:** Shopkeeper selects customer → enters amount and optional note → confirms → system records `baki_transaction` (type='credit'), updates `customer.total_baki`, appends `audit_log` entry
- **Alternate Flow (Voice):** Voice command "করিম পাঁচশো টাকা বাকি" → Voice FSM → intent=add_baki, amount=500, customer=Karim → wizard confirmation → same outcome as main flow
- **Postcondition:** Customer's outstanding balance updated; audit record created; dashboard KPI refreshed

**UC-02: Record Payment**
- **Actor:** Shopkeeper
- **Trigger:** Customer pays off part or all of outstanding debt
- **Precondition:** Customer has outstanding baki balance > 0
- **Main Flow:** Shopkeeper selects customer → enters payment amount → system validates amount ≤ total_baki (overpayment guard) → records `baki_transaction` (type='payment'), reduces `total_baki`, logs audit
- **Exception Flow:** If payment amount > outstanding balance → system displays error "Payment exceeds outstanding balance" → transaction rejected → database unchanged

**UC-03: Manage Inventory Stock Movement**
- **Actor:** Shopkeeper
- **Trigger:** New stock received from supplier, or stock consumed in sale
- **Main Flow:** Shopkeeper selects product → records movement type (in/out/adjust) and quantity → system records `stock_movement` with `qty_before`, `qty_after`, timestamp; updates `product.stock`
- **Postcondition:** Product.stock updated; low-stock alert triggered if `stock ≤ low_stock_threshold`

**UC-04: View Demand Predictions**
- **Actor:** Shopkeeper
- **Trigger:** Shopkeeper opens StockSuggestionsScreen
- **Main Flow:** System reads `weekly_sales` history per product → runs Markov state prediction → applies Bangladesh-specific context multipliers → ranks products by urgency → displays purchase recommendations with Bengali action labels (বেশি কিনুন / ঠিক আছে / কম কিনুন)
- **Alternate Flow (insufficient history):** If < 4 weeks of history → rule-based reorder engine provides quantity recommendation based on average daily consumption and safety stock target

**UC-05: Authenticate with PIN (Trusted Device)**
- **Actor:** Shopkeeper (returning user on trusted device)
- **Trigger:** App launch; saved PIN profile detected
- **Main Flow:** App detects trusted device ID → displays PIN entry screen → shopkeeper enters 4–6 digit PIN → `POST /api/auth/pin/login` → backend verifies PIN hash + device hash → access token issued → business screens unlocked
- **Exception Flow:** If PIN fails ≥ 5 times → account temporarily locked → password recovery flow prompted

#### 3.3.3 Entity-Relationship Analysis

The core business entities of HISAB and their relationships are represented below:

```
┌──────────────────────────────────────────────────────────────────────┐
│                     ENTITY-RELATIONSHIP DIAGRAM                      │
├──────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  ┌──────────┐  owns (user_id)  ┌─────────────────┐                  │
│  │   USER   │─────────────────►│ BAKI_TRANSACTION│                  │
│  │ id       │                  │ id, customer_id  │                  │
│  │ email    │                  │ type (credit /   │                  │
│  │ password │                  │ payment), amount │                  │
│  │ _hash    │                  │ note, user_id    │                  │
│  │ pin_hash │                  │ created_at       │                  │
│  └─────┬────┘                  └────────┬─────────┘                  │
│        │ owns                           │ belongs to                 │
│        ▼                                ▼                            │
│  ┌──────────┐  has many        ┌─────────────────┐                  │
│  │ CUSTOMER │◄─────────────────│  BAKI_ENTRY     │                  │
│  │ id, name │                  │  (running       │                  │
│  │ phone    │                  │   balance cache) │                  │
│  │ nickname │                  └─────────────────┘                  │
│  │ total_   │                                                        │
│  │ baki     │                                                        │
│  │ trust_   │                                                        │
│  │ score    │                                                        │
│  └──────────┘                                                        │
│                                                                      │
│  ┌──────────┐  contains  ┌──────────┐  references  ┌─────────────┐  │
│  │   SALE   │───────────►│SALE_ITEM │─────────────►│   PRODUCT   │  │
│  │ id       │            │ quantity │              │ id, name    │  │
│  │ total    │            │ price    │              │ price       │  │
│  │ is_baki  │            │ product_id              │ cost_price  │  │
│  │ customer_│            └──────────┘              │ stock       │  │
│  │ id       │                                      │ threshold   │  │
│  └──────────┘                                      └──────┬──────┘  │
│                                                           │         │
│  ┌──────────────────┐  tracks              ┌─────────────▼──────┐   │
│  │  STOCK_MOVEMENT  │◄─────────────────────│  WEEKLY_SALES      │   │
│  │  product_id      │                      │  (Markov input)    │   │
│  │  type (in/out/   │                      │  product_id        │   │
│  │  adjust)         │                      │  week_start        │   │
│  │  qty_before      │                      │  units_sold        │   │
│  │  qty_after       │                      │  state (LOW/MED/   │   │
│  │  user_id         │                      │  HIGH)             │   │
│  └──────────────────┘                      └────────────────────┘   │
│                                                                      │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │  AUDIT_LOG  (append-only, immutable)                         │   │
│  │  action │ entity │ entity_id │ metadata (JSON) │ user_id │   │   │
│  │  timestamp                                                   │   │
│  └──────────────────────────────────────────────────────────────┘   │
│                                                                      │
└──────────────────────────────────────────────────────────────────────┘
```

**Key Relationships:**
- One USER → many CUSTOMERS, PRODUCTS, SALES, BAKI_TRANSACTIONS (enforced via `user_id` foreign key scoping)
- One CUSTOMER → many BAKI_TRANSACTIONS (ordered credit and payment history)
- One SALE → many SALE_ITEMS; each SALE_ITEM references one PRODUCT
- One PRODUCT → many STOCK_MOVEMENTS (complete in/out/adjust audit)
- One PRODUCT → many WEEKLY_SALES entries (time-series data driving Markov model)
- Every domain mutation event → exactly one AUDIT_LOG entry (transactional side effect)

#### 3.3.4 System Constraints Analysis

| Constraint ID | Constraint | Type | Impact on Design |
|---|---|---|---|
| CR-001 | APK size < 50 MB | Hardware | Limits ML model size; requires TFLite INT8 quantization |
| CR-002 | Minimum RAM 512 MB | Hardware | Peak app usage must remain below 150 MB; no heavy in-memory caching |
| CR-003 | 100% offline core operation | Connectivity | All features must use local SQLite; no cloud dependency for business ops |
| CR-004 | Voice model < 5 MB | ML | Requires domain-specific CNN; rules out general-purpose ASR (>100 MB) |
| CR-005 | OCR model < 10 MB | ML | Requires two-stage lightweight pipeline with quantization |
| CR-006 | 8-week development timeline | Project | MoSCoW prioritization essential; advanced features deferred where necessary |
| CR-007 | Android 8.0+ only (API 26+) | Platform | Covers ~95% of Bangladesh smartphone market; simplifies native module selection |
| CR-008 | Bengali-first UI | Accessibility | Custom font loading required; large touch targets (min 48dp); minimal text entry |
| CR-009 | No paid training compute | Budget | ML training on Google Colab free tier; synthetic data generation to avoid costly collection |

---

### 3.4 Overall System Framework and Flowcharts

#### 3.4.1 High-Level System Framework

The HISAB system is organized as a three-tier framework. The **Mobile Application Layer** handles all direct user interactions and contains the full business logic for offline-first operation. The **Local Intelligence Layer** encompasses the on-device ML models (Voice ASR, OCR, rule-based reorder engine) and the local SQLite database. The **Cloud Services Layer** provides authentication management, demand forecasting computation, and optional networked features, but is never a hard dependency for core business operations.

```
╔═══════════════════════════════════════════════════════════════════════╗
â•'                       HISAB SYSTEM FRAMEWORK                         â•'
╠═══════════════════════════════════════════════════════════════════════╣
â•'                                                                       â•'
║  ┌───────────────────────────────────────────────────────────────┐   ║
║  │                 MOBILE APPLICATION LAYER                      │   ║
║  │                                                               │   ║
║  │  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────────────┐ │   ║
║  │  │  Baki    │ │Inventory │ │  Sales   │ │  Dashboard KPIs  │ │   ║
║  │  │  Ledger  │ │ Manager  │ │  Module  │ │  (Aggregated)    │ │   ║
║  │  └──────────┘ └──────────┘ └──────────┘ └──────────────────┘ │   ║
║  │  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────────────┐ │   ║
║  │  │ Customer │ │  Audit   │ │ Reports  │ │  Auth Module     │ │   ║
║  │  │  Module  │ │  Trail   │ │ + Export │ │  (Hybrid)        │ │   ║
║  │  └──────────┘ └──────────┘ └──────────┘ └──────────────────┘ │   ║
║  └──────────────────────────┬────────────────────────────────────┘   ║
║                             │ reads / writes                         ║
║  ┌──────────────────────────▼────────────────────────────────────┐   ║
║  │                 LOCAL INTELLIGENCE LAYER                      │   ║
║  │                                                               │   ║
║  │  ┌─────────────────┐  ┌─────────────┐  ┌──────────────────┐  │   ║
║  │  │ SQLite Database │  │ Voice ASR   │  │  OCR Engine      │  │   ║
║  │  │ (Primary Store) │  │ (TFLite,    │  │  (TFLite,        │  │   ║
║  │  │ 12 tables       │  │  < 5 MB)    │  │  < 10 MB)        │  │   ║
║  │  └─────────────────┘  └─────────────┘  └──────────────────┘  │   ║
║  │  ┌─────────────────┐  ┌─────────────┐                         │   ║
║  │  │ Reorder Engine  │  │  Trust Score│                         │   ║
║  │  │ (Rule-based)    │  │  Calculator │                         │   ║
║  │  └─────────────────┘  └─────────────┘                         │   ║
║  └──────────────────────────┬────────────────────────────────────┘   ║
║                             │ optional sync (WiFi / mobile data)     ║
║  ┌──────────────────────────▼────────────────────────────────────┐   ║
║  │                 CLOUD SERVICES LAYER                          │   ║
║  │                                                               │   ║
║  │  ┌──────────────┐  ┌──────────────────┐  ┌─────────────────┐ │   ║
║  │  │ Auth Service │  │ Markov Forecast  │  │ Area Trend Agg. │ │   ║
║  │  │ JWT + OTP    │  │ API (MLOps)      │  │ (Anonymized)    │ │   ║
║  │  │ + PIN + bcrypt│  │ walkForward,     │  │ (Future scope)  │ │   ║
║  │  └──────────────┘  │ drift, rollout   │  └─────────────────┘ │   ║
║  │  ┌──────────────┐  └──────────────────┘                       │   ║
║  │  │  MongoDB     │                                              │   ║
║  │  │  (User Auth, │                                              │   ║
║  │  │   ML Models) │                                              │   ║
║  │  └──────────────┘                                              │   ║
║  └───────────────────────────────────────────────────────────────┘   ║
â•'                                                                       â•'
╚═══════════════════════════════════════════════════════════════════════╝
```

#### 3.4.2 Master Application Control Flowchart

The following flowchart describes the master control flow from app launch through the main operational loop:

```
                       ┌──────────────────────┐
                       │      App Launch       │
                       └──────────┬───────────┘
                                  │
                                  â–¼
                       ┌──────────────────────────┐
                       │  Initialize SQLite:       │
                       │  createTables()           │
                       │  runMigrations()          │
                       │  backfillUserScoping()    │
                       └──────────┬───────────────┘
                                  │
                                  â–¼
                       ┌──────────────────────────┐    No    ┌────────────────────┐
                       │  Local Session Exists?    │─────────►│  Auth Stack:       │
                       │  (auth_sessions table)    │          │  LoginScreen /     │
                       └──────────┬───────────────┘          │  SignupScreen /    │
                                  │ Yes                       │  VerifyEmailScreen │
                                  ▼                           └────────┬───────────┘
                       ┌──────────────────────────┐                    │
                       │  Restore User Context     │                    │ on success
                       │  Load scoped domain data  │◄───────────────────┘
                       └──────────┬───────────────┘
                                  │
                                  â–¼
                       ┌──────────────────────────┐
                       │  Network Available?       │
                       │  checkBackendHealth()     │
                       └────┬─────────────┬────────┘
                            │ Yes          │ No
                            â–¼             â–¼
                 ┌──────────────┐  ┌────────────────┐
                 │ Sync Token   │  │  Offline Mode  │
                 │ Refresh +    │  │  Full SQLite   │
                 │ Drain Queue  │  │  functionality │
                 └──────┬───────┘  └───────┬────────┘
                        └──────────┬───────┘
                                   â–¼
                       ┌──────────────────────────┐
                       │     MAIN DASHBOARD        │
                       │  DashboardScreen          │
                       │  (KPIs, alerts, activity) │
                       └──────────┬───────────────┘
                                  │
              ┌───────────────────┼───────────────────┐
              â–¼                   â–¼                   â–¼
   ┌────────────────┐  ┌────────────────┐  ┌────────────────┐
   │  Baki Module   │  │Inventory Module│  │  Sales Module  │
   │  BakiListScreen│  │ProductList +   │  │  SalesScreen + │
   │  CustomerLedger│  │StockMovement   │  │  SalesHistory  │
   └───────┬────────┘  └───────┬────────┘  └───────┬────────┘
           └───────────────────┼───────────────────┘
                               â–¼
                   ┌───────────────────────────┐
                   │  All Mutations:            │
                   │  BEGIN TRANSACTION         │
                   │  → SQLite domain write     │
                   │  → INSERT audit_log        │
                   │  → PUSH pending_sync_queue │
                   │  COMMIT TRANSACTION        │
                   └───────────────────────────┘
```

#### 3.4.3 Voice Command Processing Flowchart

```
             ┌──────────────────────────────┐
             │  User Taps Microphone Button  │
             └──────────────┬───────────────┘
                            │
                            â–¼
             ┌──────────────────────────────┐
             │  Start Audio Recording        │
             │  expo-audio: 16kHz, mono WAV  │
             └──────────────┬───────────────┘
                            │
                            â–¼
             ┌──────────────────────────────┐
             │  User Speaks (Bengali)        │
             │  e.g. "করিম পাঁচশো টাকা বাকি" │
             └──────────────┬───────────────┘
                            │
                            â–¼
             ┌──────────────────────────────┐
             │  Stop Recording               │
             └──────────────┬───────────────┘
                            │
                            â–¼
             ┌──────────────────────────────────────────┐
             │  Mel Spectrogram Extraction               │
             │  80 mel bins | 25ms window | 10ms hop    │
             │  log-scale normalization                  │
             └──────────────────┬───────────────────────┘
                                │
                                â–¼
             ┌──────────────────────────────────────────┐
             │  CNN Encoder (3-layer Conv1d)             │
             │  Conv1d(80→128) → ReLU →                 │
             │  Conv1d(128→64) → ReLU →                 │
             │  Conv1d(64→32)  → ReLU    (~2 MB)        │
             └──────────┬───────────────┬───────────────┘
                        │               │
                        â–¼               â–¼
          ┌─────────────────┐  ┌─────────────────────────┐
          │ Intent Classifier│  │   Number Extractor       │
          │ Linear(32, 5)    │  │   Attention(32) + CTC    │
          │ → Softmax        │  │                          │
          │                  │  │ "পাঁচশো"  → 500         │
          │ add_baki  (0)    │  │ "একশো"    → 100         │
          │ payment   (1)    │  │ "পঁচিশ"   → 25          │
          │ query     (2)    │  └──────────┬──────────────┘
          │ sale      (3)    │             │
          │ other     (4)    │             │
          └────────┬─────────┘             │
                   │                       │
                   â–¼                       â–¼
          ┌─────────────────┐  ┌──────────────────────────┐
          │ Confidence Gate  │  │   Name Matcher            │
          │ score > 0.75?    │  │ Levenshtein fuzzy match  │
          │                  │  │ vs. customer table        │
          │ Yes → proceed    │  │ "করিম" → Karim (id=7)    │
          │ No  → retry /   │  └──────────┬───────────────┘
          │       cancel     │             │
          └────────┬─────────┘             │
                   └───────────┬───────────┘
                               â–¼
             ┌──────────────────────────────────────────┐
             │  Voice FSM Validation                     │
             │  add_baki: needs {customer ✓, amount ✓}  │
             │  Result: COMPLETE                         │
             └──────────────────┬───────────────────────┘
                                │
                                â–¼
             ┌──────────────────────────────────────────┐
             │  Multi-Step Review Wizard                 │
             │  Step 1 VoiceIntentScreen: "বাকি যোগ?"  │
             │  Step 2 VoiceAmountScreen: "৳ ৫০০?"      │
             │  Step 3 VoiceNameScreen:  "করিম?"        │
             │  Step 4 VoiceReviewScreen: Confirm / Edit │
             └──────────────────┬───────────────────────┘
                                │ Confirmed
                                â–¼
             ┌──────────────────────────────────────────┐
             │  Command Executor                         │
             │  → BakiService.addCredit(7, 500, null)   │
             │  → SQLite transaction + audit log         │
             │  voiceAnalyticsLogger.record(event)       │
             └──────────────────────────────────────────┘
```

#### 3.4.4 Markov Chain Demand Prediction Flowchart

```
        ┌──────────────────────────────────────────┐
        │  Trigger: User Opens StockSuggestionsScreen│
        └───────────────────┬──────────────────────┘
                            │
                            â–¼
        ┌──────────────────────────────────────────┐
        │  For each product:                        │
        │  SELECT * FROM weekly_sales               │
        │  WHERE product_id = X                     │
        │  ORDER BY week_start DESC LIMIT 12        │
        └───────────────────┬──────────────────────┘
                            │
                            â–¼
        ┌──────────────────────────────────────────┐
        │  Classify each week's units_sold → State  │
        │  < 20 units  →  LOW                       │
        │  20–49 units →  MEDIUM                    │
        │  ≥ 50 units  →  HIGH                      │
        └───────────────────┬──────────────────────┘
                            │
                            â–¼
        ┌──────────────────────────────────────────┐
        │  Check history depth:                     │
        │  ≥ 12 weeks → Full Markov Chain           │
        │  4–11 weeks → Laplace-smoothed Markov     │
        │  < 4 weeks  → Rule-based fallback only    │
        └───────────────────┬──────────────────────┘
                            │ (≥ 4 weeks path)
                            â–¼
        ┌──────────────────────────────────────────┐
        │  Build Transition Count Matrix C:         │
        │  C[i][j] = count(state_t=i, state_{t+1}=j)│
        │  Apply Laplace smoothing: C[i][j] += 1   │
        │  Normalize rows → Probability matrix P   │
        └───────────────────┬──────────────────────┘
                            │
                            â–¼
        ┌──────────────────────────────────────────┐
        │  Compute next-week distribution:          │
        │  π_{t+1} = π_t × P                       │
        │  (π_t = current state one-hot vector)    │
        └───────────────────┬──────────────────────┘
                            │
                            â–¼
        ┌──────────────────────────────────────────┐
        │  Confidence Gate:                         │
        │  max(π_{t+1}) > confidence_threshold?     │
        │  Yes → use Markov prediction              │
        │  No  → invoke fallback engine             │
        └───────────────────┬──────────────────────┘
                            │
                            â–¼
        ┌──────────────────────────────────────────┐
        │  Apply Context Multipliers:               │
        │  Check current date against calendar:    │
        │  Ramadan active?    → qty × 1.4          │
        │  Eid ul-Fitr ±1wk?  → qty × 2.0          │
        │  Month start 1–5?   → qty × 1.2          │
        │  Summer (Apr–Jun)?  → beverages × 1.3    │
        │  Rainy (Jun–Sep)?   → footfall × 0.8     │
        └───────────────────┬──────────────────────┘
                            │
                            â–¼
        ┌──────────────────────────────────────────┐
        │  Emit prediction per product:             │
        │  { productId, currentState,               │
        │    predictedState, confidence,            │
        │    recommendedQty,                        │
        │    action: "বেশি কিনুন" /                │
        │             "ঠিক আছে"   /                │
        │             "কম কিনুন" }                 │
        └───────────────────┬──────────────────────┘
                            │
                            â–¼
        ┌──────────────────────────────────────────┐
        │  Walk-Forward Evaluation (background):    │
        │  Rolling-origin splits → leakage check   │
        │  → Score metrics → Update model registry │
        │  → Drift check → Advance rollout stage   │
        └──────────────────────────────────────────┘
```

---

### 3.5 System Architecture Design

#### 3.5.1 Architectural Pattern: Clean Architecture + MVVM

HISAB adopts **Clean Architecture** [12] as its primary structural pattern, organized into four concentric layers with strict inward-only dependency rules — inner layers do not depend on outer layers, ensuring that business logic remains independent of framework, database, and UI decisions:

```
┌─────────────────────────────────────────────────────────────┐
│                   PRESENTATION LAYER                        │
│  React Native Screens │ UI Components │ Hooks │ Theme       │
│  (View + ViewModel in MVVM)                                 │
├─────────────────────────────────────────────────────────────┤
│                   APPLICATION LAYER                         │
│  BakiService │ CustomerService │ SalesService               │
│  PredictionService │ AuthService │ AuditService             │
│  (Orchestrates use cases; coordinates domain + infra)       │
├─────────────────────────────────────────────────────────────┤
│                    DOMAIN LAYER                             │
│  Entities: Customer, Product, Transaction, Sale             │
│  Interfaces: ICustomerRepo, ITransactionRepo                │
│  Use Cases: AddBaki, RecordPayment, UpdateStock             │
├─────────────────────────────────────────────────────────────┤
│                 INFRASTRUCTURE LAYER                        │
│  SQLite (expo-sqlite) │ TFLite Runtime │ Camera Module      │
│  File System │ HTTP Client (axios) │ expo-audio            │
└─────────────────────────────────────────────────────────────┘
              Dependency arrows point INWARD only â–²
```

MVVM mapping within the Presentation Layer:
- **View:** React Native screens (`screens/*.js`) — render UI, bind to ViewModel state, dispatch user events
- **ViewModel:** Custom React hooks (`hooks/`) — manage presentation state, expose action handlers, subscribe to service outputs via React Context
- **Model:** Domain entities (TypeScript-style JS interfaces) — Customer, Product, Transaction, Sale, Prediction

#### 3.5.2 Backend Architecture

The Node.js cloud backend follows a strict layered architecture with clean separation of concerns:

```
  ┌────────────────────────────────────────────────┐
  │             ROUTES LAYER                        │
  │  /api/auth/*  (authRoutes.js)                   │
  │  /api/v1/*    (markovRoutes.js)                 │
  │  /health      (healthCheck)                     │
  └─────────────────┬──────────────────────────────┘
                    │ delegates to
  ┌─────────────────▼──────────────────────────────┐
  │             CONTROLLER LAYER                    │
  │  authController.js                              │
  │  v1/markovController.js                         │
  │  (Request validation, response envelope shaping)│
  └─────────────────┬──────────────────────────────┘
                    │ calls
  ┌─────────────────▼──────────────────────────────┐
  │             SERVICE LAYER                       │
  │  authService, markovService, forecastService    │
  │  trustService, emailService, fallbackEngine     │
  └─────────────────┬──────────────────────────────┘
                    │ persists to
  ┌─────────────────▼──────────────────────────────┐
  │           MODEL LAYER (Mongoose ODM)            │
  │  User.js: credentials, OTP, PIN, verification  │
  │  RefreshToken.js: token hash, family, expiry   │
  └─────────────────┬──────────────────────────────┘
                    │ cross-cuts all layers
  ┌─────────────────▼──────────────────────────────┐
  │            MIDDLEWARE LAYER                     │
  │  authMiddleware.js  → JWT validation, req.user_id│
  │  rateLimitMiddleware.js → per-route limits       │
  │  Helmet.js → 8 HTTP security headers             │
  │  Zod       → runtime schema validation           │
  └────────────────────────────────────────────────┘
```

#### 3.5.3 Design Patterns Applied

Eight canonical software design patterns [13][16] are applied across HISAB's modules:

| Module | Primary Pattern | Secondary Pattern | Rationale |
|---|---|---|---|
| Database Layer | **Repository** | Singleton | Abstracts all SQLite operations behind interfaces; single DB connection |
| Voice Engine | **Adapter** | Strategy | Uniform interface over TFLite model; swappable backend (TFLite / cloud) |
| OCR Engine | **Adapter** | Template Method | Fixed two-stage pipeline template with pluggable stage implementations |
| Prediction Engine | **Strategy** | Factory | Markov and rule-based reorder as interchangeable algorithm strategies |
| State Management | **Observer** | Pub/Sub | React Context subscriptions; screens reactively update on data change events |
| Service Layer | **Facade** | Dependency Injection | Simplifies multi-step operations (baki entry + audit + sync queue) into single calls |
| Input Handling | **Command** | Chain of Responsibility | Voice and touch actions encapsulated as executable Command objects |
| UI Components | **Composite** | Decorator | Complex screens composed from atomic reusable components with behavioral augmentation |

#### 3.5.4 Database Schema

The local SQLite database defines twelve primary tables. All transactional tables include a `user_id` column enforcing per-user data isolation:

| Table | Purpose | Key Columns |
|---|---|---|
| `users` | Local user identity and credentials | id, email, password_hash, pin_hash, device_id_hash, pin_enabled |
| `auth_sessions` | Token storage with server sync state | user_id, access_token, refresh_token, server_synced, created_at |
| `pending_sync_queue` | Deferred backend operation queue | id, operation, payload (JSON), retry_count, status, created_at |
| `customers` | Customer profiles and risk state | id, user_id, name, phone, nickname, total_baki, trust_score |
| `baki_entries` | Running balance cache per customer | customer_id, current_balance, last_updated |
| `baki_transactions` | Credit and payment event log | id, customer_id, user_id, type, amount, note, created_at |
| `products` | Product catalog | id, user_id, name, price, cost_price, stock, threshold, expiry_date |
| `stock_movements` | Stock change audit trail | id, product_id, user_id, type, qty_before, qty_after, created_at |
| `sales` | Sale transaction header | id, user_id, customer_id, total, is_baki, created_at |
| `sale_items` | Sale line items | id, sale_id, product_id, quantity, price |
| `weekly_sales` | Weekly demand aggregation for Markov | id, product_id, week_start, units_sold, state |
| `audit_logs` | Immutable mutation audit trail | id, user_id, action, entity, entity_id, metadata (JSON), timestamp |

---

### 3.6 Data Flow and Workflow

#### 3.6.1 Core Transaction Flow (Baki Entry)

```
User Input (Voice Command / Touch Form)
    │
    â–¼
Intent Parser: Voice FSM validates completeness / UI form validates fields
    │
    â–¼
Validation Layer:
    ├── Amount > 0 (non-zero guard)
    ├── Customer exists (customer_id in customers table)
    └── User is authenticated (session active)
    │
    â–¼
BakiService.addCredit(customerId, amount, note, userId)
    │
    ├── BEGIN TRANSACTION (SQLite atomic)
    ├── INSERT INTO baki_transactions
    │       (customer_id, type='credit', amount, note, user_id, created_at)
    ├── UPDATE customers
    │       SET total_baki = total_baki + amount, updated_at = NOW()
    │       WHERE id = customerId AND user_id = userId
    ├── INSERT INTO audit_logs
    │       (action='BAKI_ADD', entity='customer', entity_id=customerId,
    │        metadata={prev_balance, new_balance, amount}, user_id, timestamp)
    ├── COMMIT TRANSACTION
    └── PUSH to pending_sync_queue
            (operation='BAKI_ADD', payload={...}) [if cloud sync enabled]
    │
    â–¼
React Context dispatch: UPDATE_CUSTOMER_BALANCE action
    │
    â–¼
Dashboard KPI recomputed → "Total Outstanding" card refreshed
```

#### 3.6.2 Demand Forecasting Flow

```
Trigger: StockSuggestionsScreen mounted / Pull-to-refresh
    │
    â–¼
For each product in catalog:
  READ weekly_sales WHERE product_id=X ORDER BY week_start DESC LIMIT 12
    │
    â–¼
Classify units_sold → State sequence [LOW, MEDIUM, HIGH, ...]
    │
    â–¼
Depth check:
  ≥ 12 weeks → Full Markov + walk-forward evaluation
  4–11 weeks → Laplace-smoothed Markov (α=1 prior)
  < 4 weeks  → Rule-based reorder (avg consumption × safety stock days)
    │
    â–¼
Build row-normalized Transition Matrix P from state sequence
    │
    â–¼
π_{t+1} = π_t × P    (current state distribution × P)
    │
    â–¼
Confidence gate: max(Ï€_{t+1}) > threshold?
  Yes → accept Markov prediction
  No  → invoke fallback engine (safety: always returns a valid recommendation)
    │
    â–¼
Apply Bangladesh context multipliers (calendar/seasonal lookup)
    │
    â–¼
Compute recommendedQty = base_demand × multiplier × predicted_state_factor
    │
    â–¼
Emit: {productId, predictedState, confidence, recommendedQty, action (Bengali label)}
    │
    â–¼
Rank products by urgency (days_remaining ascending) → display on screen
```

#### 3.6.3 Voice Command Processing Flow

```
User taps mic → expo-audio starts recording at 16kHz mono WAV
    │
    â–¼
User completes utterance → stop recording triggered
    │
    â–¼
Mel Spectrogram: 80 mel bins, 25ms Hamming window, 10ms hop, log-magnitude
    │
    â–¼
CNN Encoder: Conv1d(80→128) → ReLU → Conv1d(128→64) → ReLU → Conv1d(64→32)
    │
    ├── Intent Classifier: Linear(32,5) → Softmax → argmax → intent class
    └── Number Extractor: Attention(32) → CTC decoder → Bengali digit string → int
    │
    â–¼
Name Matcher: tokenize utterance → compute Levenshtein distance to all customer names
              → return best match if distance ≤ 2
    │
    â–¼
Voice FSM: validate entity completeness for detected intent
    ├── add_baki: {customer ✓, amount ✓} → COMPLETE
    ├── payment:  {customer ✓, amount ✓} → COMPLETE
    ├── query:    {scope ✓}              → COMPLETE
    └── sale:     {product ✓, qty ✓}     → COMPLETE
    │
    â–¼
Multi-step Review Wizard → user confirms each entity slot
    │
    â–¼
Command Executor dispatches to service layer (BakiService / SalesService / etc.)
    │
    â–¼
voiceAnalyticsLogger.record({intent, latency_ms, slot_accuracy, success})
```

#### 3.6.4 OCR Pipeline Flow (Handwritten Khata)

```
User taps "Scan Khata" → Camera UI launches (expo-camera)
    │
    â–¼
User photographs khata page → raw JPEG image captured
    │
    â–¼
Stage 1: Image Preprocessing
    ├── Grayscale conversion
    ├── Otsu's adaptive binarization (global threshold optimization)
    ├── Deskew correction (Hough line transform on horizontal baselines)
    └── 5×5 Gaussian noise kernel removal
    │
    â–¼
Stage 1: Line Detector CNN (~2 MB TFLite)
    └── Output: [{y_top, y_bottom, x_left, x_right, confidence}] per text row
    │
    â–¼
For each detected text row:
    │
    ├── Number Region Detector CNN (~1 MB TFLite)
    │   └── Output: bounding boxes of right-aligned digit sequences
    │
    ├── Bengali Digit Recognizer CNN (~3 MB TFLite)
    │   └── Input: cropped digit region → Output: digit string → integer amount
    │
    └── Name Region Matcher (no ML)
        └── Extract left text → fuzzy Levenshtein match → customer DB entry
    │
    â–¼
Structured output: [{name, name_confidence, amount, amount_confidence, boundingBox}]
    │
    â–¼
OCR Review Screen: display each detected entry with confidence color indicators
    │
    â–¼
User confirms / corrects entries → batch INSERT to baki_transactions
```

---

### 3.7 Algorithms and Logic

#### 3.7.1 Markov Chain Demand Forecasting

The demand forecasting engine models each product's weekly sales volume as a discrete-state, first-order Markov process. The three demand states — **LOW** (< 20 units/week), **MEDIUM** (20–49 units/week), and **HIGH** (≥ 50 units/week) — are defined based on the realistic weekly sales volumes observed in Bangladeshi general stores.

**Transition Matrix Construction:**

Given a sequence of observed weekly states S = [s₁, s₂, ..., sₙ], the transition count matrix C is built as:

```
C[i][j] = count of consecutive pairs (s_t = i, s_{t+1} = j), for t = 1..n-1
```

Laplace smoothing (α = 1) is applied to prevent zero-probability transitions: `C[i][j] += 1`

Row normalization yields the probability matrix P:
```
P[i][j] = C[i][j] / Σⱼ C[i][j]
```

**State Prediction:**

Current state vector π_t (one-hot for the most recent week's observed state) is multiplied by P to obtain the next-week state probability distribution:
```
π_{t+1} = π_t × P
```

The predicted state is `argmax(Ï€_{t+1})`. The confidence is `max(Ï€_{t+1})`.

**Example Computation (Condensed):**

Weekly sales: [35, 42, 55, 48, 22, 18] → States: [MED, MED, HIGH, MED, MED, LOW]

Transition Matrix P (with Laplace smoothing):

```
         LOW    MED    HIGH
LOW    [ 0.50   0.33   0.17 ]
MED    [ 0.17   0.50   0.33 ]
HIGH   [ 0.17   0.67   0.17 ]

Current state = MED:  π_t = [0, 1, 0]
Ï€_{t+1} = [0.17, 0.50, 0.33]
→ Predicted: MEDIUM (50% confidence) → action: "ঠিক আছে"
```

**Bangladesh Context Multipliers:**

| Period | Multiplier | Rationale |
|---|---|---|
| Ramadan (30 days) | ×1.4 | Increased food/beverage consumption |
| Eid ul-Fitr (±1 week) | ×2.0 | Pre-Eid shopping surge |
| Eid ul-Adha (±1 week) | ×1.5 | Sacrificial animal period spending |
| Pahela Baishakh | ×1.3 | Bengali New Year celebrations |
| Market Day (hatbar) | ×1.25 | Weekly rural market footfall increase |
| Month Start (days 1–5) | ×1.2 | Post-salary spending increase |
| Harvest Season | ×1.3 | Rural income influx period |
| Summer (April–June) | ×1.3 | Beverages; cooling product demand |
| Rainy Season (June–Sep) | ×0.8 | Reduced customer footfall |

#### 3.7.2 Customer Trust Scoring Algorithm

Each customer receives a trust score T ∈ {1, 2, 3, 4, 5} computed by a five-feature rule-based classifier:

```
Features:
  F1: total_baki          — current outstanding balance (BDT)
  F2: avg_repayment_days  — mean days between credit and payment
  F3: delayed_count       — payments that took > 30 days
  F4: transaction_count   — total transactions (relationship length proxy)
  F5: last_payment_days   — days since most recent payment

Algorithm:
  score = 3   (neutral baseline)

  IF F1 > 5000:      score -= 1   (high unresolved debt)
  IF F2 > 30:        score -= 1   (consistently slow payer)
  IF F3 > 2:         score -= 1   (frequent late payments)
  IF F4 > 20:        score += 1   (long, active relationship)
  IF F5 < 7:         score += 1   (recently active payer)

  T = clamp(score, min=1, max=5)

UI Mapping:
  T = 4–5 → Green indicator   ("Low Risk — extend credit freely")
  T = 3   → Amber indicator   ("Medium Risk — monitor balance")
  T = 1–2 → Red indicator     ("High Risk — limit or refuse credit")
```

#### 3.7.3 Hybrid Authentication Decision Logic

```
ON APP LAUNCH:
  IF local_session_exists AND session_not_expired:
    IF backend_reachable:
      attempt token_refresh()
      IF success: update auth_session, continue
      IF fail (network): use local session, queue refresh for later
    ELSE:
      use local session directly (full offline mode)
  ELSE:
    redirect to LoginScreen

ON LOGIN (online path):
  1. POST /api/auth/login {email, password}
  2. Server: bcrypt.compare(password, hash) + account_lock check + email_verified check
  3. If all pass: issue JWT access_token (15 min) + refresh_token (long TTL, hashed)
  4. Client: store tokens in auth_sessions (SQLite)

ON LOGIN (offline path):
  1. Retrieve stored password_hash from users (SQLite)
  2. derivePasswordHash(inputPassword) → compare locally
  3. If match: restore session; queue server sync for later
  4. All business operations proceed via SQLite exclusively

ON TOKEN EXPIRY:
  1. Detect 401 from backend API call
  2. POST /api/auth/refresh {refreshToken}
  3. Server: verify token hash, check reuse (family invalidation if reused)
  4. Issue new access_token + new refresh_token
  5. Update auth_sessions; retry original request
```

#### 3.7.4 Rule-Based Reorder Suggestion Engine

The deterministic engine computes purchase recommendations when Markov prediction is unavailable:

```
For each product P where P.stock ≤ P.low_stock_threshold:

  Step 1: avg_daily_out =
    SUM(qty_out) / count_days_in_window
    FROM stock_movements WHERE product_id=P.id AND type='out'
    AND created_at >= NOW() - 30 days
    (default: 1.0 unit/day if no history)

  Step 2: days_remaining =
    MAX(P.stock, 0) / avg_daily_out

  Step 3: safety_stock_days = 14  (configurable)

  Step 4: recommended_qty =
    CEIL((safety_stock_days - days_remaining) × avg_daily_out)
    CLAMP(min=1)

  Step 5: urgency_rank = 1 / days_remaining  (higher = more urgent)

Output: sorted recommendations descending by urgency_rank
```

---

### 3.8 Technology Stack Justification

| Technology | Role | Justification |
|---|---|---|
| **React Native v0.81.5** | Cross-platform mobile UI | Single JS codebase targets Android (and future iOS); JavaScript familiarity; large ecosystem |
| **Expo SDK 54** | Native module management | Simplifies camera, audio, SQLite integration; managed build pipeline reduces DevOps overhead |
| **expo-sqlite v16** | Local offline data store | ACID-compliant; zero network dependency; supports complex aggregation queries for KPI dashboard |
| **React Navigation v7** | Screen routing | Declarative; supports bottom tabs, native stacks, drawer; well-maintained community standard |
| **React Context API** | Frontend state management | Lightweight Observer pattern; no Redux overhead for two-person project scale |
| **Node.js + Express.js v5** | Cloud API server | Non-blocking I/O for high-concurrency API; Express v5 async error handling improvements |
| **MongoDB + Mongoose v8** | Cloud database | Document model suits user-centric auth data; horizontal scaling; flexible schema evolution |
| **JWT (jsonwebtoken v9)** | Stateless auth tokens | Eliminates server-side session storage; compatible with offline-first (no server ping needed) |
| **bcrypt v6** | Password and PIN hashing | Adaptive work factor (12 rounds); resistant to brute-force; industry-standard KDF |
| **TensorFlow Lite** | On-device ML inference | Designed for mobile; INT8 quantization achieves 4× compression; CPU-only inference |
| **PyTorch + torchaudio** | ML model training | State-of-the-art; strong audio processing via torchaudio; ONNX export path to TFLite |
| **Helmet.js v8** | HTTP security headers | Prevents XSS, clickjacking, MIME sniffing via automatic security header injection |
| **Zod v4** | API schema validation | TypeScript-first runtime validation; eliminates manual parsing boilerplate; composable schemas |
| **PDFKit v0.15** | PDF generation | Pure JS PDF synthesis; no external service; receipts and summaries generated on-device or server |
| **Nodemailer v8** | Email delivery | OTP and recovery emails; supports SMTP providers (Gmail, SendGrid, etc.) |
| **Git + GitHub** | Version control and project management | Feature branching (feature/A/weekN, feature/B/weekN); weekly integration via PRs; Issues for sprint |

---

### 3.9 Security Design

Security is treated as a first-class design concern given that HISAB handles financial transaction records. The design implements **defense-in-depth** — multiple independent security layers so that failure of one layer does not compromise the system:

**Layer 1 — Transport Security:**
- All client-server communication requires HTTPS (TLS 1.2+)
- Helmet.js injects eight security headers: HSTS, Content-Security-Policy, X-Frame-Options, X-Content-Type-Options, Referrer-Policy, X-DNS-Prefetch-Control, X-Download-Options, X-Permitted-Cross-Domain-Policies
- CORS configured to allow only registered mobile app origins

**Layer 2 — Authentication Security:**
- Passwords: bcrypt hashed with 12 salt rounds (~180ms computation — costly enough to resist brute force)
- JWT access tokens: 15-minute TTL minimizes exposure window if token is intercepted
- Refresh tokens: bcrypt-hashed in MongoDB; plain-text transmitted once and never persisted
- Token family revocation: refresh token reuse (replay attack) triggers family-wide invalidation
- OTP: SHA-256 hashed in storage; single-use (`otp_used` flag); expires in 10 minutes; resend cooldown 60 seconds
- PIN: bcrypt hashed server-side; device-bound via hashed device ID; locked after 5 failed attempts for 15 minutes

**Layer 3 — Rate Limiting:**
- Login: 10 requests / 15-minute window per IP → returns HTTP 429 with `Retry-After`
- OTP request/confirm: 5 requests / 10-minute window
- PIN login: 5 requests / 10-minute window

**Layer 4 — Data Isolation:**
- All SQLite domain queries filter by `WHERE user_id = ?` parameter binding
- Migration backfill ensures legacy records are scoped to the migrating user
- No cross-user join is possible in any currently implemented query

**Layer 5 — Audit and Accountability:**
- All financial mutations produce an immutable `audit_logs` entry in the same atomic transaction
- All high-risk authentication events (OTP issued, OTP failed, PIN locked, token reuse detected) are recorded in a `security_events` table

---

### 3.10 MLOps Pipeline Design

The Markov forecasting system implements production-grade ML lifecycle governance adapted from enterprise MLOps patterns [19]:

```
┌─────────────────────────────────────────────────────────────────┐
│                      MLOPS PIPELINE                             │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  1. DATA LAYER                                                  │
│     weekly_sales (SQLite) → aggregation → backend/data/         │
│                                                                 │
│  2. EVALUATION (leakage-safe)                                   │
│     walkForward.js:   rolling-origin splits, strict chronology  │
│     leakageChecks.js: detect future data in training window     │
│     metrics.js:       calibration error, discrimination score   │
│     economicMetrics.js: hit rate, gain/loss ratio               │
│                                                                 │
│  3. ROBUSTNESS                                                  │
│     stressTest.js:   scenario execution (regime shift, spike)   │
│     robustness.js:   stability score under noisy inputs         │
│                                                                 │
│  4. MODEL GOVERNANCE                                            │
│     modelRegistry.js: version registration, activation, rollback│
│                                                                 │
│  5. STAGED ROLLOUT                                              │
│     featureFlag.js:  5% → 25% → 50% → 100%                     │
│                      deterministic hash-based user assignment   │
│                      rollback trigger: drift / instability      │
│                                                                 │
│  6. PRODUCTION MONITORING                                       │
│     driftDetector.js:    distribution shift detection           │
│     stabilityChecker.js: transition matrix stability monitoring │
│                                                                 │
│  7. AUTOMATED LIFECYCLE                                         │
│     lifecycleScheduler.js: cron-based job orchestrator          │
│     recalibrationJob.js:   monthly parameter update             │
│     (quarterly retraining path: full model rebuild)             │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

### 3.11 Conclusion

This chapter has presented the complete methodology underlying the HISAB system in structured detail. The Hybrid Agile-V development model provides the documentation rigor required for academic and regulatory compliance while preserving the iterative flexibility necessary for a two-person team building a novel product under time and resource constraints. The formal problem decomposition reveals five distinct sub-problems requiring coordinated solutions spanning database engineering, machine learning, HCI, and cybersecurity domains. The use case analysis, entity-relationship model, and constraint analysis collectively provide the logical foundation from which all design decisions flow.

The Clean Architecture with MVVM pattern, eightW)    P(LOW→MEDIUM)    P(LOW→HIGH)    |
    | P(MED→LOW)    P(MED→MEDIUM)    P(MED→HIGH)    |
    | P(HIGH→LOW)   P(HIGH→MEDIUM)   P(HIGH→HIGH)   |
```

Each element P(i→j) represents the empirical probability of transitioning from demand state *i* in week *t* to demand state *j* in week *t+1*, computed from the frequency of observed state transitions in the historical data window.

The predicted state distribution for the next week is computed as:

```
