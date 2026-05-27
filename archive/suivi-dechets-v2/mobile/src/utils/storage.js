import AsyncStorage from '@react-native-async-storage/async-storage';

export const saveToken = async (token) => {
  try {
    await AsyncStorage.setItem('@auth_token', token);
  } catch (e) {
    console.error('Error saving token', e);
  }
};

export const checkToken = async () => {
  try {
    return await AsyncStorage.getItem('@auth_token');
  } catch (e) {
    console.error('Error reading token', e);
    return null;
  }
};

export const clearToken = async () => {
  try {
    await AsyncStorage.removeItem('@auth_token');
  } catch (e) {
    console.error('Error clearing token', e);
  }
};

// Offline sync queue
export const saveOfflineAction = async (action) => {
  try {
    const existing = await AsyncStorage.getItem('@offline_queue');
    const queue = existing ? JSON.parse(existing) : [];
    queue.push(action);
    await AsyncStorage.setItem('@offline_queue', JSON.stringify(queue));
  } catch (e) {
    console.error('Error saving offline action', e);
  }
};

export const getOfflineQueue = async () => {
  try {
    const existing = await AsyncStorage.getItem('@offline_queue');
    return existing ? JSON.parse(existing) : [];
  } catch (e) {
    return [];
  }
};

export const clearOfflineQueue = async () => {
  await AsyncStorage.removeItem('@offline_queue');
};
