import { useCallback, useEffect, useMemo, useState } from 'react';
import { FlatList, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppButton, AppCard } from '../components/ui';
import { UI_COLORS } from '../constants/ui-theme';
import { getPendingSyncItems } from '../database/db';
import { useAuth } from '../context/AuthContext';
import { useAppData } from '../context/AppDataContext';
import {
  fetchOfflineQueueSummaryOnline,
  pushOfflineQueueSnapshotOnline,
  evaluateRetryOnline,
} from '../services/backend/reliabilityApi';
import { evaluateRetryVisibility } from '../services/sync/retryManager';

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

const toRetryText = (visibility) => {
  if (!visibility) {
    return 'Retry visibility unavailable';
  }

  if (visibility.exhausted) {
    return `Retry stopped (${visibility.reason})`;
  }

  if (visibility.shouldRetry) {
    return 'Ready to retry now';
  }

  const ms = Number(visibility.retryInMs || 0);
  const seconds = Math.max(0, Math.round(ms / 1000));
  return `Retry in ${seconds}s`;
};

export default function OfflineQueueMonitor() {
  const { session, isOnline } = useAuth();
  const { runOnlineSync } = useAppData();

  const [items, setItems] = useState([]);
  const [serverSummary, setServerSummary] = useState(null);
  const [loading, setLoading] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [statusText, setStatusText] = useState('');

  const accessToken = session?.access_token || null;

  const localSummary = useMemo(() => {
    const summary = {
      total: items.length,
      failed: 0,
      maxAttempts: 0,
      byEntity: {},
      oldestQueuedAt: null,
      newestQueuedAt: null,
      recentErrors: [],
    };

    for (const row of items) {
      const entity = String(row?.entity_type || 'unknown').trim().toLowerCase() || 'unknown';
      summary.byEntity[entity] = (summary.byEntity[entity] || 0) + 1;

      const attempts = Number(row?.attempts || 0);
      if (attempts > 0) {
        summary.failed += 1;
      }

      summary.maxAttempts = Math.max(summary.maxAttempts, attempts);

      const createdAt = row?.created_at || null;
      if (createdAt) {
        if (!summary.oldestQueuedAt || new Date(createdAt).getTime() < new Date(summary.oldestQueuedAt).getTime()) {
          summary.oldestQueuedAt = createdAt;
        }

        if (!summary.newestQueuedAt || new Date(createdAt).getTime() > new Date(summary.newestQueuedAt).getTime()) {
          summary.newestQueuedAt = createdAt;
        }
      }

      if (row?.last_error) {
        summary.recentErrors.push({
          id: row.id,
          message: String(row.last_error),
          attempts,
          entity,
        });
      }
    }

    summary.recentErrors = summary.recentErrors.slice(0, 20);
    return summary;
  }, [items]);

  const rowsWithRetry = useMemo(() => {
    return items.map((row) => ({
      ...row,
      retry: evaluateRetryVisibility({
        attempts: row?.attempts || 0,
        lastAttemptAt: row?.updated_at || row?.created_at || null,
        lastError: row?.last_error || null,
      }),
    }));
  }, [items]);

  const loadQueue = useCallback(async () => {
    setLoading(true);
    setStatusText('');

    try {
      const queueRows = await getPendingSyncItems({
        limit: 300,
        forCurrentUser: true,
      });
      setItems(queueRows);

      if (isOnline && accessToken) {
        const summary = await fetchOfflineQueueSummaryOnline({ accessToken });
        setServerSummary(summary || null);
      } else {
        setServerSummary(null);
      }
    } catch (error) {
      setStatusText(error?.message || 'Unable to load queue monitor.');
    } finally {
      setLoading(false);
    }
  }, [accessToken, isOnline]);

  useEffect(() => {
    loadQueue();
  }, [loadQueue]);

  const publishSnapshot = useCallback(async () => {
    if (!isOnline || !accessToken) {
      setStatusText('কিউ স্ন্যাপশট প্রকাশ করতে অনলাইনে লগইন করুন।');
      return;
    }

    try {
      setPublishing(true);
      setStatusText('');

      await pushOfflineQueueSnapshotOnline({
        accessToken,
        snapshot: localSummary,
      });

      const summary = await fetchOfflineQueueSummaryOnline({ accessToken });
      setServerSummary(summary || null);
      setStatusText('কিউ স্ন্যাপশট ব্যাকএন্ডে প্রকাশিত হয়েছে।');
    } catch (error) {
      setStatusText(error?.message || 'Failed to publish queue snapshot.');
    } finally {
      setPublishing(false);
    }
  }, [accessToken, isOnline, localSummary]);

  return (
    <SafeAreaView style={styles.safeArea}>
      <FlatList
        data={rowsWithRetry}
        keyExtractor={(item) => String(item?.id || Math.random())}
        contentContainerStyle={styles.container}
        ListHeaderComponent={(
          <View style={styles.headerWrap}>
            <Text style={styles.title}>অফলাইন সারি</Text>
            <Text style={styles.subtitle}>মুলতুবি সিঙ্ক, পুনরায় চেষ্টার সময় এবং ব্যর্থতার ধরন পর্যবেক্ষণ করুন।</Text>

            <AppCard style={styles.card}>
              <Text style={styles.sectionTitle}>স্থানীয় সারির অবস্থা</Text>
              <Text style={styles.metaText}>Total pending: {localSummary.total}</Text>
              <Text style={styles.metaText}>Failed attempts: {localSummary.failed}</Text>
              <Text style={styles.metaText}>Max attempts: {localSummary.maxAttempts}</Text>
              <Text style={styles.metaText}>Oldest: {formatDateTime(localSummary.oldestQueuedAt)}</Text>
              <Text style={styles.metaText}>Newest: {formatDateTime(localSummary.newestQueuedAt)}</Text>
              <View style={styles.buttonRow}>
                <AppButton
                  title={loading ? 'Refreshing...' : 'Refresh'}
                  style={styles.buttonFlex}
                  onPress={loadQueue}
                  disabled={loading}
                />
                <AppButton
                  title={publishing ? 'Publishing...' : 'Publish Snapshot'}
                  variant="secondary"
                  style={styles.buttonFlex}
                  onPress={publishSnapshot}
                  disabled={publishing}
                />
                <AppButton
                  title="সিঙ্ক চালান"
                  style={styles.buttonFlex}
                  onPress={async () => {
                    setStatusText('অনলাইন সিঙ্ক চলছে...');
                    await runOnlineSync();
                    await loadQueue();
                    setStatusText('সিঙ্ক সম্পন্ন এবং কিউ রিফ্রেশ হয়েছে।');
                  }}
                />
              </View>
              {statusText ? <Text style={styles.statusText}>{statusText}</Text> : null}
            </AppCard>

            {serverSummary?.latest ? (
              <AppCard style={styles.card}>
                <Text style={styles.sectionTitle}>সার্ভার স্ন্যাপশট</Text>
                <Text style={styles.metaText}>Latest pending: {Number(serverSummary.latest.pending || 0)}</Text>
                <Text style={styles.metaText}>Latest failed: {Number(serverSummary.latest.failed || 0)}</Text>
                <Text style={styles.metaText}>Captured: {formatDateTime(serverSummary.latest.createdAt)}</Text>
                <Text style={styles.metaText}>Samples: {Number(serverSummary.samples || 0)}</Text>
              </AppCard>
            ) : null}

            <AppCard style={styles.card}>
              <Text style={styles.sectionTitle}>রিমোট রিট্রাই মূল্যায়ন</Text>
              <AppButton
                title="প্রথম ব্যর্থটি মূল্যায়ন করুন"
                variant="secondary"
                onPress={async () => {
                  const firstFailed = rowsWithRetry.find((row) => Number(row?.attempts || 0) > 0);
                  if (!firstFailed) {
                    setStatusText('কোনো ব্যর্থ কিউ আইটেম পাওয়া যায়নি।');
                    return;
                  }

                  if (!isOnline || !accessToken) {
                    setStatusText('রিমোট রিট্রাই চালাতে অনলাইনে লগইন করুন।');
                    return;
                  }

                  try {
                    const response = await evaluateRetryOnline({
                      accessToken,
                      attempts: firstFailed.attempts,
                      lastAttemptAt: firstFailed.updated_at || firstFailed.created_at || null,
                      lastError: firstFailed.last_error || null,
                    });

                    const decision = response?.decision;
                    setStatusText(
                      decision?.retryExhausted
                        ? `Remote retry decision: stopped (${decision.reason}).`
                        : `Remote retry decision: ${decision?.shouldRetryNow ? 'retry now' : `wait until ${formatDateTime(decision?.nextRetryAt)}`}.`
                    );
                  } catch (error) {
                    setStatusText(error?.message || 'Remote retry evaluation failed.');
                  }
                }}
              />
            </AppCard>

            <Text style={styles.sectionTitle}>সারির আইটেম</Text>
          </View>
        )}
        ListEmptyComponent={
          <Text style={styles.metaText}>{loading ? 'Loading queue items...' : 'Queue is empty.'}</Text>
        }
        renderItem={({ item }) => (
          <AppCard style={styles.card}>
            <Text style={styles.rowTitle}>{String(item.entity_type || 'unknown')}</Text>
            <Text style={styles.metaText}>Operation: {String(item.operation || '-')}</Text>
            <Text style={styles.metaText}>Attempts: {Number(item.attempts || 0)}</Text>
            <Text style={styles.metaText}>Retry: {toRetryText(item.retry)}</Text>
            <Text style={styles.metaText}>Last error: {String(item.last_error || '-')}</Text>
            <Text style={styles.metaText}>Updated: {formatDateTime(item.updated_at || item.created_at)}</Text>
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
    textTransform: 'capitalize',
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
});
