import { getAccessToken, showToast } from './auth.js';
import { drawRouteOnMap } from './google-maps.js';

let selectedBins = new Set();
let allBins = [];

export async function initTournees() {
  await fetchBinsForTournee();
  
  document.getElementById('btn-select-all').addEventListener('click', () => {
    allBins.forEach(b => selectedBins.add(b.id));
    renderBinsList();
  });
  
  document.getElementById('btn-optimize').addEventListener('click', generateRoute);
}

async function fetchBinsForTournee() {
  try {
    const res = await fetch('/api/bins/urgent?threshold=50', {
      headers: { 'Authorization': `Bearer ${getAccessToken()}` }
    });
    if (!res.ok) throw new Error('Erreur de chargement');
    allBins = await res.json();
    renderBinsList();
  } catch (err) {
    document.getElementById('tournees-bins-list').innerHTML = `<p class="auth-error">Erreur: ${err.message}</p>`;
  }
}

function renderBinsList() {
  const container = document.getElementById('tournees-bins-list');
  if (allBins.length === 0) {
    container.innerHTML = '<p class="text-muted" style="text-align:center; padding: 20px;">Aucune poubelle urgente.</p>';
    return;
  }
  
  container.innerHTML = allBins.map(bin => {
    const isSelected = selectedBins.has(bin.id);
    return `
      <div class="bin-item ${isSelected ? 'selected' : ''}" data-id="${bin.id}">
        <div>
          <div style="font-weight:600;">${bin.nom}</div>
          <div style="font-size:11px; color:var(--text-muted);">${bin.quartier}</div>
        </div>
        <div style="display:flex; align-items:center; gap:10px;">
          <span class="badge" style="background:${bin.niveau >= 80 ? 'var(--danger)' : 'var(--warning)'}">${bin.niveau}%</span>
          <i data-lucide="${isSelected ? 'check-circle' : 'circle'}" style="color:${isSelected ? 'var(--primary)' : 'var(--text-muted)'}; width:18px;"></i>
        </div>
      </div>
    `;
  }).join('');
  
  lucide.createIcons();
  
  // Add click listeners
  container.querySelectorAll('.bin-item').forEach(el => {
    el.addEventListener('click', () => {
      const id = el.getAttribute('data-id');
      if (selectedBins.has(id)) selectedBins.delete(id);
      else selectedBins.add(id);
      renderBinsList();
    });
  });
}

async function generateRoute() {
  if (selectedBins.size === 0) {
    return showToast('Sélectionnez au moins une poubelle.', 'warning');
  }
  
  const btn = document.getElementById('btn-optimize');
  btn.innerHTML = '<div class="loading-spinner" style="width:16px; height:16px; border-width:2px; display:inline-block; margin-right:5px;"></div> Calcul en cours...';
  btn.disabled = true;
  
  try {
    const res = await fetch('/api/tournees/optimize', {
      method: 'POST',
      headers: { 
        'Authorization': `Bearer ${getAccessToken()}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ binIds: Array.from(selectedBins) })
    });
    
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Erreur optimisation');
    }
    
    const tournee = await res.json();
    showToast('Tournée optimisée avec succès!', 'success');
    displayTourneeResult(tournee);
    
    // Draw on map
    if (tournee.route && tournee.route.length > 0) {
      drawRouteOnMap(tournee.route);
      document.querySelector('[data-tab="carte"]').click(); // switch to map to show route
    }
    
  } catch (err) {
    showToast(err.message, 'error');
  } finally {
    btn.innerHTML = '<i data-lucide="zap"></i> Générer l\'itinéraire optimal';
    btn.disabled = false;
    lucide.createIcons();
  }
}

function displayTourneeResult(tournee) {
  document.getElementById('tournee-empty-state').style.display = 'none';
  document.getElementById('tournee-results-state').style.display = 'block';
  
  document.getElementById('tournee-dist').textContent = `${tournee.distanceTotale} km`;
  document.getElementById('tournee-time').textContent = `${tournee.dureeEstimee} min`;
  document.getElementById('tournee-fuel').textContent = `${tournee.carburantEstime} L`;
  document.getElementById('tournee-co2').textContent = `${tournee.co2Economise} kg`;
  
  const list = document.getElementById('optimized-route-list');
  list.innerHTML = tournee.route.map((pt, i) => `
    <div style="display:flex; gap:10px; padding:10px; border-bottom:1px solid var(--border);">
      <div style="font-weight:bold; color:var(--primary); width:20px;">${i+1}</div>
      <div>
        <div style="font-weight:600; font-size:13px;">${pt.nom}</div>
        <div style="font-size:11px; color:var(--text-muted);">${pt.adresse || pt.quartier || 'Dépôt Central'}</div>
      </div>
    </div>
  `).join('');
  
  // Setup export PDF
  const exportBtn = document.getElementById('btn-export-pdf');
  exportBtn.onclick = async () => {
    exportBtn.innerHTML = 'Génération...';
    try {
      const res = await fetch(`/api/tournees/${tournee.id}/export`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${getAccessToken()}` }
      });
      if (!res.ok) throw new Error('Erreur export');
      
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Tournee_${tournee.nom.replace(/ /g, '_')}.pdf`;
      a.click();
      showToast('PDF téléchargé.', 'success');
    } catch(e) {
      showToast(e.message, 'error');
    } finally {
      exportBtn.innerHTML = '<i data-lucide="download"></i> Exporter PDF';
      lucide.createIcons();
    }
  };
}
