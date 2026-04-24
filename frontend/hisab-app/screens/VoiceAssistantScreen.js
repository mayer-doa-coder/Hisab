import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Animated, Easing, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppButton, AppCard, AppInput } from '../components/ui';
import VoiceStepScreen from '../components/voice/VoiceStepScreen';
import { UI_COLORS } from '../constants/ui-theme';
import { useAuth } from '../context/AuthContext';
import { useAppData } from '../context/AppDataContext';
import { createOfflineAsrEngine } from '../services/voice/asr';
import { executeCommand } from '../services/voice/commandExecutor';
import { normalize as normalizeUtterance } from '../services/voice/normalization';
import {
  logCommandOutcome,
  logExecutionBlocked,
  logFlowCancellation,
  logLatencySample,
  logNormalizedOutput,
  logRawAsrOutput,
  logSttFailure,
  logSttRetry,
  logSttStart,
  logSttSuccess,
  logUserCorrection,
} from '../services/voice/voiceAnalyticsLogger';
import { getPilotAccessState } from '../services/voice/pilot/pilotRolloutManager';
import {
  applyUserShortcut,
  getUserPersonalizationResources,
  setUserHotwords,
} from '../services/voice/personalization/userVoicePersonalization';
import VoiceAmountScreen from './VoiceAmountScreen';
import VoiceDateScreen from './VoiceDateScreen';
import VoiceIntentScreen from './VoiceIntentScreen';
import VoiceNameScreen from './VoiceNameScreen';
import VoiceReviewScreen from './VoiceReviewScreen';
import {
  DEFAULT_TIMEOUT_RETRY_LIMIT,
  STATES,
  buildInitialContext,
  buildOutputContract,
  getPromptForState,
  handleTimeout,
  transition,
} from '../services/voice/voiceFSM';

const TIMEOUT_MS = 12000;
const STT_UI_STATES = Object.freeze({
  IDLE: 'IDLE',
  LISTENING: 'LISTENING',
  PROCESSING: 'PROCESSING',
  SUCCESS: 'SUCCESS',
  ERROR: 'ERROR',
});

const mapFailureReasonForAnalytics = (reason) => {
  const normalized = String(reason || '').trim().toUpperCase();
  if (!normalized) {
    return 'STT_ERROR';
  }

  if (normalized.includes('TIMEOUT')) {
    return 'TIMEOUT';
  }
  if (normalized.includes('NETWORK')) {
    return 'NETWORK_ERROR';
  }
  if (normalized.includes('EMPTY')) {
    return 'EMPTY_RESULT';
  }
  if (normalized.includes('LOW_CONFIDENCE')) {
    return 'LOW_CONFIDENCE';
  }
  return normalized;
};

const toSimpleName = (value) => String(value || '').trim().toLowerCase();

const toText = (value) => String(value || '').trim();

const looksLikeUtterance = (value) => {
  const token = toText(value);
  return token.includes(' ') || /[\u0980-\u09FF]/.test(token);
};

const STATE_STEP_NUMBER = {
  WAIT_INTENT: 1,
  WAIT_NAME:   2,
  WAIT_AMOUNT: 3,
  WAIT_DATE:   4,
  REVIEW:      5,
  CONFIRM:     6,
  EXECUTE:     6,
};

const STATE_LABELS_BN = {
  WAIT_INTENT: 'কি করতে চান?',
  WAIT_NAME:   'কার নাম?',
  WAIT_AMOUNT: 'কত টাকা?',
  WAIT_DATE:   'কোন তারিখ?',
  REVIEW:      'একবার দেখুন',
  CONFIRM:     'নিশ্চিত করুন',
  EXECUTE:     'সম্পন্ন হচ্ছে',
};

const ORB_LABELS_BN = {
  IDLE:       'মাইক',
  LISTENING:  'শুনছি',
  PROCESSING: 'ভাবছি',
  SUCCESS:    'বুঝেছি',
  ERROR:      'আবার',
};

const getExecutionSummary = ({ intent, name, amount, date }) => {
  if (intent === 'baki') {
    return `৳${amount} বাকি রেকর্ড হয়েছে ${name} এর জন্য${date ? ` (${date})` : ''}।`;
  }

  if (intent === 'joma') {
    return `৳${amount} জমা রেকর্ড হয়েছে ${name} এর জন্য।`;
  }

  if (intent === 'becha' || intent === 'kinbo') {
    return 'বিক্রির তথ্য নেওয়া হয়েছে। বাকি কাজ টাচ স্ক্রিনে করুন।';
  }

  return 'কমান্ড সম্পন্ন হয়েছে।';
};

