import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

import { UI_COLORS } from '../../constants/ui-theme';
import { useAppData } from '../../context/AppDataContext';
import CustomerForm from './CustomerForm';

export default function CustomerQuickAddModal({ visible, onDismiss, onAdded }) {
  const { addCustomer } = useAppData();
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [creditLimit, setCreditLimit] = useState('0');
  const [dueTermsDays, setDueTermsDays] = useState('30');
  const [saving, setSaving] = useState(false);

  const resetForm = () => {
    setName('');
    setPhone('');
    setAddress('');
    setCreditLimit('0');
    setDueTermsDays('30');
  };

  const handleSave = async () => {
    if (!name.trim()) {
      Alert.alert('নাম দিন', 'কাস্টমারের নাম লিখুন।');
      return;
    }
    if (saving) return;
    try {
      setSaving(true);
      const numericCreditLimit = Number(creditLimit || 0);
      const numericDueTermsDays = Number(dueTermsDays || 30);
      const saved = await addCustomer({
        name: name.trim(),
        phone: phone.trim(),
        address: address.trim(),
        creditLimit: Number.isFinite(numericCreditLimit) && numericCreditLimit >= 0 ? numericCreditLimit : 0,
        dueTermsDays: Number.isInteger(numericDueTermsDays) && numericDueTermsDays > 0 ? numericDueTermsDays : 30,
      });
      resetForm();
      onAdded(String(saved.id));
    } catch (err) {
      Alert.alert('ব্যর্থ', err?.message || 'কাস্টমার যোগ করা যায়নি।');
    } finally {
      setSaving(false);
    }
  };

  const handleDismiss = () => {
    resetForm();
    onDismiss();
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={handleDismiss}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.backdrop}
      >
        <TouchableOpacity style={styles.backdropTap} activeOpacity={1} onPress={handleDismiss} />
        <View style={styles.sheet}>
          <View style={styles.header}>
            <Text style={styles.title}>নতুন কাস্টমার</Text>
            <TouchableOpacity onPress={handleDismiss} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
              <MaterialIcons name="close" size={24} color={UI_COLORS.textPrimary} />
            </TouchableOpacity>
          </View>
          <ScrollView keyboardShouldPersistTaps="handled">
            <CustomerForm
              editingCustomerId={null}
              name={name}
              phone={phone}
              address={address}
              creditLimit={creditLimit}
              dueTermsDays={dueTermsDays}
              setName={setName}
              setPhone={setPhone}
              setAddress={setAddress}
              setCreditLimit={setCreditLimit}
              setDueTermsDays={setDueTermsDays}
              onSave={handleSave}
              onCancel={handleDismiss}
              saving={saving}
            />
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  backdropTap: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  sheet: {
    backgroundColor: UI_COLORS.background,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingTop: 16,
    paddingHorizontal: 16,
    paddingBottom: 32,
    maxHeight: '90%',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: UI_COLORS.textPrimary,
  },
});
