import { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, FlatList, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppButton, AppCard } from '../components/ui';
import { UI_COLORS } from '../constants/ui-theme';
import { useAuth } from '../context/AuthContext';
import {
  fetchSalesReportOnline,
  fetchInventoryReportOnline,
  fetchFinanceReportOnline,
  fetchCollectionsReportOnline,
  fetchTaxSummaryOnline,
  fetchReconciliationOverviewOnline,
  exportReportCsvOnline,
  exportReportPdfOnline,
  captureAuditSnapshotOnline,
} from '../services/backend/reportingApi';

const REPORT_TYPES = [
  { key: 'sales', label: 'Sales' },
  { key: 'inventory', label: 'Inventory' },
  { key: 'finance', label: 'Finance' },
  { key: 'collections', label: 'Collections' },
];

const PERIOD_OPTIONS = [
  { key: 'daily', label: 'Daily' },
  { key: 'weekly', label: 'Weekly' },
  { key: 'monthly', label: 'Monthly' },
];

const formatMetricValue = (value) => {
  if (typeof value === 'number') {
    return Number.isInteger(value) ? String(value) : value.toFixed(2);
  }

  if (typeof value === 'boolean') {
    return value ? 'Yes' : 'No';
  }

  if (value === null || value === undefined || value === '') {
    return '-';
  }

  if (typeof value === 'object') {
    return JSON.stringify(value);
  }

  return String(value);
};

const toTitleCase = (value) => {
  return String(value || '')
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, (ch) => ch.toUpperCase());
};

