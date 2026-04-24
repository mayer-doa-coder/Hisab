import { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, FlatList, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppButton, AppCard, AppInput } from '../components/ui';
import { UI_COLORS } from '../constants/ui-theme';
import { getPendingSyncItems } from '../database/db';
import { useAuth } from '../context/AuthContext';
import { useAppData } from '../context/AppDataContext';
import {
  listSyncConflictsOnline,
  resolveSyncConflictOnline,
  createSyncConflictOnline,
} from '../services/backend/reliabilityApi';
import {
  isConflictStatus,
  buildConflictRecordFromQueueItem,
} from '../services/sync/conflictResolver';

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

const summarizeConflictCount = (rows = []) => {
  const summary = {
    total: rows.length,
    open: 0,
    resolved: 0,
    byEntity: {},
  };

  for (const row of rows) {
    const status = String(row?.status || '').trim().toLowerCase();
    if (status === 'resolved') {
      summary.resolved += 1;
    } else {
      summary.open += 1;
    }

    const entity = String(row?.entityType || row?.entity_type || 'unknown').trim().toLowerCase() || 'unknown';
    summary.byEntity[entity] = (summary.byEntity[entity] || 0) + 1;
  }

  return summary;
};

export default function SyncConflictScreen() {
  const { session, isOnline } = useAuth();
  const { runOnlineSync, refreshAll } = useAppData();

  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [statusText, setStatusText] = useState('');
  const [resolutionNote, setResolutionNote] = useState('');

  const accessToken = session?.access_token || null;

  const loadConflicts = useCallback(async () => {
    setLoading(true);
    setStatusText('');

    try {
      const pendingQueue = await getPendingSyncItems({
        limit: 300,
        forCurrentUser: true,
      });

      const localConflicts = pendingQueue
        .filter((row) => row?.last_error && isConflictStatus(row.last_error))
        .map((row) => buildConflictRecordFromQueueItem({ item: row }))
        .filter(Boolean);

      if (isOnline && accessToken) {
        const response = await listSyncConflictsOnline({
          accessToken,
          status: 'all',
          limit: 300,
        });

        const remoteItems = Array.isArray(response?.items) ? response.items : [];

        if (!remoteItems.length && localConflicts.length) {
          // Seed server records so supervisors can resolve conflicts centrally.
          const candidate = localConflicts[0];
          await createSyncConflictOnline({
            accessToken,
            entityType: candidate.entityType,
            reason: candidate.reason,
            clientChange: candidate.clientChange || null,
            serverSnapshot: candidate.serverSnapshot || null,
            metadata: {
              source: 'auto_seed_from_offline_queue',
            },
          });

          const reloaded = await listSyncConflictsOnline({
            accessToken,
            status: 'all',
            limit: 300,
          });

          setItems(Array.isArray(reloaded?.items) ? reloaded.items : []);
        } else {
          setItems(remoteItems.length ? remoteItems : localConflicts);
        }
      } else {
        setItems(localConflicts);
      }
    } catch (error) {
      setStatusText(error?.message || 'Unable to load conflicts right now.');
    } finally {
      setLoading(false);
    }
  }, [accessToken, isOnline]);

  useEffect(() => {
    loadConflicts();
  }, [loadConflicts]);

  const summary = useMemo(() => summarizeConflictCount(items), [items]);

  const handleResolve = useCallback(async (conflict, resolution) => {
    if (!conflict) {
      return;
    }

    if (!isOnline || !accessToken) {
      Alert.alert('অনলাইন প্রয়োজন', 'Conflict resolution requires online mode to update the server state.');
      return;
    }

    try {
      setSubmitting(true);
      setStatusText('');

      await resolveSyncConflictOnline({
        accessToken,
        conflictId: String(conflict.conflictId || '').trim(),
        resolution,
        note: resolutionNote || null,
        mergedData: resolution === 'merge'
          ? {
              ...(conflict.serverSnapshot && typeof conflict.serverSnapshot === 'object' ? conflict.serverSnapshot : {}),
              ...(conflict.clientChange && typeof conflict.clientChange === 'object' ? conflict.clientChange : {}),
            }
          : null,
      });

      await runOnlineSync();
      await refreshAll();
      await loadConflicts();
      setStatusText('দ্বন্দ্ব সমাধান হয়েছে এবং সিঙ্ক শুরু হয়েছে।');
    } catch (error) {
      setStatusText(error?.message || 'Failed to resolve conflict.');
    } finally {
      setSubmitting(false);
    }
  }, [accessToken, isOnline, loadConflicts, refreshAll, resolutionNote, runOnlineSync]);

  return (
    <SafeAreaView style={styles.safeArea}>
      <FlatList
        data={items}
        keyExtractor={(item, index) => String(item?.conflictId || `row-${index}`)}
        contentContainerStyle={styles.container}
        ListHeaderComponent={(
          <View style={styles.headerWrap}>
            <Text style={styles.title}>সিঙ্ক দ্বন্দ্ব</Text>
            <Text style={styles.subtitle}>ডেটা বিচ্যুতি হওয়ার আগেই সিঙ্ক দ্বন্দ্ব পর্যবেক্ষণ ও সমাধান করুন।</Text>

            <AppCard style={styles.card}>
              <Text style={styles.sectionTitle}>সারসংক্ষেপ</Text>
              <Text style={styles.metaText}>Total: {summary.total}</Text>
              <Text style={styles.metaText}>Open: {summary.open}</Text>
              <Text style={styles.metaText}>Resolved: {summary.resolved}</Text>
              <View style={styles.buttonRow}>
                <AppButton
                  title={loading ? 'Refreshing...' : 'Refresh'}
                  style={styles.buttonFlex}
                  onPress={loadConflicts}
                  disabled={loading}
                />
                <AppButton
                  title={submitting ? 'Syncing...' : 'Run Sync'}
                  variant="secondary"
                  style={styles.buttonFlex}
                  onPress={async () => {
                    try {
                      setSubmitting(true);
                      await runOnlineSync();
                      await loadConflicts();
                    } finally {
                      setSubmitting(false);
                    }
                  }}
                  disabled={submitting}
                />
              </View>
            </AppCard>

            <AppCard style={styles.card}>
              <Text style={styles.sectionTitle}>সমাধানের নোট</Text>
              <AppInput
                value={resolutionNote}
                onChangeText={setResolutionNote}
                placeholder="অডিট ট্রেইলের জন্য নোট (ঐচ্ছিক)"
                multiline
                style={styles.noteInput}
              />
              {statusText ? <Text style={styles.statusText}>{statusText}</Text> : null}
            </AppCard>

            <Text style={styles.sectionTitle}>দ্বন্দ্বের তালিকা</Text>
          </View>
        )}
        ListEmptyComponent={
          <Text style={styles.metaText}>
            {loading ? 'Loading conflict records...' : 'No active conflicts found.'}
          </Text>
        }
        renderItem={({ item }) => {
          const status = String(item?.status || 'open').trim().toLowerCase() || 'open';
          return (
            <AppCard style={styles.card}>
              <Text style={styles.rowTitle}>{String(item?.entityType || item?.entity_type || 'unknown')}</Text>
              <Text style={styles.metaText}>Status: {status}</Text>
              <Text style={styles.metaText}>Reason: {String(item?.reason || item?.message || '-')}</Text>
              <Text style={styles.metaText}>Updated: {formatDateTime(item?.updatedAt || item?.updated_at)}</Text>
              {status === 'resolved' ? (
                <Text style={styles.metaText}>Resolution: {String(item?.resolution || '-')}</Text>
              ) : (
                <View style={styles.buttonRow}>
                  <AppButton
                    title="সার্ভার ডেটা রাখুন"
                    variant="secondary"
                    style={styles.buttonFlex}
                    onPress={() => handleResolve(item, 'server_wins')}
                    disabled={submitting}
                  />
                  <AppButton
                    title="লোকাল ডেটা রাখুন"
                    style={styles.buttonFlex}
                    onPress={() => handleResolve(item, 'client_wins')}
                    disabled={submitting}
                  />
                  <AppButton
                    title="মার্জ করুন"
                    variant="secondary"
                    style={styles.buttonFlex}
                    onPress={() => handleResolve(item, 'merge')}
                    disabled={submitting}
                  />
                </View>
              )}
            </AppCard>
          );
        }}
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
    textTransform: 'capitalize',
  },
  metaText: {
    fontSize: 13,
    color: UI_COLORS.textSecondary,
  },
  noteInput: {
    minHeight: 74,
    textAlignVertical: 'top',
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
});
