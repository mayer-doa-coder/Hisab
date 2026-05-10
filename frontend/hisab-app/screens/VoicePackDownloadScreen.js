import { useCallback, useEffect, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppButton, AppCard } from '../components/ui';
import { UI_COLORS } from '../constants/ui-theme';
import {
  VOICE_PACK_DEFINITIONS,
  checkForPackUpdates,
  getPackStatus,
  installVoicePack,
  removeVoicePack,
} from '../services/voice/voicePack';

const REMOTE_VERSION_URL = null;

const ProgressBar = ({ percent = 0 }) => (
  <View style={styles.progressTrack}>
    <View style={[styles.progressFill, { width: `${Math.max(0, Math.min(100, percent))}%` }]} />
  </View>
);

const packList = Object.values(VOICE_PACK_DEFINITIONS || {});

export default function VoicePackDownloadScreen() {
  const [statuses, setStatuses] = useState({});
  const [activePackId, setActivePackId] = useState('');
  const [progress, setProgress] = useState(0);
  const [message, setMessage] = useState('Voice pack not installed. Download required for offline voice.');
  const [lastError, setLastError] = useState('');
  const [updateState, setUpdateState] = useState({});

  const refreshStatus = useCallback(async () => {
    const rows = await Promise.all(packList.map(async (pack) => [pack.pack_id, await getPackStatus(pack.pack_id)]));
    setStatuses(Object.fromEntries(rows));
  }, []);

  useEffect(() => {
    refreshStatus();
  }, [refreshStatus]);

  const installPack = useCallback(async (packId) => {
    setActivePackId(packId);
    setProgress(0);
    setLastError('');
    setMessage('ভয়েস প্যাক ডাউনলোড হচ্ছে...');

    try {
      await installVoicePack({
        packId,
        onProgress: ({ progress: nextProgress }) => {
          setProgress(nextProgress);
        },
      });
      setMessage('ভয়েস প্যাক ইনস্টল ও যাচাই হয়েছে। অফলাইন ভয়েস প্রস্তুত।');
      await refreshStatus();
    } catch (error) {
      setLastError(error?.message || 'Download failed.');
      setMessage('ডাউনলোড ব্যর্থ হয়েছে। আবার চেষ্টা করুন।');
    } finally {
      setActivePackId('');
    }
  }, [refreshStatus]);

  const removePack = useCallback(async (packId) => {
    setLastError('');
    setMessage('প্যাক সরানো হচ্ছে...');
    try {
      await removeVoicePack(packId);
      setMessage('ভয়েস প্যাক সরানো হয়েছে।');
      await refreshStatus();
    } catch (error) {
      setLastError(error?.message || 'Could not remove pack.');
    }
  }, [refreshStatus]);

  const checkUpdates = useCallback(async (packId) => {
    setLastError('');
    setMessage('আপডেট চেক হচ্ছে...');
    try {
      const result = await checkForPackUpdates({
        packId,
        remoteManifestUrl: REMOTE_VERSION_URL,
      });
      setUpdateState((prev) => ({ ...prev, [packId]: result }));
      setMessage(result.hasUpdate ? 'New pack version available.' : 'Pack is up to date.');
    } catch (error) {
      setLastError(error?.message || 'Unable to check updates.');
    }
  }, []);

  const activeStatus = useMemo(() => statuses[activePackId] || null, [activePackId, statuses]);

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.container}>
        <Text style={styles.title}>ভয়েস প্যাক ম্যানেজার</Text>
        <Text style={styles.subtitle}>মূল অ্যাপ হালকা থাকে। প্রয়োজনে ভয়েস প্যাক ইনস্টল করুন।</Text>

        <AppCard style={styles.infoCard}>
          <Text style={styles.message}>{message}</Text>
          {activePackId ? (
            <>
              <Text style={styles.helper}>Installing: {activePackId}</Text>
              <ProgressBar percent={progress} />
              <Text style={styles.helper}>Progress: {progress}%</Text>
            </>
          ) : null}
          {activeStatus?.installed ? <Text style={styles.helper}>Installed version: {activeStatus.pack_version}</Text> : null}
          {lastError ? <Text style={styles.error}>{lastError}</Text> : null}
        </AppCard>

        {packList.map((pack) => {
          const status = statuses[pack.pack_id];
          const update = updateState[pack.pack_id];
          return (
            <AppCard key={pack.pack_id} style={styles.packCard}>
              <Text style={styles.packTitle}>{pack.quality === 'hq' ? 'HQ Bengali Pack' : 'Default Bengali Command Pack'}</Text>
              <Text style={styles.helper}>Model: {pack.model}</Text>
              <Text style={styles.helper}>Approx size: {pack.size_mb_estimate}MB</Text>
              <Text style={styles.helper}>Version: {pack.pack_version}</Text>
              <Text style={styles.helper}>Status: {status?.installed ? 'ইনস্টল হয়েছে' : 'Not Installed'}</Text>
              {update?.hasUpdate ? <Text style={styles.warning}>Update available: {update.remote?.pack_version}</Text> : null}
              <View style={styles.row}>
                <AppButton
                  title={status?.installed ? 'Reinstall' : 'ডাউনলোড'}
                  onPress={() => installPack(pack.pack_id)}
                  disabled={Boolean(activePackId)}
                />
                <AppButton
                  variant="secondary"
                  title="আবার চেষ্টা"
                  onPress={() => installPack(pack.pack_id)}
                  disabled={Boolean(activePackId)}
                />
                <AppButton
                  variant="secondary"
                  title="আপডেট দেখুন"
                  onPress={() => checkUpdates(pack.pack_id)}
                  disabled={Boolean(activePackId)}
                />
                <AppButton
                  variant="secondary"
                  title="সরান"
                  onPress={() => removePack(pack.pack_id)}
                  disabled={Boolean(activePackId) || !status?.installed}
                />
              </View>
            </AppCard>
          );
        })}
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
  infoCard: {
    gap: 8,
  },
  packCard: {
    gap: 8,
  },
  message: {
    fontSize: 14,
    fontWeight: '700',
    color: UI_COLORS.textPrimary,
  },
  helper: {
    fontSize: 12,
    color: UI_COLORS.textSecondary,
  },
  error: {
    fontSize: 12,
    color: UI_COLORS.textDanger,
    fontWeight: '700',
  },
  warning: {
    fontSize: 12,
    color: UI_COLORS.textWarning,
    fontWeight: '700',
  },
  packTitle: {
    fontSize: 16,
    color: UI_COLORS.textPrimary,
    fontWeight: '700',
  },
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  progressTrack: {
    width: '100%',
    height: 10,
    borderRadius: 999,
    backgroundColor: UI_COLORS.borderSoft,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: UI_COLORS.primary,
  },
});
