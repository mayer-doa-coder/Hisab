const MAX_EVENTS = 500;

const events = [];

export const VOICE_KPI_THRESHOLDS = Object.freeze({
  transcription_availability: 0.95,
  intent_accuracy: 0.9,
  slot_accuracy: {
    name_accuracy: 0.9,
    amount_accuracy: 0.95,
  },
  false_execution_rate: 0.01,
  p95_latency_ms: 1500,
  max_audio_size_kb: 350,
  monthly_request_cap: 12000,
  monthly_stt_spend_usd: 100,
});

const EVENT_NAME_MAP = Object.freeze({
  raw_asr_output: 'voice_transcription',
  normalized_output: 'voice_normalization',
  user_correction: 'voice_user_correction',
  flow_cancellation: 'voice_flow_cancellation',
  execution_blocked: 'voice_execution_blocked',
  command_outcome: 'voice_command_outcome',
  latency_sample: 'voice_latency_sample',
  transcription_lifecycle: 'voice_transcription',
  stt_start: 'STT_START',
  stt_success: 'STT_SUCCESS',
  stt_failure: 'STT_FAILURE',
  stt_retry: 'STT_RETRY',
  stt_request: 'STT_REQUEST',
});

const pushEvent = (type, payload = {}) => {
  const status = String(payload?.status || 'INFO').toUpperCase();
  const latencyMs = Number(payload?.latencyMs ?? payload?.latency_ms);
  const confidence = Number(payload?.confidence ?? payload?.asr?.confidence);

  const row = {
    type,
    event: EVENT_NAME_MAP[type] || String(type || 'voice_event'),
    status,
    latency_ms: Number.isFinite(latencyMs) ? latencyMs : null,
    confidence: Number.isFinite(confidence) ? confidence : null,
    payload,
    createdAt: new Date().toISOString(),
  };

  events.push(row);
  if (events.length > MAX_EVENTS) {
    events.splice(0, events.length - MAX_EVENTS);
  }

  return row;
};

export const logRawAsrOutput = (payload) => pushEvent('raw_asr_output', payload);
export const logNormalizedOutput = (payload) => pushEvent('normalized_output', payload);
export const logUserCorrection = (payload) => pushEvent('user_correction', payload);
export const logFlowCancellation = (payload) => pushEvent('flow_cancellation', payload);
export const logExecutionBlocked = (payload) => pushEvent('execution_blocked', payload);
export const logCommandOutcome = (payload) => pushEvent('command_outcome', payload);
export const logLatencySample = (payload) => pushEvent('latency_sample', payload);
export const logSttStart = (payload = {}) => pushEvent('stt_start', {
  ...payload,
  status: 'STARTED',
});
export const logSttSuccess = (payload = {}) => pushEvent('stt_success', {
  ...payload,
  status: 'SUCCESS',
});
export const logSttFailure = (payload = {}) => pushEvent('stt_failure', {
  ...payload,
  status: 'FAILED',
});
export const logSttRetry = (payload = {}) => pushEvent('stt_retry', {
  ...payload,
  status: 'RETRY',
});
export const logSttRequest = (payload = {}) => pushEvent('stt_request', {
  ...payload,
  status: payload?.status || 'SUCCESS',
});

export const logTranscriptionStart = (payload = {}) =>
  pushEvent('transcription_lifecycle', {
    ...payload,
    stage: 'start',
    status: 'STARTED',
  });

export const logTranscriptionEnd = (payload = {}) => {
  const ok = payload?.ok !== false;
  return pushEvent('transcription_lifecycle', {
    ...payload,
    stage: 'end',
    status: ok ? 'SUCCESS' : 'FAILED',
  });
};

export const getVoiceEvents = ({ type = null, limit = 100 } = {}) => {
  const rows = type ? events.filter((item) => item.type === type) : events;
  return rows.slice(Math.max(0, rows.length - Number(limit || 100)));
};

export const summarizeFailurePatterns = () => {
  const counts = events.reduce((acc, row) => {
    acc[row.type] = (acc[row.type] || 0) + 1;
    return acc;
  }, {});

  return {
    total: events.length,
    counts,
    topFailureSignals: [
      ['execution_blocked', counts.execution_blocked || 0],
      ['flow_cancellation', counts.flow_cancellation || 0],
      ['user_correction', counts.user_correction || 0],
    ].sort((a, b) => b[1] - a[1]).map(([signal, value]) => ({ signal, value })),
  };
};

