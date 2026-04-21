const buildRandomWalkPrediction = ({ currentState, currentValue = null } = {}) => {
  const normalizedState = String(currentState || '').trim().toUpperCase() || 'SIDEWAYS_STABLE';

  return {
    prediction: currentValue !== null && currentValue !== undefined
      ? currentValue
      : normalizedState,
    probability: 1,
    model: 'RANDOM_WALK',
    state: normalizedState,
  };
};

module.exports = {
  buildRandomWalkPrediction,
};
