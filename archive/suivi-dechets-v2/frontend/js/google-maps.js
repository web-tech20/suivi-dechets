import { getAccessToken } from './auth.js';
import { loadMLPredictions } from './ml-viz.js';

let map;
let markers = new Map(); // binId -> marker instance
let markerCluster;
let currentRoutePath = null;

// Abomey-Calavi coordinates
const CENTER = { lat: 6.4486, lng: 2.4187 };

export async function initGoogleMaps() {
  // Dynamically load Google Maps script (using a placeholder key for local dev if missing)
  const script = document.createElement('script');
  // NOTE: In production, replace YOUR_API_KEY with the actual key from environment
  script.src = `https://maps.googleapis.com/maps/api/js?key=YOUR_API_KEY_HERE&libraries=marker&callback=initMapFn`;
  script.async = true;
  script.defer = true;
  
  window.initMapFn = () => {
    setupMap();
    fetchAndPlotBins();
  };
  
  document.head.appendChild(script);
  
  // Setup overlay close button
  document.getElementById('close-overlay').addEventListener('click', () => {
    document.getElementById('map-overlay-panel').style.display = 'none';
  });
}

function setupMap() {
  const isDark = document.body.classList.contains('dark-theme');
  
  map = new google.maps.Map(document.getElementById('google-map'), {
    center: CENTER,
    zoom: 13,
    mapId: '90f87356969d889c', // Placeholder map ID to enable Advanced Markers
    disableDefaultUI: false,
    zoomControl: true,
    mapTypeControl: false,
    streetViewControl: true,
    fullscreenControl: true,
    styles: isDark ? getDarkMapStyles() : [] // Apply dark theme if active
  });
  
  // Load MarkerClusterer script dynamically
  const clusterScript = document.createElement('script');
  clusterScript.src = "https://unpkg.com/@googlemaps/markerclusterer/dist/index.min.js";
  clusterScript.onload = () => {
    markerCluster = new markerClusterer.MarkerClusterer({ map });
  };
  document.head.appendChild(clusterScript);

  // Listen for app theme changes
  window.addEventListener('themeChanged', (e) => {
    if (map) {
      map.setOptions({ styles: e.detail.isDark ? getDarkMapStyles() : [] });
    }
  });
}

async function fetchAndPlotBins() {
  try {
    const res = await fetch('/api/bins', {
      headers: { 'Authorization': `Bearer ${getAccessToken()}` }
    });
    const bins = await res.json();
    
    bins.forEach(bin => addBinMarker(bin));
  } catch (err) {
    console.error('Erreur chargement poubelles', err);
  }
}

function getMarkerColor(niveau) {
  if (niveau >= 80) return '#ef4444'; // Red
  if (niveau >= 50) return '#f59e0b'; // Orange
  return '#10b981'; // Green
}

function addBinMarker(bin) {
  const color = getMarkerColor(bin.niveau);
  
  // Creating a custom SVG icon for Google Maps
  const svgMarker = {
    path: "M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z",
    fillColor: color,
    fillOpacity: 1,
    strokeWeight: 2,
    strokeColor: "#ffffff",
    scale: 1.5,
    anchor: new google.maps.Point(12, 24)
  };

  const marker = new google.maps.Marker({
    position: { lat: bin.latitude, lng: bin.longitude },
    map: map,
    icon: svgMarker,
    title: bin.nom
  });

  marker.addListener('click', () => {
    showBinDetails(bin);
  });

  markers.set(bin.id, marker);
  
  if (markerCluster) {
    markerCluster.addMarker(marker);
  }
}

export function updateBinMarker(binId, reading) {
  if (markers.has(binId)) {
    const marker = markers.get(binId);
    const color = getMarkerColor(reading.niveauRemplissage);
    
    const svgMarker = marker.getIcon();
    svgMarker.fillColor = color;
    marker.setIcon(svgMarker);
    
    // Bounce animation for critical update
    if (reading.niveauRemplissage >= 80) {
      marker.setAnimation(google.maps.Animation.BOUNCE);
      setTimeout(() => marker.setAnimation(null), 3000);
    }
  }
}

