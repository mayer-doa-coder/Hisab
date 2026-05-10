const nowMs = () => Date.now();

const DEFAULT_OFFLINE_HINTS = Object.freeze([
  'baki',
  'joma',
  'becha',
  'kinbo',
  'confirm',
  'cancel',
]);

const findKeyword = (referenceText = '', vocabulary = DEFAULT_OFFLINE_HINTS) => {
  const raw = String(referenceText || '').trim().toLowerCase();
  for (const keyword of vocabulary) {
    if (raw.includes(keyword)) {
      return keyword;
    }
  }
  return raw.split(/\s+/).filter(Boolean)[0] || '';
};

class OnnxRunner {
  constructor() {
    this.ready = false;
    this.modelInfo = null;
  }

  async init({ encoderModelPath, decoderModelPath, quantization = 'int8' } = {}) {
    this.modelInfo = {
      encoderModelPath: encoderModelPath || 'models/whisper-base-encoder-int8.onnx',
      decoderModelPath: decoderModelPath || 'models/whisper-base-decoder-int8.onnx',
      quantization,
    };

    // Real runtime can be injected from native side to keep Expo workflow stable.
    this.ready = true;
    return {
      ready: true,
      modelInfo: this.modelInfo,
    };
  }

  async infer({ mel, hintedText = '' } = {}) {
    const started = nowMs();
    if (!this.ready) {
      await this.init({});
    }

    // Placeholder deterministic decode path when native ORT bridge is unavailable.
    const token = findKeyword(hintedText);
    const elapsed = Math.max(1, nowMs() - started);

    return {
      text: token || String(hintedText || '').trim().toLowerCase(),
      tokenIds: token ? [1] : [],
      confidence: token ? 0.76 : 0.45,
      inferenceMs: elapsed,
      debug: {
        usedNativeOrt: false,
        melShape: [1, mel?.nMels || 80, mel?.frames || 300],
        quantization: this.modelInfo?.quantization || 'int8',
      },
    };
  }
}

export const createOnnxRunner = () => new OnnxRunner();

export default {
  createOnnxRunner,
};
