# 📘 Software Solution Document

## Project: Hisab – Smart Retail Assistant for Small Stores in Bangladesh

## 1. Executive Summary

Small retail shop owners in Bangladesh rely heavily on manual processes such as handwritten ledgers (“baki khata”), memory-based stock tracking, and informal customer management. These methods are error-prone, time-consuming, and limit business growth.

Hisab is a mobile-first intelligent retail management system designed specifically for small দোকান (general stores). It digitizes daily operations including credit tracking, inventory management, expiry monitoring, and supplier coordination.

The system integrates:

- Offline-first mobile app
- AI-powered voice assistant (Bangla-first interaction)
- Predictive analytics using stochastic models (Markov Chain)
- Smart customer trust scoring
- Seamless mobile payment integration (bKash/Nagad)

The goal is to increase efficiency, reduce losses, and empower small business owners with data-driven decisions.

## 2. Problem Statement

### Current Challenges Faced by Shop Owners

#### 📒 Manual Credit Management (“Baki”)

Handwritten ledgers are prone to:

- Errors
- Loss or damage
- Difficulty tracking repayments
- No automated reminders for customers

#### 📦 Inventory Issues

- No real-time stock visibility
- Overstocking or understocking
- Expired products often overlooked → financial loss

#### 🧾 Lack of Transaction Records

- No receipts → poor accountability
- Hard to track daily/monthly profit

#### 🧠 Cognitive Overload

Owner must remember:

- Customer debts
- Stock levels
- Supplier offers
- Seasonal demand

#### 🔊 Communication Gap

- Busy environment → no time for manual entry
- Low digital literacy → typing is difficult

#### 💸 Trust Issues

No structured way to evaluate:

- Customer creditworthiness
- Payment behavior

#### 🌐 Connectivity Constraints

- Rural areas often lack stable internet

## 3. Proposed Solution

### 🎯 High-Level Approach

Hisab will be an AI-powered offline-first mobile application that automates retail shop operations using voice and smart analytics.

### 🧱 Technology Stack

| Layer | Technology |
| --- | --- |
| Frontend | React Native / Flutter |
| Backend | Node.js + Express |
| Database (Local) | SQLite |
| Database (Cloud) | MongoDB / Firebase |
| AI Voice | Whisper / Vosk (offline speech recognition) |
| ML Models | Python (Markov Chain, forecasting) |
| Sync Engine | Custom offline-first sync (CRDT or queue-based) |
| Payment Integration | bKash API, Nagad API |
| Deployment | Vercel / AWS / Firebase |

### 💡 Key Innovations

- 🎙️ Voice-first interaction (Bangla supported)
- 📊 Markov Chain-based demand prediction
- 🔒 Customer Trust Score System
- 📡 Offline-first architecture with auto-sync
- 🧠 AI-driven expiry & counterfeit detection

## 4. System Architecture

### 🏗️ High-Level Architecture

```text
[ Mobile App (Offline First) ]
        |
        | Local Storage (SQLite)
        |
[ Sync Engine ] <----> [ Cloud Backend (Node.js + MongoDB) ]
        |
        |-----------------------------|
        |                             |
[ AI Voice Module ]         [ ML Prediction Engine ]
        |                             |
[ Speech-to-Text ]         [ Markov Chain Model ]
```

### 🔄 Data Flow

1. User speaks → Voice captured
2. Speech-to-text converts to command
3. App processes update stock / baki / transaction
4. Data saved locally (SQLite)
5. Sync engine uploads to cloud when online
6. ML engine analyzes data → predictions returned

### 🧩 Core Components

- Mobile App Layer
- Voice Processing Module
- Inventory Management Engine
- Credit Tracking System
- Prediction Engine
- Payment Gateway Module
- Sync Engine

## 5. Functional Requirements

### 📦 Inventory Management

- Add/update/delete products
- Track stock levels
- Expiry date alerts
- Auto-reorder suggestions

### 💳 Baki Management

- Add customer credit
- Track repayments
- Daily/weekly/monthly summaries
- Automated reminders

### 🎙️ Voice Assistant

- Voice commands in Bangla
- Example:
  - “Rahim 50 taka baki”
  - “Stock koto ase?”

### 🧾 Transaction System

- Silent logging of transactions
- Optional receipt generation
- Barcode scanning

### 📊 Analytics Dashboard

- Sales trends
- Demand forecasting
- Seasonal insights

### 🤝 Trust Score System

Based on:

- Payment history
- Frequency of delays
- Community data (future scope)

### 💸 Payment Integration

- bKash / Nagad payments
- Payment tracking

### 📡 Offline Mode

- Full functionality without internet
- Auto-sync when connected

## 6. Non-Functional Requirements

### ⚡ Performance

- App response time < 2 seconds
- Voice processing < 3 seconds

### 🔒 Security

- Data encryption (AES)
- Secure payment APIs
- Role-based access

### 📈 Scalability

- Modular microservices architecture
- Cloud scaling (AWS/Firebase)

### 📴 Reliability

- Offline-first guarantee
- Conflict resolution during sync

### 🌍 Usability

- Bangla-first UI
- Minimal typing
- Voice-driven interaction

## 7. Implementation Plan

### 📅 Phase Breakdown

| Phase | Duration | Tasks |
| --- | --- | --- |
| Phase 1 | 2 weeks | Requirements + UI/UX design |
| Phase 2 | 3 weeks | Core app (inventory + baki) |
| Phase 3 | 2 weeks | Voice assistant integration |
| Phase 4 | 2 weeks | ML model (Markov Chain) |
| Phase 5 | 1 week | Payment integration |
| Phase 6 | 2 weeks | Testing + optimization |
| Phase 7 | 1 week | Deployment |

### 👥 Team Allocation (2 Members)

- Member 1 (Frontend + Voice)
- Member 2 (Backend + ML + Sync)

## 8. Testing & Quality Assurance

### 🧪 Testing Types

- Unit Testing
- Integration Testing
- UI Testing
- Offline/Sync Testing
- Voice Accuracy Testing

### ✅ Acceptance Criteria

- 95% accuracy in voice commands
- Zero data loss during offline sync
- Correct prediction trends (baseline accuracy >70%)

## 9. Deployment & Maintenance

### 🚀 Deployment Strategy

- Beta testing with local দোকান owners
- Gradual rollout (region-wise)

### 📊 Monitoring

- Crash analytics (Firebase Crashlytics)
- Usage analytics
- Sync logs

### 🔧 Maintenance

- Regular updates
- Model retraining
- Feature improvements based on feedback

## 10. Risks & Mitigation

| Risk | Impact | Mitigation |
| --- | --- | --- |
| Low digital literacy | High | Voice-first UX |
| Poor internet | High | Offline-first system |
| Voice recognition errors | Medium | Train Bangla dataset |
| Data sync conflicts | Medium | Conflict resolution logic |
| Trust score misuse | High | Transparent scoring rules |

## 🎓 Research Paper Angle (Very Important)

Potential publication tracks:

- “Offline-first AI-driven Retail Management System for Developing Economies”
- “Markov Chain-based Demand Forecasting in Small Retail Shops”
- “Voice-enabled Financial Tracking for Low-Literacy Users”
