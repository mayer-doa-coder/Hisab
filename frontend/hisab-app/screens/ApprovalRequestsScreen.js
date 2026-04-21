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
      Alert.alert('Failed', error?.message || 'Failed to load approval requests.');
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
      Alert.alert('Approve Failed', error?.message || 'Unable to approve this request.');
    }
  }, [approveApprovalRequest, decisionNote, loadRows]);

  const handleReject = useCallback(async (approvalRequestId) => {
    try {
      await rejectApprovalRequest({ approvalRequestId, decisionNote });
      await loadRows();
    } catch (error) {
      Alert.alert('Reject Failed', error?.message || 'Unable to reject this request.');
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
            <Text style={styles.title}>Approval Queue</Text>
            <Text style={styles.subtitle}>Review pending void, return, and discount override requests.</Text>
            <AppCard style={styles.noteCard}>
              <Text style={styles.label}>Decision Note (Optional)</Text>
              <AppInput
                value={decisionNote}
                onChangeText={setDecisionNote}
                placeholder="Add a note for approval/rejection"
              />
            </AppCard>
          </View>
        )}
        ListEmptyComponent={
          loading
            ? (
              <View style={styles.emptyWrap}>
                <ActivityIndicator color={UI_COLORS.primary} />
                <Text style={styles.emptyText}>Loading requests...</Text>
              </View>
            )
            : <Text style={styles.emptyText}>No pending requests.</Text>
        }
        renderItem={({ item }) => (
          <AppCard style={styles.card}>
            <Text style={styles.action}>{item.actionType}</Text>
            <Text style={styles.meta}>Requested By: {String(item.requestedBy || 'N/A')}</Text>
            <Text style={styles.meta}>At: {formatTime(item.createdAt)}</Text>
            <Text style={styles.meta}>Reason: {item.reason || 'N/A'}</Text>
            <View style={styles.buttonRow}>
              <TouchableOpacity style={styles.approveButton} onPress={() => handleApprove(item.approvalRequestId)}>
                <Text style={styles.approveButtonText}>Approve</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.rejectButton} onPress={() => handleReject(item.approvalRequestId)}>
                <Text style={styles.rejectButtonText}>Reject</Text>
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
