const API_URL = '/api/auth';

let accessToken = localStorage.getItem('sd_access_token');
let refreshToken = localStorage.getItem('sd_refresh_token');
let user = null;

export async function checkAuth() {
  if (!accessToken) return null;

  try {
    const res = await fetch(`${API_URL}/me`, {
      headers: { 'Authorization': `Bearer ${accessToken}` }
    });
    
    if (res.ok) {
      user = await res.json();
      return user;
    } else if (res.status === 401 && refreshToken) {
      // Try to refresh
      const refreshed = await doRefreshToken();
      if (refreshed) return checkAuth(); // retry me
    }
    
    // Auth failed
    logout();
    return null;
  } catch (e) {
    console.error('Auth Check Error', e);
    return null;
  }
}

async function doRefreshToken() {
  try {
    const res = await fetch(`${API_URL}/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken })
    });
    
    if (res.ok) {
      const data = await res.json();
      accessToken = data.accessToken;
      refreshToken = data.refreshToken;
      localStorage.setItem('sd_access_token', accessToken);
      localStorage.setItem('sd_refresh_token', refreshToken);
      return true;
    }
  } catch (e) { }
  
  return false;
}

export async function login(email, password) {
  try {
    const res = await fetch(`${API_URL}/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });
    
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Erreur de connexion');
    
    accessToken = data.accessToken;
    refreshToken = data.refreshToken;
    localStorage.setItem('sd_access_token', accessToken);
    localStorage.setItem('sd_refresh_token', refreshToken);
    
    window.location.reload();
  } catch (err) {
    document.getElementById('auth-error').textContent = err.message;
  }
}

export function logout() {
  localStorage.removeItem('sd_access_token');
  localStorage.removeItem('sd_refresh_token');
  window.location.reload();
}

export function getUser() {
  return user;
}

export function getAccessToken() {
  return accessToken;
}

// Setup Login Form Listener
document.addEventListener('DOMContentLoaded', () => {
  const form = document.getElementById('login-form');
  if (form) {
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const email = document.getElementById('email').value;
      const pass = document.getElementById('password').value;
      login(email, pass);
    });
  }
});
