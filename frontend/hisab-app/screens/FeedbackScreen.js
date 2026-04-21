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
  { key: 'bug', label: 'Bug' },
  { key: 'feature', label: 'Feature' },
  { key: 'ux', label: 'UX' },
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
      setStatusText('Feedback sync requires online mode.');
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
      setStatusText(error?.message || 'Unable to load feedback data.');
    }
  }, [accessToken, isOnline, selectedShopId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const selectedShopName = useMemo(() => {
    const row = pilotShops.find((shop) => String(shop.id) === String(selectedShopId));
    return row?.shop_name || 'Select a shop';
  }, [pilotShops, selectedShopId]);

  const submit = useCallback(async () => {
    if (!accessToken || !isOnline) {
      setStatusText('Internet connection is required to submit feedback.');
      return;
    }

    if (!selectedShopId) {
      setStatusText('Select a pilot shop first.');
      return;
    }

    if (!message.trim()) {
      setStatusText('Feedback message is required.');
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
      setStatusText('Feedback submitted. Thank you.');
      await loadData();
    } catch (error) {
      setStatusText(error?.message || 'Unable to submit feedback.');
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
            <Text style={styles.title}>Feedback Loop</Text>
            <Text style={styles.subtitle}>Collect operator feedback continuously during pilot rollout.</Text>

            <AppCard style={styles.card}>
              <Text style={styles.sectionTitle}>Submit Feedback</Text>
              <Text style={styles.metaText}>Shop: {selectedShopName}</Text>
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
                placeholder="Write feedback from real usage"
                multiline
                style={styles.messageInput}
              />
              <AppButton
                title={submitting ? 'Submitting...' : 'Submit Feedback'}
                onPress={submit}
                disabled={submitting}
              />
              {statusText ? <Text style={styles.statusText}>{statusText}</Text> : null}
            </AppCard>

            <AppCard style={styles.card}>
              <Text style={styles.sectionTitle}>Feedback Summary</Text>
              <Text style={styles.metaText}>Total: {Number(summary?.total || 0)}</Text>
              <Text style={styles.metaText}>Bug: {Number(summary?.bug || 0)}</Text>
              <Text style={styles.metaText}>Feature: {Number(summary?.feature || 0)}</Text>
              <Text style={styles.metaText}>UX: {Number(summary?.ux || 0)}</Text>
              <Text style={styles.metaText}>Average Rating: {Number(summary?.averageRating || 0).toFixed(2)}</Text>
            </AppCard>

            <Text style={styles.sectionTitle}>Recent Feedback</Text>
          </View>
        )}
        ListEmptyComponent={<Text style={styles.metaText}>No feedback submitted yet.</Text>}
        renderItem={({ item }) => (
          <AppCard style={styles.card}>
            <Text style={styles.rowTitle}>{String(item?.category || '').toUpperCase()}</Text>
            <Text style={styles.metaText}>{item?.message || '-'}</Text>
            <Text style={styles.metaText}>Rating: {item?.rating ?? '-'}</Text>
            <Text style={styles.metaText}>Time: {item?.timestamp ? new Date(item.timestamp).toLocaleString() : '-'}</Text>
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
