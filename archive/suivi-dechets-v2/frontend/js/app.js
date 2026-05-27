import { checkAuth, logout, getUser } from './auth.js';
import { connectWebSocket } from './websocket.js';
import { initGoogleMaps } from './google-maps.js';
import { initDashboard } from './dashboard.js';
import { initTournees } from './tournees.js';
import { initAlerts } from './alerts.js';

// Global App State
const state = {
  currentView: 'dashboard',
  user: null,
  isSidebarCollapsed: false
};

async function initApp() {
  // 1. Check Authentication
  state.user = await checkAuth();
  
  if (!state.user) {
    document.getElementById('auth-overlay').style.display = 'flex';
    document.getElementById('app').style.display = 'none';
    return; // Wait for login
  }

  // 2. Setup UI for authenticated user
  document.getElementById('auth-overlay').style.display = 'none';
  document.getElementById('app').style.display = 'flex';
  
  document.getElementById('user-name').textContent = state.user.nom;
  document.getElementById('user-role').textContent = state.user.role;
  
  // Apply Role Based Access Control (RBAC) to UI
  applyRBAC();

  // 3. Connect WebSocket
  connectWebSocket();

  // 4. Initialize Modules
  initDashboard();
  initGoogleMaps();
  initTournees();
  initAlerts();

  // 5. Setup Event Listeners
  setupNavigation();
  setupThemeToggle();
  
  document.getElementById('btn-logout').addEventListener('click', logout);
  document.getElementById('toggle-sidebar').addEventListener('click', toggleSidebar);
}

function setupNavigation() {
  const navItems = document.querySelectorAll('.nav-item');
  const views = document.querySelectorAll('.view');
  
  navItems.forEach(item => {
    item.addEventListener('click', (e) => {
      e.preventDefault();
      const tab = item.getAttribute('data-tab');
      
      // Update UI
      navItems.forEach(nav => nav.classList.remove('active'));
      item.classList.add('active');
      
      views.forEach(view => view.classList.remove('active'));
      document.getElementById(`view-${tab}`).classList.add('active');
      
      // Update Title
      const titles = {
        'dashboard': 'Dashboard Analytique',
        'carte': 'Cartographie Globale',
        'tournees': 'Optimisation des Tournées',
        'alertes': 'Centre de Contrôle des Alertes'
      };
      document.getElementById('page-title').textContent = titles[tab];
      
      state.currentView = tab;
      
      // Trigger module-specific refresh if needed
      if (tab === 'carte') {
        window.dispatchEvent(new Event('resize')); // Fix Google Maps sizing issue when un-hidden
      }
    });
  });
}

function applyRBAC() {
  const role = state.user.role;
  
  if (role === 'OBSERVATEUR') {
    document.querySelector('[data-tab="tournees"]').style.display = 'none';
  } else if (role === 'COLLECTEUR') {
    document.querySelector('[data-tab="dashboard"]').style.display = 'none';
    document.querySelector('[data-tab="tournees"]').click(); // Auto switch
  }
}

function setupThemeToggle() {
  const btn = document.getElementById('theme-toggle');
  btn.addEventListener('click', () => {
    document.body.classList.toggle('dark-theme');
    const icon = document.body.classList.contains('dark-theme') ? 'sun' : 'moon';
    btn.innerHTML = `<i data-lucide="${icon}"></i>`;
    lucide.createIcons();
    
    // Dispatch event so Chart.js can update colors
    window.dispatchEvent(new CustomEvent('themeChanged', { 
      detail: { isDark: document.body.classList.contains('dark-theme') } 
    }));
  });
}

function toggleSidebar() {
  const sidebar = document.querySelector('.sidebar');
  state.isSidebarCollapsed = !state.isSidebarCollapsed;
  if (state.isSidebarCollapsed) {
    sidebar.style.width = '80px';
    document.querySelectorAll('.nav-item span, .logo-text, .user-details').forEach(el => el.style.display = 'none');
  } else {
    sidebar.style.width = '260px';
    document.querySelectorAll('.nav-item span, .logo-text, .user-details').forEach(el => el.style.display = 'block');
  }
  // Let map resize
  setTimeout(() => window.dispatchEvent(new Event('resize')), 300);
}

export function showToast(message, type = 'info') {
  const container = document.getElementById('toast-container');
  const toast = document.createElement('div');
  toast.className = 'toast';
  
  let icon = 'info';
  let color = 'var(--primary)';
  if (type === 'error') { icon = 'alert-circle'; color = 'var(--danger)'; }
  else if (type === 'warning') { icon = 'alert-triangle'; color = 'var(--warning)'; }
  else if (type === 'success') { icon = 'check-circle'; color = 'var(--primary)'; }
  
  toast.style.borderLeftColor = color;
  toast.innerHTML = `<i data-lucide="${icon}" style="color:${color}"></i> <span>${message}</span>`;
  
  container.appendChild(toast);
  lucide.createIcons();
  
  setTimeout(() => {
    toast.style.opacity = '0';
    setTimeout(() => toast.remove(), 300);
  }, 4000);
}

// Start Application
document.addEventListener('DOMContentLoaded', initApp);
