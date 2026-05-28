// ═══════════════════════════════════════════════════════════════
// SUIVI-DÉCHETS — Frontend App (Vanilla JS SPA)
// ═══════════════════════════════════════════════════════════════
// Détection auto environnement (localhost ou Render)
const API_URL = window.location.hostname === 'localhost'
  ? 'http://localhost:3000'
  : 'https://suivi-dechets.onrender.com';

// Socket will be initialized once below (after DOM ready)
let socket = null;
const bootToken = localStorage.getItem('accessToken');
if (!bootToken && window.location.pathname !== '/login') {
  window.location.href = '/login';
}

document.addEventListener('DOMContentLoaded', () => {
  const MAP_CENTER = [6.4486, 2.3553];
  const MAP_MAX_BOUNDS = [[6.43, 2.33], [6.47, 2.38]];
  const LAND_BOUNDS = { latMin: 6.435, latMax: 6.465, lngMin: 2.335, lngMax: 2.375 };

  const FAST_UAC = {
    lat: 6.4405,
    lng: 2.4168,
    nom: 'FAST - Faculté des Sciences et Techniques',
    batiments: [
      { nom: 'Amphi 500', lat: 6.4402, lng: 2.4165 },
      { nom: 'Laboratoire IoT', lat: 6.4408, lng: 2.4170 },
      { nom: 'Bibliothèque FAST', lat: 6.4400, lng: 2.4162 },
      { nom: 'Salle Hackathon', lat: 6.4405, lng: 2.4168 }
    ]
  };

  let demoModeActive = false;
  let demoTimeouts = [];
  let hackathonMapLayers = null;

  const state = {
    activeTab: 'dashboard',
    poubelles: [],
    alertes: [],
    stats: null,
    selectedBins: [],
    currentRoute: null,
    currentUser: null,
    simulationActive: false,
    currentMapMode: null,
    map: null,
    markers: {},
    markerCluster: null,
    routeLayer: null,
    quartiersChart: null,
    currentLocation: null,
    locationPermission: 'unknown'
  };

  let deferredPrompt = null;

  function getAccessToken() {
    return localStorage.getItem('accessToken');
  }

  function getRefreshToken() {
    return localStorage.getItem('refreshToken');
  }

  function setSession(tokens = {}, user = null) {
    if (tokens.accessToken) localStorage.setItem('accessToken', tokens.accessToken);
    if (tokens.refreshToken) localStorage.setItem('refreshToken', tokens.refreshToken);
    if (user) {
      localStorage.setItem('user', JSON.stringify(user));
      state.currentUser = user;
    }
  }

  function clearSession() {
    localStorage.removeItem('accessToken');
    localStorage.removeItem('refreshToken');
    localStorage.removeItem('user');
    state.currentUser = null;
  }

  async function refreshAccessToken() {
    const refreshToken = getRefreshToken();
    if (!refreshToken) return false;

    const response = await fetch(`${API_URL}/api/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken })
    });

    if (!response.ok) {
      clearSession();
      return false;
    }

    const tokens = await response.json();
    setSession(tokens);
    return true;
  }

  async function apiFetch(url, options = {}, retry = true) {
    const headers = { ...(options.headers || {}) };
    const token = getAccessToken();

    if (token && options.auth !== false) {
      headers.Authorization = `Bearer ${token}`;
    }

    // Prepend API_URL to relative paths
    const fullUrl = url.startsWith('http') ? url : `${API_URL}${url}`;
    const response = await fetch(fullUrl, { ...options, headers });

    if (response.status === 401 && retry) {
      let payload = null;
      try {
        payload = await response.clone().json();
      } catch (error) {
        payload = null;
      }

      if (payload && payload.code === 'TOKEN_EXPIRED') {
        const refreshed = await refreshAccessToken();
        if (refreshed) {
          return apiFetch(url, options, false);
        }
      }

      clearSession();
      if (window.location.pathname !== '/login') {
        window.location.href = '/login';
      }
    }

    return response;
  }

  const API = {
    async getStats() {
      const res = await apiFetch('/api/stats');
      return res.json();
    },
    async getPoubelles() {
      const res = await apiFetch('/api/poubelles');
      const payload = await res.json();
      return Array.isArray(payload) ? payload : (payload.data || []);
    },
    async getAlertes() {
      const res = await apiFetch('/api/alertes');
      return res.json();
    },
    async acknowledgeAlert(id) {
      const res = await apiFetch(`/api/alertes/${id}/acknowledge`, { method: 'PUT' });
      return res.json();
    },
    async optimizeRoute(binIds) {
      const payload = {
        poubelle_ids: binIds,
        collecteur: 'Equipe Elite'
      };
      if (state.currentLocation) {
        payload.origin = {
          latitude: state.currentLocation.latitude,
          longitude: state.currentLocation.longitude,
          label: 'Position actuelle',
          quartier: 'Position actuelle'
        };
      }
      const res = await apiFetch('/api/tournees/optimiser', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      return res.json();
    },
    async assignRoute(routeId, collecteur = 'Equipe Elite') {
      const res = await apiFetch(`/api/tournees/${routeId}/assigner`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ collecteur })
      });
      return res.json();
    },
    async toggleSimulation(start, interval = 5000) {
      const endpoint = start ? '/api/simulation/start' : '/api/simulation/stop';
      const res = await apiFetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ interval })
      });
      return res.json();
    },
    async getSimulationStatus() {
      const res = await apiFetch('/api/simulation/status');
      return res.json();
    },
    async getMe() {
      const res = await apiFetch('/api/auth/me');
      return res.json();
    },
    async logout() {
      const res = await apiFetch('/api/auth/logout', { method: 'POST' });
      return res.json();
    },
    async getMapsConfig() {
      const res = await apiFetch('/api/config/maps');
      return res.json();
    }
  };

  function showToast(message, type = 'success') {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = `toast toast--${type}`;

    let icon = '';
    if (type === 'success') icon = '<span class=\"material-symbols-outlined\" style=\"color: #10b981; font-size: 18px;\">check_circle</span>';
    else if (type === 'error') icon = '<span class=\"material-symbols-outlined\" style=\"color: #ef4444; font-size: 18px;\">error</span>';
    else icon = '<span class=\"material-symbols-outlined\" style=\"color: #f59e0b; font-size: 18px;\">warning</span>';

    toast.innerHTML = `
      ${icon}
      <span>${message}</span>
      <button class="toast__close">&times;</button>
    `;

    container.appendChild(toast);

    toast.querySelector('.toast__close').addEventListener('click', () => {
      toast.remove();
    });

    setTimeout(() => {
      toast.style.opacity = '0';
      setTimeout(() => toast.remove(), 400);
    }, 4500);

    if (type === 'error' && 'Notification' in window && Notification.permission === 'granted') {
      new Notification('SUIVI-DÉCHETS', {
        body: message,
        icon: '/favicon.svg',
        badge: '/favicon.svg',
        vibrate: [200, 100, 200]
      });
    }
  }

  async function initPushNotifications() {
    if (!('Notification' in window) || !('serviceWorker' in navigator)) {
      return;
    }

    const permission = await Notification.requestPermission();
    if (permission === 'granted') {
      await navigator.serviceWorker.ready;
      console.log('✅ Notifications push autorisées');
    }
  }

  function registerServiceWorker() {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/service-worker.js')
        .then((registration) => console.log('✅ Service Worker enregistré', registration.scope))
        .catch((error) => console.error('❌ Service Worker échec', error));
    }
  }

  function setupPwaInstallPrompt() {
    window.addEventListener('beforeinstallprompt', (event) => {
      event.preventDefault();
      deferredPrompt = event;

      if (document.getElementById('install-pwa-btn')) {
        return;
      }

      const installBtn = document.createElement('button');
      installBtn.id = 'install-pwa-btn';
      installBtn.textContent = 'Installer l application';
      installBtn.className = 'btn btn--primary btn--sm';
      installBtn.addEventListener('click', async () => {
        if (!deferredPrompt) return;
        deferredPrompt.prompt();
        await deferredPrompt.userChoice;
        deferredPrompt = null;
        installBtn.remove();
      });

      document.querySelector('.header__right')?.prepend(installBtn);
    });
  }

  function updateLocationStatusUI() {
    const badge = document.getElementById('location-status-badge');
    if (!badge) return;
    if (state.currentLocation) {
      badge.textContent = '📍';
      badge.classList.remove('hidden');
      badge.title = 'Géolocalisation active';
    } else if (state.locationPermission === 'denied') {
      badge.textContent = '❌';
      badge.classList.remove('hidden');
      badge.title = 'Géolocalisation refusée';
    } else {
      badge.classList.add('hidden');
    }
  }

  function updateRouteLocationHint() {
    const hint = document.getElementById('route-location-hint');
    if (!hint) return;
    if (state.currentLocation) {
      hint.innerHTML = `<div style="margin-bottom: 16px; padding: 12px 16px; border-radius: 14px; background: rgba(16, 185, 129, 0.1); border: 1px solid rgba(16, 185, 129, 0.25); color: #d1fae5; font-size: 13px;">
        Itinéraire calculé à partir de votre position actuelle&nbsp;: ${state.currentLocation.latitude.toFixed(5)}, ${state.currentLocation.longitude.toFixed(5)}.
      </div>`;
    } else if (state.locationPermission === 'denied') {
      hint.innerHTML = `<div style="margin-bottom: 16px; padding: 12px 16px; border-radius: 14px; background: rgba(239, 68, 68, 0.08); border: 1px solid rgba(239, 68, 68, 0.25); color: #fecaca; font-size: 13px;">
        La géolocalisation a été refusée. L'itinéraire utilisera le dépôt par défaut.
      </div>`;
    } else {
      hint.innerHTML = `<div style="margin-bottom: 16px; padding: 12px 16px; border-radius: 14px; background: rgba(59, 130, 246, 0.08); border: 1px solid rgba(59, 130, 246, 0.25); color: #bfdbfe; font-size: 13px;">
        Recherche de votre position en temps réel... Autorisez la localisation pour démarrer l'itinéraire depuis votre emplacement.
      </div>`;
    }
  }

  function initGeolocationTracking() {
    if (!('geolocation' in navigator)) {
      state.locationPermission = 'unsupported';
      updateLocationStatusUI();
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        state.currentLocation = {
          latitude: position.coords.latitude,
          longitude: position.coords.longitude
        };
        state.locationPermission = 'granted';
        updateLocationStatusUI();
      },
      (error) => {
        state.currentLocation = null;
        state.locationPermission = error.code === error.PERMISSION_DENIED ? 'denied' : 'denied';
        updateLocationStatusUI();
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 10000
      }
    );

    navigator.geolocation.watchPosition(
      (position) => {
        state.currentLocation = {
          latitude: position.coords.latitude,
          longitude: position.coords.longitude
        };
        state.locationPermission = 'granted';
        if (state.activeTab === 'tournees') {
          refreshActiveTabContent();
        }
        updateLocationStatusUI();
        // update map marker for "Vous êtes ici"
        if (typeof L !== 'undefined') updateYouAreHereMarker();
      },
      (error) => {
        state.currentLocation = null;
        state.locationPermission = error.code === error.PERMISSION_DENIED ? 'denied' : 'denied';
        updateLocationStatusUI();
      },
      {
        enableHighAccuracy: true,
        maximumAge: 5000,
        timeout: 15000
      }
    );
  }

  // --- Theme handling (persisted) ---
  function applyTheme(theme) {
    document.documentElement.classList.toggle('dark', theme === 'dark');
    localStorage.setItem('theme', theme);
  }

  function toggleTheme() {
    const current = localStorage.getItem('theme') || (document.documentElement.classList.contains('dark') ? 'dark' : 'light');
    const next = current === 'dark' ? 'light' : 'dark';
    applyTheme(next);
  }

  function initTheme() {
    const saved = localStorage.getItem('theme');
    if (saved) applyTheme(saved);
    const btn = document.getElementById('theme-toggle-btn') || document.getElementById('theme-toggle');
    if (btn) btn.addEventListener('click', () => toggleTheme());
  }

  // --- System load polling ---
  let systemLoadTimer = null;
  async function fetchSystemLoad() {
    try {
      const res = await apiFetch('/api/system/load');
      if (!res.ok) return null;
      return await res.json();
    } catch (e) { return null; }
  }

  async function updateSystemLoadUI() {
    const badge = document.getElementById('system-load-badge');
    if (!badge) return;
    const data = await fetchSystemLoad();
    if (!data) { badge.textContent = '—'; return; }
    const count = (data.alertes_total ?? data.alertes) || 0;
    const dbkb = data.db_size_bytes ? Math.round(data.db_size_bytes / 1024) + 'KB' : '';
    badge.textContent = `${count} • ${dbkb}`;
  }

  function initSystemLoadPolling(interval = 15000) {
    updateSystemLoadUI();
    if (systemLoadTimer) clearInterval(systemLoadTimer);
    systemLoadTimer = setInterval(updateSystemLoadUI, interval);
  }

  // --- Filter chips for alerts/map ---
  function initFilterChips() {
    const container = document.getElementById('filter-chips');
    if (!container) return;
    container.addEventListener('click', (e) => {
      const btn = e.target.closest('.chip');
      if (!btn) return;
      container.querySelectorAll('.chip').forEach((c) => c.classList.remove('active'));
      btn.classList.add('active');
      const filter = btn.dataset.filter;
      applyFilter(filter);
    });
  }

  function applyFilter(filter) {
    // simple example: show/hide markers by alert presence or resolved flag
    Object.values(state.markers).forEach((rec) => {
      let visible = true;
      if (filter === 'signalement') {
        visible = Number(rec.bin.niveau || 0) >= 50;
      } else if (filter === 'resolved') {
        visible = Number(rec.bin.niveau || 0) < 50;
      }
      setMarkerVisible(rec, visible);
    });
  }

  // --- "Vous êtes ici" marker management ---
  let youMarker = null;
  function updateYouAreHereMarker() {
    if (!state.map || !state.currentLocation) return;
    try {
      const ll = [state.currentLocation.latitude, state.currentLocation.longitude];
      if (!youMarker) {
        youMarker = L.circleMarker(ll, { radius: 8, color: '#5b9eff', fillColor: '#5b9eff', fillOpacity: 0.95, weight: 2 }).addTo(state.map);
        youMarker.bindTooltip('Vous êtes ici', { permanent: false, direction: 'top' });
      } else {
        youMarker.setLatLng(ll);
      }
    } catch (e) { /* ignore leaflet errors if map not ready */ }
  }

  function formatTimestamp(value) {
    if (!value) return '--';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    return date.toLocaleString('fr-FR');
  }

  function getMarkerColor(level) {
    if (level >= 80) return '#ef4444';
    if (level >= 50) return '#f59e0b';
    return '#10b981';
  }

  function isUACBin(bin) {
    return Boolean(bin?.quartier && String(bin.quartier).startsWith('UAC'));
  }

  function createUACMarker(bin) {
    const color = getMarkerColor(bin?.niveau || 0);
    return L.divIcon({
      html: `
        <div class="uac-marker-pin" style="--uac-color:${color}">
          <div class="uac-marker-inner">🎓</div>
        </div>
      `,
      className: 'uac-marker',
      iconSize: [44, 44],
      iconAnchor: [22, 44],
      popupAnchor: [0, -40]
    });
  }

  function createLeafletIcon(level, bin = null) {
    if (bin && isUACBin(bin)) {
      return createUACMarker(bin);
    }
    const color = getMarkerColor(level);
    const size = 28;
    return L.divIcon({
      className: 'leaflet-marker-custom',
      html: `<div class="map-marker map-marker--pin" style="--marker-color:${color}"></div>`,
      iconSize: [size, size],
      iconAnchor: [size / 2, size / 2],
      popupAnchor: [0, -size / 2]
    });
  }

  function addHackathonOverlay(map) {
    if (!map || typeof L === 'undefined') return;

    if (hackathonMapLayers) {
      hackathonMapLayers.forEach((layer) => {
        try { map.removeLayer(layer); } catch (e) { /* ignore */ }
      });
    }
    hackathonMapLayers = [];

    const bannerIcon = L.divIcon({
      html: `<div class="hackathon-banner">🚀 HACKATHON FAST 2026</div>`,
      className: 'hackathon-banner-wrap',
      iconSize: [220, 44],
      iconAnchor: [110, 22]
    });
    hackathonMapLayers.push(L.marker([FAST_UAC.lat, FAST_UAC.lng], { icon: bannerIcon, zIndexOffset: 1000 }).addTo(map));

    FAST_UAC.batiments.forEach((b) => {
      hackathonMapLayers.push(
        L.circleMarker([b.lat, b.lng], {
          radius: 8,
          color: '#8b5cf6',
          fillColor: '#8b5cf6',
          fillOpacity: 0.35,
          weight: 2
        }).addTo(map)
      );
      hackathonMapLayers.push(
        L.marker([b.lat, b.lng], {
          icon: L.divIcon({
            className: 'fast-building-label',
            html: `<span>${b.nom}</span>`,
            iconSize: [0, 0]
          })
        }).addTo(map)
      );
    });
  }

  function ensureLeaflet() {
    if (typeof L === 'undefined') {
      throw new Error('Leaflet non chargé — vérifiez votre connexion');
    }
    return L;
  }

  function haversineKm(lat1, lon1, lat2, lon2) {
    const R = 6371;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) ** 2 +
      Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
      Math.sin(dLon / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  function buildInfoWindowContent(bin) {
    const level = Math.round(Number(bin.niveau || 0));
    const color = getMarkerColor(level);
    return `
      <div class="bin-popup">
        <div class="bin-popup__name" style="color:${color};">${bin.nom}</div>
        <div class="bin-popup__quartier">${bin.quartier} - ${bin.adresse || ''}</div>
        <div class="bin-popup__level">
          <div class="progress" style="margin-bottom: 0;">
            <div class="progress__header">
              <span class="progress__label">Remplissage</span>
              <span class="progress__value">${level}%</span>
            </div>
            <div class="progress__bar" style="height: 6px;">
              <div class="progress__fill" style="width:${Math.min(level, 100)}%; background:${color};"></div>
            </div>
          </div>
        </div>
        <div class="bin-popup__stats">
          <div class="bin-popup__stat"><span>Temp:</span><span>${bin.temperature ?? '--'}°C</span></div>
          <div class="bin-popup__stat"><span>Batt:</span><span>${bin.batterie ?? '--'}%</span></div>
          <div class="bin-popup__stat"><span>Signal:</span><span>${bin.signal_force ?? '--'}%</span></div>
          <div class="bin-popup__stat"><span>Maj:</span><span>${formatTimestamp(bin.dernier_releve)}</span></div>
        </div>
      </div>
    `;
  }

  function clearMapState() {
    if (state.markerCluster && state.map) {
      state.map.removeLayer(state.markerCluster);
    }
    state.markerCluster = null;

    Object.values(state.markers).forEach((entry) => {
      if (entry?.marker && state.map) {
        if (state.markerCluster) {
          state.markerCluster.removeLayer(entry.marker);
        } else {
          state.map.removeLayer(entry.marker);
        }
      }
    });
    state.markers = {};

    if (state.routeLayer && state.map) {
      state.map.removeLayer(state.routeLayer);
      state.routeLayer = null;
    }

    if (state.map) {
      state.map.remove();
      state.map = null;
    }
  }

  async function initMap(containerId, options = {}) {
    ensureLeaflet();
    clearMapState();

    const container = document.getElementById(containerId);
    if (!container) return null;

    if (!container.style.minHeight) {
      container.style.minHeight = options.minHeight || '360px';
    }

    state.map = L.map(container, {
      center: MAP_CENTER,
      zoom: options.zoom || 14,
      maxBounds: MAP_MAX_BOUNDS,
      maxBoundsViscosity: 0.85,
      zoomControl: true
    });

    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> &copy; CARTO',
      subdomains: 'abcd',
      maxZoom: 19
    }).addTo(state.map);

    L.control.scale({
      metric: true,
      imperial: false,
      position: 'bottomleft',
      updateWhenIdle: true
    }).addTo(state.map);

    const MiniMapControl = L.Control.extend({
      options: { position: 'bottomright' },
      onAdd() {
        const containerEl = L.DomUtil.create('div', 'minimap-control');
        containerEl.style.width = '150px';
        containerEl.style.height = '150px';
        containerEl.style.borderRadius = '12px';
        containerEl.style.border = '1px solid rgba(91, 158, 255, 0.45)';
        containerEl.style.overflow = 'hidden';
        containerEl.style.boxShadow = '0 12px 26px rgba(0,0,0,0.35)';
        L.DomEvent.disableClickPropagation(containerEl);

        const miniMap = L.map(containerEl, {
          attributionControl: false,
          zoomControl: false,
          dragging: false,
          scrollWheelZoom: false,
          doubleClickZoom: false,
          boxZoom: false,
          keyboard: false,
          tap: false
        }).setView(MAP_CENTER, 12);

        L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
          subdomains: 'abcd',
          maxZoom: 19
        }).addTo(miniMap);
        L.circleMarker(MAP_CENTER, { radius: 6, color: '#5b9eff', fillColor: '#5b9eff', fillOpacity: 0.9 }).addTo(miniMap);
        return containerEl;
      }
    });
    state.map.addControl(new MiniMapControl());

    if (options.hackathonOverlay !== false) {
      addHackathonOverlay(state.map);
    }

    state.currentMapMode = options.mode || 'dashboard';

    if (options.showAllBins !== false) {
      addBinMarkers(state.poubelles, { cluster: options.cluster !== false });
    }

    setTimeout(() => state.map?.invalidateSize(), 150);
    return state.map;
  }

  async function renderHackathonStats() {
    let data = state.stats;
    try {
      const res = await apiFetch('/api/admin/stats');
      if (res.ok) data = await res.json();
    } catch (e) {
      console.warn('Hackathon stats fallback', e);
    }

    const container = document.getElementById('hackathon-stats');
    if (!container) return;

    const co2 = data.co2_saved ?? 148;
    const esp32 = data.esp32_online ?? 0;
    const total = data.total_bins ?? data.total_poubelles ?? state.poubelles?.length ?? 0;
    const uac = data.uac_bins ?? state.poubelles?.filter((b) => isUACBin(b)).length ?? 4;

    container.innerHTML = `
      <div class="stats-showcase">
        <div class="stat-premium">
          <div class="stat-premium__icon">🏫</div>
          <div class="stat-premium__value">${total}</div>
          <div class="stat-premium__label">Poubelles connectées</div>
          <div class="stat-premium__sub">Abomey-Calavi & Cotonou · ${uac} sur campus UAC</div>
        </div>
        <div class="stat-premium">
          <div class="stat-premium__icon">📡</div>
          <div class="stat-premium__value">${esp32}</div>
          <div class="stat-premium__label">ESP32 actifs</div>
          <div class="stat-premium__sub">données en temps réel</div>
        </div>
        <div class="stat-premium">
          <div class="stat-premium__icon">🚛</div>
          <div class="stat-premium__value">${co2}</div>
          <div class="stat-premium__label">kg CO₂ économisés</div>
          <div class="stat-premium__sub">optimisation TSP des tournées</div>
        </div>
        <div class="stat-premium">
          <div class="stat-premium__icon">⚡</div>
          <div class="stat-premium__value">&lt; 100ms</div>
          <div class="stat-premium__label">Temps de réponse API</div>
          <div class="stat-premium__sub">temps réel WebSocket</div>
        </div>
      </div>
    `;
  }

  function clearDemoTimers() {
    demoTimeouts.forEach((id) => clearTimeout(id));
    demoTimeouts = [];
  }

  function highlightMapDemo() {
    if (!state.map) return;
    state.map.flyTo(MAP_CENTER, 11, { duration: 1.2 });
    setTimeout(() => {
      if (state.map) state.map.flyTo([FAST_UAC.lat, FAST_UAC.lng], 16, { duration: 1.8 });
    }, 2000);
  }

  function highlightUACDemo() {
    if (!state.map || typeof L === 'undefined') return;
    state.map.flyTo([FAST_UAC.lat, FAST_UAC.lng], 17, { duration: 1.5 });
    const pulse = L.marker([FAST_UAC.lat, FAST_UAC.lng], {
      icon: L.divIcon({
        html: '<div class="demo-flash-marker">🎓 FAST UAC</div>',
        className: 'demo-flash-wrap',
        iconSize: [120, 40],
        iconAnchor: [60, 40]
      })
    }).addTo(state.map);
    setTimeout(() => {
      try { state.map.removeLayer(pulse); } catch (e) { /* ignore */ }
    }, 3200);
  }

  async function simulateESP32Bulk() {
    const token = localStorage.getItem('accessToken');
    const demoBins = ['ESP-DEMO-01', 'ESP-DEMO-02', 'ESP-DEMO-03'];
    for (const esp32Id of demoBins) {
      try {
        await fetch(`${API_URL}/api/iot/releve`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-esp32-token': 'shared-secret-key-2026'
          },
          body: JSON.stringify({
            esp32_id: esp32Id,
            niveau: Math.round(55 + Math.random() * 40),
            temperature: Number((26 + Math.random() * 10).toFixed(1)),
            batterie: Math.round(50 + Math.random() * 45),
            signal: Math.round(-70 + Math.random() * 20),
            distance: Math.round(30 + Math.random() * 120),
            poids: Number((2 + Math.random() * 12).toFixed(1))
          })
        });
      } catch (e) {
        console.warn('Demo ESP32 simulate failed', esp32Id, e);
      }
    }
    showToast('📡 Simulation ESP32 — envoi de relevés en direct', 'info');
  }

  function startDemoMode() {
    if (demoModeActive) return;
    demoModeActive = true;

    let overlay = document.querySelector('.demo-mode');
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.className = 'demo-mode';
      overlay.innerHTML = `
        <div class="demo-badge">
          🎓 DÉMONSTRATION — FAST UAC HACKATHON 2026
        </div>
      `;
      document.body.appendChild(overlay);
    }

    const steps = [
      { delay: 0, action: () => showToast('Bienvenue à la démo SUIVI-DÉCHETS', 'info') },
      { delay: 2000, action: () => showToast('📊 Réseau connecté — Abomey-Calavi & Cotonou', 'success') },
      { delay: 5000, action: () => highlightMapDemo() },
      { delay: 8000, action: () => showToast('🗺️ Clustering intelligent — visualisation fluide du réseau', 'info') },
      { delay: 12000, action: () => simulateESP32Bulk() },
      { delay: 15000, action: () => showToast('📡 ESP32 — relevés toutes les 60 secondes', 'success') },
      { delay: 20000, action: () => highlightUACDemo() },
      { delay: 25000, action: () => showToast('🎓 Solution développée à la FAST UAC', 'success') }
    ];

    steps.forEach((step) => {
      const id = setTimeout(step.action, step.delay);
      demoTimeouts.push(id);
    });
  }

  function addBinMarkers(bins = state.poubelles, options = {}) {
    if (!state.map || typeof L === 'undefined') return;

    const clusterEnabled = options.cluster !== false && typeof L.markerClusterGroup !== 'undefined';

    if (state.markerCluster) {
      state.map.removeLayer(state.markerCluster);
      state.markerCluster = null;
    }

    Object.values(state.markers).forEach((entry) => {
      if (entry?.marker) {
        if (state.markerCluster) state.markerCluster.removeLayer(entry.marker);
        else state.map.removeLayer(entry.marker);
      }
    });
    state.markers = {};

    const latlngs = [];
    const markerList = [];

    bins.forEach((bin) => {
      const lat = Number(bin.latitude);
      const lng = Number(bin.longitude);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;

      const level = Number(bin.niveau || 0);
      const marker = L.marker([lat, lng], {
        icon: createLeafletIcon(level, bin),
        title: bin.nom
      });
      marker.bindPopup(buildInfoWindowContent(bin), { maxWidth: 300 });

      const record = { marker, bin, visible: true };
      state.markers[bin.id] = record;
      markerList.push(marker);
      latlngs.push([lat, lng]);
    });

    if (clusterEnabled && markerList.length > 1) {
      state.markerCluster = L.markerClusterGroup({
        showCoverageOnHover: false,
        maxClusterRadius: 50
      });
      markerList.forEach((m) => state.markerCluster.addLayer(m));
      state.map.addLayer(state.markerCluster);
    } else {
      markerList.forEach((m) => m.addTo(state.map));
    }

    if (latlngs.length > 1 && state.currentMapMode !== 'route') {
      state.map.fitBounds(latlngs, { padding: [48, 48] });
    } else if (latlngs.length === 1) {
      state.map.setView(latlngs[0], 15);
    }
  }

  function setMarkerVisible(record, visible) {
    if (!record?.marker || !state.map) return;
    if (visible === record.visible) return;
    record.visible = visible;
    if (state.markerCluster) {
      if (visible) state.markerCluster.addLayer(record.marker);
      else state.markerCluster.removeLayer(record.marker);
    } else if (visible) {
      record.marker.addTo(state.map);
    } else {
      state.map.removeLayer(record.marker);
    }
  }

  function updateMarker(bin) {
    const record = state.markers[bin.id];
    if (!record || !state.map) return;

    const merged = { ...record.bin, ...bin };
    const level = Number(merged.niveau || 0);
    record.bin = merged;
    record.marker.setLatLng([Number(merged.latitude), Number(merged.longitude)]);
    record.marker.setIcon(createLeafletIcon(level, merged));
    record.marker.setPopupContent(buildInfoWindowContent(merged));
  }

  async function calculateRoute(routeBins) {
    if (!state.map || !routeBins?.length) return null;

    const routePoints = routeBins.map((bin) => ({
      ...bin,
      latitude: Number(bin.latitude),
      longitude: Number(bin.longitude)
    }));

    if (routePoints.length < 2) return null;

    if (state.routeLayer) {
      state.map.removeLayer(state.routeLayer);
      state.routeLayer = null;
    }

    const latlngs = routePoints.map((p) => [p.latitude, p.longitude]);
    latlngs.push([routePoints[0].latitude, routePoints[0].longitude]);

    state.routeLayer = L.polyline(latlngs, {
      color: '#10b981',
      weight: 5,
      opacity: 0.92,
      lineJoin: 'round'
    }).addTo(state.map);

    state.map.fitBounds(state.routeLayer.getBounds(), { padding: [40, 40] });
    addBinMarkers(routePoints, { cluster: false });

    let distanceKm = 0;
    for (let i = 0; i < routePoints.length - 1; i++) {
      distanceKm += haversineKm(
        routePoints[i].latitude, routePoints[i].longitude,
        routePoints[i + 1].latitude, routePoints[i + 1].longitude
      );
    }
    distanceKm += haversineKm(
      routePoints[routePoints.length - 1].latitude,
      routePoints[routePoints.length - 1].longitude,
      routePoints[0].latitude,
      routePoints[0].longitude
    );
    distanceKm = Math.round(distanceKm * 100) / 100;
    const durationMin = Math.max(1, Math.round((distanceKm / 22) * 60));

    return {
      isFallback: false,
      orderedStops: routePoints,
      distanceKm,
      durationMin
    };
  }

  async function exportRoutePdf(routeData = state.currentRoute, options = {}) {
    if (!routeData) {
      showToast('Aucune tournée à exporter', 'error');
      return;
    }

    if (!window.jspdf?.jsPDF || !window.html2canvas) {
      showToast('Librairies PDF indisponibles', 'error');
      return;
    }

    const target = document.getElementById('route-result-container');
    if (!target) {
      showToast('Résumé de tournée introuvable', 'error');
      return;
    }

    const exportBtn = document.getElementById('btn-export-pdf');
    const previousText = exportBtn ? exportBtn.textContent : '';

    if (exportBtn) {
      exportBtn.disabled = true;
      exportBtn.textContent = 'Generation PDF...';
    }

    try {
      const canvas = await window.html2canvas(target, {
        backgroundColor: '#ffffff',
        scale: 2,
        useCORS: true
      });

      const { jsPDF } = window.jspdf;
      const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();
      const margin = 12;

      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(18);
      pdf.text('SUIVI-DECHETS - Ordre de mission', margin, 18);

      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(11);
      pdf.text(`Tournee: ${routeData.id}`, margin, 26);
      pdf.text(`Collecteur: ${routeData.collecteur || 'Equipe Elite'}`, margin, 32);
      pdf.text(`Statut: ${routeData.statut || 'planifiee'}`, margin, 38);
      pdf.text(`Genere le: ${formatTimestamp(new Date().toISOString())}`, margin, 44);

      const imageWidth = pageWidth - margin * 2;
      const imageHeight = (canvas.height * imageWidth) / canvas.width;
      const imageY = 52;

      if (imageY + imageHeight <= pageHeight - margin) {
        pdf.addImage(canvas.toDataURL('image/png'), 'PNG', margin, imageY, imageWidth, imageHeight);
      } else {
        let remainingHeight = imageHeight;
        let sourceY = 0;
        const ratio = canvas.width / imageWidth;
        let firstPage = true;

        while (remainingHeight > 0) {
          const availableHeight = firstPage ? pageHeight - imageY - margin : pageHeight - 2 * margin;
          const sliceHeight = Math.min(remainingHeight, availableHeight);
          const sliceCanvas = document.createElement('canvas');
          sliceCanvas.width = canvas.width;
          sliceCanvas.height = Math.floor(sliceHeight * ratio);
          const sliceCtx = sliceCanvas.getContext('2d');

          sliceCtx.drawImage(
            canvas,
            0,
            sourceY,
            canvas.width,
            sliceCanvas.height,
            0,
            0,
            canvas.width,
            sliceCanvas.height
          );

          const yPosition = firstPage ? imageY : margin;
          pdf.addImage(
            sliceCanvas.toDataURL('image/png'),
            'PNG',
            margin,
            yPosition,
            imageWidth,
            sliceHeight
          );

          remainingHeight -= sliceHeight;
          sourceY += sliceCanvas.height;

          if (remainingHeight > 0) {
            pdf.addPage();
            firstPage = false;
          }
        }
      }

      const filename = options.filename || `tournee-${routeData.id}.pdf`;
      pdf.save(filename);
      showToast('PDF genere avec succes', 'success');
    } catch (err) {
      console.error(err);
      showToast('Echec de la generation du PDF', 'error');
    } finally {
      if (exportBtn) {
        exportBtn.disabled = false;
        exportBtn.textContent = previousText || 'Exporter PDF';
      }
    }
  }

  // === Repositionnement temps réel des poubelles ===
  let positionSimulationInterval = null;

  async function updateBinPosition(binId, newLat, newLng) {
    try {
      const response = await apiFetch(`/api/poubelles/${binId}/position`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ latitude: newLat, longitude: newLng })
      });
      if (response.ok) {
        const updatedBin = await response.json();
        const idx = state.poubelles.findIndex((p) => p.id === binId);
        if (idx !== -1) {
          state.poubelles[idx] = { ...state.poubelles[idx], ...updatedBin };
          updateMarker(state.poubelles[idx]);
        }
        return true;
      }
    } catch (err) {
      console.error('Erreur mise à jour position:', err);
    }
    return false;
  }

  function scheduleNextPositionTick() {
    const delayMs = 45000 + Math.floor(Math.random() * 15001);
    positionSimulationInterval = setTimeout(async () => {
      const numToMove = Math.floor(Math.random() * 3) + 1;
      const poubelles = state.poubelles.filter((p) => p.actif !== 0);

      for (let i = 0; i < numToMove && poubelles.length > 0; i++) {
        const randomIndex = Math.floor(Math.random() * poubelles.length);
        const bin = poubelles[randomIndex];
        const deltaLat = (Math.random() - 0.5) * 0.01;
        const deltaLng = (Math.random() - 0.5) * 0.01;
        const newLat = Math.max(LAND_BOUNDS.latMin, Math.min(LAND_BOUNDS.latMax, Number(bin.latitude) + deltaLat));
        const newLng = Math.max(LAND_BOUNDS.lngMin, Math.min(LAND_BOUNDS.lngMax, Number(bin.longitude) + deltaLng));
        await updateBinPosition(bin.id, newLat, newLng);
      }

      scheduleNextPositionTick();
    }, delayMs);
  }

  function startRealTimePositionSimulation() {
    stopRealTimePositionSimulation();
    scheduleNextPositionTick();
    console.log('📍 Simulation repositionnement activée (45–60 s)');
  }

  function stopRealTimePositionSimulation() {
    if (positionSimulationInterval) {
      clearTimeout(positionSimulationInterval);
      positionSimulationInterval = null;
    }
  }

  socket = io(API_URL, { transports: ['websocket', 'polling'] });

  socket.on('connect', () => {
    console.log('📡 Connecté au serveur temps réel');
  });

  socket.on('bin:position:update', (updatedBin) => {
    const idx = state.poubelles.findIndex((p) => p.id === updatedBin.id);
    if (idx !== -1) {
      state.poubelles[idx] = { ...state.poubelles[idx], ...updatedBin };
      updateMarker(state.poubelles[idx]);
    }
  });

  socket.on('bin:update', (updatedBin) => {
    const idx = state.poubelles.findIndex((p) => p.id === updatedBin.id);
    if (idx !== -1) {
      state.poubelles[idx] = { ...state.poubelles[idx], ...updatedBin };
      updateMarker(state.poubelles[idx]);
      if (state.activeTab === 'dashboard' || state.activeTab === 'carte') {
        refreshActiveTabContent();
      }
    }
  });

  socket.on('alert:new', (alert) => {
    state.alertes.unshift(alert);
    showToast(`Alerte: ${alert.message}`, 'error');
    updateAlertBadge();
    if (state.activeTab === 'dashboard' || state.activeTab === 'alertes') {
      refreshActiveTabContent();
    }
  });

  socket.on('alert:resolved', (resolvedAlert) => {
    state.alertes = state.alertes.filter((a) => a.id !== resolvedAlert.id);
    showToast(`Alerte résolue: ${resolvedAlert.message}`, 'success');
    updateAlertBadge();
    if (state.activeTab === 'dashboard' || state.activeTab === 'alertes') {
      refreshActiveTabContent();
    }
  });

  socket.on('simulation:status', (status) => {
    state.simulationActive = status.running;
    updateSimulationUI();
  });

  socket.on('stats:update', (stats) => {
    state.stats = { ...(state.stats || {}), ...stats };
    if (state.activeTab === 'dashboard') {
      updateDashboardStats(state.stats);
      renderDashboardPerformance(state.stats);
    }
  });

  function updateAlertBadge() {
    const activeAlerts = state.alertes.filter((a) => !a.acknowledgeée).length;
    const badge = document.getElementById('alert-badge');
    const dot = document.getElementById('notif-dot');

    if (activeAlerts > 0) {
      badge.textContent = activeAlerts;
      badge.classList.remove('hidden');
      dot.classList.remove('hidden');
    } else {
      badge.classList.add('hidden');
      dot.classList.add('hidden');
    }
  }

  function updateSimulationUI() {
    const btn = document.getElementById('sim-toggle');
    const indicator = document.getElementById('sim-indicator');
    if (!btn || !indicator) return;

    if (state.simulationActive) {
      btn.classList.add('active');
      btn.innerHTML = `
        <span class="material-symbols-outlined" style="font-size:16px;">check_box_outline_blank</span>
        <span>Arrêter Simulation</span>
      `;
      indicator.classList.remove('hidden');
    } else {
      btn.classList.remove('active');
      btn.innerHTML = `
        <span class="material-symbols-outlined" style="font-size:16px;">play_arrow</span>
        <span>Simulateur IoT</span>
      `;
      indicator.classList.add('hidden');
    }
  }

  function updateUserProfileUI() {
    const storedUser = state.currentUser || JSON.parse(localStorage.getItem('user') || 'null');
    if (!storedUser) return;

    const fullName = [storedUser.prenom, storedUser.nom].filter(Boolean).join(' ').trim() || storedUser.email;
    const initial = fullName.charAt(0).toUpperCase();
    const roleLabel = storedUser.role || 'UTILISATEUR';

    [
      document.querySelector('.header__profile-name'),
      document.querySelector('.sidebar__user-name')
    ].forEach((node) => {
      if (node) node.textContent = fullName;
    });

    [
      document.querySelector('.header__profile-role'),
      document.querySelector('.sidebar__user-role')
    ].forEach((node) => {
      if (node) node.textContent = roleLabel;
    });

    [
      document.querySelector('.header__profile-avatar'),
      document.querySelector('.sidebar__avatar')
    ].forEach((node) => {
      if (node) node.textContent = initial;
    });
  }

  async function renderDashboard() {
    const content = document.getElementById('page-content');
    content.innerHTML = `
      <div class="page-title animate-fade">
        <h1>Tableau de Bord</h1>
        <p>Gestion intelligente des déchets urbains - Temps réel</p>
      </div>

      <div class="stats-grid" id="stats-grid-container">
        <div class="content__loading"><div class="spinner"></div></div>
      </div>

      <div id="hackathon-stats" class="hackathon-stats animate-slide-up"></div>

      <div class="dashboard-grid">
        <div class="card animate-slide-up">
          <div class="card__header">
            <div class="card__header-left">
              <span class="material-symbols-outlined" style="font-size:18px;">map</span>
              <h3>Réseau Urbain Premium - Bénin</h3>
            </div>
          </div>
          <div class="card__body" style="padding: 0;">
            <div class="map-container" id="dashboard-map"></div>
          </div>
        </div>

        <div class="space-y-20">
          <div class="card animate-slide-up">
            <div class="card__header">
              <div class="card__header-left">
                <span class="material-symbols-outlined" style="font-size:18px;">warning</span>
                <h3>Alertes Critiques</h3>
              </div>
            </div>
            <div class="card__body" style="padding: 0;" id="dashboard-alerts"></div>
          </div>

          <div class="card animate-slide-up">
            <div class="card__header">
              <div class="card__header-left">
                <span class="material-symbols-outlined" style="font-size:18px;">layers</span>
                <h3>Performances du Réseau</h3>
              </div>
            </div>
            <div class="card__body" id="dashboard-performance"></div>
          </div>
        </div>
      </div>
    `;

    try {
      const stats = await API.getStats();
      state.stats = stats;
      updateDashboardStats(state.stats);
      await renderHackathonStats();
      renderDashboardAlerts();
      renderDashboardPerformance(state.stats);
      await initMap('dashboard-map', { mode: 'dashboard', cluster: true, minHeight: '380px' });
    } catch (err) {
      console.error(err);
      showToast('Erreur de chargement du dashboard cartographique', 'error');
    }
  }

  function updateDashboardStats(stats) {
    const statsGrid = document.getElementById('stats-grid-container');
    if (!statsGrid) return;

    statsGrid.innerHTML = `
      <div class="stat-card stat-card--blue animate-slide-up">
        <div class="stat-card__header">
          <span class="stat-card__label">Total Poubelles</span>
          <div class="stat-card__icon">
            <span class="material-symbols-outlined" style="font-size:20px;">delete</span>
          </div>
        </div>
        <div class="stat-card__value">${stats.total_poubelles}</div>
        <div class="stat-card__sub">Actives sur le réseau</div>
      </div>

      <div class="stat-card stat-card--emerald animate-slide-up" style="animation-delay: 0.1s;">
        <div class="stat-card__header">
          <span class="stat-card__label">Remplissage Moyen</span>
          <div class="stat-card__icon">
            <span class="material-symbols-outlined" style="font-size:20px;">bar_chart</span>
          </div>
        </div>
        <div class="stat-card__value">${stats.niveau_moyen}%</div>
        <div class="stat-card__sub">Moyenne générale</div>
      </div>

      <div class="stat-card stat-card--red animate-slide-up" style="animation-delay: 0.2s;">
        <div class="stat-card__header">
          <span class="stat-card__label">Alertes Actives</span>
          <div class="stat-card__icon">
            <span class="material-symbols-outlined" style="font-size:20px;">notifications</span>
          </div>
        </div>
        <div class="stat-card__value">${stats.alertes_actives}</div>
        <div class="stat-card__sub">Requiert action immédiate</div>
      </div>

      <div class="stat-card stat-card--purple animate-slide-up" style="animation-delay: 0.3s;">
        <div class="stat-card__header">
          <span class="stat-card__label">Tournées Actives</span>
          <div class="stat-card__icon">
            <span class="material-symbols-outlined" style="font-size:20px;">route</span>
          </div>
        </div>
        <div class="stat-card__value">${stats.tournees_actives}</div>
        <div class="stat-card__sub">Collecteurs en service</div>
      </div>
    `;
  }

  function renderDashboardAlerts() {
    const alertsContainer = document.getElementById('dashboard-alerts');
    if (!alertsContainer) return;

    const activeAlerts = state.alertes.filter((a) => !a.acknowledgeée).slice(0, 4);

    if (activeAlerts.length === 0) {
      alertsContainer.innerHTML = `
        <div style="padding: 30px; text-align: center; color: var(--text-muted);">
          <span class="material-symbols-outlined" style="font-size:32px; margin-bottom: 8px; opacity: 0.5;">remove_circle_outline</span>
          <p>Aucune alerte active</p>
        </div>
      `;
      return;
    }

    alertsContainer.innerHTML = activeAlerts.map((alert) => `
      <div class="alert-item">
        <div class="alert-item__left">
          <div class="alert-item__icon alert-item__icon--critical">
            <span class="material-symbols-outlined" style="font-size:18px;">warning</span>
          </div>
          <div>
            <div class="alert-item__name">${alert.poubelle_nom || 'Poubelle'}</div>
            <div class="alert-item__detail">${alert.quartier} — ${alert.message}</div>
          </div>
        </div>
        <div class="alert-item__actions">
          <button class="btn btn--primary btn--sm btn-ack" data-id="${alert.id}">Traiter</button>
        </div>
      </div>
    `).join('');

    alertsContainer.querySelectorAll('.btn-ack').forEach((btn) => {
      btn.addEventListener('click', async (event) => {
        const id = event.currentTarget.getAttribute('data-id');
        try {
          const resolved = await API.acknowledgeAlert(id);
          if (resolved.error) throw new Error(resolved.error);
          state.alertes = state.alertes.filter((a) => a.id !== parseInt(id, 10));
          updateAlertBadge();
          renderDashboardAlerts();
          showToast('Alerte traitée avec succès', 'success');
        } catch (err) {
          showToast('Erreur lors du traitement', 'error');
        }
      });
    });
  }

  function renderDashboardPerformance(stats) {
    const perfContainer = document.getElementById('dashboard-performance');
    if (!perfContainer) return;

    perfContainer.innerHTML = `
      <div class="progress">
        <div class="progress__header">
          <span class="progress__label">Couverture réseau</span>
          <span class="progress__value">${stats.couverture_reseau}%</span>
        </div>
        <div class="progress__bar">
          <div class="progress__fill progress__fill--green" style="width: ${stats.couverture_reseau}%"></div>
        </div>
      </div>

      <div class="progress">
        <div class="progress__header">
          <span class="progress__label">Taux de collecte</span>
          <span class="progress__value">${stats.taux_collecte}%</span>
        </div>
        <div class="progress__bar">
          <div class="progress__fill progress__fill--blue" style="width: ${stats.taux_collecte}%"></div>
        </div>
      </div>

      <div class="progress">
        <div class="progress__header">
          <span class="progress__label">Satisfaction usagers</span>
          <span class="progress__value">${stats.satisfaction}%</span>
        </div>
        <div class="progress__bar">
          <div class="progress__fill progress__fill--purple" style="width: ${stats.satisfaction}%"></div>
        </div>
      </div>
    `;
  }

  async function renderCarte() {
    const content = document.getElementById('page-content');
    content.innerHTML = `
      <div class="page-title animate-fade">
        <h1>Carte Interactive Leaflet</h1>
        <p>Vue temps réel sur Abomey-Calavi — réseau de poubelles connectées</p>
      </div>

      <div class="card animate-slide-up" style="height: calc(100vh - 180px);">
        <div class="card__body" style="padding: 0; height: 100%;">
          <div class="map-container map-fullpage" id="full-map"></div>
        </div>
      </div>
    `;

    try {
      await initMap('full-map', { mode: 'carte', cluster: true, minHeight: 'calc(100vh - 200px)' });
    } catch (err) {
      console.error(err);
      showToast('Carte indisponible', 'error');
    }
  }

  async function renderTournees() {
    const content = document.getElementById('page-content');
    const binsToCollect = state.poubelles.filter((p) => Number(p.niveau || 0) >= 70);

    content.innerHTML = `
      <div class="page-title animate-fade">
        <h1>Optimisation de Tournée</h1>
        <p>Optimisation TSP + tracé Leaflet sur le réseau</p>
      </div>

      <div class="dashboard-grid animate-slide-up">
        <div class="card">
          <div class="card__header">
            <div class="card__header-left">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="6" cy="19" r="3"/><path d="M9 19h8.5a3.5 3.5 0 0 0 0-7h-11a3.5 3.5 0 0 1 0-7H15"/></svg>
              <h3>Sélectionner les points de collecte (Remplissage &ge; 70%)</h3>
            </div>
            <button class="btn btn--primary btn--sm" id="btn-select-all">Sélectionner tout</button>
          </div>
          <div class="card__body">
            <div id="route-location-hint" class="route-location-hint"></div>
            <div class="tournee-grid" id="tournee-select-grid">
              ${binsToCollect.length === 0 ? `
                <div style="grid-column: 1/-1; text-align: center; padding: 40px; color: var(--text-muted);">
                  <span class="material-symbols-outlined" style="font-size:32px; margin-bottom: 8px; opacity: 0.5;">remove_circle_outline</span>
                  <p>Aucune poubelle ne nécessite de collecte urgente (&ge; 70%)</p>
                </div>
              ` : binsToCollect.map((bin) => `
                <label class="tournee-checkbox ${state.selectedBins.includes(bin.id) ? 'checked' : ''}" data-id="${bin.id}">
                  <input type="checkbox" value="${bin.id}" ${state.selectedBins.includes(bin.id) ? 'checked' : ''}>
                  <div>
                    <div class="tournee-checkbox__name">${bin.nom}</div>
                    <div class="tournee-checkbox__detail">${bin.quartier} • ${bin.niveau}%</div>
                  </div>
                </label>
              `).join('')}
            </div>

            <div style="margin-top: 20px; display: flex; justify-content: flex-end;">
              <button class="btn btn--primary" id="btn-generate-route" ${state.selectedBins.length < 2 ? 'disabled' : ''}>
                Générer itinéraire optimal
              </button>
            </div>
          </div>
        </div>

        <div class="space-y-20">
          <div class="card" id="route-result-container">
            <div style="padding: 40px; text-align: center; color: var(--text-muted);">
              <span class="material-symbols-outlined" style="font-size:48px; margin-bottom: 12px; opacity: 0.4;">layers</span>
              <p>Sélectionnez au moins 2 points pour calculer un itinéraire optimisé.</p>
            </div>
          </div>

          <div class="card" style="height: 320px; padding:0; overflow:hidden;">
            <div id="route-map" style="width:100%; height:100%;"></div>
          </div>
        </div>
      </div>
    `;

    try {
      await initMap('route-map', {
        mode: 'route',
        cluster: false,
        showAllBins: false,
        zoom: 14,
        minHeight: '320px'
      });
      addBinMarkers(binsToCollect, { cluster: false });
    } catch (err) {
      console.error(err);
      showToast('Carte indisponible pour les tournées', 'error');
    }

    const checkboxes = content.querySelectorAll('.tournee-checkbox');
    checkboxes.forEach((checkboxNode) => {
      checkboxNode.addEventListener('click', (event) => {
        event.preventDefault();
        const checkbox = checkboxNode.querySelector('input');
        const id = checkboxNode.getAttribute('data-id');

        checkbox.checked = !checkbox.checked;
        if (checkbox.checked) {
          checkboxNode.classList.add('checked');
          if (!state.selectedBins.includes(id)) state.selectedBins.push(id);
        } else {
          checkboxNode.classList.remove('checked');
          state.selectedBins = state.selectedBins.filter((value) => value !== id);
        }

        document.getElementById('btn-generate-route').disabled = state.selectedBins.length < 2;
      });
    });

    const selectAllBtn = document.getElementById('btn-select-all');
    if (selectAllBtn) {
      selectAllBtn.addEventListener('click', () => {
        const allIds = binsToCollect.map((bin) => bin.id);
        const allCheckboxes = content.querySelectorAll('.tournee-checkbox');

        if (state.selectedBins.length === binsToCollect.length) {
          state.selectedBins = [];
          allCheckboxes.forEach((node) => {
            node.classList.remove('checked');
            node.querySelector('input').checked = false;
          });
        } else {
          state.selectedBins = [...allIds];
          allCheckboxes.forEach((node) => {
            node.classList.add('checked');
            node.querySelector('input').checked = true;
          });
        }

        document.getElementById('btn-generate-route').disabled = state.selectedBins.length < 2;
      });
    }

    updateRouteLocationHint();

    document.getElementById('btn-generate-route')?.addEventListener('click', generateRoute);
  }

  async function generateRoute() {
    const resultContainer = document.getElementById('route-result-container');
    resultContainer.innerHTML = `<div class="content__loading"><div class="spinner"></div><p>Optimisation du trajet...</p></div>`;

    try {
      const data = await API.optimizeRoute(state.selectedBins);
      if (data.error) {
        throw new Error(data.error);
      }

      const routeResult = await calculateRoute(data.route);
      const distanceKm = (routeResult && routeResult.distanceKm !== null) ? routeResult.distanceKm : data.distance_totale;
      const durationMin = (routeResult && routeResult.durationMin !== null) ? routeResult.durationMin : data.duree_estimee;
      const fuelEstimate = Math.round(distanceKm * 0.12 * 100) / 100;
      const co2Saved = Math.round(Math.max(distanceKm * 1.25 - distanceKm, 0) * 2.31 * 100) / 100;
      const orderedStops = routeResult?.orderedStops ?? data.route;

      state.currentRoute = {
        ...data,
        route: orderedStops,
        distance_totale: distanceKm,
        duree_estimee: durationMin,
        carburant_estime: fuelEstimate,
        co2_economise: co2Saved,
        statut: 'planifiée',
        collecteur: 'Equipe Elite'
      };

      resultContainer.innerHTML = `
        <div class="route-result" data-route-id="${data.id}">
          <div class="route-result__header">
            <div class="route-result__icon">
              <span class="material-symbols-outlined" style="font-size:24px;">check</span>
            </div>
            <div>
              <div class="route-result__title">Itinéraire optimisé généré</div>
              <div class="route-result__sub">${data.nb_points} poubelles optimisées + Dépôt</div>
            </div>
          </div>

          <div class="route-summary">
            <div class="route-summary__item">
              <span class="route-summary__label">ID</span>
              <strong>${data.id}</strong>
            </div>
            <div class="route-summary__item">
              <span class="route-summary__label">Collecteur</span>
              <strong id="route-collector-name">Equipe Elite</strong>
            </div>
            <div class="route-summary__item">
              <span class="route-summary__label">Statut</span>
              <strong id="route-status-badge" class="route-status route-status--planned">Planifiée</strong>
            </div>
          </div>

          <div class="route-steps">
            ${orderedStops.map((point, index) => `
              <div class="route-step">
                <div class="route-step__num ${point.id === 'depot' ? 'route-step__num--depot' : 'route-step__num--stop'}">${index + 1}</div>
                <div>
                  <strong>${point.nom}</strong>
                  <span style="font-size: 11px; color: var(--text-secondary);">(${point.quartier})</span>
                </div>
              </div>
            `).join('')}
          </div>

          <div class="route-metrics">
            <div>
              <div class="route-metric__label">Distance estimée</div>
              <div class="route-metric__value">${distanceKm} km</div>
            </div>
            <div>
              <div class="route-metric__label">Durée Trajet</div>
              <div class="route-metric__value">${durationMin} min</div>
            </div>
            <div>
              <div class="route-metric__label">Carburant Requis</div>
              <div class="route-metric__value">${fuelEstimate} L</div>
            </div>
            <div>
              <div class="route-metric__label">CO2 Économisé</div>
              <div class="route-metric__value route-metric__value--green">${co2Saved} kg</div>
            </div>
          </div>

          <div class="route-actions">
            <button class="btn btn--primary" id="btn-export-pdf">Exporter PDF</button>
            <button class="btn btn--dark" id="btn-share-collector">Assigner Tournée</button>
          </div>
        </div>
      `;

      document.getElementById('btn-export-pdf').addEventListener('click', async () => {
        await exportRoutePdf(state.currentRoute);
      });

      document.getElementById('btn-share-collector').addEventListener('click', async () => {
        if (!state.currentRoute?.id) {
          showToast('Aucune tournée à assigner', 'error');
          return;
        }

        const assignBtn = document.getElementById('btn-share-collector');
        const originalText = assignBtn.textContent;
        assignBtn.disabled = true;
        assignBtn.textContent = 'Assignation...';

        try {
          const updatedRoute = await API.assignRoute(
            state.currentRoute.id,
            state.currentRoute.collecteur || 'Equipe Elite'
          );

          if (updatedRoute.error) {
            throw new Error(updatedRoute.error);
          }

          state.currentRoute = {
            ...state.currentRoute,
            ...updatedRoute
          };

          const collectorNode = document.getElementById('route-collector-name');
          const statusNode = document.getElementById('route-status-badge');

          if (collectorNode) collectorNode.textContent = state.currentRoute.collecteur;
          if (statusNode) {
            statusNode.textContent = 'Assignée';
            statusNode.className = 'route-status route-status--assigned';
          }

          showToast('Tournée assignée et enregistrée en base', 'success');
          await exportRoutePdf(state.currentRoute, {
            filename: `ordre-mission-${state.currentRoute.id}.pdf`
          });
        } catch (err) {
          console.error(err);
          showToast('Erreur lors de l assignation', 'error');
        } finally {
          assignBtn.disabled = false;
          assignBtn.textContent = originalText;
        }
      });
    } catch (err) {
      console.error(err);
      showToast('Erreur lors du calcul de tournée', 'error');
      resultContainer.innerHTML = `
        <div style="padding: 40px; text-align: center; color: var(--red);">
          <span class="material-symbols-outlined" style="font-size:48px; margin-bottom: 12px; opacity: 0.8;">error_outline</span>
          <p>Échec du calcul : ${err.message || 'Erreur inconnue'}</p>
        </div>
      `;
    }
  }

  function renderAlertes() {
    const content = document.getElementById('page-content');
    content.innerHTML = `
      <div class="page-title animate-fade">
        <h1>Gestion des Alertes</h1>
        <p>Visualisation et acquittement des alertes du réseau IoT</p>
      </div>

      <div class="dashboard-grid">
        <div class="card animate-slide-up">
          <div class="card__header">
            <div class="card__header-left">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/></svg>
              <h3>Alertes Actives</h3>
            </div>
          </div>
          <div class="card__body" style="padding: 0;" id="full-alerts-list"></div>
        </div>

        <div class="card animate-slide-up">
          <div class="card__header">
            <div class="card__header-left">
              <span class="material-symbols-outlined" style="font-size:18px;">schedule</span>
              <h3>Historique Récent</h3>
            </div>
          </div>
          <div class="card__body" id="alerts-history"></div>
        </div>
      </div>
    `;

    renderFullAlertsList();
    renderAlertsHistory();
  }

  function renderFullAlertsList() {
    const list = document.getElementById('full-alerts-list');
    if (!list) return;

    const active = state.alertes.filter((a) => !a.acknowledgeée);

    if (active.length === 0) {
      list.innerHTML = `
        <div style="padding: 40px; text-align: center; color: var(--text-muted);">
          <span class="material-symbols-outlined" style="font-size:40px; margin-bottom: 8px; opacity: 0.5;">check_circle</span>
          <p>Aucune alerte en attente. Tout est sous contrôle.</p>
        </div>
      `;
      return;
    }

    list.innerHTML = active.map((alert) => `
      <div class="alert-item">
        <div class="alert-item__left">
          <div class="alert-item__icon ${alert.severite === 'critical' ? 'alert-item__icon--critical' : 'alert-item__icon--warning'}">
            <span class="material-symbols-outlined" style="font-size:18px;">warning</span>
          </div>
          <div>
            <div class="alert-item__name">${alert.poubelle_nom} (${alert.quartier})</div>
            <div class="alert-item__detail">${alert.message}</div>
          </div>
        </div>
        <div class="alert-item__actions">
          <button class="btn btn--primary btn-ack-full" data-id="${alert.id}">Résoudre</button>
        </div>
      </div>
    `).join('');

    list.querySelectorAll('.btn-ack-full').forEach((btn) => {
      btn.addEventListener('click', async (event) => {
        const id = event.currentTarget.getAttribute('data-id');
        try {
          const resolved = await API.acknowledgeAlert(id);
          if (resolved.error) throw new Error(resolved.error);
          state.alertes = state.alertes.filter((a) => a.id !== parseInt(id, 10));
          updateAlertBadge();
          renderFullAlertsList();
          renderAlertsHistory();
          showToast('Alerte résolue et enregistrée', 'success');
        } catch (err) {
          showToast('Erreur', 'error');
        }
      });
    });
  }

  async function renderAlertsHistory() {
    const container = document.getElementById('alerts-history');
    if (!container) return;

    try {
      const res = await apiFetch('/api/alertes?active=false');
      const allAlerts = await res.json();
      const resolved = allAlerts.filter((alert) => alert.acknowledgeée);

      if (resolved.length === 0) {
        container.innerHTML = `
          <div style="padding: 30px; text-align: center; color: var(--text-muted);">
            <p>Historique vide.</p>
          </div>
        `;
        return;
      }

      container.innerHTML = resolved.slice(0, 8).map((alert) => `
        <div class="history-item">
          <div>
            <div class="history-item__name">${alert.poubelle_nom}</div>
            <div class="history-item__detail">${alert.quartier} • Niveau: ${alert.niveau || '--'}%</div>
          </div>
          <div class="history-item__value">
            <span class="text-green" style="font-weight: 700;">Traité</span>
            <div class="history-item__time">${new Date(alert.resolved_at).toLocaleTimeString('fr-FR')}</div>
          </div>
        </div>
      `).join('');
    } catch (err) {
      container.innerHTML = `<p style="color: var(--red);">Erreur lors de la récupération</p>`;
    }
  }

  function renderStatistiques() {
    const content = document.getElementById('page-content');
    content.innerHTML = `
      <div class="page-title animate-fade">
        <h1>Rapports & Statistiques</h1>
        <p>Analyses avancées et prédictions sur la production des déchets</p>
      </div>

      <div class="stats-page-grid animate-slide-up">
        <div class="card">
          <div class="card__header">
            <div class="card__header-left">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>
              <h3>Top Quartiers Producteurs de Déchets</h3>
            </div>
          </div>
          <div class="card__body">
            <div class="chart-container">
              <canvas id="quartiers-chart"></canvas>
            </div>
          </div>
        </div>

        <div class="card">
          <div class="card__header">
            <div class="card__header-left">
              <span class="material-symbols-outlined" style="font-size:18px;">attach_money</span>
              <h3>Performances Écologiques</h3>
            </div>
          </div>
          <div class="card__body">
            <div style="display: flex; flex-direction: column; gap: 20px;">
              <div style="background: var(--bg-primary); padding: 20px; border-radius: var(--radius-md); text-align: center;">
                <div style="font-size: 13px; color: var(--text-secondary);">Total CO2 Économisé</div>
                <div style="font-size: 32px; font-weight: 800; color: var(--emerald); margin-top: 6px;">148.5 kg</div>
                <div style="font-size: 11px; color: var(--text-muted); margin-top: 4px;">Grâce aux itinéraires optimisés</div>
              </div>

              <div style="background: var(--bg-primary); padding: 20px; border-radius: var(--radius-md); text-align: center;">
                <div style="font-size: 13px; color: var(--text-secondary);">Taux d Efficacité Énergétique</div>
                <div style="font-size: 32px; font-weight: 800; color: var(--blue); margin-top: 6px;">96.4%</div>
                <div style="font-size: 11px; color: var(--text-muted); margin-top: 4px;">Autonomie moyenne des batteries capteurs</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div class="card animate-slide-up" style="margin-top:20px;">
        <div class="card__header">
          <div class="card__header-left">
            <span class="material-symbols-outlined" style="font-size:18px;">monitoring</span>
            <h3>Évolution horaire (24h)</h3>
          </div>
        </div>
        <div class="card__body">
          <div class="chart-container">
            <canvas id="hourly-chart"></canvas>
          </div>
        </div>
      </div>
    `;

    setTimeout(drawCharts, 100);
    setTimeout(() => { renderDetailedChart().catch(() => {}); }, 120);
  }

  function drawCharts() {
    const canvas = document.getElementById('quartiers-chart');
    if (!canvas) return;

    const quartierMap = new Map();
    state.poubelles.forEach((bin) => {
      const quartier = bin.quartier || 'Inconnu';
      const level = Number(bin.niveau || 0);
      const current = quartierMap.get(quartier) || { total: 0, count: 0 };
      current.total += level;
      current.count += 1;
      quartierMap.set(quartier, current);
    });

    const data = Array.from(quartierMap.entries())
      .map(([label, values]) => ({
        label,
        value: Math.round(values.total / values.count)
      }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 5);

    if (data.length === 0) {
      const ctx = canvas.getContext('2d');
      const width = canvas.offsetWidth;
      const height = canvas.offsetHeight;
      canvas.width = width * window.devicePixelRatio;
      canvas.height = height * window.devicePixelRatio;
      ctx.scale(window.devicePixelRatio, window.devicePixelRatio);
      ctx.fillStyle = '#94a3b8';
      ctx.font = '500 14px Inter';
      ctx.textAlign = 'center';
      ctx.fillText('Aucune donnee disponible', width / 2, height / 2);
      return;
    }

    if (state.quartiersChart) {
      state.quartiersChart.destroy();
    }

    state.quartiersChart = new Chart(canvas, {
      type: 'bar',
      data: {
        labels: data.map((item) => item.label),
        datasets: [{
          label: 'Remplissage moyen (%)',
          data: data.map((item) => item.value),
          backgroundColor: ['#10b981', '#22c55e', '#34d399', '#3b82f6', '#60a5fa'],
          borderRadius: 12,
          borderSkipped: false
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false }
        },
        scales: {
          x: {
            grid: { display: false },
            ticks: { color: '#94a3b8', font: { family: 'Inter' } }
          },
          y: {
            beginAtZero: true,
            max: 100,
            ticks: { color: '#64748b', callback: (value) => `${value}%` },
            grid: { color: 'rgba(30, 36, 72, 0.8)' }
          }
        }
      }
    });
  }

  async function renderDetailedChart() {
    const canvas = document.getElementById('hourly-chart');
    if (!canvas) return;

    const res = await apiFetch('/api/stats/hourly');
    const data = await res.json();
    if (data.error) return;

    const ctx = canvas.getContext('2d');
    new Chart(ctx, {
      type: 'line',
      data: {
        labels: data.hours || [],
        datasets: [
          {
            label: 'Niveau moyen (%)',
            data: data.levels || [],
            borderColor: '#5b9eff',
            backgroundColor: 'rgba(91,158,255,0.18)',
            tension: 0.4,
            fill: true
          },
          {
            label: 'Alertes',
            data: data.alerts || [],
            borderColor: '#ef4444',
            backgroundColor: 'rgba(239,68,68,0.25)',
            type: 'bar',
            yAxisID: 'y1',
            barPercentage: 0.5
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { labels: { color: '#94a3b8' } } },
        scales: {
          x: { ticks: { color: '#64748b' }, grid: { color: 'rgba(30,36,72,0.6)' } },
          y: {
            beginAtZero: true,
            max: 100,
            ticks: { color: '#94a3b8', callback: (v) => `${v}%` },
            grid: { color: 'rgba(30,36,72,0.6)' }
          },
          y1: {
            beginAtZero: true,
            position: 'right',
            ticks: { color: '#f59e0b' },
            grid: { drawOnChartArea: false }
          }
        }
      }
    });
  }

  function refreshActiveTabContent() {
    if (state.activeTab === 'dashboard') {
      if (state.stats) {
        updateDashboardStats(state.stats);
        renderDashboardPerformance(state.stats);
      }
      renderDashboardAlerts();
    } else if (state.activeTab === 'tournees') {
      renderTournees();
      updateRouteLocationHint();
    } else if (state.activeTab === 'alertes') {
      renderFullAlertsList();
      renderAlertsHistory();
    } else if (state.activeTab === 'statistiques') {
      renderStatistiques();
    }
  }

  function setupNavigation() {
    updateUserProfileUI();

    const logoutBtn = document.getElementById('logout-btn');
    if (logoutBtn && !logoutBtn.dataset.bound) {
      logoutBtn.dataset.bound = '1';
      logoutBtn.addEventListener('click', async () => {
        try {
          await API.logout();
        } finally {
          clearSession();
          window.location.href = '/login';
        }
      });
    }

    const links = document.querySelectorAll('.sidebar__link');
    links.forEach((link) => {
      link.addEventListener('click', (event) => {
        links.forEach((item) => item.classList.remove('sidebar__link--active'));
        const activeLink = event.currentTarget;
        activeLink.classList.add('sidebar__link--active');

        state.activeTab = activeLink.getAttribute('data-tab');

        if (state.activeTab === 'dashboard') renderDashboard();
        else if (state.activeTab === 'carte') renderCarte();
        else if (state.activeTab === 'tournees') renderTournees();
        else if (state.activeTab === 'alertes') renderAlertes();
        else if (state.activeTab === 'statistiques') renderStatistiques();

        if (window.innerWidth <= 768) {
          document.getElementById('sidebar').classList.remove('sidebar--open');
        }
      });
    });

    const toggleBtn = document.getElementById('sidebar-toggle');
    const sidebar = document.getElementById('sidebar');
    const main = document.querySelector('.main');

    toggleBtn.addEventListener('click', () => {
      sidebar.classList.toggle('sidebar--open');
      if (window.innerWidth > 768) {
        sidebar.classList.toggle('sidebar--collapsed');
        main.classList.toggle('main--collapsed');
      }
    });

    document.getElementById('sim-toggle').addEventListener('click', async () => {
      try {
        const nextState = !state.simulationActive;
        await API.toggleSimulation(nextState);
        state.simulationActive = nextState;
        updateSimulationUI();
        showToast(state.simulationActive ? 'Simulateur IoT démarré' : 'Simulateur IoT arrêté', 'info');
      } catch (err) {
        showToast('Erreur simulateur', 'error');
      }
    });

    document.getElementById('refresh-btn').addEventListener('click', async () => {
      const btn = document.getElementById('refresh-btn');
      btn.style.transform = 'rotate(360deg)';
      btn.style.transition = 'transform 0.8s ease';

      try {
        state.poubelles = await API.getPoubelles();
        state.alertes = await API.getAlertes();
        state.stats = await API.getStats();
        updateAlertBadge();

        if (state.map && (state.activeTab === 'dashboard' || state.activeTab === 'carte')) {
          addBinMarkers(state.poubelles, { cluster: true });
        }

        refreshActiveTabContent();
        showToast('Données actualisées', 'success');
      } catch (err) {
        showToast('Échec de la synchronisation', 'error');
      }

      setTimeout(() => {
        btn.style.transform = 'none';
        btn.style.transition = 'none';
      }, 800);
    });

    const searchInput = document.getElementById('search-input');
    if (searchInput) {
      searchInput.addEventListener('input', (event) => {
        const query = event.target.value.toLowerCase().trim();

      if (!query) {
        Object.values(state.markers).forEach((record) => setMarkerVisible(record, true));
        return;
      }

      let firstMatch = null;
      Object.values(state.markers).forEach((record) => {
        const bin = record.bin;
        const match = bin.nom.toLowerCase().includes(query) || bin.quartier.toLowerCase().includes(query);
        setMarkerVisible(record, match);
        if (!firstMatch && match) firstMatch = record.marker;
      });

      if (firstMatch && state.map) {
        const ll = firstMatch.getLatLng();
        state.map.setView(ll, Math.max(state.map.getZoom(), 15));
        firstMatch.openPopup();
      }
    });
  }

  }

  async function init() {
    try {
      state.currentUser = JSON.parse(localStorage.getItem('user') || 'null');
      const me = await API.getMe();
      if (me?.error) {
        throw new Error(me.error);
      }

      state.currentUser = me;
      localStorage.setItem('user', JSON.stringify(me));
      updateUserProfileUI();

      setupPwaInstallPrompt();
      initGeolocationTracking();

      // presentation helpers
      initTheme();
      initFilterChips();
      initSystemLoadPolling();

      state.poubelles = await API.getPoubelles();
      state.alertes = await API.getAlertes();
      state.stats = await API.getStats();
      const simStatus = await API.getSimulationStatus();
      state.simulationActive = simStatus.running;

      updateAlertBadge();
      updateSimulationUI();
      setupNavigation();
      await renderDashboard();
      const demoEnabled = new URLSearchParams(window.location.search).get('demo') === '1';
      if (demoEnabled) {
        startDemoMode();
      }
      if (['SUPER_ADMIN', 'ADMIN'].includes(state.currentUser?.role)) {
        startRealTimePositionSimulation();
      }
    } catch (err) {
      console.error(err.stack || err);
      clearSession();
      if (window.location.pathname !== '/login') {
        window.location.href = '/login';
      }
    }
  }

  init();
});
