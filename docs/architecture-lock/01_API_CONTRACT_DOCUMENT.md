# Hisab API Contract Document

Version: 1.0 (Architecture Lock)
Date: 2026-04-10
Scope: Production API contracts for domain modules beyond auth

## 1. Contract Standards

Base path:
- `/api/v1`

Transport and format:
- HTTPS only in production
- `Content-Type: application/json`
- `Accept: application/json`
- UTF-8 payloads only

Authentication:
- `Authorization: Bearer <access_token>` required for all routes in this document
- JWT `sub` or `user_id` claim is the ownership root

Success envelope:
```json
{
  "requestId": "7f5fbe31-8fdb-4c4d-a71b-5e6b4be5dd61",
  "timestamp": "2026-04-10T09:25:11.224Z",
  "data": {}
}
```

Error envelope:
```json
{
  "requestId": "7f5fbe31-8fdb-4c4d-a71b-5e6b4be5dd61",
  "timestamp": "2026-04-10T09:25:11.224Z",
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "name is required",
    "details": [
      { "field": "name", "reason": "required" }
    ]
  }
}
```

Pagination standard:
- Request query: `page` (1+), `pageSize` (1..100), `sortBy`, `sortOrder`
- Response metadata:
```json
{
  "page": 1,
  "pageSize": 20,
  "total": 245,
  "hasNext": true
}
```

Idempotency standard for mutation endpoints:
- Header: `Idempotency-Key`
- Required for all `POST` and `PATCH` requests that mutate financial quantities
- Format: `hsb_<deviceId>_<entity>_<op>_<uuidv7>`
- Max length: 128 characters
- Duplicate key (same user + route + body hash): return original response with `200` or `201`
- Duplicate key with different body hash: `409 IDEMPOTENCY_KEY_REUSED_WITH_DIFFERENT_PAYLOAD`

Ownership enforcement standard:
- `userId` must be derived from validated JWT; never trusted from request body/query
- If resource exists but owned by another user: return `404 RESOURCE_NOT_FOUND` (no ownership leakage)
- Every query must include `WHERE user_id = <token_user_id>`

## 2. Common Validation Rules

Field constraints:
- `name`: string, trim, 1..120
- `note`: string, trim, 0..500
- `phone`: `^\+?[0-9]{8,15}$`
- Money fields: decimal with max 2 fraction digits, range `0.01` to `99999999.99`
- Quantity fields: integer range `0` to `9999999`
- Date fields: ISO-8601 UTC string

Common errors:
- `400 VALIDATION_ERROR`
- `401 UNAUTHORIZED`
- `403 FORBIDDEN` (reserved for role-based controls)
- `404 RESOURCE_NOT_FOUND`
- `409 CONFLICT`
- `409 IDEMPOTENCY_KEY_REUSED_WITH_DIFFERENT_PAYLOAD`
- `422 BUSINESS_RULE_VIOLATION`
- `429 RATE_LIMITED`
- `500 INTERNAL_ERROR`

## 3. Products API

### 3.1 Create Product
- Method/Route: `POST /api/v1/products`
- Idempotency: required

Request schema:
```json
{
  "name": "ACI Salt 1kg",
  "sku": "ACI-SALT-1KG",
  "unit": "pcs",
  "price": 55.0,
  "quantityOnHand": 40,
  "reorderLevel": 10,
  "expiryDate": "2026-12-30T00:00:00.000Z"
}
```

Response schema:
```json
{
  "requestId": "uuid",
  "timestamp": "iso",
  "data": {
    "productId": "prd_01JQ2X2M5F7PH9Y3VJH5J2V2QW",
    "name": "ACI Salt 1kg",
    "sku": "ACI-SALT-1KG",
    "unit": "pcs",
    "price": 55,
    "quantityOnHand": 40,
    "reorderLevel": 10,
    "expiryDate": "2026-12-30T00:00:00.000Z",
    "version": 1,
    "createdAt": "iso",
    "updatedAt": "iso"
  }
}
```

Validation rules:
- `name` required
- `sku` optional, unique per user if provided
- `price >= 0`
- `quantityOnHand >= 0`
- `reorderLevel >= 0`
- `expiryDate` if present must be future or current date

