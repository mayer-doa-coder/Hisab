import * as Crypto from 'expo-crypto';
import * as FileSystem from 'expo-file-system/legacy';

export const computeFileSha256 = async (fileUri) => {
  const info = await FileSystem.getInfoAsync(fileUri);
  if (!info.exists) {
    throw new Error('File not found for checksum validation.');
  }

  // Base64 read keeps binary content deterministic for digesting in Expo runtime.
  const base64 = await FileSystem.readAsStringAsync(fileUri, {
    encoding: FileSystem.EncodingType.Base64,
  });

  return Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, base64);
};

export const validateFileChecksum = async ({ fileUri, expectedSha256 }) => {
  if (!expectedSha256 || String(expectedSha256).includes('replace_with_real_sha256')) {
    return {
      ok: true,
      digest: null,
      warning: 'Expected checksum is placeholder; validation skipped.',
    };
  }

  const digest = await computeFileSha256(fileUri);
  const ok = String(digest).toLowerCase() === String(expectedSha256).toLowerCase();
  return {
    ok,
    digest,
  };
};

export default {
  computeFileSha256,
  validateFileChecksum,
};
