import { getAccessToken, showToast } from './auth.js';

let productionChart, predictionChart;

export async function initDashboard() {
  await fetchKPIs();
  setupCharts();
  
  // Listen for theme changes to re-render charts
  window.addEventListener('themeChanged', (e) => {
    if (productionChart) productionChart.update();
    if (predictionChart) predictionChart.update();
  });
}

async function fetchKPIs() {
  try {
    const res = await fetch('/api/analytics', {
      headers: { 'Authorization': `Bearer ${getAccessToken()}` }
    });
    if (!res.ok) throw new Error('Erreur KPI');
    const data = await res.json();
    
    document.getElementById('kpi-avg-fill').textContent = `${data.kpis.averageFill}%`;
    document.getElementById('kpi-active-alerts').textContent = data.kpis.activeAlerts;
    document.getElementById('kpi-distance').textContent = `${data.kpis.totalDistanceKm} km`;
    document.getElementById('kpi-co2').textContent = `${data.kpis.totalCo2Economise} kg`;
    
    updateProductionChart(data.charts.weeklyProduction);
  } catch (err) {
    console.error(err);
  }
}

function setupCharts() {
  // Chart.js defaults
  Chart.defaults.color = () => document.body.classList.contains('dark-theme') ? '#94a3b8' : '#64748b';
  Chart.defaults.font.family = "'Inter', sans-serif";
  Chart.defaults.elements.line.tension = 0.4;
  Chart.defaults.plugins.tooltip.backgroundColor = 'rgba(15, 23, 42, 0.9)';
  Chart.defaults.plugins.tooltip.padding = 10;
  Chart.defaults.plugins.tooltip.cornerRadius = 8;
  
  const ctxProd = document.getElementById('productionChart').getContext('2d');
  productionChart = new Chart(ctxProd, {
    type: 'line',
    data: { labels: [], datasets: [] },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        y: { beginAtZero: true, max: 100, grid: { color: () => document.body.classList.contains('dark-theme') ? '#334155' : '#e2e8f0' } },
        x: { grid: { display: false } }
      }
    }
  });
}

function updateProductionChart(data) {
  if (!data || data.length === 0) return;
  
  const labels = data.map(d => new Date(d.date).toLocaleDateString('fr-FR', { weekday: 'short' }));
  const values = data.map(d => d.avg_level);
  
  const gradient = productionChart.ctx.createLinearGradient(0, 0, 0, 300);
  gradient.addColorStop(0, 'rgba(16, 185, 129, 0.5)');
  gradient.addColorStop(1, 'rgba(16, 185, 129, 0.0)');
  
  productionChart.data = {
    labels,
    datasets: [{
      label: 'Remplissage Moyen (%)',
      data: values,
      borderColor: '#10b981',
      backgroundColor: gradient,
      borderWidth: 3,
      fill: true,
      pointBackgroundColor: '#10b981',
      pointBorderColor: '#fff',
      pointBorderWidth: 2,
      pointRadius: 4,
      pointHoverRadius: 6
    }]
  };
  productionChart.update();
}

export function drawPredictionChart(predictions) {
  const ctxPred = document.getElementById('predictionChart').getContext('2d');
  
  if (predictionChart) predictionChart.destroy();
  
  const labels = ['Actuel', '+6h', '+12h', '+24h'];
  const values = [predictions.current, predictions.predicted_6h, predictions.predicted_12h, predictions.predicted_24h];
  
  const gradient = ctxPred.createLinearGradient(0, 0, 0, 300);
  gradient.addColorStop(0, 'rgba(245, 158, 11, 0.5)');
  gradient.addColorStop(1, 'rgba(245, 158, 11, 0.0)');
  
  predictionChart = new Chart(ctxPred, {
    type: 'line',
    data: {
      labels,
      datasets: [{
        label: 'Niveau Prédit (%)',
        data: values,
        borderColor: '#f59e0b',
        backgroundColor: gradient,
        borderWidth: 3,
        fill: true,
        borderDash: [5, 5], // Dashed line for predictions
        pointBackgroundColor: '#f59e0b',
        pointRadius: 5
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        annotation: {
          annotations: {
            line1: { type: 'line', yMin: 80, yMax: 80, borderColor: '#ef4444', borderWidth: 2, borderDash: [2, 2], label: { display: true, content: 'Seuil Critique', position: 'end' } }
          }
        }
      },
      scales: {
        y: { beginAtZero: true, max: 100, grid: { color: () => document.body.classList.contains('dark-theme') ? '#334155' : '#e2e8f0' } },
        x: { grid: { display: false } }
      }
    }
  });
}
