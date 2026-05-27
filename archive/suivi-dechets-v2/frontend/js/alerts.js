import { getAccessToken, showToast } from './auth.js';

export async function initAlerts() {
  await refreshAlerts();
  
  document.getElementById('btn-refresh-alerts').addEventListener('click', refreshAlerts);
}

export async function refreshAlerts() {
  const container = document.getElementById('alerts-list');
  const badge = document.getElementById('alerts-badge');
  
  try {
    const res = await fetch('/api/alerts', {
      headers: { 'Authorization': `Bearer ${getAccessToken()}` }
    });
    if (!res.ok) throw new Error('Erreur de chargement');
    
    const alerts = await res.json();
    
    badge.textContent = alerts.length;
    if (alerts.length > 0) badge.style.display = 'inline-block';
    else badge.style.display = 'none';
    
    if (alerts.length === 0) {
      container.innerHTML = `
        <div class="empty-state" style="padding-top:40px;">
          <i data-lucide="check-circle" style="width:48px; height:48px; color:var(--primary); margin-bottom:15px;"></i>
          <h3>Aucune alerte active</h3>
          <p>Tous les capteurs fonctionnent normalement.</p>
        </div>
      `;
      lucide.createIcons();
      return;
    }
    
    container.innerHTML = alerts.map(a => `
      <div class="alert-item ${a.severite === 'critical' ? 'critical' : ''}">
        <div class="alert-info">
          <h4>${a.poubelle_nom}</h4>
          <p>${a.message}</p>
          <p style="font-size:10px; margin-top:5px; opacity:0.7;">
            <i data-lucide="clock" style="width:10px; height:10px; display:inline-block;"></i> 
            ${new Date(a.timestamp).toLocaleString('fr-FR')}
          </p>
        </div>
        <button class="btn btn-secondary btn-small btn-resolve" data-id="${a.id}">Résoudre</button>
      </div>
    `).join('');
    
    lucide.createIcons();
    
    // Add resolve handlers
    container.querySelectorAll('.btn-resolve').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        const id = e.currentTarget.getAttribute('data-id');
        await resolveAlert(id);
      });
    });
    
  } catch (err) {
    container.innerHTML = `<p class="auth-error">Erreur: ${err.message}</p>`;
  }
}

async function resolveAlert(id) {
  try {
    const res = await fetch(`/api/alerts/${id}/resolve`, {
      method: 'PUT',
      headers: { 'Authorization': `Bearer ${getAccessToken()}` }
    });
    
    if (!res.ok) throw new Error('Impossible de résoudre l\'alerte');
    
    showToast('Alerte résolue avec succès', 'success');
    refreshAlerts(); // Re-fetch
  } catch (err) {
    showToast(err.message, 'error');
  }
}