const inWindow = ({ createdAt, cycleDays = 7, now = new Date() }) => {
  const nowMs = toTimestamp(now);
  const startMs = nowMs - Number(cycleDays || 7) * 24 * 60 * 60 * 1000;
  const at = toTimestamp(createdAt);
  return at >= startMs && at <= nowMs;
};

const getTranscriptionRows = (rows = []) => {
  const lifecycleRows = rows.filter((item) => item.type === 'transcription_lifecycle' && item?.payload?.stage === 'end');
  if (lifecycleRows.length) {
    return lifecycleRows;
  }

  return rows.filter((item) => item.type === 'raw_asr_output');
};

const getIntentAccuracy = (rows = []) => {
  const values = rows
    .map((item) => Number(item?.payload?.intent_accuracy))
    .filter((value) => Number.isFinite(value) && value >= 0 && value <= 1);
  if (!values.length) {
    return null;
  }

  return Number((values.reduce((sum, item) => sum + item, 0) / values.length).toFixed(4));
};

const getSlotAccuracy = (rows = []) => {
  const nameValues = rows
    .map((item) => Number(item?.payload?.slot_accuracy?.name_accuracy))
    .filter((value) => Number.isFinite(value) && value >= 0 && value <= 1);
  const amountValues = rows
    .map((item) => Number(item?.payload?.slot_accuracy?.amount_accuracy))
    .filter((value) => Number.isFinite(value) && value >= 0 && value <= 1);

  const average = (values) => {
    if (!values.length) {
      return null;
    }
    return Number((values.reduce((sum, item) => sum + item, 0) / values.length).toFixed(4));
  };

  return {
    name_accuracy: average(nameValues),
    amount_accuracy: average(amountValues),
  };
};

const getEstimatedMonthlySttSpend = (rows = []) => {
  const direct = rows
    .map((item) => Number(item?.payload?.stt_cost_usd))
    .filter((value) => Number.isFinite(value) && value >= 0);
  if (direct.length) {
    return Number(direct.reduce((sum, item) => sum + item, 0).toFixed(4));
  }

  // Fallback estimation: each successful cloud transcription costs a small fixed unit.
  const transcriptionRows = getTranscriptionRows(rows);
  const successCount = transcriptionRows.filter((item) => {
    if (item.type === 'transcription_lifecycle') {
      return String(item?.payload?.status || '').toUpperCase() === 'SUCCESS';
    }
    return item?.payload?.asr?.ok !== false;
  }).length;

  return Number((successCount * 0.0008).toFixed(4));
};

const getSttCostProxy = (rows = []) => {
  const sttRequestRows = rows.filter((item) => item.type === 'stt_request');
  const totalAudioSeconds = sttRequestRows
    .map((item) => Number(item?.payload?.audio_seconds ?? item?.payload?.audio_duration ?? 0))
    .filter((value) => Number.isFinite(value) && value >= 0)
    .reduce((sum, value) => sum + value, 0);

  return {
    audio_seconds: Number(totalAudioSeconds.toFixed(2)),
    request_count: sttRequestRows.length,
  };
};

