import {
  AudioModule,
  RecordingPresets,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
} from 'expo-audio';
import * as FileSystem from 'expo-file-system/legacy';

const DEFAULT_RECORDING_OPTIONS = Object.freeze({
  ...RecordingPresets.HIGH_QUALITY,
  isMeteringEnabled: true,
  sampleRate: 16000,
  numberOfChannels: 1,
  bitRate: 32000,
  android: {
    ...RecordingPresets.HIGH_QUALITY.android,
    sampleRate: 16000,
    numberOfChannels: 1,
    bitRate: 32000,
  },
  ios: {
    ...RecordingPresets.HIGH_QUALITY.ios,
    sampleRate: 16000,
    numberOfChannels: 1,
    bitRate: 32000,
  },
  web: {
    ...RecordingPresets.HIGH_QUALITY.web,
    numberOfChannels: 1,
  },
});

export const MAX_UTTERANCE_MS = 4000;
export const MAX_AUDIO_FILE_BYTES = 350 * 1024;

const getRecorderStatus = async (recording) => {
  if (!recording || typeof recording.getStatus !== 'function') {
    return null;
  }

  try {
    return await Promise.resolve(recording.getStatus());
  } catch {
    return null;
  }
};

export const requestMicrophonePermission = async () => {
  const result = await requestRecordingPermissionsAsync();
  return Boolean(result?.granted);
};

export const startPushToTalkRecording = async ({
  maxDurationMs = MAX_UTTERANCE_MS,
  onAutoStop,
} = {}) => {
  const granted = await requestMicrophonePermission();
  if (!granted) {
    throw new Error('Microphone permission denied.');
  }

  await setAudioModeAsync({
    allowsRecording: true,
    playsInSilentMode: true,
    allowsBackgroundRecording: false,
  });

  const recording = new AudioModule.AudioRecorder(DEFAULT_RECORDING_OPTIONS);
  let speechDetected = false;
  let silentFrames = 0;
  const silenceFrameLimit = 7;
  const speechDbThreshold = -35;
  const silenceDbThreshold = -48;

  await recording.prepareToRecordAsync(DEFAULT_RECORDING_OPTIONS);
  await Promise.resolve(recording.record());
  const startedAtMs = Date.now();

  const poller = setInterval(async () => {
    try {
      const status = await getRecorderStatus(recording);
      if (!status?.canRecord || !status?.isRecording) {
        return;
      }

      const db = Number(status?.metering);
      if (!Number.isFinite(db)) {
        return;
      }

      if (db >= speechDbThreshold) {
        speechDetected = true;
        silentFrames = 0;
        return;
      }

      if (!speechDetected) {
        return;
      }

      if (db <= silenceDbThreshold) {
        silentFrames += 1;
        if (silentFrames >= silenceFrameLimit) {
          await recording.stop();
          if (typeof onAutoStop === 'function') {
            onAutoStop('silence');
          }
        }
      } else {
        silentFrames = 0;
      }
    } catch (_error) {
      // Ignore races with manual stop.
    }
  }, 100);

  const timer = setTimeout(async () => {
    try {
      await recording.stop();
      if (typeof onAutoStop === 'function') {
        onAutoStop('max_duration');
      }
    } catch (_error) {
      // Intentionally swallow timeout stop races.
    }
  }, Math.max(800, Math.min(4000, Number(maxDurationMs) || MAX_UTTERANCE_MS)));

  return {
    recording,
    poller,
    timer,
    startedAtMs,
  };
};

export const stopPushToTalkRecording = async ({ recording, poller, timer, startedAtMs = 0 }) => {
  if (timer) {
    clearTimeout(timer);
  }
  if (poller) {
    clearInterval(poller);
  }

  if (!recording) {
    return {
      uri: null,
      fileUri: null,
      durationMs: 0,
      effectiveDurationMs: 0,
      fileSizeBytes: 0,
      wasTrimmed: false,
    };
  }

  try {
    const status = await getRecorderStatus(recording);
    if (status?.isRecording) {
      await recording.stop();
    }
  } catch (_error) {
    // stop may race with timeout auto-stop.
  }

  const status = await getRecorderStatus(recording);
  const uri = recording.uri || status?.url || null;
  const rawDurationMs = Number(
    status?.durationMillis
    ?? status?.durationMs
    ?? recording?.durationMillis
    ?? (startedAtMs ? (Date.now() - Number(startedAtMs)) : 0)
    ?? 0
  ) || 0;
  const effectiveDurationMs = Math.min(rawDurationMs, MAX_UTTERANCE_MS);
  const wasTrimmed = rawDurationMs > MAX_UTTERANCE_MS;

  let fileSizeBytes = 0;
  if (uri) {
    try {
      const info = await FileSystem.getInfoAsync(uri);
      fileSizeBytes = Number(info?.size || 0);
    } catch (_error) {
      fileSizeBytes = 0;
    }
  }

  return {
    uri,
    fileUri: uri,
    durationMs: rawDurationMs,
    effectiveDurationMs,
    fileSizeBytes,
    wasTrimmed,
  };
};

export default {
  requestMicrophonePermission,
  startPushToTalkRecording,
  stopPushToTalkRecording,
  MAX_UTTERANCE_MS,
  MAX_AUDIO_FILE_BYTES,
};
