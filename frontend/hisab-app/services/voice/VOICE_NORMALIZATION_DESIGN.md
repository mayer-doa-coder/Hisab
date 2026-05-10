# Phase 2: Bengali Lexicon and Normalization

## Library Structure

- normalization/nameMatcher.js
- normalization/numberParser.js
- normalization/dateParser.js
- normalization/confidenceScorer.js
- normalization/normalizer.js
- normalization/testCorpus.bn.js
- normalization/index.js

## API Contract

```javascript
normalize(text, resources)
```

Returns:

```json
{
  "text": "string",
  "intent": "baki|joma|becha|kinbo|null",
  "name": "string|null",
  "nameType": "customer|product|branch|null",
  "amount": 0,
  "date": "YYYY-MM-DD|null",
  "confidence": {
    "name": 0,
    "amount": 0,
    "intent": 0,
    "date": 0,
    "overall": 0
  },
  "ambiguous": false,
  "candidates": [],
  "correctionPrompts": [],
  "shouldClarify": false
}
```

## Name Matching Logic

- Deterministic scoring only
- Alias-aware dictionary per entity type
- Matching features:
  - exact
  - prefix
  - Levenshtein distance similarity
  - phonetic similarity (Bangla transliteration + Banglish folding)
- Ambiguity when top-2 scores are too close

## Number Parsing Rules

- Bangla digit normalization: ০১২৩৪৫৬৭৮৯ -> 0123456789
- Numeric token parser supports integer and decimal
- Spoken parser supports common Bangla and Banglish words
  - panchash/pachash -> 50
  - eksho/sho -> 100
- Currency words stripped (taka, tk, টাকা)

## Date Parsing Rules

- Relative:
  - aj -> today
  - kal -> tomorrow
- Weekday:
  - shukrobar, robibar, etc.
- Explicit:
  - YYYY-MM-DD
  - DD/MM
  - DD-MM
  - `12 tarikh`

## Confidence Scoring

- Slot-level confidence:
  - name
  - amount
  - intent
  - date
- Weighted deterministic overall score
- Clarification trigger when overall below threshold

## Clarification Prompts

- Name ambiguity:
  - Did you mean Rahim or Karim?
- Low confidence fallback:
  - Please confirm the command details manually.

## Example Transformations

Input:
- `rahin pachash taka baki kal`

Output (shape):
- intent: baki
- name: Rahim
- amount: 50
- date: tomorrow ISO date
- confidence map with overall score

Input:
- `karim eksho joma aj`

Output (shape):
- intent: joma
- name: Karim
- amount: 100
- date: today ISO date
- high confidence with no clarification
