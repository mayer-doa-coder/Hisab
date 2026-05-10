import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import ReceiptView from '../components/ReceiptView';
import { UI_COLORS } from '../constants/ui-theme';
import { useAppData } from '../context/AppDataContext';

const formatMoney = (value) => `৳${Number(value || 0).toFixed(2)}`;

const buildReceiptText = (receipt) => {
  const lines = [];
  lines.push(`Receipt: ${receipt.receipt_id}`);
  lines.push(`Date: ${receipt.timestamp || 'N/A'}`);
  lines.push(`Customer: ${receipt.customer_name || 'Walk-in'}`);
  lines.push('');
  lines.push('Items:');
  (receipt.items || []).forEach((item) => {
    lines.push(`- ${item.product_name} x${item.quantity} @ ${formatMoney(item.unit_price)} = ${formatMoney(item.subtotal)}`);
  });
  lines.push('');
  lines.push('Payments:');
  (receipt.payments || []).forEach((payment) => {
    lines.push(`- ${payment.method} (${payment.status}) ${formatMoney(payment.amount)}`);
  });
  lines.push('');
  lines.push(`Total: ${formatMoney(receipt.total_amount)}`);

  return lines.join('\n');
};

export default function ReceiptScreen({ navigation, route }) {
  const { getSaleReceipt } = useAppData();
  const [receipt, setReceipt] = useState(null);
  const [loading, setLoading] = useState(true);
  const [errorText, setErrorText] = useState('');
  const [autoShareDone, setAutoShareDone] = useState(false);

  const saleId = useMemo(() => Number(route?.params?.saleId || 0), [route?.params?.saleId]);
  const receiptId = useMemo(() => String(route?.params?.receiptId || '').trim(), [route?.params?.receiptId]);
  const shouldAutoShare = Boolean(route?.params?.autoShare);

  const handleShare = useCallback(async () => {
    if (!receipt) {
      return;
    }

    try {
      await Share.share({
        title: `Receipt ${receipt.receipt_id}`,
        message: buildReceiptText(receipt),
      });
    } catch (error) {
      Alert.alert('শেয়ার ব্যর্থ', error?.message || 'রিসিট শেয়ার করা যায়নি।');
    }
  }, [receipt]);

  const loadReceipt = useCallback(async () => {
    try {
      setLoading(true);
      setErrorText('');
      const data = await getSaleReceipt({
        saleId: Number.isInteger(saleId) && saleId > 0 ? saleId : null,
        receiptId: receiptId || null,
      });
      setReceipt(data);
    } catch (error) {
      setErrorText(error?.message || 'Unable to load receipt.');
      setReceipt(null);
    } finally {
      setLoading(false);
    }
  }, [getSaleReceipt, receiptId, saleId]);

  useEffect(() => {
    loadReceipt();
  }, [loadReceipt]);

  useEffect(() => {
    if (!shouldAutoShare || !receipt || autoShareDone) {
      return;
    }

    setAutoShareDone(true);
    handleShare();
  }, [autoShareDone, handleShare, receipt, shouldAutoShare]);

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.container}>
        <Text style={styles.title}>রিসিট</Text>

        {loading ? (
          <View style={styles.loadingWrap}>
            <ActivityIndicator color={UI_COLORS.primary} />
            <Text style={styles.loadingText}>রসিদ লোড হচ্ছে...</Text>
          </View>
        ) : null}

        {errorText ? <Text style={styles.errorText}>{errorText}</Text> : null}

        {!loading && !errorText ? <ReceiptView receipt={receipt} /> : null}

        {!loading && !errorText ? (
          <View style={styles.buttonRow}>
            <TouchableOpacity style={styles.primaryButton} onPress={handleShare}>
              <Text style={styles.primaryButtonText}>রিসিট শেয়ার করুন</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.secondaryButton} onPress={() => handleShare()}>
              <Text style={styles.secondaryButtonText}>পুনরায় প্রিন্ট</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.secondaryButton} onPress={() => navigation.navigate('MainSidebar', { screen: 'Sales' })}>
              <Text style={styles.secondaryButtonText}>বিক্রিতে ফিরুন</Text>
            </TouchableOpacity>
          </View>
        ) : null}
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
    padding: 14,
    paddingBottom: 20,
    gap: 10,
  },
  title: {
    fontSize: 24,
    fontWeight: '800',
    color: UI_COLORS.textPrimary,
  },
  loadingWrap: {
    alignItems: 'center',
    gap: 8,
    marginTop: 20,
  },
  loadingText: {
    fontSize: 13,
    color: UI_COLORS.textSecondary,
  },
  errorText: {
    marginTop: 10,
    fontSize: 13,
    color: UI_COLORS.textDanger,
  },
  buttonRow: {
    marginTop: 2,
    gap: 8,
  },
  primaryButton: {
    borderRadius: 10,
    backgroundColor: UI_COLORS.primary,
    paddingVertical: 12,
    alignItems: 'center',
  },
  primaryButtonText: {
    color: UI_COLORS.textOnPrimary,
    fontWeight: '700',
  },
  secondaryButton: {
    borderWidth: 1,
    borderColor: UI_COLORS.borderSoft,
    borderRadius: 10,
    backgroundColor: UI_COLORS.surfaceSubtle,
    paddingVertical: 10,
    alignItems: 'center',
  },
  secondaryButtonText: {
    color: UI_COLORS.primary,
    fontWeight: '700',
    fontSize: 12,
  },
});
