const redis = require('redis');
require('dotenv').config();

let client = null;
let isReady = false;

const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';

if (process.env.NODE_ENV !== 'test') {
  client = redis.createClient({ url: redisUrl });

  client.on('error', (err) => {
    console.warn('⚠️ Redis Connection Error. Falling back to in-memory store.', err.message);
    isReady = false;
  });

  client.on('connect', () => {
    console.log('📡 Redis Client connected');
  });

  client.on('ready', () => {
    console.log('⚡ Redis Client ready for caching');
    isReady = true;
  });

  // Attempt async connection
  client.connect().catch((err) => {
    console.warn('⚠️ Redis connect failed. Cache will use local memory fallback.');
  });
}

// In-Memory Fallback Store
const memoryStore = {};

const cache = {
  async get(key) {
    if (isReady && client) {
      try { return await client.get(key); } catch (e) { /* ignore */ }
    }
    return memoryStore[key] || null;
  },

  async set(key, value, expirySeconds = null) {
    if (isReady && client) {
      try {
        if (expirySeconds) {
          await client.set(key, value, { EX: expirySeconds });
        } else {
          await client.set(key, value);
        }
        return true;
      } catch (e) { /* ignore */ }
    }
    memoryStore[key] = value;
    if (expirySeconds) {
      setTimeout(() => { delete memoryStore[key]; }, expirySeconds * 1000);
    }
    return true;
  },

  async del(key) {
    if (isReady && client) {
      try { await client.del(key); return true; } catch (e) { /* ignore */ }
    }
    delete memoryStore[key];
    return true;
  }
};

module.exports = cache;
