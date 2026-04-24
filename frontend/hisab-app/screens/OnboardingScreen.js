import { useCallback, useEffect, useMemo, useState } from 'react';
import { FlatList, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppButton, AppCard, AppInput } from '../components/ui';
import { UI_COLORS } from '../constants/ui-theme';
import { useAuth } from '../context/AuthContext';
import {
  createPilotShopOnline,
  fetchOnboardingTemplatesOnline,
  listPilotShopsOnline,
  trackAnalyticsEventOnline,
} from '../services/backend/pilotApi';
import {
  SHOP_TYPE_OPTIONS,
  getContextualTip,
  getShopTypeStarterTemplate,
} from '../services/onboarding/contextualTips';

const GUIDED_STEPS = [
  { key: 'shop_context', title: 'Shop Context', subtitle: 'Capture shop type and pilot objective.' },
  { key: 'core_setup', title: 'Core Setup', subtitle: 'Prepare products, payments, and customer basics.' },
  { key: 'first_sale', title: 'First Sale Drill', subtitle: 'Create one digital sale to validate flow.' },
  { key: 'collections', title: 'Collections Drill', subtitle: 'Record one payment and verify baki update.' },
];

export default function OnboardingScreen() {
  const { session, isOnline } = useAuth();
  const accessToken = session?.access_token || null;

  const [shopName, setShopName] = useState('');
  const [shopType, setShopType] = useState('grocery');
  const [estimatedDailySales, setEstimatedDailySales] = useState('0');
  const [stepIndex, setStepIndex] = useState(0);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [statusText, setStatusText] = useState('');
  const [templates, setTemplates] = useState({});
  const [pilotShops, setPilotShops] = useState([]);

  const activeStep = GUIDED_STEPS[stepIndex] || GUIDED_STEPS[0];

  const selectedTemplate = useMemo(() => {
    const remoteTemplate = templates?.[shopType];
    if (remoteTemplate) {
      return {
        title: remoteTemplate.title,
        focus: remoteTemplate.keyFocus,
        steps: Array.isArray(remoteTemplate.checklist) ? remoteTemplate.checklist : [],
      };
    }

    return getShopTypeStarterTemplate(shopType);
  }, [shopType, templates]);

  const loadData = useCallback(async () => {
    if (!accessToken || !isOnline) {
      setStatusText('অনবোর্ডিং টেমপ্লেটের জন্য অনলাইন মোড প্রয়োজন।');
      return;
    }

    try {
      setLoading(true);
      const [templateResponse, pilotResponse] = await Promise.all([
        fetchOnboardingTemplatesOnline({ accessToken }),
        listPilotShopsOnline({ accessToken }),
      ]);

      setTemplates(templateResponse?.templates || {});
      setPilotShops(Array.isArray(pilotResponse?.items) ? pilotResponse.items : []);
      setStatusText('');
    } catch (error) {
      setStatusText(error?.message || 'Failed to load onboarding data.');
    } finally {
      setLoading(false);
    }
  }, [accessToken, isOnline]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const createPilotShop = useCallback(async () => {
    if (!accessToken || !isOnline) {
      setStatusText('পাইলট শপ তৈরি করতে ইন্টারনেট সংযোগ প্রয়োজন।');
      return;
    }

    if (!shopName.trim()) {
      setStatusText('শপের নাম দিন।');
      return;
    }

    try {
      setCreating(true);
      setStatusText('');

      await createPilotShopOnline({
        accessToken,
        shopName: shopName.trim(),
        type: shopType,
        onboardingDate: new Date().toISOString(),
        status: 'active',
        estimatedDailySales: Number(estimatedDailySales || 0),
      });

      await trackAnalyticsEventOnline({
        accessToken,
        eventType: 'report_viewed',
        metadata: {
          origin: 'onboarding_created_shop',
          shopType,
        },
        source: 'onboarding_screen',
      });

      setShopName('');
      setEstimatedDailySales('0');
      setStatusText('পাইলট শপ সফলভাবে যোগ হয়েছে।');
      await loadData();
    } catch (error) {
      setStatusText(error?.message || 'Unable to create pilot shop.');
    } finally {
      setCreating(false);
    }
  }, [accessToken, estimatedDailySales, isOnline, loadData, shopName, shopType]);

  return (
    <SafeAreaView style={styles.safeArea}>
      <FlatList
        data={pilotShops}
        keyExtractor={(item, index) => String(item?.id || `pilot-${index}`)}
        contentContainerStyle={styles.container}
        ListHeaderComponent={(
          <View style={styles.headerWrap}>
            <Text style={styles.title}>পাইলট অনবোর্ডিং</Text>
            <Text style={styles.subtitle}>৫-১০টি বিভিন্ন ধরনের দোকানে চালু করুন।</Text>

            <AppCard style={styles.card}>
              <Text style={styles.sectionTitle}>পথপ্রদর্শক</Text>
              <Text style={styles.metaText}>Step {stepIndex + 1} of {GUIDED_STEPS.length}</Text>
              <Text style={styles.rowTitle}>{activeStep.title}</Text>
              <Text style={styles.metaText}>{activeStep.subtitle}</Text>
              <View style={styles.buttonRow}>
                <AppButton
                  title="আগে"
                  variant="secondary"
                  style={styles.buttonFlex}
                  onPress={() => setStepIndex((prev) => Math.max(0, prev - 1))}
                  disabled={stepIndex === 0}
                />
                <AppButton
                  title={stepIndex === GUIDED_STEPS.length - 1 ? 'Restart' : 'Next'}
                  style={styles.buttonFlex}
                  onPress={() => setStepIndex((prev) => (prev === GUIDED_STEPS.length - 1 ? 0 : prev + 1))}
                />
              </View>
            </AppCard>

            <AppCard style={styles.card}>
              <Text style={styles.sectionTitle}>পাইলট দোকান সেটআপ</Text>
              <AppInput
                value={shopName}
                onChangeText={setShopName}
                placeholder="দোকানের নাম"
              />
              <AppInput
                value={estimatedDailySales}
                onChangeText={setEstimatedDailySales}
                placeholder="আনুমানিক দৈনিক বিক্রি"
                keyboardType="numeric"
              />

              <View style={styles.segmentRow}>
                {SHOP_TYPE_OPTIONS.map((option) => (
                  <AppButton
                    key={option.key}
                    title={option.label}
                    variant={shopType === option.key ? 'primary' : 'secondary'}
                    style={styles.segmentButton}
                    onPress={() => setShopType(option.key)}
                  />
                ))}
              </View>

              <AppButton
                title={creating ? 'Creating...' : 'Add Pilot Shop'}
                onPress={createPilotShop}
                disabled={creating}
              />
            </AppCard>

            <AppCard style={styles.card}>
              <Text style={styles.sectionTitle}>দোকানের ধরনের টেমপ্লেট</Text>
              <Text style={styles.rowTitle}>{selectedTemplate.title}</Text>
              <Text style={styles.metaText}>Focus: {selectedTemplate.focus}</Text>
              {(selectedTemplate.steps || []).map((row, index) => (
                <Text key={`${selectedTemplate.title}-${index}`} style={styles.metaText}>- {row}</Text>
              ))}
            </AppCard>

            <AppCard style={styles.card}>
              <Text style={styles.sectionTitle}>প্রসঙ্গীয় টিপ</Text>
              <Text style={styles.metaText}>{getContextualTip(activeStep.key === 'collections' ? 'credit' : activeStep.key === 'core_setup' ? 'inventory' : 'sales')}</Text>
              {statusText ? <Text style={styles.statusText}>{statusText}</Text> : null}
            </AppCard>

            <Text style={styles.sectionTitle}>পাইলট দোকানসমূহ</Text>
            {loading ? <Text style={styles.metaText}>পাইলট দোকান লোড হচ্ছে...</Text> : null}
          </View>
        )}
        ListEmptyComponent={<Text style={styles.metaText}>এখনো কোনো পাইলট শপ নেই।</Text>}
        renderItem={({ item }) => (
          <AppCard style={styles.card}>
            <Text style={styles.rowTitle}>{item?.shop_name || 'Unknown Shop'}</Text>
            <Text style={styles.metaText}>Type: {item?.type || '-'}</Text>
            <Text style={styles.metaText}>Status: {item?.status || '-'}</Text>
            <Text style={styles.metaText}>Onboarding: {item?.onboarding_date ? new Date(item.onboarding_date).toLocaleDateString() : '-'}</Text>
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
  segmentRow: {
    flexDirection: 'row',
    gap: 8,
    flexWrap: 'wrap',
  },
  segmentButton: {
    flex: 1,
    minWidth: 100,
  },
});
