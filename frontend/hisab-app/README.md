# Hisab Mobile App (Frontend)

React Native + Expo app for inventory, customer, baki, stock movement, and reorder suggestions.

## Run

1. Install dependencies

```bash
npm install
```

2. Start Expo

```bash
npm start
```

## Current Architecture

- Entry point: `App.js`
- Navigation: React Navigation bottom tabs (not Expo Router runtime)
- Local persistence: `database/db.js` with SQLite migrations and query helpers
- Domain screens:
  - `screens/ProductListScreen.js`
  - `screens/CustomerListScreen.js`
  - `screens/BakiListScreen.js`
  - `screens/StockMovementScreen.js`
  - `screens/ProductDetailsScreen.js`
- Rule-based reorder engine: `services/reorder/reorderSuggestionEngine.js`

## Notes

- Run lint before push:

```bash
npm run lint
```