Error responses:
- `409 PRODUCT_SKU_ALREADY_EXISTS`
- `422 INVALID_EXPIRY_DATE`

Ownership enforcement:
- Insert with `user_id` from token

### 3.2 List Products
- Method/Route: `GET /api/v1/products?page=1&pageSize=20&search=salt&lowStockOnly=false&expiringWithinDays=7`

Response schema:
```json
{
  "requestId": "uuid",
  "timestamp": "iso",
  "data": {
    "items": [
      {
        "productId": "prd_...",
        "name": "ACI Salt 1kg",
        "sku": "ACI-SALT-1KG",
        "unit": "pcs",
        "price": 55,
        "quantityOnHand": 40,
        "reorderLevel": 10,
        "expiryDate": "2026-12-30T00:00:00.000Z",
        "version": 3,
        "updatedAt": "iso"
      }
    ],
    "page": 1,
    "pageSize": 20,
    "total": 1,
    "hasNext": false
  }
}
```

Validation rules:
- `expiringWithinDays` range: `0..365`

Ownership enforcement:
- Return only products for token user

### 3.3 Get Product by Id
- Method/Route: `GET /api/v1/products/{productId}`

Response schema:
- Same object as in list/create

Ownership enforcement:
- If `productId` not owned by user, return 404

### 3.4 Update Product
- Method/Route: `PATCH /api/v1/products/{productId}`
- Idempotency: recommended

Request schema:
```json
{
  "name": "ACI Salt 1kg Premium",
  "price": 58,
  "reorderLevel": 12,
  "expiryDate": "2026-12-30T00:00:00.000Z",
  "expectedVersion": 3
}
```

Validation rules:
- At least one mutable field required
- `expectedVersion` required for optimistic concurrency

Error responses:
- `409 VERSION_CONFLICT`

Ownership enforcement:
- Update only if `product_id` + `user_id` match

### 3.5 Delete Product
- Method/Route: `DELETE /api/v1/products/{productId}`

Response schema:
```json
{
  "requestId": "uuid",
  "timestamp": "iso",
  "data": {
    "deleted": true,
    "productId": "prd_..."
  }
}
```

Business rule:
- If product has unreconciled transactions, perform soft-delete (`isArchived=true`) instead of hard-delete

Error responses:
- `422 PRODUCT_HAS_ACTIVE_REFERENCES`

## 4. Customers API

### 4.1 Create Customer
- Method/Route: `POST /api/v1/customers`
- Idempotency: required

Request schema:
```json
{
  "name": "Karim Store",
  "phone": "+8801712345678",
  "address": "Mirpur, Dhaka",
  "creditLimit": 5000
}
```

Response schema:
```json
{
  "requestId": "uuid",
  "timestamp": "iso",
  "data": {
    "customerId": "cus_01JQ2Y2ZX5A6BZSVP2F3B4YKT8",
    "name": "Karim Store",
    "phone": "+8801712345678",
    "address": "Mirpur, Dhaka",
    "creditLimit": 5000,
    "version": 1,
    "createdAt": "iso",
    "updatedAt": "iso"
  }
}
```

Validation rules:
- `name` required
- `creditLimit` optional, if present `>= 0`

### 4.2 List Customers
- Method/Route: `GET /api/v1/customers?page=1&pageSize=20&search=karim&hasDue=true`

Response includes `totalDue`:
```json
{
  "requestId": "uuid",
  "timestamp": "iso",
  "data": {
    "items": [
      {
        "customerId": "cus_...",
        "name": "Karim Store",
        "phone": "+8801712345678",
        "totalDue": 1300,
        "riskLevel": "medium",
        "updatedAt": "iso"
      }
    ],
    "page": 1,
    "pageSize": 20,
    "total": 1,
    "hasNext": false
  }
}
```

### 4.3 Update Customer
- Method/Route: `PATCH /api/v1/customers/{customerId}`
- Idempotency: recommended

Request schema:
```json
{
  "name": "Karim Grocery",
  "phone": "+8801712345678",
  "address": "Section 10, Mirpur",
  "creditLimit": 7000,
  "expectedVersion": 2
}
```

Error responses:
- `409 VERSION_CONFLICT`

