import * as FileSystem from 'expo-file-system/legacy';

const ROOT_DIR = `${FileSystem.documentDirectory || ''}voice-packs/`;
const VERSION_FILE = `${ROOT_DIR}version.json`;

export const VOICE_PACK_DEFINITIONS = Object.freeze({
  bn_command_int8: {
    pack_id: 'bn_command_int8',
    pack_version: '1.0.0',
    model: 'whisper-base-int8-command',
    size_mb_estimate: 58,
    quality: 'default',
    download_url: 'https://example.com/hisab/voicepacks/bn_command_int8.onnxpack',
    checksum: 'replace_with_real_sha256',
    local_file_name: 'bn_command_int8.onnxpack',
  },
  bn_hq_bnb4: {
    pack_id: 'bn_hq_bnb4',
    pack_version: '1.0.0',
    model: 'whisper-hq-bnb4',
    size_mb_estimate: 148,
    quality: 'hq',
    download_url: 'https://example.com/hisab/voicepacks/bn_hq_bnb4.onnxpack',
    checksum: 'replace_with_real_sha256',
    local_file_name: 'bn_hq_bnb4.onnxpack',
  },
});

const ensureRoot = async () => {
  const info = await FileSystem.getInfoAsync(ROOT_DIR);
  if (!info.exists) {
    await FileSystem.makeDirectoryAsync(ROOT_DIR, { intermediates: true });
  }
};

const parseSafeJson = (raw, fallback) => {
  try {
    return JSON.parse(String(raw || ''));
  } catch {
    return fallback;
  }
};

export const getVoicePackRootDir = () => ROOT_DIR;

export const getLocalVersionManifest = async () => {
  await ensureRoot();
  const info = await FileSystem.getInfoAsync(VERSION_FILE);
  if (!info.exists) {
    return {
      schema_version: 1,
      installed_packs: {},
      updated_at: null,
    };
  }

  const raw = await FileSystem.readAsStringAsync(VERSION_FILE);
  return parseSafeJson(raw, {
    schema_version: 1,
    installed_packs: {},
    updated_at: null,
  });
};

export const saveLocalVersionManifest = async (manifest) => {
  await ensureRoot();
  const next = {
    schema_version: 1,
    installed_packs: manifest?.installed_packs || {},
    updated_at: new Date().toISOString(),
  };
  await FileSystem.writeAsStringAsync(VERSION_FILE, JSON.stringify(next, null, 2));
  return next;
};

export const getPackDefinition = (packId) => {
  const key = String(packId || '').trim();
  return VOICE_PACK_DEFINITIONS[key] || null;
};

const toSemverParts = (version) => {
  const [major, minor, patch] = String(version || '0.0.0').split('.').map((v) => Number(v) || 0);
  return [major, minor, patch];
};

export const isNewerVersion = (left, right) => {
  const [l1, l2, l3] = toSemverParts(left);
  const [r1, r2, r3] = toSemverParts(right);
  if (l1 !== r1) {
    return l1 > r1;
  }
  if (l2 !== r2) {
    return l2 > r2;
  }
  return l3 > r3;
};

export const fetchRemotePackManifest = async ({ url, timeoutMs = 7000 } = {}) => {
  if (!url) {
    return null;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) {
      return null;
    }
    return response.json();
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
};

export default {
  getVoicePackRootDir,
  getLocalVersionManifest,
  saveLocalVersionManifest,
  getPackDefinition,
  fetchRemotePackManifest,
  isNewerVersion,
};
