import messaging from '@react-native-firebase/messaging';
import { Platform } from 'react-native';

export const initFCM = (onMessageReceived) => {
  if (Platform.OS === 'web') return () => {}; // Firebase messaging not setup for web here

  // Request permissions for iOS
  messaging().requestPermission().then(authStatus => {
    const enabled =
      authStatus === messaging.AuthorizationStatus.AUTHORIZED ||
      authStatus === messaging.AuthorizationStatus.PROVISIONAL;
    
    if (enabled) {
      console.log('Authorization status:', authStatus);
      // Get FCM token to register with backend
      messaging().getToken().then(token => {
        console.log('FCM Token:', token);
        // TODO: Send token to backend /api/users/profile
      });
    }
  });

  // Handle messages when app is in foreground
  const unsubscribe = messaging().onMessage(async remoteMessage => {
    if (onMessageReceived) {
      onMessageReceived(remoteMessage);
    }
  });

  // Handle background messages
  messaging().setBackgroundMessageHandler(async remoteMessage => {
    console.log('Message handled in the background!', remoteMessage);
  });

  return unsubscribe;
};
