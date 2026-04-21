const express = require('express');

const {
	getStockSuggestions,
	getStockSuggestionBacktest,
	getStockSuggestionStability,
} = require('../../controllers/v1/suggestionsController');

const router = express.Router();

router.get('/', getStockSuggestions);
router.get('/backtest', getStockSuggestionBacktest);
router.get('/stability', getStockSuggestionStability);

module.exports = router;