### 4.4 Delete/Archive Customer
- Method/Route: `DELETE /api/v1/customers/{customerId}`

Behavior:
- Hard-delete only if no due and no locked references
- Else archive

Error responses:
- `422 CUSTOMER_HAS_OUTSTANDING_DUE`

## 5. Baki (Credit Ledger) API

### 5.1 Add Credit Entry
- Method/Route: `POST /api/v1/baki/credits`
- Idempotency: required

Request schema:
```json
{
  "customerId": "cus_...",
  "amount": 500,
  "note": "Rice and oil",
  "occurredAt": "2026-04-10T08:30:00.000Z"
}
```

Response schema:
```json
{
  "requestId": "uuid",
  "timestamp": "iso",
  "data": {
    "ledgerEntryId": "bak_...",
    "type": "credit",
    "customerId": "cus_...",
    "amount": 500,
    "runningDue": 1800,
    "occurredAt": "iso",
    "createdAt": "iso"
  }
}
```

Validation rules:
- `amount > 0`
- customer must exist and be owned by user

### 5.2 Add Payment Entry
- Method/Route: `POST /api/v1/baki/payments`
- Idempotency: required

Request schema:
```json
{
  "customerId": "cus_...",
  "amount": 300,
  "paymentMethod": "cash",
  "note": "Partial payment",
  "occurredAt": "2026-04-10T08:40:00.000Z"
}
```

Business rules:
- Payment amount must not exceed current due

Error responses:
- `422 OVERPAYMENT_NOT_ALLOWED`
- `422 NO_OUTSTANDING_DUE`

### 5.3 Customer Ledger
- Method/Route: `GET /api/v1/baki/customers/{customerId}/ledger?from=...&to=...`

Response schema:
```json
{
  "requestId": "uuid",
  "timestamp": "iso",
  "data": {
    "customer": {
      "customerId": "cus_...",
      "name": "Karim Grocery"
    },
    "entries": [
      {
        "ledgerEntryId": "bak_...",
        "type": "credit",
        "amount": 500,
        "runningDue": 1800,
        "occurredAt": "iso"
      }
    ],
    "totalDue": 1800
  }
}
```

### 5.4 Baki Summary
- Method/Route: `GET /api/v1/baki/summary?from=...&to=...`

Response fields:
- `totalCredit`
- `totalPayments`
- `netDueChange`
- `collectionRate`
- `activeCustomers`

Ownership enforcement:
- every aggregation scoped by user

## 6. Inventory Movements API

### 6.1 Record Movement
- Method/Route: `POST /api/v1/inventory/movements`
- Idempotency: required

Request schema:
```json
{
  "productId": "prd_...",
  "movementType": "stock_out",
  "quantity": 3,
  "reason": "sale",
  "note": "Sold to walk-in customer",
  "occurredAt": "2026-04-10T09:00:00.000Z"
}
```

Allowed `movementType` values:
- `stock_in`
- `stock_out`
- `adjustment`
- `expiry_removal`

Validation rules:
- `quantity` must be positive integer
- `stock_out` and `expiry_removal` cannot produce negative stock

Response schema:
```json
{
  "requestId": "uuid",
  "timestamp": "iso",
  "data": {
    "movementId": "mov_...",
    "productId": "prd_...",
    "movementType": "stock_out",
    "quantityDelta": -3,
    "quantityBefore": 40,
    "quantityAfter": 37,
    "occurredAt": "iso",
    "createdAt": "iso"
  }
}
```

Error responses:
- `422 INSUFFICIENT_STOCK`

### 6.2 List Movements
- Method/Route: `GET /api/v1/inventory/movements?productId=prd_...&from=...&to=...&page=1&pageSize=50`

Response:
- paginated movement records scoped to user

## 7. Transactions API

Purpose:
- Unified financial transactions beyond baki ledger events (sale, purchase, expense, income)

### 7.1 Create Transaction
- Method/Route: `POST /api/v1/transactions`
- Idempotency: required

Request schema:
```json
{
  "transactionType": "sale",
  "amount": 850,
  "currency": "BDT",
  "customerId": "cus_...",
  "referenceType": "inventory_movement",
  "referenceId": "mov_...",
  "note": "Morning sale batch",
  "occurredAt": "2026-04-10T10:00:00.000Z"
}
```