export const computeBaselineMetricsFromEvents = ({ eventRows = [], cycleDays = 30, now = new Date() } = {}) => {
  const rows = (Array.isArray(eventRows) ? eventRows : []).filter((item) => inWindow({ createdAt: item.createdAt, cycleDays, now }));

  const transcriptionRows = getTranscriptionRows(rows);
  const transcriptionAttempts = transcriptionRows.length;
  const transcriptionSuccessCount = transcriptionRows.filter((item) => {
    if (item.type === 'transcription_lifecycle') {
      return String(item?.payload?.status || '').toUpperCase() === 'SUCCESS';
    }
    return item?.payload?.asr?.ok !== false;
  }).length;

  const commandRows = rows.filter((item) => item.type === 'command_outcome');
  const cancellationRows = rows.filter((item) => item.type === 'flow_cancellation');
  const failedRows = rows.filter((item) => String(item?.status || '').toUpperCase() === 'FAILED');

  const latencyValues = [
    ...rows
      .map((item) => Number(item?.latency_ms))
      .filter((value) => Number.isFinite(value) && value >= 0),
    ...rows
      .map((item) => Number(item?.payload?.asr?.latency_ms))
      .filter((value) => Number.isFinite(value) && value >= 0),
  ];

  const transcriptionAvailability = transcriptionAttempts
    ? Number((transcriptionSuccessCount / transcriptionAttempts).toFixed(4))
    : 0;

  const intentAccuracy = getIntentAccuracy(rows);
  const slotAccuracy = getSlotAccuracy(rows);

  return {
    date: new Date(now).toISOString(),
    transcription_availability: transcriptionAvailability,
    intent_accuracy: intentAccuracy,
    slot_accuracy: slotAccuracy,
    latency_p95: percentile(latencyValues, 95),
    error_rate: rows.length ? Number((failedRows.length / rows.length).toFixed(4)) : 0,
    cancellation_rate: commandRows.length ? Number((cancellationRows.length / commandRows.length).toFixed(4)) : 0,
    stt_monthly_spend_usd: getEstimatedMonthlySttSpend(rows),
    stt_cost_proxy: getSttCostProxy(rows),
    sample_size: {
      events: rows.length,
      transcriptions: transcriptionAttempts,
      commands: commandRows.length,
    },
  };
};

export const computeBaselineMetrics = ({ cycleDays = 30, now = new Date() } = {}) => {
  return computeBaselineMetricsFromEvents({
    eventRows: events,
    cycleDays,
    now,
  });
};

const toTimestamp = (value) => {
  const ms = new Date(value).getTime();
  return Number.isFinite(ms) ? ms : 0;
};

const percentile = (values, p) => {
  if (!Array.isArray(values) || !values.length) {
    return null;
  }

  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[index];
};

export const computePilotKpisFromEvents = ({ eventRows = [], cycleDays = 7, now = new Date() } = {}) => {
  const nowMs = toTimestamp(now);
  const windowStartMs = nowMs - (Number(cycleDays) || 7) * 24 * 60 * 60 * 1000;

  const rows = (Array.isArray(eventRows) ? eventRows : []).filter((item) => {
    const createdMs = toTimestamp(item.createdAt);
    return createdMs >= windowStartMs && createdMs <= nowMs;
  });

  const commandRows = rows.filter((item) => item.type === 'command_outcome');
  const correctionRows = rows.filter((item) => item.type === 'user_correction');
  const cancelRows = rows.filter((item) => item.type === 'flow_cancellation');
  const blockedRows = rows.filter((item) => item.type === 'execution_blocked');

  const latencyRows = rows.filter((item) => item.type === 'latency_sample');
  const rawAsrRows = rows.filter((item) => item.type === 'raw_asr_output');
  const sttFailureRows = rows.filter((item) => item.type === 'stt_failure');
  const sttRetryRows = rows.filter((item) => item.type === 'stt_retry');
  const sttRequestRows = rows.filter((item) => item.type === 'stt_request');
  const brokenFlowRows = rows.filter((item) => {
    if (item.type !== 'execution_blocked') {
      return false;
    }

    const reason = String(item?.payload?.reason || item?.payload?.code || '').toUpperCase();
    return reason.includes('FSM') || reason.includes('STATE') || reason.includes('TRANSITION');
  });
  const sessionIds = new Set(
    rows
      .map((item) => String(item?.payload?.session_id || item?.payload?.sessionId || '').trim())
      .filter(Boolean)
  );
  const latencyValues = [
    ...latencyRows
      .map((item) => Number(item?.payload?.latencyMs))
      .filter((value) => Number.isFinite(value) && value >= 0),
    ...rawAsrRows
      .map((item) => Number(item?.payload?.asr?.latency_ms))
      .filter((value) => Number.isFinite(value) && value >= 0),
  ];

  const successCount = commandRows.filter((item) => item?.payload?.success === true).length;
  const integrityIssueCount = commandRows.filter((item) => item?.payload?.integrityIssue === true).length;
  const criticalSafetyIssueCount = commandRows.filter((item) => item?.payload?.safetyCritical === true).length;

  const totalCommands = commandRows.length;
  const sttRequestCount = sttRequestRows.length;
  const sttFailureRate = sttRequestCount
    ? Number((sttFailureRows.length / sttRequestCount).toFixed(4))
    : 0;
  const retryRate = sttRequestCount
    ? Number((sttRetryRows.length / sttRequestCount).toFixed(4))
    : 0;
  const userConfusionRate = totalCommands
    ? Number(((correctionRows.length + cancelRows.length) / totalCommands).toFixed(4))
    : 0;
  const avgRetriesPerSession = sessionIds.size
    ? Number((sttRetryRows.length / sessionIds.size).toFixed(4))
    : 0;

  return {
    cycleDays: Number(cycleDays) || 7,
    totalEvents: rows.length,
    totalCommands,
    successRate: totalCommands ? Number((successCount / totalCommands).toFixed(4)) : 0,
    correctionRate: totalCommands ? Number((correctionRows.length / totalCommands).toFixed(4)) : 0,
    cancellationRate: totalCommands ? Number((cancelRows.length / totalCommands).toFixed(4)) : 0,
    blockedRate: totalCommands ? Number((blockedRows.length / totalCommands).toFixed(4)) : 0,
    falseExecutionRate: totalCommands ? Number(((totalCommands - successCount) / totalCommands).toFixed(4)) : 0,
    sttFailureRate,
    retryRate,
    userConfusionRate,
    latency: {
      sampleCount: latencyValues.length,
      p50Ms: percentile(latencyValues, 50),
      p95Ms: percentile(latencyValues, 95),
      maxMs: latencyValues.length ? Math.max(...latencyValues) : null,
    },
    sessions: {
      total: sessionIds.size,
      avgRetriesPerSession,
    },
    blockedFlowCount: brokenFlowRows.length,
    stt: {
      requestCount: sttRequestCount,
      failureCount: sttFailureRows.length,
      retryCount: sttRetryRows.length,
    },
    criticalSafetyIssueCount,
    integrityIssueCount,
  };
};