export default function ReportsScreen() {
  const { session, isOnline } = useAuth();
  const [period, setPeriod] = useState('daily');
  const [reportType, setReportType] = useState('sales');
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [snapshotLoading, setSnapshotLoading] = useState(false);
  const [statusText, setStatusText] = useState('');
  const [report, setReport] = useState(null);
  const [reconciliation, setReconciliation] = useState(null);
  const [taxSummary, setTaxSummary] = useState(null);

  const accessToken = session?.access_token || null;

  const loadReport = useCallback(async () => {
    if (!isOnline || !accessToken) {
      setStatusText('রিপোর্টের জন্য অনলাইন মোড এবং বৈধ লগইন প্রয়োজন।');
      return;
    }

    try {
      setLoading(true);
      setStatusText('');

      const reportFetcherByType = {
        sales: fetchSalesReportOnline,
        inventory: fetchInventoryReportOnline,
        finance: fetchFinanceReportOnline,
        collections: fetchCollectionsReportOnline,
      };

      const fetcher = reportFetcherByType[reportType] || fetchSalesReportOnline;

      const [reportData, taxData, reconciliationData] = await Promise.all([
        fetcher({ accessToken, period }),
        fetchTaxSummaryOnline({ accessToken, period: period === 'daily' ? 'monthly' : period }),
        fetchReconciliationOverviewOnline({ accessToken, period }),
      ]);

      setReport(reportData || null);
      setTaxSummary(taxData?.taxSummary || null);
      setReconciliation(reconciliationData || null);
      setStatusText('');
    } catch (error) {
      setStatusText(error?.message || 'Failed to load reports.');
    } finally {
      setLoading(false);
    }
  }, [accessToken, isOnline, period, reportType]);

  useEffect(() => {
    loadReport();
  }, [loadReport]);

  const summaryRows = useMemo(() => {
    if (!report?.summary || typeof report.summary !== 'object') {
      return [];
    }

    return Object.entries(report.summary).map(([key, value]) => ({
      id: `summary-${key}`,
      label: toTitleCase(key),
      value: formatMetricValue(value),
    }));
  }, [report]);

  const detailRows = useMemo(() => {
    if (!report?.breakdown || typeof report.breakdown !== 'object') {
      return [];
    }

    const firstArrayKey = Object.keys(report.breakdown).find((key) => Array.isArray(report.breakdown[key]));
    if (!firstArrayKey) {
      return [];
    }

    return (report.breakdown[firstArrayKey] || []).slice(0, 25).map((row, index) => ({
      id: `${firstArrayKey}-${index}`,
      section: firstArrayKey,
      row,
    }));
  }, [report]);

  const handleExportCsv = useCallback(async () => {
    if (!accessToken) {
      setStatusText('লগইন সেশন নেই। আবার লগইন করুন।');
      return;
    }

    try {
      setExporting(true);
      const response = await exportReportCsvOnline({ accessToken, reportType, period });
      setStatusText(`CSV export ready (${response?.byteLength || 0} chars).`);
    } catch (error) {
      setStatusText(error?.message || 'CSV export failed.');
    } finally {
      setExporting(false);
    }
  }, [accessToken, period, reportType]);

  const handleExportPdf = useCallback(async () => {
    if (!accessToken) {
      setStatusText('লগইন সেশন নেই। আবার লগইন করুন।');
      return;
    }

    try {
      setExporting(true);
      const response = await exportReportPdfOnline({ accessToken, reportType, period });
      setStatusText(`PDF export ready (${response?.byteLength || 0} bytes).`);
    } catch (error) {
      setStatusText(error?.message || 'PDF export failed.');
    } finally {
      setExporting(false);
    }
  }, [accessToken, period, reportType]);

  const handleCaptureSnapshot = useCallback(async () => {
    if (!accessToken) {
      setStatusText('লগইন সেশন নেই। আবার লগইন করুন।');
      return;
    }

    try {
      setSnapshotLoading(true);
      const snapshot = await captureAuditSnapshotOnline({ accessToken });
      Alert.alert(
        'Audit Snapshot',
        snapshot?.created ? 'Daily snapshot captured successfully.' : 'Snapshot already exists for today (immutable).'
      );
    } catch (error) {
      setStatusText(error?.message || 'Unable to capture audit snapshot.');
    } finally {
      setSnapshotLoading(false);
    }
  }, [accessToken]);

  return (
    <SafeAreaView style={styles.safeArea}>
      <FlatList
        data={detailRows}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.container}
        ListHeaderComponent={
          <View style={styles.headerWrap}>
            <Text style={styles.title}>রিপোর্ট</Text>
            <Text style={styles.subtitle}>ব্যবসার রিপোর্ট তৈরি করুন।</Text>

            <AppCard style={styles.card}>
              <Text style={styles.sectionTitle}>সময়কাল</Text>
              <View style={styles.segmentRow}>
                {PERIOD_OPTIONS.map((option) => (
                  <AppButton
                    key={option.key}
                    title={option.label}
                    variant={period === option.key ? 'primary' : 'secondary'}
                    style={styles.segmentButton}
                    onPress={() => setPeriod(option.key)}
                  />
                ))}
              </View>

              <Text style={styles.sectionTitle}>রিপোর্টের ধরন</Text>
              <View style={styles.segmentRow}>
                {REPORT_TYPES.map((option) => (
                  <AppButton
                    key={option.key}
                    title={option.label}
                    variant={reportType === option.key ? 'primary' : 'secondary'}
                    style={styles.segmentButton}
                    onPress={() => setReportType(option.key)}
                  />
                ))}
              </View>

              <View style={styles.buttonRow}>
                <AppButton
                  title={loading ? 'লোড হচ্ছে...' : 'Refresh'}
                  onPress={loadReport}
                  style={styles.buttonFlex}
                  disabled={loading}
                />
                <AppButton
                  title={snapshotLoading ? 'Capturing...' : 'Capture Snapshot'}
                  variant="secondary"
                  style={styles.buttonFlex}
                  onPress={handleCaptureSnapshot}
                  disabled={snapshotLoading}
                />
              </View>
            </AppCard>

            <AppCard style={styles.card}>
              <Text style={styles.sectionTitle}>সারসংক্ষেপ</Text>
              {summaryRows.length ? (
                summaryRows.map((row) => (
                  <View key={row.id} style={styles.metricRow}>
                    <Text style={styles.metricLabel}>{row.label}</Text>
                    <Text style={styles.metricValue}>{row.value}</Text>
                  </View>
                ))
              ) : (
                <Text style={styles.metaText}>কোনো সারসংক্ষেপ নেই।</Text>
              )}
            </AppCard>

            {taxSummary ? (
              <AppCard style={styles.card}>
                <Text style={styles.sectionTitle}>করবান্ধব সারসংক্ষেপ</Text>
                <Text style={styles.metaText}>Total Sales: {formatMetricValue(taxSummary.totalSales)}</Text>
                <Text style={styles.metaText}>Total Expenses: {formatMetricValue(taxSummary.totalExpenses)}</Text>
                <Text style={styles.metaText}>Net Profit: {formatMetricValue(taxSummary.netProfit)}</Text>
              </AppCard>
            ) : null}

            {reconciliation ? (
              <AppCard style={styles.card}>
                <Text style={styles.sectionTitle}>সমন্বয়</Text>
                <Text style={styles.metaText}>All Reconciled: {reconciliation.allReconciled ? 'Yes' : 'No'}</Text>
              </AppCard>
            ) : null}

            <AppCard style={styles.card}>
              <Text style={styles.sectionTitle}>রপ্তানি</Text>
              <View style={styles.buttonRow}>
                <AppButton
                  title={exporting ? 'Exporting...' : 'Export CSV'}
                  variant="secondary"
                  style={styles.buttonFlex}
                  onPress={handleExportCsv}
                  disabled={exporting}
                />
                <AppButton
                  title={exporting ? 'Exporting...' : 'Export PDF'}
                  style={styles.buttonFlex}
                  onPress={handleExportPdf}
                  disabled={exporting}
                />
              </View>
              {statusText ? <Text style={styles.statusText}>{statusText}</Text> : null}
            </AppCard>

            <Text style={styles.sectionTitle}>বিস্তারিত বিশ্লেষণ</Text>
          </View>
        }
        ListEmptyComponent={<Text style={styles.metaText}>{loading ? 'Loading details...' : 'No detailed rows available.'}</Text>}
        renderItem={({ item }) => (
          <AppCard style={styles.card}>
            <Text style={styles.rowTitle}>{toTitleCase(item.section)}</Text>
            {Object.entries(item.row || {}).map(([key, value]) => (
              <Text key={`${item.id}-${key}`} style={styles.metaText}>
                {toTitleCase(key)}: {formatMetricValue(value)}
              </Text>
            ))}
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
  segmentRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  segmentButton: {
    minHeight: 44,
    paddingVertical: 8,
    flexGrow: 1,
  },
  buttonRow: {
    flexDirection: 'row',
    gap: 8,
  },
  buttonFlex: {
    flex: 1,
    minHeight: 46,
  },
  metricRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 10,
    borderBottomWidth: 1,
    borderBottomColor: UI_COLORS.border,
    paddingVertical: 6,
  },
  metricLabel: {
    fontSize: 13,
    color: UI_COLORS.textSecondary,
    flex: 1,
  },
  metricValue: {
    fontSize: 13,
    color: UI_COLORS.textPrimary,
    fontWeight: '700',
    flexShrink: 0,
  },
  metaText: {
    fontSize: 13,
    color: UI_COLORS.textSecondary,
  },
  rowTitle: {
    fontSize: 14,
    color: UI_COLORS.textPrimary,
    fontWeight: '700',
  },
  statusText: {
    fontSize: 12,
    color: UI_COLORS.textMuted,
  },
});
