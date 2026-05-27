import React, { useEffect, useState } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Provider as PaperProvider, MD3DarkTheme } from 'react-native-paper';
import { Alert, View, ActivityIndicator } from 'react-native';
import { Map, Route, Bell, User } from 'lucide-react-native';

// Screens
import LoginScreen from './src/screens/LoginScreen';
import MapScreen from './src/screens/MapScreen';
import TourneesScreen from './src/screens/TourneesScreen';
import AlertsScreen from './src/screens/AlertsScreen';
import ProfileScreen from './src/screens/ProfileScreen';

// Services
import { initFCM } from './src/services/notifications';
import { checkToken } from './src/utils/storage';

const Tab = createBottomTabNavigator();

const theme = {
  ...MD3DarkTheme,
  colors: {
    ...MD3DarkTheme.colors,
    primary: '#10b981',
    secondary: '#3b82f6',
    error: '#ef4444',
    background: '#0f172a',
    surface: '#1e293b'
  },
};

export default function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // 1. Initialize Firebase Cloud Messaging for Push Notifications
    const cleanupFCM = initFCM((message) => {
      Alert.alert('🔔 Nouvelle Alerte', message.notification?.body || 'Alerte Système');
    });

    // 2. Check Authentication Token
    const verifyAuth = async () => {
      const token = await checkToken();
      setIsAuthenticated(!!token);
      setIsLoading(false);
    };
    verifyAuth();

    return cleanupFCM;
  }, []);

  if (isLoading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#0f172a' }}>
        <ActivityIndicator size="large" color="#10b981" />
      </View>
    );
  }

  return (
    <PaperProvider theme={theme}>
      <NavigationContainer theme={theme}>
        {!isAuthenticated ? (
          <LoginScreen onLoginSuccess={() => setIsAuthenticated(true)} />
        ) : (
          <Tab.Navigator
            screenOptions={({ route }) => ({
              headerStyle: { backgroundColor: '#1e293b' },
              headerTintColor: '#fff',
              tabBarStyle: { backgroundColor: '#1e293b', borderTopColor: '#334155' },
              tabBarActiveTintColor: '#10b981',
              tabBarInactiveTintColor: '#64748b',
              tabBarIcon: ({ color, size }) => {
                if (route.name === 'Carte') return <Map color={color} size={size} />;
                if (route.name === 'Tournées') return <Route color={color} size={size} />;
                if (route.name === 'Alertes') return <Bell color={color} size={size} />;
                if (route.name === 'Profil') return <User color={color} size={size} />;
              },
            })}
          >
            <Tab.Screen name="Carte" component={MapScreen} />
            <Tab.Screen name="Tournées" component={TourneesScreen} />
            <Tab.Screen name="Alertes" component={AlertsScreen} />
            <Tab.Screen name="Profil" component={ProfileScreen} />
          </Tab.Navigator>
        )}
      </NavigationContainer>
    </PaperProvider>
  );
}
