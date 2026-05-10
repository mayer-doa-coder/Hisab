export const VOICE_TUNING_CONFIG = Object.freeze({
  thresholds: {
    normalizationOverall: 0.85,
    nameMatchMin: 0.85,
    productMatchMin: 0.82,
    branchMatchMin: 0.8,
    nameAmbiguityDelta: 0.08,
    asrAcceptance: 0.68,
    nameConfidenceMin: 0.85,
    amountConfidenceMin: 0.9,
    intentConfidenceMin: 0.8,
    intentSensitivity: 0.82,
    executionMinConfidence: 0.78,
    highRiskExecutionMinConfidence: 0.9,
    releaseGateIntentAccuracyMin: 0.9,
    releaseGateAmountAccuracyMin: 0.95,
    releaseGateNameAccuracyMin: 0.9,
    releaseGateFalseExecutionRateMax: 0.02,
    releaseGateCancellationRateMax: 0.3,
  },
  grammar: {
    WAIT_INTENT: ['baki', 'joma', 'becha', 'kinbo', 'balance'],
    WAIT_AMOUNT: ['number_only'],
    WAIT_DATE: ['aj', 'kal', 'yyyy-mm-dd'],
    CONFIRM: ['confirm', 'yes', 'na', 'cancel'],
  },
  intents: {
    baki: ['baki', 'বাকি', 'ধার', 'দেনা', 'উধার', 'due', 'bakki', 'baqi', 'baky', 'baki dao', 'dhar', 'udhar'],
    joma: ['joma', 'জমা', 'পেমেন্ট', 'পরিশোধ', 'payment', 'pay', 'jama', 'jumma', 'shod'],
    becha: ['becha', 'bikri', 'বেচা', 'বিক্রি', 'বিক্রয়', 'sale', 'sell', 'beca', 'bikree', 'bikroy'],
    kinbo: ['kinbo', 'kina', 'কিনবো', 'কিনা', 'purchase', 'buy'],
    balance: ['balance', 'ব্যালেন্স', 'হিসাব', 'বাকি কত', 'কত বাকি', 'hisab', 'baki koto', 'koto baki', 'bal', 'check', 'hisab dekho', 'balans', 'hishab', 'hiseb'],
  },
  prompts: {
    WAIT_INTENT: {
      bn: 'কি করবেন?',
      en: 'What action?'
    },
    WAIT_NAME: {
      bn: 'নাম বলুন',
      en: 'Say name'
    },
    WAIT_AMOUNT: {
      bn: 'কত টাকা?',
      en: 'How much?'
    },
    WAIT_DATE: {
      bn: 'তারিখ বলুন',
      en: 'Say date'
    },
  },
  production: {
    rolloutStages: [5, 25, 50, 100],
    stableCyclesRequired: 2,
    commandCoverage: {
      active: ['ADD_DEBT', 'PAYMENT', 'SALE', 'CHECK_BALANCE'],
      next: ['INVENTORY_ADJUSTMENT', 'SUPPLIER_DUE'],
    },
    improvementCadenceDays: {
      confusionAnalysis: 7,
      hotwordRefresh: 14,
      thresholdReview: 7,
    },
    costControls: {
      maxMonthlyRequests: 12000,
      maxMonthlySpendUsd: 100,
      maxAverageAudioSeconds: 3.5,
    },
  },
});

export default VOICE_TUNING_CONFIG;