export const computePilotKpis = ({ cycleDays = 7, now = new Date() } = {}) => {
  return computePilotKpisFromEvents({
    eventRows: events,
    cycleDays,
    now,
  });
};

const DEFAULT_PILOT_THRESHOLDS = Object.freeze({
  minCommands: 20,
  minSuccessRate: 0.95,
  maxCorrectionRate: 0.35,
  maxCancellationRate: 0.25,
  maxBlockedRate: 0.2,
  maxFalseExecutionRate: 0.05,
  maxP95LatencyMs: 1800,
  maxCriticalSafetyIssues: 0,
  maxIntegrityIssues: 0,
  maxSttFailureRate: 0.2,
  maxRetryRate: 0.45,
  maxBrokenFlowCount: 0,
  maxUserConfusionRate: 0.35,
});

export const buildGoNoGoDecision = ({ kpis, thresholds = {} }) => {
  const limits = {
    ...DEFAULT_PILOT_THRESHOLDS,
    ...(thresholds || {}),
  };

  const blockers = [];

  if (Number(kpis.totalCommands || 0) < Number(limits.minCommands)) {
    blockers.push('Insufficient command volume for pilot confidence.');
  }

  if (Number(kpis.successRate || 0) < Number(limits.minSuccessRate)) {
    blockers.push('Success rate below pilot threshold.');
  }

  if (Number(kpis.correctionRate || 0) > Number(limits.maxCorrectionRate)) {
    blockers.push('Correction rate above tolerated threshold.');
  }

  if (Number(kpis.cancellationRate || 0) > Number(limits.maxCancellationRate)) {
    blockers.push('Cancellation rate too high for stable rollout.');
  }

  if (Number(kpis.blockedRate || 0) > Number(limits.maxBlockedRate)) {
    blockers.push('Execution blocked rate indicates unstable parsing or confidence gating.');
  }

  if (Number(kpis.falseExecutionRate || 0) > Number(limits.maxFalseExecutionRate)) {
    blockers.push('False execution rate exceeds safety baseline.');
  }

  if (Number(kpis.latency?.p95Ms || 0) > Number(limits.maxP95LatencyMs)) {
    blockers.push('P95 latency is above pilot SLA.');
  }

  if (Number(kpis.sttFailureRate || 0) > Number(limits.maxSttFailureRate)) {
    blockers.push('Repeated STT failures above tolerated rate.');
  }

  if (Number(kpis.retryRate || 0) > Number(limits.maxRetryRate)) {
    blockers.push('Retry frequency indicates unstable recognition quality.');
  }

  if (Number(kpis.blockedFlowCount || 0) > Number(limits.maxBrokenFlowCount)) {
    blockers.push('Broken FSM flow signals detected in execution blocked events.');
  }

  if (Number(kpis.userConfusionRate || 0) > Number(limits.maxUserConfusionRate)) {
    blockers.push('User confusion pattern is above acceptable pilot baseline.');
  }

  if (Number(kpis.criticalSafetyIssueCount || 0) > Number(limits.maxCriticalSafetyIssues)) {
    blockers.push('Critical safety issue count must be zero for rollout.');
  }

  if (Number(kpis.integrityIssueCount || 0) > Number(limits.maxIntegrityIssues)) {
    blockers.push('Data integrity issue count must be zero for rollout.');
  }

  return {
    decision: blockers.length ? 'NO_GO' : 'GO',
    blockers,
    thresholds: limits,
    evaluatedAt: new Date().toISOString(),
  };
};

