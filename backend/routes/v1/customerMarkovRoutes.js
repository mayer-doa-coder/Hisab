'use strict';

const express = require('express');
const {
  postBuildCustomerModel,
  postPredictCustomerState,
  postBatchPredictCustomers,
  getCustomerSeasonalFactor,
  postClassifyCustomer,
} = require('../../controllers/v1/customerMarkovController');

const router = express.Router();

// Build a customer Markov transition model from snapshot/transaction data
router.post('/build', postBuildCustomerModel);

// Predict next Markov state for a single customer
router.post('/predict', postPredictCustomerState);

// Batch-predict next states for up to 500 customers
router.post('/batch-predict', postBatchPredictCustomers);

// Classify a customer into a Markov state from raw behavioral data
router.post('/classify', postClassifyCustomer);

// Return the active seasonal factor for a given date
router.get('/seasonal', getCustomerSeasonalFactor);

module.exports = router;
