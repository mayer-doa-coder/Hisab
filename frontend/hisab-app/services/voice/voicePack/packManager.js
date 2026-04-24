import * as FileSystem from 'expo-file-system/legacy';

import { validateFileChecksum } from './checksumValidator';
import {
  getLocalVersionManifest,
  getPackDefinition,
  getVoicePackRootDir,
  saveLocalVersionManifest,
  fetchRemotePackManifest,
  isNewerVersion,
} from './versionManager';
import {
  startOrResumeDownload,
  pauseDownload,
  cancelDownload,
} from './downloader';

const activeDownloads = new Map();

const packFileUri = (packId, fileName) => `${getVoicePackRootDir()}${packId}/${fileName}`;
const packResumeUri = (packId) => `${getVoicePackRootDir()}${packId}/resume.json`;

const ensurePackDir = async (packId) => {
  const dir = `${getVoicePackRootDir()}${packId}/`;
  const info = await FileSystem.getInfoAsync(dir);
  if (!info.exists) {
    await FileSystem.makeDirectoryAsync(dir, { intermediates: true });
  }
  return dir;
};

export const getPackStatus = async (packId) => {
  const manifest = await getLocalVersionManifest();
  const record = manifest.installed_packs?.[packId] || null;
  if (!record) {
    return {
      installed: false,
      packId,
    };
  }

  const fileInfo = await FileSystem.getInfoAsync(record.local_uri || '');
  return {
    installed: Boolean(record && fileInfo.exists),
    packId,
    ...record,
  };
};

export const isVoicePackInstalled = async (packId = 'bn_command_int8') => {
  const status = await getPackStatus(packId);
  return Boolean(status.installed);
};

export const installVoicePack = async ({
  packId = 'bn_command_int8',
  onProgress,
} = {}) => {
  const definition = getPackDefinition(packId);
  if (!definition) {
    throw new Error(`Unknown voice pack: ${packId}`);
  }

  await ensurePackDir(packId);
  const targetFileUri = packFileUri(packId, definition.local_file_name);
  const resumeStateUri = packResumeUri(packId);

  const { resumable, fileUri } = await startOrResumeDownload({
    url: definition.download_url,
    targetFileUri,
    resumeStateUri,
    onProgress,
  });

  activeDownloads.set(packId, { resumable, targetFileUri, resumeStateUri });

  const checksum = await validateFileChecksum({
    fileUri,
    expectedSha256: definition.checksum,
  });

  if (!checksum.ok) {
    await FileSystem.deleteAsync(fileUri, { idempotent: true });
    throw new Error('Voice pack checksum validation failed. Please retry download.');
  }

  const manifest = await getLocalVersionManifest();
  const installedPacks = {
    ...(manifest.installed_packs || {}),
    [packId]: {
      pack_version: definition.pack_version,
      model: definition.model,
      checksum: definition.checksum,
      local_uri: fileUri,
      installed_at: new Date().toISOString(),
    },
  };

  await saveLocalVersionManifest({
    ...manifest,
    installed_packs: installedPacks,
  });

  activeDownloads.delete(packId);

  return {
    packId,
    status: 'installed',
    fileUri,
    checksum,
  };
};

export const pauseVoicePackDownload = async (packId = 'bn_command_int8') => {
  const active = activeDownloads.get(packId);
  if (!active) {
    return null;
  }

  const result = await pauseDownload({
    resumable: active.resumable,
    resumeStateUri: active.resumeStateUri,
  });
  return result;
};

export const cancelVoicePackDownload = async (packId = 'bn_command_int8') => {
  const active = activeDownloads.get(packId);
  const definition = getPackDefinition(packId);
  if (!definition) {
    return;
  }

  const targetFileUri = active?.targetFileUri || packFileUri(packId, definition.local_file_name);
  const resumeStateUri = active?.resumeStateUri || packResumeUri(packId);

  await cancelDownload({
    resumable: active?.resumable || null,
    targetFileUri,
    resumeStateUri,
  });

  activeDownloads.delete(packId);
};

export const removeVoicePack = async (packId = 'bn_command_int8') => {
  const manifest = await getLocalVersionManifest();
  const record = manifest.installed_packs?.[packId];
  if (record?.local_uri) {
    await FileSystem.deleteAsync(record.local_uri, { idempotent: true }).catch(() => null);
  }

  const dir = `${getVoicePackRootDir()}${packId}/`;
  await FileSystem.deleteAsync(dir, { idempotent: true }).catch(() => null);

  const next = {
    ...(manifest.installed_packs || {}),
  };
  delete next[packId];

  await saveLocalVersionManifest({
    ...manifest,
    installed_packs: next,
  });
};

export const checkForPackUpdates = async ({
  packId = 'bn_command_int8',
  remoteManifestUrl = null,
} = {}) => {
  const installed = await getPackStatus(packId);
  const remote = await fetchRemotePackManifest({ url: remoteManifestUrl });
  if (!remote?.pack_version) {
    return {
      hasUpdate: false,
      installed,
      remote: null,
    };
  }

  const currentVersion = installed.pack_version || '0.0.0';
  const hasUpdate = isNewerVersion(remote.pack_version, currentVersion);

  return {
    hasUpdate,
    installed,
    remote,
  };
};

export default {
  getPackStatus,
  isVoicePackInstalled,
  installVoicePack,
  pauseVoicePackDownload,
  cancelVoicePackDownload,
  removeVoicePack,
  checkForPackUpdates,
};