export const getPilotSnapshot = ({ cycleDays = 7, thresholds = {} } = {}) => {
  const kpis = computePilotKpis({ cycleDays });
  const decision = buildGoNoGoDecision({ kpis, thresholds });

  return {
    kpis,
    decision,
    failureSummary: summarizeFailurePatterns(),
  };
};

const toIsoWeek = (date = new Date()) => {
  const utc = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const dayNum = utc.getUTCDay() || 7;
  utc.setUTCDate(utc.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(utc.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil((((utc - yearStart) / 86400000) + 1) / 7);
  return `${utc.getUTCFullYear()}-W${String(weekNo).padStart(2, '0')}`;
};

export const buildPilotGoNoGoReport = ({ eventRows = [], cycleDays = 7, thresholds = {}, now = new Date() } = {}) => {
  const kpis = computePilotKpisFromEvents({ eventRows, cycleDays, now });
  const decision = buildGoNoGoDecision({ kpis, thresholds });
  const failureSummary = summarizeFailurePatterns();

  const recommendations = [];
  if (decision.blockers.some((item) => item.toLowerCase().includes('stt failures'))) {
    recommendations.push('Tune ASR confidence thresholds and enforce shorter prompts for noisy environments.');
  }
  if (decision.blockers.some((item) => item.toLowerCase().includes('broken fsm'))) {
    recommendations.push('Refine grammar transition rules and strengthen state-level clarification prompts.');
  }
  if (decision.blockers.some((item) => item.toLowerCase().includes('confusion'))) {
    recommendations.push('Expand hotword dictionary and bilingual guidance to reduce correction and cancellation patterns.');
  }
  if (!recommendations.length) {
    recommendations.push('No threshold changes required; continue one more weekly monitoring cycle.');
  }

  return {
    week: toIsoWeek(new Date(now)),
    decision: decision.decision,
    kpis: {
      transcription_availability: Number(kpis.successRate || 0),
      intent_accuracy: Number(kpis.successRate || 0),
      slot_accuracy: {
        name: Number(Math.max(0, 1 - Number(kpis.correctionRate || 0)).toFixed(4)),
        amount: Number(Math.max(0, 1 - Number(kpis.falseExecutionRate || 0)).toFixed(4)),
      },
      false_execution_rate: Number(kpis.falseExecutionRate || 0),
      cancellation_rate: Number(kpis.cancellationRate || 0),
      p95_latency_ms: Number(kpis.latency?.p95Ms || 0),
      stt_failure_rate: Number(kpis.sttFailureRate || 0),
      retry_rate: Number(kpis.retryRate || 0),
    },
    blockers: decision.blockers,
    recommendations,
    diagnostics: {
      failure_summary: failureSummary,
      sessions: kpis.sessions,
      stt: kpis.stt,
      blocked_flow_count: Number(kpis.blockedFlowCount || 0),
      critical_safety_issues: Number(kpis.criticalSafetyIssueCount || 0),
      integrity_issues: Number(kpis.integrityIssueCount || 0),
    },
    cycleDays: Number(cycleDays || 7),
    thresholds: {
      ...DEFAULT_PILOT_THRESHOLDS,
      ...(thresholds || {}),
    },
    generatedAt: new Date(now).toISOString(),
  };
};

export const analyzeBengaliConfusionsFromEvents = ({ eventRows = [], cycleDays = 14, now = new Date() } = {}) => {
  const rows = (Array.isArray(eventRows) ? eventRows : []).filter((item) => inWindow({ createdAt: item.createdAt, cycleDays, now }));

  const misrecognizedNames = {};
  const numberExtractionErrors = {};
  const intentConfusions = {};

  for (const row of rows) {
    const payload = row?.payload || {};
    const reason = String(payload?.reason || payload?.code || '').toUpperCase();
    const expectedName = String(payload?.expected_name || '').trim();
    const predictedName = String(payload?.predicted_name || '').trim();
    const expectedIntent = String(payload?.expected_intent || '').trim().toLowerCase();
    const predictedIntent = String(payload?.predicted_intent || '').trim().toLowerCase();

    if (expectedName && predictedName && expectedName.toLowerCase() !== predictedName.toLowerCase()) {
      const key = `${expectedName} -> ${predictedName}`;
      misrecognizedNames[key] = (misrecognizedNames[key] || 0) + 1;
    }

    if (reason.includes('AMOUNT') || reason.includes('NUMBER')) {
      const key = String(payload?.raw_amount_token || 'unknown').trim() || 'unknown';
      numberExtractionErrors[key] = (numberExtractionErrors[key] || 0) + 1;
    }

    if (expectedIntent && predictedIntent && expectedIntent !== predictedIntent) {
      const key = `${expectedIntent} -> ${predictedIntent}`;
      intentConfusions[key] = (intentConfusions[key] || 0) + 1;
    }
  }

  const toTopList = (obj = {}, limit = 10) => Object.entries(obj)
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([key, count]) => ({ key, count }));

  return {
    cycleDays: Number(cycleDays || 14),
    sampleSize: rows.length,
    misrecognized_names_top: toTopList(misrecognizedNames),
    number_extraction_errors_top: toTopList(numberExtractionErrors),
    intent_confusions_top: toTopList(intentConfusions),
    generatedAt: new Date(now).toISOString(),
  };
};

export const buildProductionOpsSummary = ({ eventRows = [], cycleDays = 7, now = new Date() } = {}) => {
  const baseline = computeBaselineMetricsFromEvents({ eventRows, cycleDays, now });
  const pilot = computePilotKpisFromEvents({ eventRows, cycleDays, now });
  const confusion = analyzeBengaliConfusionsFromEvents({ eventRows, cycleDays: Math.max(7, cycleDays * 2), now });

  return {
    generatedAt: new Date(now).toISOString(),
    cycleDays: Number(cycleDays || 7),
    kpis: {
      transcription_availability: Number(baseline?.transcription_availability || 0),
      intent_accuracy: Number(baseline?.intent_accuracy || 0),
      slot_accuracy: baseline?.slot_accuracy || { name_accuracy: 0, amount_accuracy: 0 },
      false_execution_rate: Number(pilot?.falseExecutionRate || 0),
      cancellation_rate: Number(pilot?.cancellationRate || 0),
      p95_latency_ms: Number(baseline?.latency_p95 || 0),
    },
    reliability: {
      failure_rate: Number(pilot?.sttFailureRate || 0),
      retry_rate: Number(pilot?.retryRate || 0),
      timeout_frequency: Number(((pilot?.sttFailureRate || 0) * Number(pilot?.stt?.requestCount || 0)).toFixed(0)),
    },
    cost: {
      request_count: Number(baseline?.stt_cost_proxy?.request_count || 0),
      audio_seconds: Number(baseline?.stt_cost_proxy?.audio_seconds || 0),
      estimated_monthly_spend_usd: Number(baseline?.stt_monthly_spend_usd || 0),
    },
    confusion,
  };
};

export default {
  logRawAsrOutput,
  logNormalizedOutput,
  logUserCorrection,
  logFlowCancellation,
  logExecutionBlocked,
  logCommandOutcome,
  logLatencySample,
  logSttStart,
  logSttSuccess,
  logSttFailure,
  logSttRetry,
  logSttRequest,
  logTranscriptionStart,
  logTranscriptionEnd,
  getVoiceEvents,
  summarizeFailurePatterns,
  computePilotKpis,
  computePilotKpisFromEvents,
  computeBaselineMetrics,
  computeBaselineMetricsFromEvents,
  analyzeBengaliConfusionsFromEvents,
  buildProductionOpsSummary,
  buildGoNoGoDecision,
  getPilotSnapshot,
  buildPilotGoNoGoReport,
};
