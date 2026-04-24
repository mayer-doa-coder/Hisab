# Phase 5: Secure Execution Layer

## Execution Pipeline

FSM in `CONFIRMED` state -> structured payload builder -> validation -> RBAC check -> idempotency key -> backend execution endpoint mapping.

## Structured Payload Contract

Voice execution sends only normalized command payload:

```json
{
  "intent": "ADD_DEBT",
  "customer_id": "123",
  "amount": 50,
  "date": "2026-04-21",
  "confidence": 0.95
}
```

No raw ASR transcript is used for execution decisions.

## Idempotency

Key format:

- `idemp_<user>_<timestamp>_<hash>`

Frontend:

- generates deterministic key per payload signature
- reuses same key for same command payload replay in-session

Backend:

- existing `withIdempotency(...)` middleware stores key + payload hash
- duplicate replay with same hash returns existing response
- key reused with different payload returns conflict

## RBAC

Execution roles:

- Owner: all command intents
- Cashier: ADD_DEBT, PAYMENT, SALE
- Manager (mapped to STOCK_MANAGER): ADD_DEBT, PAYMENT, SALE, VOID

## Risk Confirmation Policy

- LOW: small sales
- MEDIUM: debt/payment
- HIGH: large amounts, delete/void

Rule:

- HIGH risk requires `CONFIRMED` state; no auto execution

## Intent to API Mapping

- ADD_DEBT -> `/api/v1/baki/credits`
- PAYMENT -> `/api/v1/baki/payments`
- SALE -> `/api/v1/transactions` with `transactionType=sale`

All mapped endpoints require `Idempotency-Key` and pass through backend auth + permission middleware.

## Response Contract

```json
{
  "status": "SUCCESS|FAILED",
  "message": "...",
  "data": {},
  "idempotency_key": "idemp_..."
}
```

## Example Execution Flow

1. Voice FSM enters `CONFIRMED`
2. Voice screen resolves customer name to `customer_id`
3. Executor validates payload
4. Executor checks role permissions
5. Executor enforces risk policy
6. Executor generates idempotency key
7. Backend executes mapped API with idempotency protection
8. UI renders success/error message
