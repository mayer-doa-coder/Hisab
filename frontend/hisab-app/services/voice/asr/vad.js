const DEFAULT_CONFIG = Object.freeze({
  sampleRate: 16000,
  frameMs: 20,
  startThreshold: 0.015,
  endThreshold: 0.008,
  minSpeechFrames: 3,
  maxSilenceFrames: 12,
});

const rootMeanSquare = (frame) => {
  if (!Array.isArray(frame) && !(frame instanceof Float32Array)) {
    return 0;
  }

  if (frame.length === 0) {
    return 0;
  }

  let sum = 0;
  for (let i = 0; i < frame.length; i += 1) {
    const v = Number(frame[i]) || 0;
    sum += v * v;
  }

  return Math.sqrt(sum / frame.length);
};

export const detectSpeechBoundaries = (pcmFloat, config = {}) => {
  const cfg = {
    ...DEFAULT_CONFIG,
    ...config,
  };

  const frameSize = Math.max(1, Math.floor((cfg.sampleRate * cfg.frameMs) / 1000));
  const input = pcmFloat instanceof Float32Array ? pcmFloat : Float32Array.from(pcmFloat || []);

  let speechFrames = 0;
  let silenceFrames = 0;
  let startedAt = -1;
  let endedAt = -1;

  for (let offset = 0; offset < input.length; offset += frameSize) {
    const frame = input.subarray(offset, Math.min(offset + frameSize, input.length));
    const rms = rootMeanSquare(frame);
    const frameIndex = Math.floor(offset / frameSize);

    if (startedAt === -1) {
      if (rms >= cfg.startThreshold) {
        speechFrames += 1;
        if (speechFrames >= cfg.minSpeechFrames) {
          startedAt = Math.max(0, frameIndex - cfg.minSpeechFrames + 1);
          silenceFrames = 0;
        }
      } else {
        speechFrames = 0;
      }
      continue;
    }

    if (rms < cfg.endThreshold) {
      silenceFrames += 1;
      if (silenceFrames >= cfg.maxSilenceFrames) {
        endedAt = Math.max(startedAt, frameIndex - cfg.maxSilenceFrames + 1);
        break;
      }
    } else {
      silenceFrames = 0;
    }
  }

  const hasSpeech = startedAt >= 0;
  const startSample = hasSpeech ? startedAt * frameSize : -1;
  const endSample = endedAt >= 0 ? Math.min(input.length, endedAt * frameSize) : input.length;

  return {
    hasSpeech,
    startSample,
    endSample,
    startMs: hasSpeech ? Math.round((startSample / cfg.sampleRate) * 1000) : -1,
    endMs: hasSpeech ? Math.round((endSample / cfg.sampleRate) * 1000) : -1,
    autoStoppedBySilence: hasSpeech && endedAt >= 0,
  };
};

export const isLikelySpeech = (pcmFloat, config = {}) => {
  const result = detectSpeechBoundaries(pcmFloat, config);
  return result.hasSpeech;
};

export default {
  detectSpeechBoundaries,
  isLikelySpeech,
};
