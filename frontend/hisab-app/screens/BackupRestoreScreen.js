import { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, FlatList, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppButton, AppCard, AppInput } from '../components/ui';
import { UI_COLORS } from '../constants/ui-theme';
import {
  createLocalBackupSnapshot,
  restoreLocalBackupSnapshot,
} from '../database/db';
import { useAuth } from '../context/AuthContext';
import { useAppData } from '../context/AppDataContext';
import {
  uploadBackupOnline,
  listBackupsOnline,
  downloadBackupOnline,
  deleteBackupOnline,
  getRetentionPolicyOnline,
  applyRetentionPolicyOnline,
} from '../services/backend/reliabilityApi';

const formatDateTime = (value) => {
  if (!value) {
    return '-';
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '-';
  }

  return `${date.toLocaleDateString()} ${date.toLocaleTimeString()}`;
};

export default function BackupRestoreScreen() {
  const { session, isOnline } = useAuth();
  const { refreshAll } = useAppData();

  const [localBackups, setLocalBackups] = useState([]);
  const [remoteBackups, setRemoteBackups] = useState([]);
  const [retentionPolicy, setRetentionPolicy] = useState(null);
  const [retentionMaxBackups, setRetentionMaxBackups] = useState('10');
  const [retentionMaxDays, setRetentionMaxDays] = useState('30');
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [statusText, setStatusText] = useState('');

  const accessToken = session?.access_token || null;

  const latestLocal = useMemo(() => localBackups[0] || null, [localBackups]);

  const loadRemoteState = useCallback(async () => {
    if (!isOnline || !accessToken) {
      setRemoteBackups([]);
      return;
    }

    try {
      const [backupResponse, retentionResponse] = await Promise.all([
        listBackupsOnline({ accessToken, limit: 60 }),
        getRetentionPolicyOnline({ accessToken }),
      ]);

      setRemoteBackups(Array.isArray(backupResponse?.items) ? backupResponse.items : []);

      const nextPolicy = retentionResponse?.retentionPolicy || null;
      setRetentionPolicy(nextPolicy);

      if (nextPolicy) {
        setRetentionMaxBackups(String(nextPolicy.maxBackupsPerUser || 10));
        setRetentionMaxDays(String(nextPolicy.maxBackupAgeDays || 30));
      }
    } catch (error) {
      setStatusText(error?.message || 'Unable to load remote backup state.');
    }
  }, [accessToken, isOnline]);

  useEffect(() => {
    loadRemoteState();
  }, [loadRemoteState]);

  const createBackup = useCallback(async ({ upload = true } = {}) => {
    try {
      setBusy(true);
      setStatusText('');

      const local = await createLocalBackupSnapshot();
      const now = new Date().toISOString();
      const localItem = {
        backupId: `local_${Date.now()}`,
        createdAt: now,
        label: 'Local Snapshot',
        schemaVersion: local?.snapshot?.schemaVersion || 'local-sqlite-v1',
        sizeBytes: Number(local?.sizeBytes || 0),
        payload: local?.snapshot || null,
      };

      setLocalBackups((previous) => [localItem, ...previous].slice(0, 10));

      if (upload && isOnline && accessToken && local?.snapshot) {
        const uploadResponse = await uploadBackupOnline({
          accessToken,
          payload: local.snapshot,
          label: `Auto backup ${new Date().toLocaleString()}`,
          schemaVersion: local.snapshot.schemaVersion || 'local-sqlite-v1',
          itemCount: Object.keys(local.snapshot.tables || {}).length,
        });

        if (uploadResponse?.backup) {
          setRemoteBackups((previous) => [uploadResponse.backup, ...previous].slice(0, 60));
        }
      }

      setStatusText('Backup snapshot created successfully.');
    } catch (error) {
      setStatusText(error?.message || 'Failed to create backup snapshot.');
    } finally {
      setBusy(false);
    }
  }, [accessToken, isOnline]);

  const restoreFromSnapshot = useCallback(async (snapshot, sourceLabel) => {
    if (!snapshot || typeof snapshot !== 'object') {
      return;
    }

    Alert.alert(
      'Confirm Restore',
      'Restoring replaces active user scoped records. Continue?',
      [
        {
          text: 'Cancel',
          style: 'cancel',
        },
        {
          text: 'Restore',
          style: 'destructive',
          onPress: async () => {
            try {
              setBusy(true);
              setStatusText('');

              await restoreLocalBackupSnapshot({
                snapshot,
                strategy: 'replace',
              });

              await refreshAll();
              setStatusText(`Restore completed from ${sourceLabel}.`);
            } catch (error) {
              setStatusText(error?.message || 'Restore failed.');
            } finally {
              setBusy(false);
            }
          },
        },
      ]
    );
  }, [refreshAll]);

  return (
    <SafeAreaView style={styles.safeArea}>
      <FlatList
        data={remoteBackups}
        keyExtractor={(item, index) => String(item?.backupId || `backup-${index}`)}
        contentContainerStyle={styles.container}
        ListHeaderComponent={(
          <View style={styles.headerWrap}>
            <Text style={styles.title}>Backup & Restore</Text>
            <Text style={styles.subtitle}>Create resilient snapshots, upload retention-managed backups, and recover safely.</Text>

            <AppCard style={styles.card}>
              <Text style={styles.sectionTitle}>Snapshot Actions</Text>
              <View style={styles.buttonRow}>
                <AppButton
                  title={busy ? 'Working...' : 'Create Local Backup'}
                  style={styles.buttonFlex}
                  onPress={() => createBackup({ upload: false })}
                  disabled={busy}
                />
                <AppButton
                  title={busy ? 'Working...' : 'Create + Upload'}
                  variant="secondary"
                  style={styles.buttonFlex}
                  onPress={() => createBackup({ upload: true })}
                  disabled={busy}
                />
              </View>
              <AppButton
                title={loading ? 'Refreshing...' : 'Refresh Remote State'}
                variant="secondary"
                style={styles.singleButton}
                onPress={async () => {
                  try {
                    setLoading(true);
                    await loadRemoteState();
                  } finally {
                    setLoading(false);
                  }
                }}
                disabled={loading}
              />
              {statusText ? <Text style={styles.statusText}>{statusText}</Text> : null}
            </AppCard>

            {latestLocal ? (
              <AppCard style={styles.card}>
                <Text style={styles.sectionTitle}>Latest Local Backup</Text>
                <Text style={styles.metaText}>Created: {formatDateTime(latestLocal.createdAt)}</Text>
                <Text style={styles.metaText}>Size: {Number(latestLocal.sizeBytes || 0)} bytes</Text>
                <AppButton
                  title="Restore Latest Local"
                  onPress={() => restoreFromSnapshot(latestLocal.payload, 'local backup')}
                  disabled={busy}
                />
              </AppCard>
            ) : null}

            <AppCard style={styles.card}>
              <Text style={styles.sectionTitle}>Retention Policy</Text>
              <AppInput
                value={retentionMaxBackups}
                onChangeText={setRetentionMaxBackups}
                keyboardType="number-pad"
                placeholder="Max backups per user"
              />
              <AppInput
                value={retentionMaxDays}
                onChangeText={setRetentionMaxDays}
                keyboardType="number-pad"
                placeholder="Max backup age (days)"
              />
              <AppButton
                title="Apply Retention"
                variant="secondary"
                onPress={async () => {
                  if (!isOnline || !accessToken) {
                    setStatusText('Online login is required to apply retention.');
                    return;
                  }

                  try {
                    setBusy(true);
                    const response = await applyRetentionPolicyOnline({
                      accessToken,
                      policy: {
                        maxBackupsPerUser: Number(retentionMaxBackups || 10),
                        maxBackupAgeDays: Number(retentionMaxDays || 30),
                      },
                    });

                    const next = response?.retentionPolicy || null;
                    setRetentionPolicy(next);
                    await loadRemoteState();
                    setStatusText('Retention policy applied successfully.');
                  } catch (error) {
                    setStatusText(error?.message || 'Failed to apply retention policy.');
                  } finally {
                    setBusy(false);
                  }
                }}
                disabled={busy}
              />
              {retentionPolicy ? (
                <Text style={styles.metaText}>
                  Active policy: {Number(retentionPolicy.maxBackupsPerUser || 10)} backups, {Number(retentionPolicy.maxBackupAgeDays || 30)} days
                </Text>
              ) : null}
            </AppCard>

            <Text style={styles.sectionTitle}>Remote Backups</Text>
          </View>
        )}
        ListEmptyComponent={<Text style={styles.metaText}>{isOnline ? 'No remote backups found.' : 'Remote backups require online mode.'}</Text>}
        renderItem={({ item }) => (
          <AppCard style={styles.card}>
            <Text style={styles.rowTitle}>{String(item?.label || item?.backupId || 'backup')}</Text>
            <Text style={styles.metaText}>Created: {formatDateTime(item?.createdAt)}</Text>
            <Text style={styles.metaText}>Size: {Number(item?.sizeBytes || 0)} bytes</Text>
            <Text style={styles.metaText}>Checksum: {String(item?.checksum || '-')}</Text>
            <View style={styles.buttonRow}>
              <AppButton
                title="Restore"
                style={styles.buttonFlex}
                onPress={async () => {
                  if (!isOnline || !accessToken) {
                    setStatusText('Online login is required to download this backup.');
                    return;
                  }

                  try {
                    setBusy(true);
                    const response = await downloadBackupOnline({
                      accessToken,
                      backupId: item.backupId,
                    });

                    if (!response?.payload) {
                      throw new Error('Downloaded backup payload is empty.');
                    }

                    await restoreFromSnapshot(response.payload, `remote backup ${item.backupId}`);
                  } catch (error) {
                    setStatusText(error?.message || 'Unable to restore remote backup.');
                  } finally {
                    setBusy(false);
                  }
                }}
                disabled={busy}
              />
              <AppButton
                title="Delete"
                variant="secondary"
                style={styles.buttonFlex}
                onPress={async () => {
                  if (!isOnline || !accessToken) {
                    setStatusText('Online login is required to delete remote backups.');
                    return;
                  }

                  try {
                    setBusy(true);
                    await deleteBackupOnline({ accessToken, backupId: item.backupId });
                    await loadRemoteState();
                    setStatusText('Remote backup deleted.');
                  } catch (error) {
                    setStatusText(error?.message || 'Failed to delete backup.');
                  } finally {
                    setBusy(false);
                  }
                }}
                disabled={busy}
              />
            </View>
          </AppCard>
        )}
      />
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
    paddingBottom: 24,
  },
  headerWrap: {
    gap: 12,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: UI_COLORS.textPrimary,
  },
  subtitle: {
    fontSize: 13,
    color: UI_COLORS.textSecondary,
  },
  card: {
    gap: 8,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: UI_COLORS.textPrimary,
  },
  rowTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: UI_COLORS.textPrimary,
  },
  metaText: {
    fontSize: 13,
    color: UI_COLORS.textSecondary,
  },
  statusText: {
    fontSize: 12,
    color: UI_COLORS.textMuted,
  },
  buttonRow: {
    flexDirection: 'row',
    gap: 8,
  },
  buttonFlex: {
    flex: 1,
    minHeight: 46,
  },
  singleButton: {
    minHeight: 46,
  },
});
