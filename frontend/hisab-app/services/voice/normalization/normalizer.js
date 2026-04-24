import { parseDate } from './dateParser';
import { parseAmount } from './numberParser';
import { buildCorrectionPrompts, scoreSlots } from './confidenceScorer';
import { buildHotwordDictionary, findBestNameMatch, normalizeText } from './nameMatcher';
import { VOICE_TUNING_CONFIG } from '../config/voiceTuningConfig';
import DEFAULT_HOTWORDS from '../config/hotwordDictionary.json';

const INTENT_SYNONYMS = Object.freeze(VOICE_TUNING_CONFIG.intents);

const findIntent = (normalizedText) => {
  const tokens = normalizedText.split(' ');

  for (const [intent, aliases] of Object.entries(INTENT_SYNONYMS)) {
    for (const alias of aliases) {
      const normalizedAlias = normalizeText(alias);
      if (!normalizedAlias) {
        continue;
      }

      if (tokens.includes(normalizedAlias)) {
        return {
          intent,
          confidence: 0.98,
        };
      }
    }
  }

  return {
    intent: null,
    confidence: 0,
  };
};

const pickEntityName = ({ text, dictionary }) => {
  const candidateQueries = Array.from(new Set([
    text,
    ...String(text || '').split(' ').filter(Boolean),
  ]));

  const pickBestAcrossQueries = ({ entries, minConfidence }) => {
    let best = {
      match: null,
      candidates: [],
      ambiguous: false,
      confidence: 0,
    };

    for (const q of candidateQueries) {
      const row = findBestNameMatch({
        query: q,
        entries,
        minConfidence,
        ambiguityDelta: VOICE_TUNING_CONFIG.thresholds.nameAmbiguityDelta,
      });
      if (Number(row.confidence || 0) > Number(best.confidence || 0)) {
        best = row;
      }
    }

    return best;
  };

  const customerMatch = pickBestAcrossQueries({
    entries: dictionary.customers,
    minConfidence: VOICE_TUNING_CONFIG.thresholds.nameMatchMin,
  });

  if (customerMatch.match) {
    return {
      type: 'customer',
      result: customerMatch,
    };
  }

  const productMatch = pickBestAcrossQueries({
    entries: dictionary.products,
    minConfidence: VOICE_TUNING_CONFIG.thresholds.productMatchMin,
  });

  if (productMatch.match) {
    return {
      type: 'product',
      result: productMatch,
    };
  }

  const branchMatch = pickBestAcrossQueries({
    entries: dictionary.branches,
    minConfidence: VOICE_TUNING_CONFIG.thresholds.branchMatchMin,
  });

  if (branchMatch.match) {
    return {
      type: 'branch',
      result: branchMatch,
    };
  }

  return {
    type: null,
    result: {
      match: null,
      candidates: [],
      ambiguous: false,
      confidence: 0,
    },
  };
};

const normalize = (text, resources = {}, options = {}) => {
  const normalizedText = normalizeText(text);
  const dictionary = buildHotwordDictionary({
    customers: [...(DEFAULT_HOTWORDS.customers || []), ...((resources && resources.customers) || [])],
    products: [...(DEFAULT_HOTWORDS.products || []), ...((resources && resources.products) || [])],
    branches: [...(DEFAULT_HOTWORDS.branches || []), ...((resources && resources.branches) || [])],
  });
  const threshold = Number.isFinite(Number(options.threshold))
    ? Number(options.threshold)
    : VOICE_TUNING_CONFIG.thresholds.normalizationOverall;

  const intent = findIntent(normalizedText);
  const entity = pickEntityName({ text: normalizedText, dictionary });
  const amount = parseAmount(normalizedText);
  const date = parseDate(normalizedText, options.now || new Date());
  const interruptedSpeech = normalizedText.split(' ').length <= 1;
  const noisyPattern = /xx+|\?\?|###|noise|golmal/.test(normalizedText);

  const scores = scoreSlots({
    nameConfidence: entity.result.confidence,
    amountConfidence: amount.confidence,
    intentConfidence: intent.confidence,
    dateConfidence: date.confidence,
    hasAmount: amount.amount !== null,
    hasDate: Boolean(date.date),
  });

  const correctionPrompts = buildCorrectionPrompts({
    nameMatch: entity.result,
    amount: amount.amount,
    amountCandidates: amount.amount ? [] : [50, 15],
    score: scores.overall,
    threshold,
  });

  return {
    text: normalizedText,
    intent: intent.intent,
    name: entity.result.match?.name || null,
    nameType: entity.type,
    amount: amount.amount,
    date: date.date,
    confidence: {
      name: scores.slots.name,
      amount: scores.slots.amount,
      intent: scores.slots.intent,
      date: scores.slots.date,
      overall: scores.overall,
    },
    ambiguous: Boolean(entity.result.ambiguous),
    candidates: entity.result.candidates,
    correctionPrompts,
    shouldClarify: scores.overall < threshold || entity.result.ambiguous || interruptedSpeech || noisyPattern,
    edgeCases: {
      interruptedSpeech,
      noisyPattern,
    },
  };
};

export {
  normalize,
};