async function showBinDetails(bin) {
  const overlay = document.getElementById('map-overlay-panel');
  const title = document.getElementById('overlay-bin-name');
  const content = document.getElementById('overlay-content');
  
  title.textContent = `${bin.nom} (${bin.quartier})`;
  
  content.innerHTML = `
    <div style="margin-bottom: 15px;">
      <div style="font-size:12px; color:var(--text-muted);">Niveau de Remplissage</div>
      <div style="display:flex; align-items:center; gap:10px;">
        <div style="flex:1; height:8px; background:var(--surface-hover); border-radius:4px; overflow:hidden;">
          <div style="height:100%; width:${bin.niveau}%; background:${getMarkerColor(bin.niveau)};"></div>
        </div>
        <span style="font-weight:700;">${bin.niveau}%</span>
      </div>
    </div>
    
    <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px; margin-bottom:15px;">
      <div class="stat-box" style="padding:10px;">
        <span class="label">Batterie</span>
        <span class="val" style="font-size:14px;">${bin.batterie || '--'}%</span>
      </div>
      <div class="stat-box" style="padding:10px;">
        <span class="label">Température</span>
        <span class="val" style="font-size:14px;">${bin.temperature || '--'}°C</span>
      </div>
    </div>
    
    <div id="ml-container">
      <div class="loading-spinner" style="width:20px; height:20px;"></div>
      <span style="font-size:12px; color:var(--text-muted); display:block; text-align:center; margin-top:5px;">Analyse LSTM en cours...</span>
    </div>
  `;
  
  overlay.style.display = 'block';
  
  // Call ML Service to load predictions in this panel
  loadMLPredictions(bin.id, 'ml-container');
}

export function drawRouteOnMap(routePoints) {
  if (currentRoutePath) {
    currentRoutePath.setMap(null);
  }

  const pathCoords = routePoints.map(p => ({ lat: p.latitude, lng: p.longitude }));
  
  // Create an animated polyline symbol
  const lineSymbol = {
    path: google.maps.SymbolPath.FORWARD_CLOSED_ARROW,
    scale: 3,
    strokeColor: '#fff'
  };

  currentRoutePath = new google.maps.Polyline({
    path: pathCoords,
    geodesic: true,
    strokeColor: '#10b981',
    strokeOpacity: 0.8,
    strokeWeight: 5,
    icons: [{
      icon: lineSymbol,
      offset: '100%'
    }],
    map: map
  });

  // Fit bounds to route
  const bounds = new google.maps.LatLngBounds();
  pathCoords.forEach(coord => bounds.extend(coord));
  map.fitBounds(bounds);
  
  // Animate the arrow
  let count = 0;
  window.setInterval(() => {
    count = (count + 1) % 200;
    const icons = currentRoutePath.get('icons');
    icons[0].offset = (count / 2) + '%';
    currentRoutePath.set('icons', icons);
  }, 20);
}

// Minimal Dark theme for map
function getDarkMapStyles() {
  return [
    { elementType: "geometry", stylers: [{ color: "#242f3e" }] },
    { elementType: "labels.text.stroke", stylers: [{ color: "#242f3e" }] },
    { elementType: "labels.text.fill", stylers: [{ color: "#746855" }] },
    { featureType: "administrative.locality", elementType: "labels.text.fill", stylers: [{ color: "#d59563" }] },
    { featureType: "poi", elementType: "labels.text.fill", stylers: [{ color: "#d59563" }] },
    { featureType: "poi.park", elementType: "geometry", stylers: [{ color: "#263c3f" }] },
    { featureType: "poi.park", elementType: "labels.text.fill", stylers: [{ color: "#6b9a76" }] },
    { featureType: "road", elementType: "geometry", stylers: [{ color: "#38414e" }] },
    { featureType: "road", elementType: "geometry.stroke", stylers: [{ color: "#212a37" }] },
    { featureType: "road", elementType: "labels.text.fill", stylers: [{ color: "#9ca5b3" }] },
    { featureType: "road.highway", elementType: "geometry", stylers: [{ color: "#746855" }] },
    { featureType: "road.highway", elementType: "geometry.stroke", stylers: [{ color: "#1f2835" }] },
    { featureType: "road.highway", elementType: "labels.text.fill", stylers: [{ color: "#f3d19c" }] },
    { featureType: "transit", elementType: "geometry", stylers: [{ color: "#2f3948" }] },
    { featureType: "transit.station", elementType: "labels.text.fill", stylers: [{ color: "#d59563" }] },
    { featureType: "water", elementType: "geometry", stylers: [{ color: "#17263c" }] },
    { featureType: "water", elementType: "labels.text.fill", stylers: [{ color: "#515c6d" }] },
    { featureType: "water", elementType: "labels.text.stroke", stylers: [{ color: "#17263c" }] }
  ];
}