Allowed `transactionType`:
- `sale`
- `purchase`
- `expense`
- `income`
- `credit_issue`
- `credit_payment`

Response schema:
```json
{
  "requestId": "uuid",
  "timestamp": "iso",
  "data": {
    "transactionId": "txn_...",
    "transactionType": "sale",
    "amount": 850,
    "currency": "BDT",
    "status": "posted",
    "occurredAt": "iso",
    "createdAt": "iso"
  }
}
```

### 7.2 List Transactions
- Method/Route: `GET /api/v1/transactions?type=sale&from=...&to=...&page=1&pageSize=50`

Response:
- paginated transaction list

### 7.3 Void Transaction
- Method/Route: `POST /api/v1/transactions/{transactionId}/void`
- Idempotency: required

Request schema:
```json
{
  "reason": "duplicate_entry",
  "voidedAt": "2026-04-10T11:00:00.000Z"
}
```

Business rule:
- Void creates compensating transaction entry; original record stays immutable

Error responses:
- `422 TRANSACTION_ALREADY_VOIDED`

## 8. Reports API

### 8.1 Dashboard Summary
- Method/Route: `GET /api/v1/reports/dashboard?from=...&to=...`

Response schema:
```json
{
  "requestId": "uuid",
  "timestamp": "iso",
  "data": {
    "totalCredit": 12000,
    "totalPayments": 8700,
    "netDue": 3300,
    "activeCustomers": 48,
    "lowStockProducts": 7,
    "expiringSoonProducts": 3,
    "stockMovementsToday": 14
  }
}
```

### 8.2 Sales Summary
- Method/Route: `GET /api/v1/reports/sales-summary?from=...&to=...&groupBy=day`

Validation:
- `groupBy`: `day|week|month`

### 8.3 Baki Aging Report
- Method/Route: `GET /api/v1/reports/baki-aging?asOf=...`

Response buckets:
- `0_7_days`
- `8_30_days`
- `31_60_days`
- `61_plus_days`

### 8.4 Inventory Health Report
- Method/Route: `GET /api/v1/reports/inventory-health?asOf=...`

Response fields:
- `totalSkus`
- `lowStockCount`
- `outOfStockCount`
- `expiringWithin7Days`
- `expiredCount`

## 9. Audit Logs API

Audit write policy:
- Clients do not directly create audit events for core business operations
- Audit records are server-generated from mutating endpoints and sync ingestion

### 9.1 List Audit Logs
- Method/Route: `GET /api/v1/audit-logs?entityType=product&action=create&from=...&to=...&page=1&pageSize=100`

Response schema:
```json
{
  "requestId": "uuid",
  "timestamp": "iso",
  "data": {
    "items": [
      {
        "auditId": "aud_...",
        "entityType": "product",
        "entityId": "prd_...",
        "action": "update",
        "metadata": {
          "before": { "price": 50 },
          "after": { "price": 55 }
        },
        "actorUserId": "usr_...",
        "source": "api",
        "occurredAt": "iso"
      }
    ],
    "page": 1,
    "pageSize": 100,
    "total": 1,
    "hasNext": false
  }
}
```

### 9.2 Get Audit Event by Id
- Method/Route: `GET /api/v1/audit-logs/{auditId}`

Ownership enforcement:
- Must belong to requesting user scope

## 10. Integration Compatibility Notes (Frontend-Backend-Database)

Contract-to-app mapping decisions:
1. Keep existing auth routes (`/api/auth/...`) active for current frontend compatibility.
2. Introduce new domain routes under `/api/v1/...` only.
3. Add frontend repository/service adapter layer:
   - `local-first read` from SQLite
   - `write-through queue` to sync protocol
4. Introduce explicit DTO mappers to translate:
   - SQLite integer IDs to API string IDs where needed
   - local timestamps to UTC ISO format
5. Preserve offline continuity: failed API writes are queued, never dropped.

Mandatory migration guardrails:
1. Do not remove current SQLite tables before sync parity is verified.
2. Add contract tests for every endpoint before frontend toggles hybrid-online mode.
3. Add shadow-read comparison mode for selected list endpoints during rollout.
