const express = require('express');

const {
  getMarketDataContract,
  getStockUniverse,
  getMarkovStateSpace,
  ingestMarketData,
  listMarketDataBars,
  getBaselinePrediction,
} = require('../../controllers/v1/marketDataController');
const { withIdempotency } = require('../../controllers/v1/controllerUtils');

const router = express.Router();

router.get('/contract', getMarketDataContract);
router.get('/universe', getStockUniverse);
router.get('/states', getMarkovStateSpace);
router.get('/bars', listMarketDataBars);
router.get('/predict/baseline', getBaselinePrediction);
router.post('/ingest', withIdempotency(ingestMarketData));

module.exports = router;
