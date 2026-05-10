# Deterministic Voice FSM Design (Hisab)

## 1) State Machine Diagram

```text
WAIT_INTENT -> WAIT_NAME -> WAIT_AMOUNT -> WAIT_DATE -> REVIEW -> CONFIRM -> EXECUTE
                     ^             ^             ^            ^
                     |             |             |            |
                  back          back          back         back

Global from any state: cancel -> WAIT_INTENT (CANCELLED)
Global from any state: repeat -> replay prompt
Global from any state: next -> deterministic forward where allowed
```

## 2) Token Grammar By State

- WAIT_INTENT:
  - baki
  - joma
  - becha
  - kinbo
- WAIT_NAME:
  - customer names from local DB
  - fuzzy match allowed with ambiguity checks
- WAIT_AMOUNT:
  - numeric token only
  - Bangla digits supported
- WAIT_DATE:
  - aj
  - kal
  - explicit date (YYYY-MM-DD or DD-MM-YYYY)
  - optional via global next
- REVIEW:
  - no business token, only global controls
- CONFIRM:
  - confirm
  - yes
  - na
  - cancel

Global controls in all states:
- next
- back
- cancel
- repeat

## 3) Transition Logic Summary

- WAIT_INTENT + valid intent -> WAIT_NAME
- WAIT_NAME + valid name -> WAIT_AMOUNT
- WAIT_AMOUNT + valid amount -> WAIT_DATE
- WAIT_DATE + valid date -> REVIEW
- WAIT_DATE + next -> REVIEW (date skipped)
- REVIEW + next -> CONFIRM
- CONFIRM + na/cancel -> WAIT_INTENT (CANCELLED)
- CONFIRM + yes/confirm -> EXECUTE (CONFIRMED)
- High risk:
  - amount >= threshold OR intent in becha/kinbo
  - requires explicit token `confirm`

## 4) Error Handling Rules

- Invalid token:
  - state does not change
  - assistant returns guided prompt for the current state
- Ambiguity:
  - returns top candidates
  - asks "Did you mean X or Y?"
  - UI enables touch fallback selection
- Timeout:
  - 2 retries max
  - then flow auto-cancels

## 5) Output Contract

```json
{
  "intent": "string|null",
  "name": "string|null",
  "amount": 0,
  "date": "YYYY-MM-DD|null",
  "confidence": 0,
  "status": "READY|CONFIRMED|CANCELLED"
}
```

## 6) Example Flows

### Flow A: baki with date
- WAIT_INTENT: baki
- WAIT_NAME: rahim
- WAIT_AMOUNT: 500
- WAIT_DATE: aj
- REVIEW: next
- CONFIRM: confirm
- EXECUTE

### Flow B: joma without date
- WAIT_INTENT: joma
- WAIT_NAME: karim
- WAIT_AMOUNT: 1200
- WAIT_DATE: next
- REVIEW: next
- CONFIRM: yes
- EXECUTE

### Flow C: ambiguous name
- WAIT_NAME input: rahi
- System: Did you mean Rahim or Rahima?
- User selects candidate
- Continue WAIT_AMOUNT
