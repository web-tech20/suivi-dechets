#!/usr/bin/env node
const http = require('http');
const { randomUUID } = require('crypto');

const BASE = process.env.BASE_URL || 'http://localhost:3000';
const TOKEN = process.env.ESP32_SECRET || 'shared-secret-key-2026';
const DEVICES = Math.max(1, Number.parseInt(process.env.DEVICES || '25', 10));
const INTERVAL_MS = Math.max(5000, Number.parseInt(process.env.INTERVAL_MS || '60000', 10));

const esp32Ids = Array.from({ length: DEVICES }, (_, i) => `ESP-SIM-${String(i + 1).padStart(4, '0')}`);

function post(pathname, payload) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify(payload);
    const url = new URL(pathname, BASE);
    const req = http.request({
      hostname: url.hostname,
      port: url.port || 80,
      path: url.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
        'x-esp32-token': TOKEN,
        'x-request-id': randomUUID()
      }
    }, (res) => {
      const chunks = [];
      res.on('data', (d) => chunks.push(d));
      res.on('end', () => resolve({ status: res.statusCode, body: Buffer.concat(chunks).toString('utf8') }));
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

async function tick() {
  const jobs = esp32Ids.map(async (esp32_id) => {
    const niveau = Math.max(0, Math.min(100, Math.round(40 + Math.random() * 60)));
    const payload = {
      esp32_id,
      niveau,
      temperature: Number((24 + Math.random() * 12).toFixed(1)),
      batterie: Math.round(30 + Math.random() * 70),
      signal: Math.round(45 + Math.random() * 55),
      distance: Math.round(20 + Math.random() * 180),
      poids: Number((1 + Math.random() * 18).toFixed(2))
    };
    return post('/api/iot/releve', payload);
  });

  const results = await Promise.allSettled(jobs);
  const ok = results.filter((r) => r.status === 'fulfilled' && r.value.status === 200).length;
  const ko = results.length - ok;
  console.log(`[${new Date().toISOString()}] ESP32 sent=${results.length} ok=${ok} ko=${ko}`);
}

console.log(`🚀 Simulateur ESP32 démarré (${DEVICES} devices, interval=${INTERVAL_MS}ms)`);
tick().catch((err) => console.error('Tick error', err.message));
setInterval(() => tick().catch((err) => console.error('Tick error', err.message)), INTERVAL_MS);
