import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { UI_COLORS } from '../constants/ui-theme';
import { useAppData } from '../context/AppDataContext';

const ENTITY_FILTERS = ['all', 'product', 'customer', 'baki_transaction', 'stock_movement'];
const ACTION_FILTERS = ['all', 'create', 'update', 'delete', 'credit', 'payment'];

const formatDateTime = (value) => {
  if (!value) {
    return 'N/A';
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return 'Invalid date';
  }

  return parsed.toLocaleString();
};

export default function AuditHistoryScreen() {
  const { getAuditLogs } = useAppData();

  const [entityType, setEntityType] = useState('all');
  const [action, setAction] = useState('all');
  const [searchText, setSearchText] = useState('');
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [rows, setRows] = useState([]);
  const [error, setError] = useState('');

  const loadLogs = useCallback(async ({ isRefresh = false } = {}) => {
    try {
      if (isRefresh) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }
      setError('');

      const data = await getAuditLogs({
        entityType,
        action,
        searchText,
        limit: 250,
      });

      setRows(Array.isArray(data) ? data : []);
    } catch (loadError) {
      setError(loadError?.message || 'Unable to load audit logs.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [action, entityType, getAuditLogs, searchText]);

  useEffect(() => {
    loadLogs();
  }, [loadLogs]);

  return (
    <SafeAreaView style={styles.safeArea}>
      <FlatList
        data={rows}
        keyExtractor={(item) => String(item.id)}
        contentContainerStyle={styles.container}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => loadLogs({ isRefresh: true })} />}
        ListHeaderComponent={
          <View style={styles.headerWrap}>
            <Text style={styles.title}>Audit History</Text>
            <Text style={styles.subtitle}>Track who changed financial data and when.</Text>

            <TextInput
              value={searchText}
              onChangeText={setSearchText}
              placeholder="Search notes, action or entity"
              style={styles.input}
            />

            <Text style={styles.label}>Entity</Text>
            <View style={styles.filterRow}>
              {ENTITY_FILTERS.map((item) => (
                <TouchableOpacity
                  key={`entity-${item}`}
                  style={[styles.chip, entityType === item && styles.chipActive]}
                  onPress={() => setEntityType(item)}
                >
                  <Text style={[styles.chipText, entityType === item && styles.chipTextActive]}>{item}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={styles.label}>Action</Text>
            <View style={styles.filterRow}>
              {ACTION_FILTERS.map((item) => (
                <TouchableOpacity
                  key={`action-${item}`}
                  style={[styles.chip, action === item && styles.chipActive]}
                  onPress={() => setAction(item)}
                >
                  <Text style={[styles.chipText, action === item && styles.chipTextActive]}>{item}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <TouchableOpacity style={styles.reloadButton} onPress={() => loadLogs()}>
              <Text style={styles.reloadButtonText}>Reload</Text>
            </TouchableOpacity>

            {error ? (
              <View style={styles.errorCard}>
                <Text style={styles.errorText}>{error}</Text>
              </View>
            ) : null}
          </View>
        }
        ListEmptyComponent={
          loading ? (
            <View style={styles.loadingWrap}>
              <ActivityIndicator size="small" color={UI_COLORS.primary} />
              <Text style={styles.loadingText}>Loading logs...</Text>
            </View>
          ) : (
            <Text style={styles.emptyText}>No audit logs found for current filters.</Text>
          )
        }
        renderItem={({ item }) => (
          <View style={styles.card}>
            <View style={styles.cardTopRow}>
              <Text style={styles.cardTitle}>{item.entity_type}</Text>
              <Text style={styles.badge}>{item.action}</Text>
            </View>
            <Text style={styles.meta}>Entity ID: {item.entity_id ?? 'N/A'}</Text>
            <Text style={styles.meta}>Time: {formatDateTime(item.created_at)}</Text>
            {item.notes ? <Text style={styles.notes}>{item.notes}</Text> : null}
          </View>
        )}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: UI_COLORS.background },
  container: { padding: 16, gap: 10 },
  headerWrap: { gap: 8, marginBottom: 8 },
  title: { fontSize: 24, fontWeight: '800', color: UI_COLORS.textPrimary },
  subtitle: { fontSize: 13, color: UI_COLORS.textSecondary },
  input: {
    marginTop: 4,
    borderWidth: 1,
    borderColor: UI_COLORS.border,
    borderRadius: 10,
    backgroundColor: UI_COLORS.surface,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: UI_COLORS.textPrimary,
  },
  label: { fontSize: 12, fontWeight: '700', color: UI_COLORS.textSecondary, marginTop: 4 },
  filterRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    backgroundColor: '#F8FAFC',
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  chipActive: { backgroundColor: '#E0E7FF', borderColor: '#C7D2FE' },
  chipText: { fontSize: 11, fontWeight: '700', color: UI_COLORS.textSecondary },
  chipTextActive: { color: UI_COLORS.primary },
  reloadButton: {
    alignSelf: 'flex-start',
    borderRadius: 8,
    backgroundColor: UI_COLORS.primary,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  reloadButtonText: { color: '#fff', fontSize: 12, fontWeight: '700' },
  errorCard: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#FECACA',
    backgroundColor: '#FEF2F2',
    padding: 10,
  },
  errorText: { color: UI_COLORS.danger, fontSize: 12, fontWeight: '600' },
  loadingWrap: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  loadingText: { color: UI_COLORS.textMuted, fontSize: 12 },
  emptyText: { color: UI_COLORS.textMuted, fontSize: 13 },
  card: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: UI_COLORS.border,
    backgroundColor: UI_COLORS.surface,
    padding: 10,
    gap: 2,
  },
  cardTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  cardTitle: { fontSize: 13, fontWeight: '700', color: UI_COLORS.textPrimary, textTransform: 'capitalize' },
  badge: {
    fontSize: 11,
    color: UI_COLORS.primary,
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderWidth: 1,
    borderColor: '#C7D7FF',
    backgroundColor: '#EEF3FF',
    fontWeight: '700',
    textTransform: 'capitalize',
  },
  meta: { fontSize: 12, color: UI_COLORS.textSecondary },
  notes: { marginTop: 2, fontSize: 12, color: UI_COLORS.textPrimary, fontWeight: '600' },
});
