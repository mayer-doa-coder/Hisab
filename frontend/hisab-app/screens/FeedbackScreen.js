import { useCallback, useEffect, useMemo, useState } from 'react';
import { FlatList, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppButton, AppCard, AppInput } from '../components/ui';
import { UI_COLORS } from '../constants/ui-theme';
import { useAuth } from '../context/AuthContext';
import {
  listFeedbackOnline,
  listPilotShopsOnline,
  submitFeedbackOnline,
} from '../services/backend/pilotApi';

const FEEDBACK_CATEGORIES = [
  { key: 'bug', label: 'বাগ' },
  { key: 'feature', label: 'ফিচার' },
  { key: 'ux', label: 'ব্যবহারযোগ্যতা' },
];

const RATINGS = [1, 2, 3, 4, 5];

export default function FeedbackScreen() {
  const { session, isOnline } = useAuth();
  const accessToken = session?.access_token || null;

  const [pilotShops, setPilotShops] = useState([]);
  const [selectedShopId, setSelectedShopId] = useState('');
  const [category, setCategory] = useState('ux');
  const [rating, setRating] = useState(0);
  const [message, setMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [statusText, setStatusText] = useState('');
  const [items, setItems] = useState([]);
  const [summary, setSummary] = useState(null);

  const loadData = useCallback(async () => {
    if (!accessToken || !isOnline) {
      setStatusText('ফিডব্যাক সিঙ্কের জন্য অনলাইন মোড প্রয়োজন।');
      return;
    }

    try {
      const [shopsResponse, feedbackResponse] = await Promise.all([
        listPilotShopsOnline({ accessToken }),
        listFeedbackOnline({ accessToken, limit: 100 }),
      ]);

      const shops = Array.isArray(shopsResponse?.items) ? shopsResponse.items : [];
      setPilotShops(shops);
      if (!selectedShopId && shops.length > 0) {
        setSelectedShopId(String(shops[0].id));
      }

      setItems(Array.isArray(feedbackResponse?.items) ? feedbackResponse.items : []);
      setSummary(feedbackResponse?.summary || null);
      setStatusText('');
    } catch (error) {
      setStatusText(error?.message || 'ফিডব্যাক ডেটা লোড হয়নি।');
    }
  }, [accessToken, isOnline, selectedShopId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const selectedShopName = useMemo(() => {
    const row = pilotShops.find((shop) => String(shop.id) === String(selectedShopId));
    return row?.shop_name || 'শপ বেছে নিন';
  }, [pilotShops, selectedShopId]);

  const submit = useCallback(async () => {
    if (!accessToken || !isOnline) {
      setStatusText('ফিডব্যাক পাঠাতে ইন্টারনেট সংযোগ প্রয়োজন।');
      return;
    }

    if (!selectedShopId) {
      setStatusText('প্রথমে একটি পাইলট শপ বেছে নিন।');
      return;
    }

    if (!message.trim()) {
      setStatusText('ফিডব্যাক বার্তা লিখুন।');
      return;
    }

    try {
      setSubmitting(true);
      await submitFeedbackOnline({
        accessToken,
        shopId: selectedShopId,
        message: message.trim(),
        category,
        rating: rating > 0 ? rating : null,
        timestamp: new Date().toISOString(),
      });

      setMessage('');
      setRating(0);
      setStatusText('ফিডব্যাক পাঠানো হয়েছে। ধন্যবাদ।');
      await loadData();
    } catch (error) {
      setStatusText(error?.message || 'ফিডব্যাক পাঠানো যায়নি।');
    } finally {
      setSubmitting(false);
    }
  }, [accessToken, category, isOnline, loadData, message, rating, selectedShopId]);

  return (
    <SafeAreaView style={styles.safeArea}>
      <FlatList
        data={items}
        keyExtractor={(item, index) => String(item?.feedbackId || `feedback-${index}`)}
        contentContainerStyle={styles.container}
        ListHeaderComponent={(
          <View style={styles.headerWrap}>
            <Text style={styles.title}>ফিডব্যাক</Text>
            <Text style={styles.subtitle}>পাইলট রোলআউটের সময় অপারেটরের মতামত সংগ্রহ করুন।</Text>

            <AppCard style={styles.card}>
              <Text style={styles.sectionTitle}>ফিডব্যাক দিন</Text>
              <Text style={styles.metaText}>শপ: {selectedShopName}</Text>
              <View style={styles.segmentRow}>
                {pilotShops.map((shop) => (
                  <AppButton
                    key={shop.id}
                    title={shop.shop_name}
                    variant={String(selectedShopId) === String(shop.id) ? 'primary' : 'secondary'}
                    style={styles.segmentButton}
                    onPress={() => setSelectedShopId(String(shop.id))}
                  />
                ))}
              </View>

              <View style={styles.segmentRow}>
                {FEEDBACK_CATEGORIES.map((item) => (
                  <AppButton
                    key={item.key}
                    title={item.label}
                    variant={category === item.key ? 'primary' : 'secondary'}
                    style={styles.segmentButton}
                    onPress={() => setCategory(item.key)}
                  />
                ))}
              </View>

              <View style={styles.segmentRow}>
                {RATINGS.map((value) => (
                  <AppButton
                    key={`rating-${value}`}
                    title={`${value}`}
                    variant={rating === value ? 'primary' : 'secondary'}
                    style={styles.ratingButton}
                    onPress={() => setRating(value)}
                  />
                ))}
              </View>

              <AppInput
                value={message}
                onChangeText={setMessage}
                placeholder="আপনার মতামত লিখুন"
                multiline
                style={styles.messageInput}
              />
              <AppButton
                title={submitting ? 'পাঠানো হচ্ছে...' : 'ফিডব্যাক পাঠান'}
                onPress={submit}
                disabled={submitting}
              />
              {statusText ? <Text style={styles.statusText}>{statusText}</Text> : null}
            </AppCard>

            <AppCard style={styles.card}>
              <Text style={styles.sectionTitle}>ফিডব্যাক সারসংক্ষেপ</Text>
              <Text style={styles.metaText}>মোট: {Number(summary?.total || 0)}</Text>
              <Text style={styles.metaText}>বাগ: {Number(summary?.bug || 0)}</Text>
              <Text style={styles.metaText}>ফিচার: {Number(summary?.feature || 0)}</Text>
              <Text style={styles.metaText}>ব্যবহারযোগ্যতা: {Number(summary?.ux || 0)}</Text>
              <Text style={styles.metaText}>গড় রেটিং: {Number(summary?.averageRating || 0).toFixed(2)}</Text>
            </AppCard>

            <Text style={styles.sectionTitle}>সাম্প্রতিক ফিডব্যাক</Text>
          </View>
        )}
        ListEmptyComponent={<Text style={styles.metaText}>এখনো কোনো ফিডব্যাক নেই।</Text>}
        renderItem={({ item }) => (
          <AppCard style={styles.card}>
            <Text style={styles.rowTitle}>{String(item?.category || '').toUpperCase()}</Text>
            <Text style={styles.metaText}>{item?.message || '-'}</Text>
            <Text style={styles.metaText}>রেটিং: {item?.rating ?? '-'}</Text>
            <Text style={styles.metaText}>সময়: {item?.timestamp ? new Date(item.timestamp).toLocaleString() : '-'}</Text>
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
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: UI_COLORS.textPrimary,
  },
  card: {
    gap: 8,
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
  segmentRow: {
    flexDirection: 'row',
    gap: 8,
    flexWrap: 'wrap',
  },
  segmentButton: {
    minWidth: 100,
    flex: 1,
  },
  ratingButton: {
    width: 48,
    minHeight: 42,
  },
  messageInput: {
    minHeight: 96,
    textAlignVertical: 'top',
  },
});
