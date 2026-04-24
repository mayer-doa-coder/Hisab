import * as FileSystem from 'expo-file-system/legacy';

const toPercent = (written, total) => {
  const safeTotal = Number(total) || 1;
  return Math.max(0, Math.min(100, Math.round((Number(written || 0) / safeTotal) * 100)));
};

const ensureDirForFile = async (fileUri) => {
  const parts = String(fileUri || '').split('/');
  parts.pop();
  const dir = `${parts.join('/')}/`;
  if (!dir) {
    return;
  }

  const info = await FileSystem.getInfoAsync(dir);
  if (!info.exists) {
    await FileSystem.makeDirectoryAsync(dir, { intermediates: true });
  }
};

const saveResumeData = async (resumeUri, resumeData) => {
  if (!resumeUri || !resumeData) {
    return;
  }
  await FileSystem.writeAsStringAsync(resumeUri, JSON.stringify({ resumeData }, null, 2));
};

const loadResumeData = async (resumeUri) => {
  if (!resumeUri) {
    return null;
  }
  const info = await FileSystem.getInfoAsync(resumeUri);
  if (!info.exists) {
    return null;
  }
  try {
    const raw = await FileSystem.readAsStringAsync(resumeUri);
    const parsed = JSON.parse(raw);
    return parsed?.resumeData || null;
  } catch {
    return null;
  }
};

const clearResumeData = async (resumeUri) => {
  if (!resumeUri) {
    return;
  }
  const info = await FileSystem.getInfoAsync(resumeUri);
  if (info.exists) {
    await FileSystem.deleteAsync(resumeUri, { idempotent: true });
  }
};

export const createResumableDownload = async ({
  url,
  targetFileUri,
  resumeStateUri,
  onProgress,
} = {}) => {
  if (!url || !targetFileUri) {
    throw new Error('Download url and target file are required.');
  }

  await ensureDirForFile(targetFileUri);
  await ensureDirForFile(resumeStateUri);

  const resumeData = await loadResumeData(resumeStateUri);

  const callback = (progress) => {
    const written = Number(progress?.totalBytesWritten || 0);
    const expected = Number(progress?.totalBytesExpectedToWrite || 0);
    if (typeof onProgress === 'function') {
      onProgress({
        written,
        total: expected,
        progress: toPercent(written, expected),
      });
    }
  };

  const resumable = new FileSystem.DownloadResumable(
    url,
    targetFileUri,
    {
      sessionType: FileSystem.FileSystemSessionType.BACKGROUND,
    },
    callback,
    resumeData || undefined
  );

  return resumable;
};

export const startOrResumeDownload = async ({
  url,
  targetFileUri,
  resumeStateUri,
  onProgress,
}) => {
  const resumable = await createResumableDownload({
    url,
    targetFileUri,
    resumeStateUri,
    onProgress,
  });

  const result = await resumable.downloadAsync();
  await clearResumeData(resumeStateUri);

  return {
    resumable,
    result,
    fileUri: result?.uri || targetFileUri,
  };
};

export const pauseDownload = async ({ resumable, resumeStateUri }) => {
  if (!resumable) {
    return null;
  }

  const paused = await resumable.pauseAsync();
  await saveResumeData(resumeStateUri, paused?.resumeData || null);
  return paused;
};

export const cancelDownload = async ({ resumable, targetFileUri, resumeStateUri }) => {
  if (resumable) {
    await resumable.pauseAsync().catch(() => null);
  }
  if (targetFileUri) {
    await FileSystem.deleteAsync(targetFileUri, { idempotent: true }).catch(() => null);
  }
  await clearResumeData(resumeStateUri);
};

export default {
  createResumableDownload,
  startOrResumeDownload,
  pauseDownload,
  cancelDownload,
};
