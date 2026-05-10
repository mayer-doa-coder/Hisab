import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  RefreshControl,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppCard, AppInput } from '../components/ui';
import { UI_COLORS } from '../constants/ui-theme';
import { useAppData } from '../context/AppDataContext';

const formatTime = (value) => {
  const date = new Date(value || '');
  if (Number.isNaN(date.getTime())) {
    return 'N/A';
  }
  return date.toISOString().replace('T', ' ').slice(0, 16);
};

export default function ApprovalRequestsScreen() {
  const {
    listApprovalRequests,
    approveApprovalRequest,
    rejectApprovalRequest,
  } = useAppData();

  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [decisionNote, setDecisionNote] = useState('');

  const loadRows = useCallback(async () => {
    try {
      setLoading(true);
      const data = await listApprovalRequests({ status: 'PENDING' });
      setRows(Array.isArray(data) ? data : []);
    } catch (error) {
      Alert.alert('ব্যর্থ', error?.message || 'অনুমোদনের অনুরোধ লোড হয়নি।');
    } finally {
      setLoading(false);
    }
  }, [listApprovalRequests]);

  useEffect(() => {
    loadRows();
  }, [loadRows]);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadRows();
    setRefreshing(false);
  }, [loadRows]);

  const handleApprove = useCallback(async (approvalRequestId) => {
    try {
      await approveApprovalRequest({ approvalRequestId, decisionNote });
      await loadRows();
    } catch (error) {
      Alert.alert('অনুমোদন ব্যর্থ', error?.message || 'এই অনুরোধ অনুমোদন করা যায়নি।');
    }
  }, [approveApprovalRequest, decisionNote, loadRows]);

  const handleReject = useCallback(async (approvalRequestId) => {
    try {
      await rejectApprovalRequest({ approvalRequestId, decisionNote });
      await loadRows();
    } catch (error) {
      Alert.alert('প্রত্যাখ্যান ব্যর্থ', error?.message || 'এই অনুরোধ প্রত্যাখ্যান করা যায়নি।');
    }
  }, [decisionNote, loadRows, rejectApprovalRequest]);

  return (
    <SafeAreaView style={styles.safeArea}>
      <FlatList
        data={rows}
        keyExtractor={(item) => String(item.approvalRequestId)}
        contentContainerStyle={styles.container}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={UI_COLORS.primary} />}
        ListHeaderComponent={(
          <View>
            <Text style={styles.title}>অনুমোদন সারি</Text>
            <Text style={styles.subtitle}>মুলতুবি বাতিল, ফেরত ও ছাড়ের অনুরোধ পর্যালোচনা করুন।</Text>
            <AppCard style={styles.noteCard}>
              <Text style={styles.label}>সিদ্ধান্তের নোট (ঐচ্ছিক)</Text>
              <AppInput
                value={decisionNote}
                onChangeText={setDecisionNote}
                placeholder="অনুমোদন/প্রত্যাখ্যানের নোট লিখুন"
              />
            </AppCard>
          </View>
        )}
        ListEmptyComponent={
          loading
            ? (
              <View style={styles.emptyWrap}>
                <ActivityIndicator color={UI_COLORS.primary} />
                <Text style={styles.emptyText}>লোড হচ্ছে...</Text>
              </View>
            )
            : <Text style={styles.emptyText}>কোনো মুলতুবি অনুরোধ নেই।</Text>
        }
        renderItem={({ item }) => (
          <AppCard style={styles.card}>
            <Text style={styles.action}>{item.actionType}</Text>
            <Text style={styles.meta}>আবেদনকারী: {String(item.requestedBy || 'N/A')}</Text>
            <Text style={styles.meta}>সময়: {formatTime(item.createdAt)}</Text>
            <Text style={styles.meta}>কারণ: {item.reason || 'অজানা'}</Text>
            <View style={styles.buttonRow}>
              <TouchableOpacity style={styles.approveButton} onPress={() => handleApprove(item.approvalRequestId)}>
                <Text style={styles.approveButtonText}>অনুমোদন</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.rejectButton} onPress={() => handleReject(item.approvalRequestId)}>
                <Text style={styles.rejectButtonText}>প্রত্যাখ্যান</Text>
              </TouchableOpacity>
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
    padding: 14,
    paddingBottom: 18,
  },
  title: {
    fontSize: 24,
    fontWeight: '800',
    color: UI_COLORS.textPrimary,
  },
  subtitle: {
    marginTop: 4,
    marginBottom: 10,
    fontSize: 13,
    color: UI_COLORS.textSecondary,
  },
  noteCard: {
    marginBottom: 12,
    gap: 6,
  },
  label: {
    fontSize: 12,
    fontWeight: '700',
    color: UI_COLORS.textSecondary,
  },
  card: {
    marginBottom: 10,
    gap: 4,
  },
  action: {
    fontSize: 14,
    fontWeight: '800',
    color: UI_COLORS.primary,
  },
  meta: {
    fontSize: 12,
    color: UI_COLORS.textSecondary,
  },
  buttonRow: {
    marginTop: 6,
    flexDirection: 'row',
    gap: 8,
  },
  approveButton: {
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: UI_COLORS.primary,
  },
  approveButtonText: {
    color: UI_COLORS.textOnPrimary,
    fontSize: 12,
    fontWeight: '700',
  },
  rejectButton: {
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: UI_COLORS.danger,
  },
  rejectButtonText: {
    color: UI_COLORS.textOnPrimary,
    fontSize: 12,
    fontWeight: '700',
  },
  emptyWrap: {
    marginTop: 20,
    alignItems: 'center',
    gap: 8,
  },
  emptyText: {
    marginTop: 8,
    fontSize: 13,
    color: UI_COLORS.textMuted,
    textAlign: 'center',
  },
});
