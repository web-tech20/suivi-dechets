import { getAccessToken } from './auth.js';
import { drawPredictionChart } from './dashboard.js';

export async function loadMLPredictions(binId, containerId) {
  const container = document.getElementById(containerId);
  
  try {
    const res = await fetch(`/api/ml/predict/${binId}`, {
      headers: { 'Authorization': `Bearer ${getAccessToken()}` }
    });
    
    if (!res.ok) throw new Error('Erreur ML');
    const data = await res.json();
    
    const isRed = data.predicted_24h >= 80;
    
    container.innerHTML = `
      <div style="background:var(--surface-hover); padding:12px; border-radius:8px; border:1px solid ${isRed ? 'var(--danger)' : 'var(--border)'};">
        <div style="display:flex; justify-content:space-between; margin-bottom:8px;">
          <span style="font-weight:600; font-size:12px;"><i data-lucide="brain" style="width:14px; height:14px; vertical-align:middle; color:#a855f7;"></i> IA LSTM</span>
          <span class="badge" style="background:#a855f7;">${(data.confidence * 100).toFixed(0)}% Confiance</span>
        </div>
        <div style="display:grid; grid-template-columns:1fr 1fr 1fr; gap:5px; text-align:center;">
          <div><div style="font-size:10px; color:var(--text-muted);">+6h</div><div style="font-weight:700; font-size:14px;">${data.predicted_6h}%</div></div>
          <div><div style="font-size:10px; color:var(--text-muted);">+12h</div><div style="font-weight:700; font-size:14px;">${data.predicted_12h}%</div></div>
          <div><div style="font-size:10px; color:var(--text-muted);">+24h</div><div style="font-weight:700; font-size:14px; color:${isRed ? 'var(--danger)' : 'inherit'};">${data.predicted_24h}%</div></div>
        </div>
        <div style="font-size:11px; margin-top:10px; color:var(--text-muted);">
          <strong>Collecte recommandée:</strong> <br>
          ${new Date(data.recommended_collection).toLocaleString('fr-FR', { weekday: 'long', hour: '2-digit', minute: '2-digit' })}
        </div>
      </div>
    `;
    
    lucide.createIcons();
    
    // Also update the dashboard chart if we are on dashboard tab
    drawPredictionChart(data);
    
  } catch (err) {
    container.innerHTML = `
      <div style="padding:10px; color:var(--warning); font-size:11px; border:1px dashed var(--warning); border-radius:4px;">
        <i data-lucide="alert-triangle" style="width:14px; height:14px; vertical-align:middle;"></i> 
        Prédictions ML temporairement indisponibles.
      </div>
    `;
    lucide.createIcons();
  }
}
