# 🗑️ SUIVI-DÉCHETS - Smart Waste Management Platform

Plateforme de gestion intelligente des poubelles connectées pour Abomey-Calavi, Bénin.

## ✨ Fonctionnalités

- 🔐 Authentification JWT (4 rôles : SUPER_ADMIN, ADMIN, COLLECTEUR, OBSERVATEUR)
- 🗺️ Carte Leaflet Dark Elite avec clustering, minimap et échelle de distance
- 📊 Dashboard temps réel avec WebSocket
- ⚠️ Alertes automatiques par seuil configurable (par poubelle/ESP32)
- 🚛 Optimisation de tournées (algorithme TSP 2-opt)
- 📄 Export PDF des tournées
- 🤖 Simulateur IoT intégré + simulateur ESP32 CLI
- 📡 API IoT dédiée pour ESP32 (`/api/iot/*`)
- 🧾 Audit IoT (`iot_logs`) + configuration distante ESP32 (`esp32_config`)
- 📈 Pagination et endpoints admin pour passage à l'échelle (centaines / milliers de bins)

## 🚀 Installation

```bash
cd /home/kisito/Desktop/SMART_DROP
npm install
npm run init-db
npm start
```

Accès : `http://localhost:3000` (redirection vers `/login`).

Mode développement : `npm run dev`

## 🔑 Comptes de test

| Rôle | Email | Mot de passe |
|------|-------|--------------|
| SUPER_ADMIN | super@suivi-dechets.com | Admin123! |
| ADMIN | admin@suivi-dechets.com | Admin123! |
| COLLECTEUR | collecteur@suivi-dechets.com | Admin123! |
| OBSERVATEUR | observateur@suivi-dechets.com | Admin123! |

## ⚙️ Configuration

Ajouter dans `.env` :

```env
JWT_SECRET=votre-secret-jwt
JWT_REFRESH_SECRET=votre-refresh-secret
ESP32_SECRET=shared-secret-key-2026
PORT=3000
```

## 📁 Structure

| Dossier / Fichier | Description |
|-------------------|-------------|
| `server.js` | Backend Express + SQLite + Socket.io |
| `public/` | Frontend SPA (HTML / CSS / JS) |
| `backend/` | Auth JWT + middleware RBAC |
| `db/` | Initialisation et base SQLite (`smartdrop.db`) |
| `db/migrations/005_scalability.sql` | Migration schéma industriel IoT |
| `esp32/firmware.ino` | Firmware ESP32 prêt à uploader |
| `scripts/generate-bins.js` | Génération massive de poubelles |
| `scripts/simulate-esp32.js` | Simulation des envois ESP32 |
| `archive/` | Ancienne stack `suivi-dechets-v2` (archivée) |

## 📡 API Endpoints

| Méthode | Route | Description |
|---------|-------|-------------|
| POST | `/api/auth/login` | Connexion JWT |
| GET | `/api/poubelles` | Liste des poubelles |
| PUT | `/api/poubelles/:id/position` | Mise à jour position temps réel |
| POST | `/api/releves` | Ajouter un relevé (IoT) |
| POST | `/api/iot/releve` | Endpoint capteur ESP32 (token `x-esp32-token`) |
| GET | `/api/iot/config` | Récupérer config ESP32 |
| POST | `/api/iot/config` | Mettre à jour config ESP32 |
| POST | `/api/iot/status` | Envoyer statut technique ESP32 |
| GET | `/api/alertes` | Liste des alertes |
| POST | `/api/tournees/optimiser` | Calculer tournée optimale |
| GET | `/api/stats` | Statistiques dashboard |
| GET | `/api/stats/hourly` | Série horaire des 24 dernières heures |
| GET | `/api/admin/stats` | KPI globaux industriel |
| GET | `/api/admin/poubelles` | Liste paginée admin |
| POST | `/api/simulation/start` | Démarrer simulateur IoT |

## 🧪 Tests rapides

```bash
# Stats (nécessite un token JWT)
curl -s http://localhost:3000/api/stats -H "Authorization: Bearer VOTRE_TOKEN"

# Coordonnées UAC
sqlite3 db/smartdrop.db "SELECT nom, latitude, longitude, quartier FROM poubelles WHERE quartier LIKE 'UAC%';"

# Générer 100 poubelles
node scripts/generate-bins.js 100

# Simuler des ESP32 (25 devices par défaut)
node scripts/simulate-esp32.js

# Test endpoint IoT
curl -X POST http://localhost:3000/api/iot/releve \
  -H "x-esp32-token: shared-secret-key-2026" \
  -H "Content-Type: application/json" \
  -d '{"esp32_id":"ESP-001","niveau":85,"temperature":31.2,"batterie":76,"signal":-64,"distance":35}'
```

## 📝 Licence

MIT
