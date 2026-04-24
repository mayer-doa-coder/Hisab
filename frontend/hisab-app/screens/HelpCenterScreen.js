import { useCallback, useEffect, useMemo, useState } from 'react';
import { FlatList, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppCard, AppInput } from '../components/ui';
import { UI_COLORS } from '../constants/ui-theme';
import { useAuth } from '../context/AuthContext';
import { fetchHelpCenterArticlesOnline } from '../services/backend/pilotApi';

export default function HelpCenterScreen() {
  const { session, isOnline } = useAuth();
  const accessToken = session?.access_token || null;

  const [articles, setArticles] = useState([]);
  const [query, setQuery] = useState('');
  const [statusText, setStatusText] = useState('');

  const loadArticles = useCallback(async () => {
    if (!accessToken || !isOnline) {
      setStatusText('Help center is available when online.');
      return;
    }

    try {
      const response = await fetchHelpCenterArticlesOnline({ accessToken });
      setArticles(Array.isArray(response?.items) ? response.items : []);
      setStatusText('');
    } catch (error) {
      setStatusText(error?.message || 'Unable to load help center content.');
    }
  }, [accessToken, isOnline]);

  useEffect(() => {
    loadArticles();
  }, [loadArticles]);

  const filtered = useMemo(() => {
    const term = String(query || '').trim().toLowerCase();
    if (!term) {
      return articles;
    }

    return (articles || []).filter((item) => {
      const title = String(item?.title || '').toLowerCase();
      const content = Array.isArray(item?.content) ? item.content.join(' ').toLowerCase() : '';
      return title.includes(term) || content.includes(term);
    });
  }, [articles, query]);

  return (
    <SafeAreaView style={styles.safeArea}>
      <FlatList
        data={filtered}
        keyExtractor={(item, index) => String(item?.slug || `article-${index}`)}
        contentContainerStyle={styles.container}
        ListHeaderComponent={(
          <View style={styles.headerWrap}>
            <Text style={styles.title}>সাহায্য কেন্দ্র</Text>
            <Text style={styles.subtitle}>বিক্রি, বাকি ব্যবস্থাপনা ও রিপোর্ট দেখার পদ্ধতি জানুন।</Text>
            <AppInput
              value={query}
              onChangeText={setQuery}
              placeholder="সাহায্যের বিষয় খুঁজুন"
            />
            {statusText ? <Text style={styles.statusText}>{statusText}</Text> : null}
            <Text style={styles.sectionTitle}>নিবন্ধসমূহ</Text>
          </View>
        )}
        ListEmptyComponent={<Text style={styles.metaText}>কোনো নিবন্ধ পাওয়া যায়নি।</Text>}
        renderItem={({ item }) => (
          <AppCard style={styles.card}>
            <Text style={styles.rowTitle}>{item?.title || 'Untitled'}</Text>
            {(Array.isArray(item?.content) ? item.content : []).map((line, index) => (
              <Text key={`${item?.slug || 'content'}-${index}`} style={styles.metaText}>- {line}</Text>
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
});