const getQuickActions = ({ state, knownNames = [], amount = null }) => {
  if (state === STATES.WAIT_INTENT) {
    return [
      { label: 'বাকি',   token: 'baki' },
      { label: 'জমা',    token: 'joma' },
      { label: 'বিক্রি', token: 'becha' },
    ];
  }

  if (state === STATES.WAIT_NAME) {
    return knownNames.slice(0, 4).map((item) => ({
      label: item.name,
      token: item.name,
    }));
  }

  if (state === STATES.WAIT_AMOUNT) {
    return [50, 100, 500, 1000].map((value) => ({
      label: `৳${value}`,
      token: `${value}`,
    }));
  }

  if (state === STATES.WAIT_DATE) {
    return [
      { label: 'আজ',       token: 'aj' },
      { label: 'কাল',      token: 'kal' },
      { label: 'বাদ দিন',  token: 'next' },
    ];
  }

  if (state === STATES.CONFIRM) {
    return [
      { label: amount ? `নিশ্চিত · ৳${amount}` : 'নিশ্চিত করুন', token: 'confirm' },
      { label: 'না',    token: 'cancel' },
      { label: 'পিছে',  token: 'back' },
    ];
  }

  return [
    { label: 'আবার',   token: 'repeat' },
    { label: 'পিছে',   token: 'back' },
    { label: 'বাতিল',  token: 'cancel' },
  ];
};

