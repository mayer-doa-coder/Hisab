const DEFAULT_THRESHOLD = 0.85;

const clamp = (value, min = 0, max = 1) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return min;
  }

  return Math.max(min, Math.min(max, numeric));
};

const scoreSlots = ({
  nameConfidence = 0,
  amountConfidence = 0,
  intentConfidence = 0,
  dateConfidence = 0,
  hasAmount = false,
  hasDate = false,
} = {}) => {
  const slots = {
    name: clamp(nameConfidence),
    amount: hasAmount ? clamp(amountConfidence) : 0,
    intent: clamp(intentConfidence),
    date: hasDate ? clamp(dateConfidence) : 0,
  };

  const weights = {
    name: 0.35,
    amount: hasAmount ? 0.35 : 0,
    intent: 0.2,
    date: hasDate ? 0.1 : 0,
  };

  const totalWeight = Object.values(weights).reduce((sum, item) => sum + item, 0) || 1;
  const weightedScore = (
    slots.name * weights.name
    + slots.amount * weights.amount
    + slots.intent * weights.intent
    + slots.date * weights.date
  ) / totalWeight;

  return {
    slots,
    overall: clamp(Number(weightedScore.toFixed(3))),
  };
};

const needsClarification = ({ score, threshold = DEFAULT_THRESHOLD } = {}) => {
  return clamp(score) < clamp(threshold);
};

const buildCorrectionPrompts = ({
  nameMatch,
  amount,
  amountCandidates = [],
  score,
  threshold = DEFAULT_THRESHOLD,
} = {}) => {
  const prompts = [];

  if (nameMatch?.ambiguous && Array.isArray(nameMatch?.candidates) && nameMatch.candidates.length >= 2) {
    const [first, second] = nameMatch.candidates;
    prompts.push(`Did you mean ${first.name} or ${second.name}?`);
  }

  if ((!amount || amount <= 0) && amountCandidates.length >= 2) {
    prompts.push(`Did you say ${amountCandidates[0]} or ${amountCandidates[1]}?`);
  }

  if (needsClarification({ score, threshold }) && prompts.length === 0) {
    prompts.push('Please confirm the command details manually.');
  }

  return prompts;
};

export {
  DEFAULT_THRESHOLD,
  scoreSlots,
  needsClarification,
  buildCorrectionPrompts,
};
