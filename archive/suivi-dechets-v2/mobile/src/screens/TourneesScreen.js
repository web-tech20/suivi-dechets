import React, { useEffect, useState } from 'react';
import { View, StyleSheet, FlatList, RefreshControl } from 'react-native';
import { Text, Surface, Button } from 'react-native-paper';
import { Route, Navigation } from 'lucide-react-native';
import api from '../services/api';
import QRScanner from '../components/QRScanner';

export default function TourneesScreen() {
  const [tournees, setTournees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [activeTourId, setActiveTourId] = useState(null);

  const fetchTournees = async () => {
    try {
      const res = await api.get('/tournees');
      setTournees(res.data);
    } catch (e) {
      console.warn(e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchTournees();
  }, []);

  const onRefresh = () => {
    setRefreshing(true);
    fetchTournees();
  };

  const startScan = (id) => {
    setActiveTourId(id);
    setScanning(true);
  };

  const handleScanComplete = async (data) => {
    setScanning(false);
    // Real implementation would validate QR matches the current point/tour
    console.log('Scanned QR:', data);
    alert('Collecte validée !');
    fetchTournees();
  };

  if (scanning) {
    return <QRScanner onScan={handleScanComplete} onCancel={() => setScanning(false)} />;
  }

  const renderItem = ({ item }) => (
    <Surface style={styles.card} elevation={2}>
      <View style={styles.cardHeader}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <Route color="#10b981" size={20} />
          <Text variant="titleMedium" style={{ fontWeight: 'bold' }}>{item.nom}</Text>
        </View>
        <View style={[styles.badge, { backgroundColor: item.statut === 'en_cours' ? '#3b82f6' : '#64748b' }]}>
          <Text style={{ fontSize: 10, color: 'white', fontWeight: 'bold' }}>
            {item.statut.toUpperCase()}
          </Text>
        </View>
      </View>
      
      <View style={styles.statsRow}>
        <View style={styles.statBox}>
          <Text style={styles.statLabel}>DISTANCE</Text>
          <Text style={styles.statVal}>{item.distance_totale} km</Text>
        </View>
        <View style={styles.statBox}>
          <Text style={styles.statLabel}>POINTS</Text>
          <Text style={styles.statVal}>{item.nb_points}</Text>
        </View>
      </View>

      <View style={styles.actions}>
        <Button 
          mode="contained" 
          icon={() => <Navigation color="white" size={16} />}
          style={{ flex: 1 }}
        >
          Naviguer
        </Button>
        <Button 
          mode="outlined" 
          onPress={() => startScan(item.id)}
          style={{ flex: 1, marginLeft: 10 }}
        >
          Scanner QR
        </Button>
      </View>
    </Surface>
  );

  return (
    <View style={styles.container}>
      <FlatList
        data={tournees}
        renderItem={renderItem}
        keyExtractor={item => item.id}
        contentContainerStyle={{ padding: 16 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#10b981" />}
        ListEmptyComponent={
          <View style={{ alignItems: 'center', marginTop: 50 }}>
            <Text style={{ color: '#64748b' }}>Aucune tournée assignée.</Text>
          </View>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f172a' },
  card: { padding: 16, borderRadius: 12, backgroundColor: '#1e293b', marginBottom: 16 },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  badge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 12 },
  statsRow: { flexDirection: 'row', gap: 10, marginBottom: 16 },
  statBox: { flex: 1, backgroundColor: '#0f172a', padding: 10, borderRadius: 8, alignItems: 'center' },
  statLabel: { fontSize: 10, color: '#94a3b8', marginBottom: 4 },
  statVal: { fontSize: 16, fontWeight: 'bold', color: '#f8fafc' },
  actions: { flexDirection: 'row' }
});
