import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useMemo, useRef, useState } from 'react';
import {
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import CustomerPhotoCapture from '../components/baki/CustomerPhotoCapture';
import PaymentCodeModal from '../components/baki/PaymentCodeModal';
import PhotoPreviewBadge from '../components/baki/PhotoPreviewBadge';
import CustomerChipSelector from '../components/customers/CustomerChipSelector';
import CustomerQuickAddModal from '../components/customers/CustomerQuickAddModal';
import { UI_COLORS } from '../constants/ui-theme';
import { useAppData } from '../context/AppDataContext';
import { useLanguage } from '../context/LanguageContext';
import { uploadBakiImage } from '../services/backend/bakiImageApi';
import BakiFilters from './baki/BakiFilters';
import BakiListItem from './baki/BakiListItem';

const TRUST_PHOTO_THRESHOLD = 50;

const MODE_CREDIT = 'credit';
const MODE_PAYMENT = 'payment';
const QUICK_AMOUNTS = [50, 100, 500, 1000];
const PAYMENT_METHOD_KEYS = ['cash', 'bkash', 'nagad', 'bank', 'baki'];


export default function BakiListScreen() {
  const { t } = useLanguage();
  const { customers, bakiRows, addBaki, addBakiPayment, addCustomer, refreshAll, refreshing } = useAppData();

  const listRef = useRef(null);
  const amountRef = useRef(null);

  const [activeMode, setActiveMode] = useState(MODE_CREDIT);
  const [selectedCustomerId, setSelectedCustomerId] = useState('');
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('cash');
  const [saving, setSaving] = useState(false);
  const [showNote, setShowNote] = useState(false);
  const [showQuickAdd, setShowQuickAdd] = useState(false);
  const [showCamera, setShowCamera] = useState(false);
  const [capturedImageUri, setCapturedImageUri] = useState(null);
  const [paymentCodeRow, setPaymentCodeRow] = useState(null);

  // list-level filter state (separate from form)
  const [search, setSearch] = useState('');
  const [listCustomerId, setListCustomerId] = useState('all');
  const [dueFilter, setDueFilter] = useState('all');

  const dueByCustomerId = useMemo(() => {
    const map = new Map();
    for (const row of bakiRows) {
      map.set(Number(row.customer_id), Math.max(0, Number(row.due_amount || 0)));
    }
    return map;
  }, [bakiRows]);

  const selectedCustomerDue = dueByCustomerId.get(Number(selectedCustomerId)) || 0;

  const selectedCustomer = useMemo(
    () => customers.find((c) => String(c.id) === String(selectedCustomerId)) || null,
    [customers, selectedCustomerId],
  );
  const selectedTrustScore = Number.isFinite(Number(selectedCustomer?.trust_score))
    ? Number(selectedCustomer.trust_score)
    : null;
  const requiresPhoto =
    activeMode === MODE_CREDIT &&
    selectedTrustScore !== null &&
    selectedTrustScore < TRUST_PHOTO_THRESHOLD;

  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return bakiRows.filter((row) => {
      const matchCustomer =
        listCustomerId === 'all' || Number(row.customer_id) === Number(listCustomerId);
      const due = Math.max(0, Number(row.due_amount || 0));
      const matchDue =
        dueFilter === 'all' ||
        (dueFilter === 'with-due' && due > 0) ||
        (dueFilter === 'no-due' && due <= 0);
      const matchQuery =
        !q ||
        String(row.customer_name || '').toLowerCase().includes(q) ||
        String(row.customer_phone || '').toLowerCase().includes(q);
      return matchCustomer && matchDue && matchQuery;
    });
  }, [bakiRows, dueFilter, search, listCustomerId]);

  const totalDue = useMemo(
    () => filteredRows.reduce((sum, r) => sum + Math.max(0, Number(r.due_amount || 0)), 0),
    [filteredRows],
  );

  const switchMode = (mode) => {
    setActiveMode(mode);
    setAmount('');
    setNote('');
    setShowNote(false);
    setCapturedImageUri(null);
  };

  const resetForm = (keepCustomer = false) => {
    setAmount('');
    setNote('');
    setShowNote(false);
    setCapturedImageUri(null);
    if (!keepCustomer) setSelectedCustomerId('');
  };

  const applyQuickAmount = (q) => {
    setAmount(String(q));
    amountRef.current?.blur();
  };

  const handleSave = async () => {
    if (saving) return;

    const numericAmount = Number(amount);

    if (!selectedCustomerId) {
      Alert.alert(t('baki.selectCustomer'), t('baki.error.customerRequired'));
      return;
    }
    if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
      Alert.alert(t('baki.amount'), t('baki.error.amountRequired'));
      return;
    }

    if (activeMode === MODE_PAYMENT) {
      if (selectedCustomerDue <= 0) {
        Alert.alert(t('baki.noDueTitle'), t('baki.noDueMsg'));
        return;
      }
      if (numericAmount - selectedCustomerDue > 0.000001) {
        Alert.alert(
          t('baki.overAmountTitle'),
          t('baki.overAmountMsg', { amount: selectedCustomerDue.toFixed(2) }),
        );
        return;
      }
      Alert.alert(
        t('baki.confirmPaymentTitle'),
        t('baki.confirmPaymentMsg', { amount: numericAmount.toFixed(2) }),
        [
          { text: t('common.cancel'), style: 'cancel' },
          {
            text: t('baki.confirm'),
            onPress: async () => {
              try {
                setSaving(true);
                await addBakiPayment({
                  customerId: Number(selectedCustomerId),
                  amount: numericAmount,
                  note,
                  paymentMethod,
                });
                resetForm(true);
                Alert.alert(t('baki.success'), t('baki.paymentSuccess'));
              } catch (error) {
                Alert.alert(t('baki.failed'), error?.message || t('baki.paymentFailed'));
              } finally {
                setSaving(false);
              }
            },
          },
        ],
      );
    } else {
      if (requiresPhoto && !capturedImageUri) {
        Alert.alert(
          t('baki.photoRequiredTitle'),
          t('baki.photoRequiredMsg'),
          [
            { text: t('common.cancel'), style: 'cancel' },
            { text: t('baki.takePhoto'), onPress: () => setShowCamera(true) },
          ],
        );
        return;
      }
      try {
        setSaving(true);
        let imageUrl = null;
        if (capturedImageUri) {
          try {
            const result = await uploadBakiImage({
              imageUri: capturedImageUri,
              customerId: Number(selectedCustomerId),
            });
            imageUrl = result?.image_url || null;
          } catch {
            imageUrl = capturedImageUri;
          }
        }
        await addBaki({
          customerId: Number(selectedCustomerId),
          amount: numericAmount,
          note,
          imageUrl,
        });
        resetForm(true);
        Alert.alert(t('baki.success'), t('baki.creditSuccess'));
      } catch (error) {
        Alert.alert(t('baki.failed'), error?.message || t('baki.creditFailed'));
      } finally {
        setSaving(false);
      }
    }
  };

  const handleStartPayment = (row) => {
    setSelectedCustomerId(String(row.customer_id));
    switchMode(MODE_PAYMENT);
    listRef.current?.scrollToOffset({ offset: 0, animated: true });
  };

  const handleShowPaymentCode = (row) => {
    setPaymentCodeRow(row);
  };

  const isPayment = activeMode === MODE_PAYMENT;
  const modeColor = isPayment ? UI_COLORS.success : UI_COLORS.primary;
  const canSave = Boolean(selectedCustomerId) && Number(amount) > 0 && !saving;

  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.flex}
      >
        <FlatList
          ref={listRef}
          data={filteredRows}
          keyExtractor={(item, index) =>
            String(item.id ?? item.customer_id ?? `baki-${index}`)
          }
          contentContainerStyle={styles.container}
          keyboardShouldPersistTaps="handled"
          ListHeaderComponent={
            <View>
              {/* ── Mode tabs ─────────────────────────────────── */}
              <View style={styles.modeTabs}>
                <TouchableOpacity
                  style={[styles.modeTab, !isPayment && styles.modeTabActiveRed]}
                  activeOpacity={0.82}
                  onPress={() => switchMode(MODE_CREDIT)}
                >
                  <MaterialIcons
                    name="add-circle-outline"
                    size={22}
                    color={!isPayment ? UI_COLORS.textOnPrimary : UI_COLORS.textSecondary}
                  />
                  <Text style={[styles.modeTabText, !isPayment && styles.modeTabTextActive]}>
                    {t('baki.giveCredit')}
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.modeTab, isPayment && styles.modeTabActiveGreen]}
                  activeOpacity={0.82}
                  onPress={() => switchMode(MODE_PAYMENT)}
                >
                  <MaterialIcons
                    name="payments"
                    size={22}
                    color={isPayment ? UI_COLORS.textOnPrimary : UI_COLORS.textSecondary}
                  />
                  <Text style={[styles.modeTabText, isPayment && styles.modeTabTextActive]}>
                    {t('baki.receivePayment')}
                  </Text>
                </TouchableOpacity>
              </View>

              {/* ── Entry form card ───────────────────────────── */}
              <View style={[styles.formCard, { borderColor: modeColor }]}>

                {/* Customer */}
                <Text style={styles.fieldLabel}>{t('baki.customer')}</Text>
                <CustomerChipSelector
                  customers={customers}
                  selectedId={selectedCustomerId}
                  onSelect={setSelectedCustomerId}
                  onAddNew={() => setShowQuickAdd(true)}
                />

                {/* Due badge — payment mode only */}
                {isPayment && selectedCustomerId ? (
                  <View style={[
                    styles.dueBadge,
                    selectedCustomerDue > 0 ? styles.dueBadgeActive : styles.dueBadgeZero,
                  ]}>
                    <Text style={styles.dueBadgeLabel}>{t('baki.currentDue')}</Text>
                    <Text style={[
                      styles.dueBadgeAmount,
                      selectedCustomerDue > 0 ? styles.dueBadgeAmountRed : styles.dueBadgeAmountGray,
                    ]}>
                      ৳{selectedCustomerDue.toFixed(2)}
                    </Text>
                  </View>
                ) : null}

                {/* Quick amounts */}
                <Text style={styles.fieldLabel}>{t('baki.amount')}</Text>
                <View style={styles.quickRow}>
                  {QUICK_AMOUNTS.map((q) => {
                    const isSelected = amount === String(q);
                    return (
                      <TouchableOpacity
                        key={q}
                        style={[
                          styles.quickBtn,
                          isSelected && { backgroundColor: modeColor, borderColor: modeColor },
                        ]}
                        activeOpacity={0.78}
                        onPress={() => applyQuickAmount(q)}
                      >
                        <Text style={[styles.quickBtnText, isSelected && styles.quickBtnTextActive]}>
                          ৳{q}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}

                  {/* "পুরো বাকি" shortcut in payment mode */}
                  {isPayment && selectedCustomerDue > 0 && (
                    <TouchableOpacity
                      style={[
                        styles.quickBtn,
                        styles.quickBtnFull,
                        amount === selectedCustomerDue.toFixed(2) && {
                          backgroundColor: UI_COLORS.success,
                          borderColor: UI_COLORS.success,
                        },
                      ]}
                      activeOpacity={0.78}
                      onPress={() => applyQuickAmount(selectedCustomerDue.toFixed(2))}
                    >
                      <Text
                        style={[
                          styles.quickBtnText,
                          amount === selectedCustomerDue.toFixed(2) && styles.quickBtnTextActive,
                        ]}
                      >
                        {t('baki.fullAmount', { amount: selectedCustomerDue.toFixed(0) })}
                      </Text>
                    </TouchableOpacity>
                  )}
                </View>

                {/* Big amount input */}
                <View style={[styles.amountWrap, { borderColor: modeColor }]}>
                  <Text style={[styles.amountCurrency, { color: modeColor }]}>৳</Text>
                  <TextInput
                    ref={amountRef}
                    value={amount}
                    onChangeText={setAmount}
                    placeholder="0"
                    placeholderTextColor={UI_COLORS.textMuted}
                    keyboardType="decimal-pad"
                    style={styles.amountInput}
                  />
                  {amount ? (
                    <TouchableOpacity
                      onPress={() => setAmount('')}
                      hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                    >
                      <MaterialIcons name="close" size={20} color={UI_COLORS.textMuted} />
                    </TouchableOpacity>
                  ) : null}
                </View>

                {/* Payment method — receive mode only */}
                {isPayment && (
                  <>
                    <Text style={styles.fieldLabel}>{t('baki.paymentMethod')}</Text>
                    <View style={styles.methodRow}>
                      {PAYMENT_METHOD_KEYS.map((key) => (
                        <TouchableOpacity
                          key={key}
                          style={[
                            styles.methodChip,
                            paymentMethod === key && {
                              backgroundColor: UI_COLORS.success,
                              borderColor: UI_COLORS.success,
                            },
                          ]}
                          activeOpacity={0.78}
                          onPress={() => setPaymentMethod(key)}
                        >
                          <Text
                            style={[
                              styles.methodChipText,
                              paymentMethod === key && styles.methodChipTextActive,
                            ]}
                          >
                            {t(`baki.${key}`)}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  </>
                )}

                {/* Note — collapsible */}
                {showNote ? (
                  <TextInput
                    value={note}
                    onChangeText={setNote}
                    placeholder={t('baki.writeNote')}
                    placeholderTextColor={UI_COLORS.textMuted}
                    style={styles.noteInput}
                    multiline
                    numberOfLines={2}
                  />
                ) : (
                  <TouchableOpacity
                    style={styles.noteToggle}
                    onPress={() => setShowNote(true)}
                  >
                    <MaterialIcons name="add" size={14} color={UI_COLORS.textMuted} />
                    <Text style={styles.noteToggleText}>{t('baki.addNote')}</Text>
                  </TouchableOpacity>
                )}

                {/* ── Photo capture — credit mode + low trust ──── */}
                {!isPayment && selectedCustomerId ? (
                  <View style={styles.photoSection}>
                    {requiresPhoto && !capturedImageUri && (
                      <View style={styles.trustAlert}>
                        <MaterialIcons name="warning" size={16} color={UI_COLORS.textWarning} />
                        <Text style={styles.trustAlertText}>
                          {t('baki.lowTrust')}
                        </Text>
                      </View>
                    )}

                    {capturedImageUri ? (
                      <PhotoPreviewBadge
                        uri={capturedImageUri}
                        onRemove={() => setCapturedImageUri(null)}
                      />
                    ) : (
                      <View style={styles.photoButtons}>
                        <TouchableOpacity
                          style={[styles.photoBtn, requiresPhoto && styles.photoBtnRequired]}
                          onPress={() => setShowCamera(true)}
                          activeOpacity={0.8}
                        >
                          <MaterialIcons
                            name="photo-camera"
                            size={22}
                            color={requiresPhoto ? UI_COLORS.textWarning : UI_COLORS.primary}
                          />
                          <Text style={[styles.photoBtnText, requiresPhoto && styles.photoBtnTextRequired]}>
                            {t('baki.takePhoto')}
                          </Text>
                        </TouchableOpacity>

                        <TouchableOpacity
                          style={styles.photoBtn}
                          onPress={() => setShowCamera(true)}
                          activeOpacity={0.8}
                        >
                          <MaterialIcons name="photo-library" size={22} color={UI_COLORS.primary} />
                          <Text style={styles.photoBtnText}>{t('baki.upload')}</Text>
                        </TouchableOpacity>
                      </View>
                    )}
                  </View>
                ) : null}

                {/* Primary CTA */}
                <TouchableOpacity
                  style={[
                    styles.cta,
                    { backgroundColor: modeColor },
                    !canSave && styles.ctaDisabled,
                  ]}
                  onPress={handleSave}
                  disabled={!canSave}
                  activeOpacity={0.85}
                >
                  <Text style={styles.ctaText}>
                    {saving ? t('baki.saving') : isPayment ? t('baki.receivePayment') : t('baki.giveCredit')}
                  </Text>
                </TouchableOpacity>
              </View>

              {/* ── Summary strip ─────────────────────────────── */}
              <View style={styles.summaryStrip}>
                <Text style={styles.summaryText}>
                  {t('baki.totalDue')}:{' '}
                  <Text style={styles.summaryValue}>৳{totalDue.toFixed(2)}</Text>
                </Text>
                <Text style={styles.summaryText}>{t('baki.customerCount', { count: filteredRows.length })}</Text>
              </View>

              {/* ── List filters ──────────────────────────────── */}
              <BakiFilters
                search={search}
                setSearch={setSearch}
                selectedCustomerId={listCustomerId}
                setSelectedCustomerId={setListCustomerId}
                dueFilter={dueFilter}
                setDueFilter={setDueFilter}
                customers={customers}
              />

              {/* ── List header ───────────────────────────────── */}
              <View style={styles.listHeaderRow}>
                <Text style={styles.listHeaderTitle}>{t('baki.customerBaki')}</Text>
                <TouchableOpacity
                  style={styles.refreshBtn}
                  onPress={async () => {
                    try { await refreshAll(); }
                    catch (e) { Alert.alert(t('baki.refreshFailed'), e?.message || t('baki.refreshFailedMsg')); }
                  }}
                >
                  <Text style={styles.refreshBtnText}>
                    {refreshing ? t('baki.refreshing') : t('baki.refresh')}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          }
          ListEmptyComponent={<Text style={styles.emptyText}>{t('baki.emptyList')}</Text>}
          renderItem={({ item }) => (
            <BakiListItem
              item={item}
              onStartPayment={handleStartPayment}
              onShowPaymentCode={handleShowPaymentCode}
            />
          )}
        />
      </KeyboardAvoidingView>
      <CustomerQuickAddModal
        visible={showQuickAdd}
        onDismiss={() => setShowQuickAdd(false)}
        onAdded={(id) => { setSelectedCustomerId(id); setShowQuickAdd(false); }}
      />
      <CustomerPhotoCapture
        visible={showCamera}
        onClose={() => setShowCamera(false)}
        onPhotoCaptured={(uri) => {
          setCapturedImageUri(uri);
          setShowCamera(false);
        }}
      />
      <PaymentCodeModal
        visible={Boolean(paymentCodeRow)}
        onClose={() => setPaymentCodeRow(null)}
        paymentCode={paymentCodeRow?.latest_payment_code || null}
        expiresAt={paymentCodeRow?.latest_payment_code_expires_at || null}
        customerName={paymentCodeRow?.customer_name || null}
        amount={paymentCodeRow?.due_amount || null}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: UI_COLORS.background },
  flex: { flex: 1 },
  container: { padding: 16, gap: 12, paddingBottom: 40 },

  /* mode tabs */
  modeTabs: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 4,
  },
  modeTab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 16,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: UI_COLORS.border,
    backgroundColor: UI_COLORS.surface,
  },
  modeTabActiveRed: {
    backgroundColor: UI_COLORS.primary,
    borderColor: UI_COLORS.primary,
  },
  modeTabActiveGreen: {
    backgroundColor: UI_COLORS.success,
    borderColor: UI_COLORS.success,
  },
  modeTabText: {
    fontSize: 16,
    fontWeight: '700',
    color: UI_COLORS.textSecondary,
  },
  modeTabTextActive: {
    color: UI_COLORS.textOnPrimary,
  },

  /* form card */
  formCard: {
    backgroundColor: UI_COLORS.surface,
    borderRadius: 16,
    borderWidth: 1.5,
    padding: 16,
    gap: 12,
  },
  fieldLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: UI_COLORS.textSecondary,
    marginBottom: -4,
  },

  /* due badge */
  dueBadge: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderWidth: 1,
  },
  dueBadgeActive: {
    backgroundColor: UI_COLORS.surfaceDanger,
    borderColor: UI_COLORS.borderDanger,
  },
  dueBadgeZero: {
    backgroundColor: UI_COLORS.surfaceSuccess,
    borderColor: UI_COLORS.borderSuccess,
  },
  dueBadgeLabel: { fontSize: 13, fontWeight: '600', color: UI_COLORS.textSecondary },
  dueBadgeAmount: { fontSize: 20, fontWeight: '800' },
  dueBadgeAmountRed: { color: UI_COLORS.textDanger },
  dueBadgeAmountGray: { color: UI_COLORS.textSuccess },

  /* quick amounts */
  quickRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  quickBtn: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: UI_COLORS.border,
    backgroundColor: UI_COLORS.surfaceSubtle,
    paddingHorizontal: 16,
    paddingVertical: 11,
  },
  quickBtnFull: {
    flexGrow: 1,
  },
  quickBtnText: {
    fontSize: 14,
    fontWeight: '700',
    color: UI_COLORS.textSecondary,
  },
  quickBtnTextActive: {
    color: UI_COLORS.textOnPrimary,
  },

  /* big amount input */
  amountWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 2,
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: UI_COLORS.surface,
    gap: 8,
  },
  amountCurrency: {
    fontSize: 28,
    fontWeight: '800',
  },
  amountInput: {
    flex: 1,
    fontSize: 36,
    fontWeight: '800',
    color: UI_COLORS.textPrimary,
    paddingVertical: 0,
    letterSpacing: 1,
  },

  /* payment method */
  methodRow: {
    flexDirection: 'row',
    gap: 8,
  },
  methodChip: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: UI_COLORS.border,
    backgroundColor: UI_COLORS.surface,
  },
  methodChipText: { fontSize: 14, fontWeight: '700', color: UI_COLORS.textSecondary },
  methodChipTextActive: { color: UI_COLORS.textOnPrimary },

  /* note */
  noteToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    alignSelf: 'flex-start',
    paddingVertical: 4,
  },
  noteToggleText: { fontSize: 13, color: UI_COLORS.textMuted },
  noteInput: {
    borderWidth: 1,
    borderColor: UI_COLORS.border,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: UI_COLORS.textPrimary,
    backgroundColor: UI_COLORS.surface,
    minHeight: 60,
    textAlignVertical: 'top',
  },

  /* CTA */
  cta: {
    borderRadius: 14,
    paddingVertical: 18,
    alignItems: 'center',
    marginTop: 4,
  },
  ctaDisabled: { opacity: 0.4 },
  ctaText: { fontSize: 18, fontWeight: '800', color: UI_COLORS.textOnPrimary, letterSpacing: 0.5 },

  /* summary */
  summaryStrip: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 4,
  },
  summaryText: { fontSize: 13, color: UI_COLORS.textSecondary },
  summaryValue: { fontWeight: '700', color: UI_COLORS.textPrimary },

  /* list section */
  listHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 4,
    marginBottom: 4,
  },
  listHeaderTitle: { fontSize: 18, fontWeight: '700', color: UI_COLORS.textPrimary },
  refreshBtn: {
    backgroundColor: UI_COLORS.surfaceSubtle,
    borderWidth: 1,
    borderColor: UI_COLORS.borderSoft,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  refreshBtnText: { color: UI_COLORS.primary, fontSize: 12, fontWeight: '600' },
  emptyText: { fontSize: 14, color: UI_COLORS.textMuted, textAlign: 'center', paddingTop: 20 },

  /* photo capture */
  photoSection: {
    gap: 10,
  },
  trustAlert: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: UI_COLORS.surfaceWarning,
    borderWidth: 1,
    borderColor: UI_COLORS.borderWarning,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  trustAlertText: {
    flex: 1,
    fontSize: 13,
    fontWeight: '600',
    color: UI_COLORS.textWarning,
    lineHeight: 18,
  },
  photoButtons: {
    flexDirection: 'row',
    gap: 10,
  },
  photoBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderWidth: 1.5,
    borderColor: UI_COLORS.border,
    borderRadius: 12,
    paddingVertical: 14,
    backgroundColor: UI_COLORS.surface,
  },
  photoBtnRequired: {
    borderColor: UI_COLORS.borderWarning,
    backgroundColor: UI_COLORS.surfaceWarning,
  },
  photoBtnText: {
    fontSize: 14,
    fontWeight: '700',
    color: UI_COLORS.primary,
  },
  photoBtnTextRequired: {
    color: UI_COLORS.textWarning,
  },
});
