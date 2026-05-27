import axios from 'axios';
import { checkToken, getOfflineQueue, clearOfflineQueue } from '../utils/storage';
import { Alert } from 'react-native';

// In production, replace with your actual server IP or domain
const BASE_URL = 'http://10.0.2.2:3000/api'; 

const api = axios.create({
  baseURL: BASE_URL,
  timeout: 5000,
});

api.interceptors.request.use(async (config) => {
  const token = await checkToken();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

export const syncOfflineData = async () => {
  const queue = await getOfflineQueue();
  if (queue.length === 0) return;

  let successCount = 0;
  for (const action of queue) {
    try {
      await api(action);
      successCount++;
    } catch (e) {
      console.warn('Failed to sync action', action);
    }
  }

  if (successCount === queue.length) {
    await clearOfflineQueue();
    console.log('🔄 All offline actions synced successfully');
  } else {
    // Keep failed ones in queue or handle logic
    Alert.alert('Sync Partial', `${successCount}/${queue.length} items synced.`);
  }
};

export default api;
