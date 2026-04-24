const SAMPLE_RATE = 16000;
const N_FFT = 400;
const HOP_LENGTH = 160;
const N_MELS = 80;
const MAX_FRAMES = 300;

const hzToMel = (hz) => 2595 * Math.log10(1 + hz / 700);
const melToHz = (mel) => 700 * (10 ** (mel / 2595) - 1);

const hannWindow = (size) => {
  const out = new Float32Array(size);
  for (let i = 0; i < size; i += 1) {
    out[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (size - 1));
  }
  return out;
};

const buildMelFilterBank = () => {
  const melMin = hzToMel(0);
  const melMax = hzToMel(SAMPLE_RATE / 2);

  const melPoints = [];
  for (let i = 0; i < N_MELS + 2; i += 1) {
    melPoints.push(melMin + ((melMax - melMin) * i) / (N_MELS + 1));
  }

  const hzPoints = melPoints.map(melToHz);
  const bins = hzPoints.map((hz) => Math.floor(((N_FFT + 1) * hz) / SAMPLE_RATE));

  const filters = Array.from({ length: N_MELS }, () => new Float32Array(Math.floor(N_FFT / 2) + 1));
  for (let m = 1; m <= N_MELS; m += 1) {
    const left = bins[m - 1];
    const center = bins[m];
    const right = bins[m + 1];

    for (let k = left; k < center; k += 1) {
      const denom = Math.max(1, center - left);
      filters[m - 1][k] = (k - left) / denom;
    }

    for (let k = center; k < right; k += 1) {
      const denom = Math.max(1, right - center);
      filters[m - 1][k] = (right - k) / denom;
    }
  }

  return filters;
};

const WINDOW = hannWindow(N_FFT);
const MEL_FILTERS = buildMelFilterBank();

const pcm16ToFloat32 = (pcm16) => {
  if (pcm16 instanceof Float32Array) {
    return pcm16;
  }

  const input = pcm16 instanceof Int16Array ? pcm16 : Int16Array.from(pcm16 || []);
  const out = new Float32Array(input.length);
  for (let i = 0; i < input.length; i += 1) {
    out[i] = Math.max(-1, Math.min(1, input[i] / 32768));
  }
  return out;
};

const stftPower = (frame) => {
  const bins = Math.floor(N_FFT / 2) + 1;
  const out = new Float32Array(bins);

  for (let k = 0; k < bins; k += 1) {
    let real = 0;
    let imag = 0;
    for (let n = 0; n < N_FFT; n += 1) {
      const sample = (frame[n] || 0) * WINDOW[n];
      const phase = (2 * Math.PI * k * n) / N_FFT;
      real += sample * Math.cos(phase);
      imag -= sample * Math.sin(phase);
    }
    out[k] = real * real + imag * imag;
  }

  return out;
};

const normalizeLogMel = (mel) => {
  let max = -Infinity;
  for (let i = 0; i < mel.length; i += 1) {
    if (mel[i] > max) {
      max = mel[i];
    }
  }

  const floor = max - 8;
  const out = new Float32Array(mel.length);
  for (let i = 0; i < mel.length; i += 1) {
    const clipped = Math.max(floor, mel[i]);
    out[i] = (clipped + 4) / 4;
  }

  return out;
};

export const wavPcmToLogMel = ({ pcm16 }) => {
  const x = pcm16ToFloat32(pcm16);
  const frames = Math.max(1, Math.min(MAX_FRAMES, 1 + Math.floor(Math.max(0, x.length - N_FFT) / HOP_LENGTH)));

  const mel = new Float32Array(N_MELS * MAX_FRAMES);

  for (let frameIndex = 0; frameIndex < frames; frameIndex += 1) {
    const start = frameIndex * HOP_LENGTH;
    const frame = x.subarray(start, Math.min(start + N_FFT, x.length));
    const power = stftPower(frame);

    for (let m = 0; m < N_MELS; m += 1) {
      let energy = 0;
      const filter = MEL_FILTERS[m];
      for (let k = 0; k < filter.length; k += 1) {
        energy += power[k] * filter[k];
      }
      mel[m * MAX_FRAMES + frameIndex] = Math.log10(Math.max(1e-10, energy));
    }
  }

  const normalized = normalizeLogMel(mel);
  return {
    sampleRate: SAMPLE_RATE,
    nMels: N_MELS,
    frames: MAX_FRAMES,
    data: normalized,
  };
};

export default {
  wavPcmToLogMel,
};