export default function VoiceAssistantScreen() {
  const navigation = useNavigation();
  const { customers, products } = useAppData();
  const { user, session } = useAuth();

  const knownNames = useMemo(
    () => (Array.isArray(customers) ? customers : []).map((item) => ({ id: item.id, name: item.name })),
    [customers]
  );

  const knownNameLookup = useMemo(() => {
    const entries = new Map();
    for (const item of knownNames) {
      entries.set(toSimpleName(item.name), item);
    }

    return entries;
  }, [knownNames]);

  const stableUserId = useMemo(
    () => String(user?.id || user?.server_id || user?.email || 'anonymous'),
    [user?.email, user?.id, user?.server_id]
  );

  const pilotAccess = useMemo(() => getPilotAccessState({ user }), [user]);

  const [currentState, setCurrentState] = useState(STATES.WAIT_INTENT);
  const [context, setContext] = useState(buildInitialContext());
  const [tokenInput, setTokenInput] = useState('');
  const [wizardFeedback, setWizardFeedback] = useState('কণ্ঠে বলুন বা বোতাম চাপুন।');
  const [suggestions, setSuggestions] = useState([]);
  const [retryCount, setRetryCount] = useState(0);
  const [isExecuting, setIsExecuting] = useState(false);
  const [executionMessage, setExecutionMessage] = useState('');
  const [normalizationResult, setNormalizationResult] = useState(null);
  const [isListening, setIsListening] = useState(false);
  const [sttUiState, setSttUiState] = useState(STT_UI_STATES.IDLE);
  const [asrFeedback, setAsrFeedback] = useState('মাইক চাপুন।');
  const [sttFailureReason, setSttFailureReason] = useState('');
  const [sttRetryAttempts, setSttRetryAttempts] = useState(0);
  const [asrResult, setAsrResult] = useState(null);
  const [heard, setHeard] = useState({ text: '', acceptedToken: '', confidence: 0 });
  const [assistantInput, setAssistantInput] = useState('');
  const lastExecutionSignatureRef = useRef('');
  const asrEngineRef = useRef(null);
  const stopMicCaptureRef = useRef(async () => {});
  const stopInFlightRef = useRef(false);
  const orbPulse = useRef(new Animated.Value(1)).current;

  const outputContract = useMemo(() => buildOutputContract(context), [context]);
  const quickActions = useMemo(
    () => getQuickActions({ state: currentState, knownNames, amount: outputContract.amount }),
    [currentState, knownNames, outputContract.amount]
  );

  useEffect(() => {
    if (!isListening) {
      orbPulse.stopAnimation();
      orbPulse.setValue(1);
      return;
    }

    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(orbPulse, {
          toValue: 1.15,
          duration: 620,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(orbPulse, {
          toValue: 1,
          duration: 620,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ])
    );

    loop.start();
    return () => loop.stop();
  }, [isListening, orbPulse]);

  useEffect(() => {
    setUserHotwords({
      userId: stableUserId,
      customers: (Array.isArray(customers) ? customers : []).map((item) => ({
        id: item.id,
        name: item.name,
        aliases: [item.phone || '', item.address || ''].filter(Boolean),
      })),
      products: (Array.isArray(products) ? products : []).map((item) => ({
        id: item.id,
        name: item.name,
      })),
      branches: [],
    });
  }, [customers, products, stableUserId]);

  useEffect(() => {
    let alive = true;
    const init = async () => {
      try {
        const engine = createOfflineAsrEngine();
        await engine.initialize({ quantization: 'int8' });
        if (!alive) {
          return;
        }
        asrEngineRef.current = engine;
        setAsrFeedback('প্রস্তুত। ৪ সেকেন্ডের মধ্যে বলুন।');
      } catch (error) {
        if (!alive) {
          return;
        }
        setAsrFeedback(error?.message || 'ASR initialization failed.');
      }
    };

    init();
    return () => {
      alive = false;
    };
  }, []);

  const resetFlow = useCallback((message = 'Flow reset.') => {
    setCurrentState(STATES.WAIT_INTENT);
    setContext(buildInitialContext());
    setWizardFeedback(message);
    setSuggestions([]);
    setRetryCount(0);
    setTokenInput('');
    setExecutionMessage('');
    setNormalizationResult(null);
    setAsrResult(null);
    setSttUiState(STT_UI_STATES.IDLE);
    setSttFailureReason('');
    setSttRetryAttempts(0);
    setHeard({ text: '', acceptedToken: '', confidence: 0 });
    lastExecutionSignatureRef.current = '';
  }, []);

  const jumpToState = useCallback((targetState) => {
    setCurrentState(targetState);
    setContext((prev) => ({
      ...prev,
      status: 'READY',
      lastError: '',
      lastPrompt: getPromptForState(targetState),
      flowHistory: [...(prev.flowHistory || []), targetState],
    }));
    setWizardFeedback(getPromptForState(targetState));
  }, []);

  const applyToken = useCallback((rawToken, confidence = 0.7) => {
    const token = String(rawToken || '').trim();
    if (!token) {
      setWizardFeedback('আবার বলুন। Please try again.');
      return;
    }

    if (token === 'cancel') {
      logFlowCancellation({ state: currentState, reason: 'user_cancel_token' });
    }

    if (token === 'back' || token === 'repeat') {
      logUserCorrection({ state: currentState, action: token });
    }

    const result = transition({
      state: currentState,
      token,
      context,
      knownNames,
    });

    setCurrentState(result.state);
    setContext(result.context);
    setWizardFeedback(result.message || getPromptForState(result.state));
    setSuggestions(Array.isArray(result.ambiguity?.candidates) ? result.ambiguity.candidates : []);
    setHeard({
      text: token,
      acceptedToken: token,
      confidence,
    });
    setRetryCount(0);
    setTokenInput('');
  }, [context, currentState, knownNames]);

  const pickTokenForStateFromNormalization = useCallback((result) => {
    if (!result) {
      return '';
    }

    if (currentState === STATES.WAIT_INTENT) {
      return result.intent || '';
    }

    if (currentState === STATES.WAIT_NAME) {
      return result.name || '';
    }

    if (currentState === STATES.WAIT_AMOUNT) {
      return Number.isFinite(Number(result.amount)) ? String(result.amount) : '';
    }

    if (currentState === STATES.WAIT_DATE) {
      return result.date || '';
    }

    return '';
  }, [currentState]);

  const processToken = useCallback((rawToken, confidenceHint = 0.7) => {
    const token = String(rawToken || '').trim();
    if (!token) {
      setWizardFeedback('আবার বলুন। Please try again.');
      return;
    }

    if (!looksLikeUtterance(token)) {
      setNormalizationResult(null);
      applyToken(token, confidenceHint);
      return;
    }

    const personalization = getUserPersonalizationResources({ userId: stableUserId });
    const shortcut = applyUserShortcut({
      userId: stableUserId,
      utterance: token,
    });

    const normalized = normalizeUtterance(shortcut.rewrittenText, {
      customers: [...(Array.isArray(customers) ? customers : []).map((item) => ({
        id: item.id,
        name: item.name,
        aliases: [item.phone || '', item.address || ''].filter(Boolean),
      })), ...(personalization.customers || [])],
      products: [...(Array.isArray(products) ? products : []).map((item) => ({
        id: item.id,
        name: item.name,
      })), ...(personalization.products || [])],
      branches: [...(personalization.branches || [])],
    });

    setNormalizationResult(normalized);
    logNormalizedOutput({
      state: currentState,
      input: token,
      rewritten_input: shortcut.rewrittenText,
      shortcut_trigger: shortcut.matchedShortcut,
      output: normalized,
    });
    if (normalized.shouldClarify && Array.isArray(normalized.correctionPrompts) && normalized.correctionPrompts.length > 0) {
      setWizardFeedback(normalized.correctionPrompts[0]);
    }

    if (normalized.ambiguous && Array.isArray(normalized.candidates)) {
      setSuggestions(normalized.candidates.map((item) => item.name).slice(0, 3));
    }

    const derivedToken = pickTokenForStateFromNormalization(normalized);
    if (!derivedToken) {
      return;
    }

    applyToken(derivedToken, Number(normalized?.confidence?.overall) || confidenceHint);
  }, [applyToken, currentState, customers, pickTokenForStateFromNormalization, products, stableUserId]);

  const startMicCapture = useCallback(async () => {
    try {
      if (!pilotAccess.enabled) {
        setAsrFeedback(pilotAccess.message);
        Alert.alert('পাইলট অ্যাক্সেস', pilotAccess.message);
        return;
      }

      if (!asrEngineRef.current) {
        setAsrFeedback('ASR not ready yet.');
        return;
      }

      await asrEngineRef.current.startListening({
        maxDurationMs: 4000,
        onAutoStop: (reason) => {
          setIsListening(false);
          setSttUiState(STT_UI_STATES.PROCESSING);
          setAsrFeedback(
            reason === 'silence'
              ? 'শোনা শেষ। বোঝার চেষ্টা করছি...'
              : 'সময় শেষ। বোঝার চেষ্টা করছি...'
          );

          // Auto-process captured audio on recorder auto-stop so users do not need a second tap.
          void Promise.resolve().then(() => stopMicCaptureRef.current());
        },
      });
      setIsListening(true);
      setSttUiState(STT_UI_STATES.LISTENING);
      setAsrFeedback('শুনছি... এখন বলুন।');
    } catch (error) {
      setIsListening(false);
      setSttUiState(STT_UI_STATES.ERROR);
      setSttFailureReason('STT_ERROR');
      setAsrFeedback(error?.message || 'Could not start recording.');
    }
  }, [navigation, pilotAccess.enabled, pilotAccess.message]);

  const stopMicCapture = useCallback(async () => {
    if (stopInFlightRef.current) {
      return;
    }

    stopInFlightRef.current = true;
    try {
      if (!asrEngineRef.current) {
        return;
      }

      setSttUiState(STT_UI_STATES.PROCESSING);
      setAsrFeedback('বোঝার চেষ্টা করছি...');
      logSttStart({
        state: currentState,
        attempt: Number(sttRetryAttempts || 0) + 1,
      });

      const result = await asrEngineRef.current.stopAndTranscribe({
        fsmState: currentState,
        knownNames,
        accessToken: session?.access_token || null,
        detectionOnly: true,
      });

      const detectedSpeechJson = {
        mode: 'detection_probe',
        ok: Boolean(result?.ok),
        reason: String(result?.reason || ''),
        detected_text: String(result?.raw_transcript || result?.text || '').trim(),
        accepted_token: String(result?.acceptedToken || ''),
        confidence: Number(result?.confidence || 0),
        provider: String(result?.stt?.provider || ''),
        request_id: String(result?.request_id || result?.stt?.request_id || ''),
        latency_ms: Number(result?.latency_ms || 0),
        audio: {
          duration_ms: Number(result?.audio?.durationMs || 0),
          file_size_bytes: Number(result?.audio?.file_size_bytes || 0),
          uri: String(result?.audio?.uri || ''),
        },
      };
      console.info('[VOICE][STT_DETECTED_JSON]', JSON.stringify(detectedSpeechJson));

      logRawAsrOutput({
        state: currentState,
        asr: result,
      });
      logLatencySample({
        stage: 'offline_asr',
        latencyMs: Number(result?.latency_ms || 0),
        ok: Boolean(result?.ok),
      });

      setAsrResult(result);
      setIsListening(false);
      setHeard({
        text: toText(result.text),
        acceptedToken: toText(result.acceptedToken),
        confidence: Number(result.confidence) || 0,
      });

      if (!result.ok) {
        const failureReason = mapFailureReasonForAnalytics(result.reason);
        setSttUiState(STT_UI_STATES.ERROR);
        setSttFailureReason(failureReason);
        setAsrFeedback(result.message || 'কথা শোনা যায়নি, আবার বলুন');
        logSttFailure({
          reason: failureReason,
          latency_ms: Number(result?.latency_ms || 0),
          request_id: String(result?.request_id || result?.stt?.request_id || ''),
          state: currentState,
        });
        if (currentState === STATES.WAIT_NAME) {
          setSuggestions(knownNames.slice(0, 3).map((item) => item.name));
        }
        return;
      }

      setSttUiState(STT_UI_STATES.SUCCESS);
      setSttFailureReason('');
      setSttRetryAttempts(0);
      logSttSuccess({
        latency_ms: Number(result?.latency_ms || 0),
        request_id: String(result?.request_id || result?.stt?.request_id || ''),
        state: currentState,
        confidence: Number(result?.confidence || 0),
      });
      setAsrFeedback('');
      processToken(result.acceptedToken || result.text, Number(result.confidence) || 0.7);
    } catch (error) {
      setIsListening(false);
      setSttUiState(STT_UI_STATES.ERROR);
      setSttFailureReason('NETWORK_ERROR');
      logSttFailure({
        reason: 'NETWORK_ERROR',
        latency_ms: 0,
        request_id: '',
        state: currentState,
      });
      setAsrFeedback(error?.message || 'ASR processing failed.');
    } finally {
      stopInFlightRef.current = false;
    }
  }, [currentState, knownNames, processToken, session?.access_token, sttRetryAttempts]);

  useEffect(() => {
    stopMicCaptureRef.current = stopMicCapture;
  }, [stopMicCapture]);

  const handleRetryStt = useCallback(() => {
    const nextRetry = Number(sttRetryAttempts || 0) + 1;
    setSttRetryAttempts(nextRetry);
    logSttRetry({
      attempt: nextRetry,
      reason: sttFailureReason || 'UNKNOWN',
      state: currentState,
    });
    startMicCapture();
  }, [currentState, startMicCapture, sttFailureReason, sttRetryAttempts]);

  const handleCancelStt = useCallback(() => {
    setIsListening(false);
    setSttUiState(STT_UI_STATES.IDLE);
    setSttFailureReason('');
    setAsrFeedback('মাইক বন্ধ করা হয়েছে। আবার শুরু করতে Mic চাপুন।');
  }, []);

  const handleManualCorrection = useCallback(() => {
    setSttUiState(STT_UI_STATES.IDLE);
    setAsrFeedback('ম্যানুয়ালি টাইপ করে পাঠান।');
  }, []);

  const handleMicToggle = useCallback(() => {
    const hasPendingRecording = Boolean(asrEngineRef.current?.hasPendingRecording?.());
    if (isListening || hasPendingRecording) {
      stopMicCapture();
      return;
    }

    startMicCapture();
  }, [isListening, startMicCapture, stopMicCapture]);

  const submitAssistantInput = useCallback(() => {
    const value = String(assistantInput || '').trim();
    if (!value) {
      return;
    }
    processToken(value, 0.85);
    setAssistantInput('');
  }, [assistantInput, processToken]);

  const executeConfirmedCommand = useCallback(async () => {
    if (context.status !== 'CONFIRMED' || currentState !== STATES.EXECUTE) {
      return;
    }

    const signature = JSON.stringify({
      intent: context.intent,
      name: context.name,
      amount: context.amount,
      date: context.date,
      status: context.status,
    });

    if (lastExecutionSignatureRef.current === signature) {
      return;
    }

    lastExecutionSignatureRef.current = signature;
    setIsExecuting(true);
    let outcomeLogged = false;

    try {
      const resolvedName = toSimpleName(context.name);
      const matchedCustomer = knownNameLookup.get(resolvedName);
      const execution = await executeCommand({
        role: user?.role,
        userId: user?.id || user?.server_id || user?.email || 'anonymous',
        accessToken: session?.access_token || null,
        context: {
          intent: context.intent,
          customerId: matchedCustomer?.id || null,
          amount: context.amount,
          date: context.date,
          confidence: context.confidence,
          status: context.status,
        },
      });

      if (execution.status !== 'SUCCESS') {
        logExecutionBlocked({
          state: currentState,
          context,
          reason: execution.message,
          details: execution.data,
        });
        logCommandOutcome({
          success: false,
          reason: execution.message,
          intent: context.intent,
          amount: Number(context.amount || 0),
          structured_payload: execution?.data?.payload || null,
          execution_result: execution?.data?.result || null,
          idempotency_key: execution.idempotency_key || null,
          safetyCritical: /high-risk|unsafe/i.test(String(execution.message || '')),
          integrityIssue: /idempotency|integrity/i.test(String(execution.message || '')),
        });
        outcomeLogged = true;
        throw new Error(execution.message || 'Secure execution failed.');
      }

      logCommandOutcome({
        success: true,
        intent: context.intent,
        amount: Number(context.amount || 0),
        structured_payload: execution?.data?.payload || null,
        execution_result: execution?.data?.result || null,
        idempotency_key: execution.idempotency_key || null,
        safetyCritical: false,
        integrityIssue: false,
      });
      outcomeLogged = true;

      setExecutionMessage(getExecutionSummary({
        intent: context.intent,
        name: context.name,
        amount: context.amount,
        date: context.date,
      }) + ` [${execution.idempotency_key || 'no-idempotency-key'}]`);
    } catch (error) {
      if (!outcomeLogged) {
        logCommandOutcome({
          success: false,
          reason: error?.message || 'Execution failed.',
          intent: context.intent,
          amount: Number(context.amount || 0),
          safetyCritical: false,
          integrityIssue: false,
        });
      }
      setExecutionMessage(error?.message || 'Execution failed. Please retry manually.');
    } finally {
      setIsExecuting(false);
    }
  }, [context, currentState, knownNameLookup, session?.access_token, user?.email, user?.id, user?.role, user?.server_id]);

  useEffect(() => {
    executeConfirmedCommand();
  }, [executeConfirmedCommand]);

  useEffect(() => {
    if (currentState === STATES.REVIEW || currentState === STATES.CONFIRM || currentState === STATES.EXECUTE) {
      return undefined;
    }

    const timer = setTimeout(() => {
      const timeout = handleTimeout({
        state: currentState,
        retryCount,
        maxRetries: DEFAULT_TIMEOUT_RETRY_LIMIT,
      });

      if (timeout.cancelled) {
        setContext((prev) => ({
          ...prev,
          status: 'CANCELLED',
          lastError: timeout.message,
        }));
        setCurrentState(STATES.WAIT_INTENT);
        setWizardFeedback(timeout.message);
        setSuggestions([]);
        setRetryCount(0);
        return;
      }

      setRetryCount(timeout.nextRetryCount);
      setWizardFeedback(timeout.message);
    }, TIMEOUT_MS);

    return () => clearTimeout(timer);
  }, [currentState, retryCount]);

  const renderWizardStep = () => {
    if (currentState === STATES.WAIT_INTENT) {
      return (
        <VoiceIntentScreen
          feedback={wizardFeedback}
          heard={heard}
          onMicToggle={handleMicToggle}
          isListening={isListening}
          onIntent={(token) => processToken(token, 1)}
          suggestions={suggestions}
          onSuggestion={(token) => processToken(token, 0.75)}
          onRetry={handleMicToggle}
        />
      );
    }

    if (currentState === STATES.WAIT_NAME) {
      return (
        <VoiceNameScreen
          feedback={wizardFeedback}
          heard={heard}
          onMicToggle={handleMicToggle}
          isListening={isListening}
          inputValue={tokenInput}
          onChangeInput={setTokenInput}
          onSubmitInput={() => processToken(tokenInput, 0.8)}
          suggestions={suggestions.length ? suggestions : knownNames.slice(0, 3).map((item) => item.name)}
          onSuggestion={(token) => processToken(token, 0.85)}
          onRetry={handleMicToggle}
        />
      );
    }

    if (currentState === STATES.WAIT_AMOUNT) {
      return (
        <VoiceAmountScreen
          feedback={wizardFeedback}
          heard={heard}
          onMicToggle={handleMicToggle}
          isListening={isListening}
          inputValue={tokenInput}
          onChangeInput={setTokenInput}
          onSubmitInput={() => processToken(tokenInput, 0.9)}
          onRetry={handleMicToggle}
        />
      );
    }

    if (currentState === STATES.WAIT_DATE) {
      return (
        <VoiceDateScreen
          feedback={wizardFeedback}
          heard={heard}
          onMicToggle={handleMicToggle}
          isListening={isListening}
          inputValue={tokenInput}
          onChangeInput={setTokenInput}
          onSubmitInput={() => processToken(tokenInput, 0.85)}
          onSkip={() => processToken('next', 1)}
          onRetry={handleMicToggle}
        />
      );
    }

    if (currentState === STATES.REVIEW) {
      return (
        <VoiceReviewScreen
          feedback={wizardFeedback}
          summary={outputContract}
          onEditName={() => jumpToState(STATES.WAIT_NAME)}
          onEditAmount={() => jumpToState(STATES.WAIT_AMOUNT)}
          onEditDate={() => jumpToState(STATES.WAIT_DATE)}
          onRetryVoice={handleMicToggle}
          onNext={() => processToken('next', 1)}
        />
      );
    }

    if (currentState === STATES.CONFIRM) {
      return (
        <VoiceStepScreen
          stepLabel="Step 6/6"
          promptBn={`${outputContract.amount || '-'} টাকা ${outputContract.name || '-'} এর নামে ${outputContract.intent || '-'} যোগ করবো?`}
          promptEn="Confirm this action?"
          feedback={wizardFeedback}
        >
          <View style={styles.row}>
            <AppButton title="হ্যাঁ, নিশ্চিত" onPress={() => processToken('confirm', 1)} />
            <AppButton variant="secondary" title="না" onPress={() => processToken('cancel', 1)} />
            <AppButton variant="secondary" title="পিছে" onPress={() => processToken('back', 1)} />
          </View>
        </VoiceStepScreen>
      );
    }

    return (
      <AppCard style={styles.card}>
        <Text style={styles.cardTitle}>{isExecuting ? 'সম্পন্ন হচ্ছে...' : 'সম্পন্ন হয়েছে ✓'}</Text>
        <Text style={styles.helperText}>{executionMessage}</Text>
        <View style={styles.row}>
          <AppButton variant="secondary" title="নতুন শুরু" onPress={() => resetFlow('নতুন ভয়েস ফ্লো শুরু হয়েছে।')} />
        </View>
      </AppCard>
    );
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.container}>
        <Text style={styles.title}>ভয়েস সহকারী</Text>
        <Text style={styles.subtitle}>বলুন অথবা বোতাম চাপুন</Text>

        <AppCard style={styles.heroCard}>
          <View style={styles.stepProgressRow}>
            {Array.from({ length: 6 }, (_, i) => i + 1).map((n) => {
              const stepNum = STATE_STEP_NUMBER[currentState] || 1;
              return (
                <View
                  key={n}
                  style={[
                    styles.stepDot,
                    n < stepNum && styles.stepDotDone,
                    n === stepNum && styles.stepDotActive,
                  ]}
                />
              );
            })}
            <Text style={styles.stepProgressLabel}>{STATE_LABELS_BN[currentState] || ''}</Text>
          </View>
          <View style={styles.orbWrap}>
            <Animated.View style={[styles.orbPulse, { transform: [{ scale: orbPulse }] }]} />
            <View style={styles.orbCore}>
              <Text style={styles.orbText}>
                {sttUiState === STT_UI_STATES.LISTENING ? ORB_LABELS_BN.LISTENING : null}
                {sttUiState === STT_UI_STATES.PROCESSING ? ORB_LABELS_BN.PROCESSING : null}
                {sttUiState === STT_UI_STATES.SUCCESS ? ORB_LABELS_BN.SUCCESS : null}
                {sttUiState === STT_UI_STATES.ERROR ? ORB_LABELS_BN.ERROR : null}
                {sttUiState === STT_UI_STATES.IDLE ? ORB_LABELS_BN.IDLE : null}
              </Text>
            </View>
          </View>

          <Text style={styles.helperText}>{asrFeedback}</Text>
          {(heard.acceptedToken || heard.text) ? (
            <Text style={styles.heardLine}>আপনি বলেছেন: {heard.acceptedToken || heard.text}</Text>
          ) : null}

          <View style={styles.row}>
            <AppButton
              title={isListening ? 'থামুন' : 'মাইক'}
              onPress={handleMicToggle}
              style={styles.micButton}
            />
            <AppButton
              variant="secondary"
              title="নতুন শুরু"
              onPress={() => resetFlow('নতুন ভয়েস ফ্লো শুরু হয়েছে।')}
            />
          </View>

          {sttUiState === STT_UI_STATES.ERROR ? (
            <View style={styles.row}>
              <AppButton title="আবার চেষ্টা" onPress={handleRetryStt} />
              <AppButton variant="secondary" title="বাতিল" onPress={handleCancelStt} />
              <AppButton variant="secondary" title="টাইপ করুন" onPress={handleManualCorrection} />
            </View>
          ) : null}

          <View style={styles.row}>
            {quickActions.map((item) => (
              <AppButton
                key={`${currentState}_${item.token}_${item.label}`}
                variant="secondary"
                title={item.label}
                onPress={() => processToken(item.token, 0.82)}
                style={styles.chipButton}
              />
            ))}
          </View>

          <View style={styles.assistantInputRow}>
            <AppInput
              style={styles.assistantInput}
              value={assistantInput}
              onChangeText={setAssistantInput}
              placeholder="টাইপ করুন... যেমন: রহিম ১০০ বাকি আজ"
              onSubmitEditing={submitAssistantInput}
            />
            <AppButton title="পাঠান" onPress={submitAssistantInput} style={styles.sendButton} />
          </View>
        </AppCard>


        {renderWizardStep()}

        {(isExecuting || executionMessage) ? (
        <AppCard style={styles.card}>
          <Text style={styles.cardTitle}>{isExecuting ? 'সম্পন্ন হচ্ছে...' : 'সম্পন্ন হয়েছে ✓'}</Text>
          <Text style={styles.helperText}>{executionMessage}</Text>
          <View style={styles.row}>
            <AppButton variant="secondary" title="নতুন শুরু" onPress={() => resetFlow('নতুন ভয়েস ফ্লো শুরু হয়েছে।')} />
          </View>
        </AppCard>
        ) : null}

      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: UI_COLORS.background,
  },
  container: {
    padding: 16,
    gap: 12,
    paddingBottom: 28,
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: UI_COLORS.textPrimary,
  },
  subtitle: {
    fontSize: 13,
    color: UI_COLORS.textSecondary,
  },
  heroCard: {
    gap: 12,
    borderRadius: 20,
    borderColor: UI_COLORS.borderInfo,
    backgroundColor: UI_COLORS.surfaceInfo,
  },
  orbWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    height: 136,
  },
  orbPulse: {
    position: 'absolute',
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: 'rgba(82, 142, 255, 0.18)',
  },
  orbCore: {
    width: 92,
    height: 92,
    borderRadius: 46,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: UI_COLORS.primary,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.45)',
  },
  orbText: {
    fontSize: 12,
    fontWeight: '700',
    color: UI_COLORS.textOnPrimary,
  },
  heardLine: {
    fontSize: 13,
    fontWeight: '600',
    color: UI_COLORS.textPrimary,
  },
  micButton: {
    minWidth: 110,
  },
  chipButton: {
    minHeight: 40,
    paddingVertical: 8,
    paddingHorizontal: 10,
  },
  assistantInputRow: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
  },
  assistantInput: {
    flex: 1,
  },
  sendButton: {
    minWidth: 84,
  },
  card: {
    gap: 10,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: UI_COLORS.textPrimary,
  },
  stepValue: {
    fontSize: 14,
    fontWeight: '700',
    color: UI_COLORS.primary,
  },
  helperText: {
    fontSize: 13,
    color: UI_COLORS.textSecondary,
  },
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  stepProgressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 4,
  },
  stepDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    borderWidth: 1.5,
    borderColor: UI_COLORS.borderSoft,
    backgroundColor: 'transparent',
  },
  stepDotDone: {
    backgroundColor: UI_COLORS.primary,
    borderColor: UI_COLORS.primary,
    opacity: 0.45,
  },
  stepDotActive: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: UI_COLORS.primary,
    borderColor: UI_COLORS.primary,
    opacity: 1,
  },
  stepProgressLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: UI_COLORS.primary,
    marginLeft: 4,
  },
});
