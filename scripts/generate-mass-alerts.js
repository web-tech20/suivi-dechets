#!/usr/bin/env node
const http = require('http');
const { randomUUID } = require('crypto');

const BASE = process.env.BASE_URL || 'http://localhost:3000';
const TOKEN = process.env.ESP32_SECRET || 'shared-secret-key-2026';
const NUM_BINS = Math.max(100, Number.parseInt(process.env.NUM_BINS || '500', 10));
const ALERTS = Math.max(50, Number.parseInt(process.env.ALERTS || '200', 10));
const CONCURRENCY = Math.max(10, Number.parseInt(process.env.CONCURRENCY || '50', 10));

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

async function sendInitialBins(esp32Ids) {
  const jobs = esp32Ids.map((esp32_id) => {
    const niveau = Math.round(10 + Math.random() * 60);
    return post('/api/iot/releve', {
      esp32_id,
      niveau,
      temperature: Number((24 + Math.random() * 12).toFixed(1)),
      batterie: Math.round(30 + Math.random() * 70),
      signal: Math.round(45 + Math.random() * 55),
      distance: Math.round(20 + Math.random() * 180),
      poids: Number((1 + Math.random() * 18).toFixed(2))
    });
  });

  const results = await Promise.allSettled(jobs);
  const ok = results.filter((r) => r.status === 'fulfilled' && r.value.status === 200).length;
  console.log(`[init] Created ${ok}/${esp32Ids.length} bins (via IoT releve)`);
}

async function sendAlerts(esp32Ids) {
  const tasks = [];
  for (let i = 0; i < ALERTS; i++) {
    const esp32_id = esp32Ids[Math.floor(Math.random() * esp32Ids.length)];
    const niveau = Math.round(80 + Math.random() * 20);
    tasks.push(() => post('/api/iot/releve', {
      esp32_id,
      niveau,
      temperature: Number((26 + Math.random() * 8).toFixed(1)),
      batterie: Math.round(20 + Math.random() * 80),
      signal: Math.round(40 + Math.random() * 60),
      distance: Math.round(5 + Math.random() * 120),
      poids: Number((2 + Math.random() * 12).toFixed(1))
    }));
  }

  let completed = 0;
  let success = 0;

  while (tasks.length > 0) {
    const batch = tasks.splice(0, CONCURRENCY).map((fn) => fn());
    const results = await Promise.allSettled(batch);
    results.forEach((r) => {
      completed += 1;
      if (r.status === 'fulfilled' && r.value.status === 200) success += 1;
    });
    console.log(`[alerts] Sent ${completed}/${ALERTS} — successful ${success}`);
  }

  console.log(`[done] Alerts sent: ${success}/${ALERTS}`);
}

async function main() {
  console.log(`🚀 generate-mass-alerts — base=${BASE} token=${TOKEN ? '***' : 'none'}`);
  const esp32Ids = Array.from({ length: NUM_BINS }, (_, i) => `ESP-MASS-${String(i + 1).padStart(5, '0')}`);
  await sendInitialBins(esp32Ids);
  await sendAlerts(esp32Ids);
}

main().catch((err) => {
  console.error('Error', err);
  process.exit(1);
});
