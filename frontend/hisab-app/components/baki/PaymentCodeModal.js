import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import * as Clipboard from 'expo-clipboard';
import { useState } from 'react';
import {
  Alert,
  Modal,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

import { UI_COLORS } from '../../constants/ui-theme';

const isExpired = (expiresAt) => {
  if (!expiresAt) return false;
  return new Date(expiresAt).getTime() < Date.now();
};

const formatExpiry = (expiresAt) => {
  if (!expiresAt) return null;
  const d = new Date(expiresAt);
  if (Number.isNaN(d.getTime())) return null;
  const hours = Math.max(0, Math.round((d.getTime() - Date.now()) / (1000 * 60 * 60)));
  if (hours <= 0) return 'মেয়াদ শেষ';
  if (hours < 24) return `${hours} ঘণ্টা বাকি`;
  return `${Math.floor(hours / 24)} দিন বাকি`;
};

export default function PaymentCodeModal({ visible, onClose, paymentCode, expiresAt, customerName, amount }) {
  const [copied, setCopied] = useState(false);

  const expired = isExpired(expiresAt);
  const expiry = formatExpiry(expiresAt);

  const handleCopy = async () => {
    if (!paymentCode) return;
    try {
      await Clipboard.setStringAsync(paymentCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      Alert.alert('ব্যর্থ', 'কপি করা যায়নি।');
    }
  };

  const codeDigits = paymentCode ? paymentCode.split('') : [];

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <View style={styles.sheet}>
          {/* Header */}
          <View style={styles.header}>
            <Text style={styles.title}>পেমেন্ট কোড</Text>
            <TouchableOpacity onPress={onClose} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
              <MaterialIcons name="close" size={24} color={UI_COLORS.textMuted} />
            </TouchableOpacity>
          </View>

          {/* Customer info */}
          {customerName ? (
            <Text style={styles.customerName}>{customerName}</Text>
          ) : null}
          {amount ? (
            <Text style={styles.amountText}>বাকি: ৳{Number(amount).toFixed(2)}</Text>
          ) : null}

          {/* USSD instruction */}
          <View style={styles.ussdBox}>
            <MaterialIcons name="phone" size={16} color={UI_COLORS.textMuted} />
            <Text style={styles.ussdText}>কাস্টমার ডায়াল করবে: *12345#</Text>
          </View>

          {/* Code display */}
          {paymentCode ? (
            <>
              <Text style={styles.codeLabel}>৬-সংখ্যার পেমেন্ট কোড</Text>
              <View style={styles.codeRow}>
                {codeDigits.map((digit, i) => (
                  <View key={i} style={[styles.digitBox, expired && styles.digitBoxExpired]}>
                    <Text style={[styles.digitText, expired && styles.digitTextExpired]}>
                      {digit}
                    </Text>
                  </View>
                ))}
              </View>

              {expiry ? (
                <Text style={[styles.expiryText, expired && styles.expiryExpired]}>
                  {expired ? '⚠️ মেয়াদ শেষ হয়েছে' : `⏱ ${expiry}`}
                </Text>
              ) : null}

              <TouchableOpacity
                style={[styles.copyBtn, expired && styles.copyBtnDisabled]}
                onPress={handleCopy}
                disabled={expired}
                activeOpacity={0.78}
              >
                <MaterialIcons
                  name={copied ? 'check' : 'content-copy'}
                  size={18}
                  color={expired ? UI_COLORS.textMuted : UI_COLORS.textOnPrimary}
                />
                <Text style={[styles.copyBtnText, expired && styles.copyBtnTextDisabled]}>
                  {copied ? 'কপি হয়েছে!' : 'কোড কপি করুন'}
                </Text>
              </TouchableOpacity>
            </>
          ) : (
            <View style={styles.noCode}>
              <MaterialIcons name="info-outline" size={24} color={UI_COLORS.textMuted} />
              <Text style={styles.noCodeText}>কোনো সক্রিয় পেমেন্ট কোড নেই।</Text>
            </View>
          )}

          {/* How it works */}
          <View style={styles.stepsBox}>
            <Text style={styles.stepsTitle}>কাস্টমার কীভাবে পেমেন্ট করবে:</Text>
            <Text style={styles.stepItem}>১. *12345# ডায়াল করুন</Text>
            <Text style={styles.stepItem}>২. "পেমেন্ট করুন" বেছে নিন</Text>
            <Text style={styles.stepItem}>৩. পরিমাণ ও দোকানের নম্বর দিন</Text>
            <Text style={styles.stepItem}>৪. এই কোড ({paymentCode || '——'}) দিন</Text>
          </View>

          <TouchableOpacity style={styles.closeBtn} onPress={onClose} activeOpacity={0.82}>
            <Text style={styles.closeBtnText}>বন্ধ করুন</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: UI_COLORS.surface,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 24,
    paddingBottom: 40,
    gap: 12,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  title: {
    fontSize: 20,
    fontWeight: '800',
    color: UI_COLORS.textPrimary,
  },
  customerName: {
    fontSize: 16,
    fontWeight: '700',
    color: UI_COLORS.textPrimary,
  },
  amountText: {
    fontSize: 14,
    color: UI_COLORS.textDanger,
    fontWeight: '600',
  },
  ussdBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: UI_COLORS.surfaceSoft,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  ussdText: {
    fontSize: 13,
    color: UI_COLORS.textSecondary,
    fontWeight: '600',
  },
  codeLabel: {
    fontSize: 12,
    color: UI_COLORS.textMuted,
    textAlign: 'center',
    marginTop: 4,
  },
  codeRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
    marginVertical: 4,
  },
  digitBox: {
    width: 44,
    height: 56,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: UI_COLORS.primary,
    backgroundColor: UI_COLORS.surfaceSoft,
    justifyContent: 'center',
    alignItems: 'center',
  },
  digitBoxExpired: {
    borderColor: UI_COLORS.borderDanger,
    backgroundColor: UI_COLORS.surfaceDanger,
  },
  digitText: {
    fontSize: 26,
    fontWeight: '900',
    color: UI_COLORS.primary,
    letterSpacing: 0,
  },
  digitTextExpired: {
    color: UI_COLORS.textDanger,
  },
  expiryText: {
    textAlign: 'center',
    fontSize: 12,
    color: UI_COLORS.textMuted,
    fontWeight: '600',
  },
  expiryExpired: {
    color: UI_COLORS.textDanger,
  },
  copyBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: UI_COLORS.primary,
    borderRadius: 12,
    paddingVertical: 14,
  },
  copyBtnDisabled: {
    backgroundColor: UI_COLORS.surfaceMuted,
  },
  copyBtnText: {
    color: UI_COLORS.textOnPrimary,
    fontWeight: '700',
    fontSize: 15,
  },
  copyBtnTextDisabled: {
    color: UI_COLORS.textMuted,
  },
  noCode: {
    alignItems: 'center',
    gap: 8,
    paddingVertical: 16,
  },
  noCodeText: {
    fontSize: 14,
    color: UI_COLORS.textMuted,
    textAlign: 'center',
  },
  stepsBox: {
    backgroundColor: UI_COLORS.surfaceSoft,
    borderRadius: 10,
    padding: 12,
    gap: 4,
  },
  stepsTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: UI_COLORS.textSecondary,
    marginBottom: 4,
  },
  stepItem: {
    fontSize: 12,
    color: UI_COLORS.textSecondary,
    lineHeight: 20,
  },
  closeBtn: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: UI_COLORS.border,
    paddingVertical: 12,
    alignItems: 'center',
  },
  closeBtnText: {
    color: UI_COLORS.textSecondary,
    fontWeight: '600',
    fontSize: 14,
  },
});
