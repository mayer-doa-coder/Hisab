import { SafeAreaView, View, Text, StyleSheet } from 'react-native';

export default function HomeScreen() {
  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.container}>
        <Text style={styles.title}>Hisab</Text>
        <Text style={styles.subtitle}>Smart Retail Assistant</Text>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Navigation Ready</Text>
          <Text style={styles.cardText}>Use bottom tabs to manage Products, Customers, and Baki.</Text>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#F4F7FF',
  },
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  title: {
    fontSize: 34,
    fontWeight: '700',
    color: '#0F172A',
  },
  subtitle: {
    marginTop: 6,
    marginBottom: 18,
    fontSize: 16,
    color: '#475569',
  },
  card: {
    width: '100%',
    maxWidth: 360,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 14,
    backgroundColor: '#fff',
    padding: 16,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#0F172A',
  },
  cardText: {
    marginTop: 6,
    fontSize: 14,
    color: '#475569',
  },
});
