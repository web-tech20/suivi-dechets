import React, { useEffect, useState } from 'react';
import { View, StyleSheet, FlatList, RefreshControl } from 'react-native';
import { Text, Surface, Button } from 'react-native-paper';
import { Bell, AlertTriangle } from 'lucide-react-native';
import api from '../services/api';
import { initWebSocket } from '../services/websocket';

export default function AlertsScreen() {
  const [alerts, setAlerts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchAlerts = async () => {
    try {
      const res = await api.get('/alerts');
      setAlerts(res.data);
    } catch (e) {
      console.warn(e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchAlerts();
    
    const cleanupWS = initWebSocket(
      null, null,
      (event) => {
        if (event === 'new_alert' || event === 'alert_resolved') {
          fetchAlerts();
        }
      }
    );
    
    return cleanupWS;
  }, []);

  const resolveAlert = async (id) => {
    try {
      await api.put(`/alerts/${id}/resolve`);
      fetchAlerts(); // Will also be triggered by WS
    } catch (e) {
      console.warn('Failed to resolve', e);
    }
  };

  const renderItem = ({ item }) => (
    <Surface style={[styles.card, { borderLeftColor: item.severite === 'critical' ? '#ef4444' : '#f59e0b', borderLeftWidth: 4 }]} elevation={2}>
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 12 }}>
        <AlertTriangle color={item.severite === 'critical' ? '#ef4444' : '#f59e0b'} size={24} />
        <View style={{ flex: 1 }}>
          <Text variant="titleMedium" style={{ fontWeight: 'bold' }}>{item.poubelle_nom}</Text>
          <Text variant="bodyMedium" style={{ color: '#94a3b8', marginTop: 4 }}>{item.message}</Text>
          <Text variant="labelSmall" style={{ color: '#64748b', marginTop: 8 }}>
            {new Date(item.timestamp).toLocaleString('fr-FR')}
          </Text>
        </View>
      </View>
      <View style={{ alignItems: 'flex-end', marginTop: 12 }}>
        <Button mode="contained" buttonColor="#334155" onPress={() => resolveAlert(item.id)}>
          Résoudre
        </Button>
      </View>
    </Surface>
  );

  return (
    <View style={styles.container}>
      <FlatList
        data={alerts}
        renderItem={renderItem}
        keyExtractor={item => item.id.toString()}
        contentContainerStyle={{ padding: 16 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); fetchAlerts(); }} tintColor="#10b981" />}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Bell color="#10b981" size={48} style={{ opacity: 0.5, marginBottom: 16 }} />
            <Text variant="titleMedium" style={{ color: '#94a3b8' }}>Aucune alerte active</Text>
          </View>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f172a' },
  card: { padding: 16, borderRadius: 12, backgroundColor: '#1e293b', marginBottom: 16 },
  empty: { alignItems: 'center', marginTop: 80 }
});
