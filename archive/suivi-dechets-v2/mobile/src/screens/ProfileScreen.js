import React, { useEffect, useState } from 'react';
import { View, StyleSheet } from 'react-native';
import { Text, Surface, Button, Avatar, List } from 'react-native-paper';
import { clearToken } from '../utils/storage';
import api from '../services/api';
import { LogOut, User, Shield, Phone } from 'lucide-react-native';

export default function ProfileScreen() {
  const [user, setUser] = useState(null);

  useEffect(() => {
    const fetchProfile = async () => {
      try {
        const res = await api.get('/auth/me');
        setUser(res.data);
      } catch (e) {
        console.warn('Failed to fetch profile', e);
      }
    };
    fetchProfile();
  }, []);

  const handleLogout = async () => {
    await clearToken();
    // In a real app with navigation context, we would trigger a state change 
    // to render the LoginScreen. For this simplified architecture, we rely on App.js state hook.
    // However, App.js won't re-render automatically here without Context/Redux.
    // Assuming simple refresh logic for demo:
    alert('Déconnecté avec succès. Redémarrez l\'application.');
  };

  if (!user) return <View style={styles.container} />;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Avatar.Text size={80} label={user.nom.substring(0, 2).toUpperCase()} style={{ backgroundColor: '#10b981' }} />
        <Text variant="headlineSmall" style={styles.name}>{user.nom}</Text>
        <View style={styles.roleBadge}>
          <Text style={styles.roleText}>{user.role.replace('_', ' ')}</Text>
        </View>
      </View>

      <Surface style={styles.card} elevation={2}>
        <List.Item
          title="Adresse Email"
          description={user.email}
          left={props => <User {...props} color="#94a3b8" />}
          titleStyle={{ color: '#f8fafc' }}
          descriptionStyle={{ color: '#64748b' }}
        />
        <List.Item
          title="Sécurité"
          description={user.emailVerifie ? "Email vérifié" : "Email non vérifié"}
          left={props => <Shield {...props} color="#10b981" />}
          titleStyle={{ color: '#f8fafc' }}
          descriptionStyle={{ color: '#64748b' }}
        />
        <List.Item
          title="Contact d'Urgence"
          description="+229 97 00 00 00"
          left={props => <Phone {...props} color="#94a3b8" />}
          titleStyle={{ color: '#f8fafc' }}
          descriptionStyle={{ color: '#64748b' }}
        />
      </Surface>

      <Button 
        mode="outlined" 
        icon={() => <LogOut color="#ef4444" size={18} />}
        onPress={handleLogout}
        textColor="#ef4444"
        style={styles.logoutBtn}
      >
        Déconnexion
      </Button>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f172a', padding: 16 },
  header: { alignItems: 'center', marginTop: 30, marginBottom: 30 },
  name: { fontWeight: 'bold', color: '#f8fafc', marginTop: 16 },
  roleBadge: { backgroundColor: '#334155', paddingHorizontal: 12, paddingVertical: 4, borderRadius: 16, marginTop: 8 },
  roleText: { color: '#94a3b8', fontSize: 12, fontWeight: 'bold' },
  card: { borderRadius: 12, backgroundColor: '#1e293b', overflow: 'hidden' },
  logoutBtn: { marginTop: 30, borderColor: '#ef4444' }
});
