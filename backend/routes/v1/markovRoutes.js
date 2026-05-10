const express = require('express');

const {
  getMarkovModel,
  getMarkovMatrix,
  postMarkovPredict,
  getMarkovFeatureContract,
  postMarkovBuildFeatures,
  getMarkovEmaSignalContract,
  postMarkovEmaSignal,
  getMarkovReorderDecisionContract,
  postMarkovReorderDecision,
  postMarkovEnsembleDecision,
  getMarkovStockSuggestionContract,
  postMarkovStockSuggestions,
  getMarkovEvaluationHooks,
  postMarkovForecast,
  postMarkovWalkForwardEvaluation,
  postMarkovStressTestEvaluation,
  getMarkovOpsStatus,
  getMarkovMonitoringDashboard,
  postMarkovRegisterVersion,
  postMarkovActivateVersion,
  postMarkovRollbackVersion,
  postMarkovSetRolloutCandidate,
  postMarkovAdvanceRolloutStage,
  postMarkovSetFeatureFlags,
  postMarkovRecordSuggestionFeedback,
  postMarkovRecordStockoutIncident,
  postMarkovRecordServiceError,
  postMarkovEvaluateAlerts,
  postMarkovDriftCheck,
  postMarkovStabilityCheck,
  postMarkovRunRecalibrationJob,
  postMarkovRunRetrainingJob,
  postMarkovRunDriftMonitoringJob,
} = require('../../controllers/v1/markovController');

const router = express.Router();

router.get('/model', getMarkovModel);
router.get('/matrix', getMarkovMatrix);
router.post('/predict', postMarkovPredict);
router.get('/features/contract', getMarkovFeatureContract);
router.post('/features/build', postMarkovBuildFeatures);
router.get('/ema/contract', getMarkovEmaSignalContract);
router.post('/ema/signal', postMarkovEmaSignal);
router.get('/reorder/contract', getMarkovReorderDecisionContract);
router.post('/reorder/decision', postMarkovReorderDecision);
router.post('/ensemble/decision', postMarkovEnsembleDecision);
router.get('/suggestions/contract', getMarkovStockSuggestionContract);
router.post('/suggestions', postMarkovStockSuggestions);
router.post('/forecast', postMarkovForecast);
router.get('/evaluate', getMarkovEvaluationHooks);
router.post('/evaluate/walk-forward', postMarkovWalkForwardEvaluation);
router.post('/evaluate/stress', postMarkovStressTestEvaluation);

router.get('/ops/status', getMarkovOpsStatus);
router.get('/ops/dashboard', getMarkovMonitoringDashboard);
router.post('/ops/register', postMarkovRegisterVersion);
router.post('/ops/activate', postMarkovActivateVersion);
router.post('/ops/rollback', postMarkovRollbackVersion);
router.post('/ops/rollout/candidate', postMarkovSetRolloutCandidate);
router.post('/ops/rollout/advance', postMarkovAdvanceRolloutStage);
router.post('/ops/feature-flags', postMarkovSetFeatureFlags);
router.post('/ops/feedback', postMarkovRecordSuggestionFeedback);
router.post('/ops/stockout', postMarkovRecordStockoutIncident);
router.post('/ops/error', postMarkovRecordServiceError);
router.post('/ops/alerts/evaluate', postMarkovEvaluateAlerts);
router.post('/ops/drift-check', postMarkovDriftCheck);
router.post('/ops/stability-check', postMarkovStabilityCheck);
router.post('/ops/jobs/recalibration', postMarkovRunRecalibrationJob);
router.post('/ops/jobs/retraining', postMarkovRunRetrainingJob);
router.post('/ops/jobs/drift-monitor', postMarkovRunDriftMonitoringJob);

module.exports = router;
