import React, { useState } from 'react';
import { View, StyleSheet, Image, KeyboardAvoidingView, Platform } from 'react-native';
import { TextInput, Button, Text, Surface, HelperText } from 'react-native-paper';
import { saveToken } from '../utils/storage';
import { Trash2 } from 'lucide-react-native';

const BASE_URL = 'http://10.0.2.2:3000/api';

export default function LoginScreen({ onLoginSuccess }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleLogin = async () => {
    setLoading(true);
    setError('');
    
    try {
      const res = await fetch(`${BASE_URL}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      });
      
      const data = await res.json();
      
      if (!res.ok) {
        throw new Error(data.error || 'Connexion échouée');
      }
      
      await saveToken(data.accessToken);
      onLoginSuccess();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView 
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={styles.container}
    >
      <Surface style={styles.card} elevation={4}>
        <View style={styles.header}>
          <Trash2 color="#10b981" size={48} />
          <Text variant="headlineMedium" style={styles.title}>SUIVI-DÉCHETS</Text>
          <Text variant="bodyMedium" style={styles.subtitle}>Mobile Collector App</Text>
        </View>

        <TextInput
          label="Adresse Email"
          mode="outlined"
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          keyboardType="email-address"
          style={styles.input}
          outlineColor="#334155"
          activeOutlineColor="#10b981"
        />
        
        <TextInput
          label="Mot de passe"
          mode="outlined"
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          style={styles.input}
          outlineColor="#334155"
          activeOutlineColor="#10b981"
        />

        {error ? <HelperText type="error" visible={!!error}>{error}</HelperText> : null}

        <Button 
          mode="contained" 
          onPress={handleLogin} 
          loading={loading}
          disabled={loading || !email || !password}
          style={styles.button}
          contentStyle={{ paddingVertical: 8 }}
        >
          Se connecter
        </Button>
      </Surface>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0f172a',
    justifyContent: 'center',
    padding: 20,
  },
  card: {
    padding: 24,
    borderRadius: 16,
    backgroundColor: '#1e293b',
  },
  header: {
    alignItems: 'center',
    marginBottom: 30,
  },
  title: {
    fontWeight: 'bold',
    color: '#f8fafc',
    marginTop: 10,
  },
  subtitle: {
    color: '#94a3b8',
  },
  input: {
    marginBottom: 16,
    backgroundColor: '#0f172a',
  },
  button: {
    marginTop: 10,
    borderRadius: 8,
  }
});
