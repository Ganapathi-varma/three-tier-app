// Frontend logic for the 3-tier demo.
// All API calls go to "/api/*", which nginx proxies to the backend.
// This keeps the browser talking to a single origin.
'use strict';

const API_BASE = '/api';
const TOKEN_KEY = 'jwt_token';

// --- DOM references ---------------------------------------------------------
const loginPanel = document.getElementById('login-panel');
const appPanel = document.getElementById('app-panel');
const loginForm = document.getElementById('login-form');
const loginError = document.getElementById('login-error');
const currentUser = document.getElementById('current-user');
const logoutBtn = document.getElementById('logout-btn');

const productForm = document.getElementById('product-form');
const productError = document.getElementById('product-error');
const productsBody = document.getElementById('products-body');
const formTitle = document.getElementById('form-title');
const cancelBtn = document.getElementById('cancel-btn');
const productIdField = document.getElementById('product-id');

// --- Token helpers ----------------------------------------------------------
function getToken() { return localStorage.getItem(TOKEN_KEY); }
function setToken(t) { localStorage.setItem(TOKEN_KEY, t); }
function clearToken() { localStorage.removeItem(TOKEN_KEY); }

// Decode the "username" out of the JWT payload (no verification needed here;
// the server verifies on every request). Falls back gracefully.
function usernameFromToken(token) {
  try {
    const payload = JSON.parse(atob(token.split('.')[1]));
    return payload.username || 'user';
  } catch {
    return 'user';
  }
}

// --- API wrapper ------------------------------------------------------------
// Adds the Authorization header and handles auth expiry centrally.
async function api(path, options = {}) {
  const headers = Object.assign({ 'Content-Type': 'application/json' }, options.headers || {});
  const token = getToken();
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(`${API_BASE}${path}`, Object.assign({}, options, { headers }));

  if (res.status === 401) {
    // Token missing/expired — force the user back to login.
    clearToken();
    showLogin();
    throw new Error('Session expired, please log in again');
  }

  if (!res.ok) {
    let message = `Request failed (${res.status})`;
    try {
      const body = await res.json();
      if (body.error) message = body.error;
    } catch { /* ignore non-JSON errors */ }
    throw new Error(message);
  }

  // 204 No Content has no body.
  if (res.status === 204) return null;
  return res.json();
}

// --- View switching ---------------------------------------------------------
function showLogin() {
  loginPanel.classList.remove('hidden');
  appPanel.classList.add('hidden');
}

function showApp() {
  loginPanel.classList.add('hidden');
  appPanel.classList.remove('hidden');
  currentUser.textContent = usernameFromToken(getToken());
  loadProducts();
}

// --- Login / logout ---------------------------------------------------------
loginForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  loginError.textContent = '';
  const username = document.getElementById('username').value.trim();
  const password = document.getElementById('password').value;

  try {
    const data = await api('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    });
    setToken(data.token);
    loginForm.reset();
    showApp();
  } catch (err) {
    loginError.textContent = err.message;
  }
});

logoutBtn.addEventListener('click', () => {
  clearToken();
  showLogin();
});

// --- Product CRUD -----------------------------------------------------------
async function loadProducts() {
  productError.textContent = '';
  try {
    const products = await api('/products');
    renderProducts(products);
  } catch (err) {
    productError.textContent = err.message;
  }
}

function renderProducts(products) {
  productsBody.innerHTML = '';
  for (const p of products) {
    const tr = document.createElement('tr');

    // Build cells safely via textContent to avoid HTML injection.
    const idTd = document.createElement('td'); idTd.textContent = p.id;
    const nameTd = document.createElement('td'); nameTd.textContent = p.name;
    const descTd = document.createElement('td'); descTd.textContent = p.description || '';
    const priceTd = document.createElement('td'); priceTd.textContent = p.price;

    const actionsTd = document.createElement('td');
    const actions = document.createElement('div');
    actions.className = 'row-actions';

    const editBtn = document.createElement('button');
    editBtn.textContent = 'Edit';
    editBtn.className = 'secondary';
    editBtn.addEventListener('click', () => startEdit(p));

    const delBtn = document.createElement('button');
    delBtn.textContent = 'Delete';
    delBtn.className = 'danger';
    delBtn.addEventListener('click', () => deleteProduct(p.id));

    actions.append(editBtn, delBtn);
    actionsTd.append(actions);
    tr.append(idTd, nameTd, descTd, priceTd, actionsTd);
    productsBody.append(tr);
  }
}

function startEdit(p) {
  productIdField.value = p.id;
  document.getElementById('name').value = p.name;
  document.getElementById('description').value = p.description || '';
  document.getElementById('price').value = p.price;
  formTitle.textContent = `Edit product #${p.id}`;
  cancelBtn.classList.remove('hidden');
}

function resetForm() {
  productForm.reset();
  productIdField.value = '';
  formTitle.textContent = 'Add product';
  cancelBtn.classList.add('hidden');
}

cancelBtn.addEventListener('click', resetForm);

productForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  productError.textContent = '';

  const payload = {
    name: document.getElementById('name').value.trim(),
    description: document.getElementById('description').value.trim(),
    price: parseFloat(document.getElementById('price').value),
  };

  const id = productIdField.value;

  try {
    if (id) {
      await api(`/products/${id}`, { method: 'PUT', body: JSON.stringify(payload) });
    } else {
      await api('/products', { method: 'POST', body: JSON.stringify(payload) });
    }
    resetForm();
    loadProducts();
  } catch (err) {
    productError.textContent = err.message;
  }
});

async function deleteProduct(id) {
  if (!confirm(`Delete product #${id}?`)) return;
  productError.textContent = '';
  try {
    await api(`/products/${id}`, { method: 'DELETE' });
    loadProducts();
  } catch (err) {
    productError.textContent = err.message;
  }
}

// --- Boot -------------------------------------------------------------------
// If a token already exists, go straight to the app view.
if (getToken()) {
  showApp();
} else {
  showLogin();
}
