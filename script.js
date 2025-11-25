const API_BASE = 'https://api.modulo.apexstudiocodes.co.uk/api';
const TOKEN_KEY = 'moduloToken';

const loginForm = document.getElementById('loginForm');
const registerForm = document.getElementById('registerForm');
const tabs = document.querySelectorAll('.tab');
const authStatus = document.getElementById('statusBar');

const workspace = document.getElementById('workspace');
const moduleGrid = document.getElementById('moduleGrid');
const workspaceStatus = document.getElementById('workspaceStatus');
const moduleTypeSelect = document.getElementById('moduleType');
const addModuleBtn = document.getElementById('addModuleBtn');
const logoutBtn = document.getElementById('logoutBtn');
let localModules = [];

if (loginForm && registerForm && tabs.length) {
  initAuthUI();
}

if (workspace && moduleGrid) {
  initDashboard();
}

if (logoutBtn) {
  logoutBtn.addEventListener('click', handleLogout);
}

function initAuthUI() {
  tabs.forEach((tab) => {
    tab.addEventListener('click', () => {
      const target = tab.dataset.target;
      tabs.forEach((t) => t.classList.toggle('active', t === tab));
      tabs.forEach((t) => t.setAttribute('aria-selected', t === tab ? 'true' : 'false'));
      [loginForm, registerForm].forEach((form) => {
        if (form) form.classList.toggle('visible', form.id === `${target}Form`);
      });
      clearStatus();
    });
  });

  loginForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    clearStatus();
    const data = getFormData(loginForm);
    if (!data.email || !data.password) {
      return setStatus('Please enter your email and password.', 'error');
    }
    try {
      const body = await submitRequest('/auth/login', data, 'Logged in.');
      if (body?.token) {
        localStorage.setItem(TOKEN_KEY, body.token);
      }
      if (body?.redirectTo) {
        window.location.href = body.redirectTo;
      } else if (body?.token) {
        window.location.href = 'dashboard.html';
      }
    } catch (error) {
      // Status already handled
    }
  });

  registerForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    clearStatus();
    const data = getFormData(registerForm);
    if (!data.firstName || !data.lastName || !data.email || !data.password) {
      return setStatus('All fields are required to create an account.', 'error');
    }
    try {
      const body = await submitRequest('/auth/register', data, 'Account created.');
      if (body?.token) {
        localStorage.setItem(TOKEN_KEY, body.token);
        window.location.href = 'dashboard.html';
      }
    } catch (error) {
      // Status already handled
    }
  });
}

async function initDashboard() {
  const token = getToken();
  if (!token) {
    setStatus('Sign in to load your modules.', 'error', workspaceStatus);
    localModules = sampleModules();
    renderModules(localModules);
    return;
  }

  await loadModules();

  if (addModuleBtn) {
    addModuleBtn.addEventListener('click', async () => {
      const type = moduleTypeSelect?.value || 'note';
      try {
        await submitRequest(
          '/modules',
          { type },
          'Module added.',
          workspaceStatus,
          { auth: true, pendingMessage: 'Creating module...' }
        );
        await loadModules();
      } catch (error) {
        // Status already handled
      }
    });
  }
}

async function loadModules() {
  try {
    const modules = await fetchModules();
    renderModules(modules.length ? modules : sampleModules());
    localModules = modules.length ? modules : sampleModules();
    clearStatus(workspaceStatus);
  } catch (error) {
    localModules = sampleModules();
    renderModules(localModules);
    setStatus('Showing sample modules. Connect to the API to load yours.', 'error', workspaceStatus);
  }
}

async function fetchModules() {
  const body = await submitRequest('/modules', null, null, workspaceStatus, {
    auth: true,
    method: 'GET',
    quiet: true,
  });
  return body?.modules || [];
}

function renderModules(modules) {
  if (!moduleGrid) return;
  moduleGrid.innerHTML = '';
  modules.forEach((mod, index) => moduleGrid.appendChild(renderModuleCard(mod, index)));
}

function renderModuleCard(module, index) {
  const card = document.createElement('div');
  card.className = `module-card size-${module.size || 'medium'}`;
  card.style.background = module.color || '#ffffff';
  card.draggable = true;
  card.dataset.index = index;

  card.addEventListener('dragstart', (e) => handleDragStart(e, card));
  card.addEventListener('dragover', (e) => handleDragOver(e, card));
  card.addEventListener('drop', (e) => handleDrop(e, card));
  card.addEventListener('dragend', () => card.classList.remove('dragging'));

  const title = module.title || prettifyType(module.type);
  const chipLabel = module.type ? prettifyType(module.type) : 'Module';

  const header = document.createElement('header');
  const left = document.createElement('div');
  left.style.display = 'flex';
  left.style.gap = '8px';
  left.style.alignItems = 'center';
  const titleEl = document.createElement('strong');
  titleEl.textContent = title;
  const chip = document.createElement('span');
  chip.className = 'chip';
  chip.textContent = chipLabel;
  left.appendChild(titleEl);
  left.appendChild(chip);

  const actions = document.createElement('div');
  actions.className = 'module-actions';

  const sizeSelect = document.createElement('select');
  sizeSelect.innerHTML = `
    <option value="small">S</option>
    <option value="medium">M</option>
    <option value="large">L</option>
  `;
  sizeSelect.value = module.size || 'medium';
  sizeSelect.addEventListener('change', () => updateModule(index, { size: sizeSelect.value }));

  const colorInput = document.createElement('input');
  colorInput.type = 'color';
  colorInput.className = 'color-input';
  colorInput.value = normalizeColor(module.color || '#ffffff');
  colorInput.addEventListener('input', () => updateModule(index, { color: colorInput.value }));

  const deleteBtn = document.createElement('button');
  deleteBtn.className = 'icon-btn';
  deleteBtn.type = 'button';
  deleteBtn.title = 'Delete module';
  deleteBtn.textContent = '×';
  deleteBtn.addEventListener('click', () => deleteModule(index));

  actions.appendChild(sizeSelect);
  actions.appendChild(colorInput);
  actions.appendChild(deleteBtn);

  header.appendChild(left);
  header.appendChild(actions);

  const content = document.createElement('div');
  content.className = 'module-content';
  content.appendChild(renderModuleContent(module));

  card.appendChild(header);
  card.appendChild(content);
  return card;
}

function renderModuleContent(module) {
  const type = module.type || 'note';
  const container = document.createElement('div');

  if (type === 'calendar') {
    container.className = 'calendar-grid';
    const days = module.days || ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    days.forEach((day) => {
      const cell = document.createElement('div');
      cell.className = 'calendar-day';
      cell.textContent = day;
      container.appendChild(cell);
    });
    return container;
  }

  if (type === 'task-list') {
    container.className = 'note-list';
    const tasks = module.items || ['Sync data sources', 'Review alerts', 'Plan next sprint'];
    tasks.forEach((task) => {
      const item = document.createElement('div');
      item.className = 'note';
      item.textContent = task;
      container.appendChild(item);
    });
    return container;
  }

  container.className = 'note-list';
  const notes = module.items || ['Capture ideas...', 'Drop quick notes for your team.'];
  notes.forEach((note) => {
    const item = document.createElement('div');
    item.className = 'note';
    item.textContent = note;
    container.appendChild(item);
  });
  return container;
}

function sampleModules() {
  return [
    { type: 'calendar', title: 'Team calendar', size: 'large' },
    { type: 'note', title: 'Notes', items: ['Welcome to your workspace', 'Connect the API to load your data'], size: 'small' },
    { type: 'task-list', title: 'Tasks', size: 'medium' },
  ];
}

function prettifyType(type = '') {
  return type
    .split('-')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
    .trim() || 'Module';
}

function handleDragStart(event, card) {
  event.dataTransfer.effectAllowed = 'move';
  event.dataTransfer.setData('text/plain', card.dataset.index);
  card.classList.add('dragging');
}

function handleDragOver(event, card) {
  event.preventDefault();
  const draggingIndex = Number(event.dataTransfer.getData('text/plain'));
  const targetIndex = Number(card.dataset.index);
  if (Number.isNaN(draggingIndex) || Number.isNaN(targetIndex) || draggingIndex === targetIndex) return;
  const dragged = localModules[draggingIndex];
  localModules.splice(draggingIndex, 1);
  localModules.splice(targetIndex, 0, dragged);
  renderModules(localModules);
  persistModules();
}

function handleDrop(event, card) {
  event.preventDefault();
  card.classList.remove('dragging');
}

function updateModule(index, changes) {
  localModules[index] = { ...localModules[index], ...changes };
  renderModules(localModules);
  persistModules();
}

function deleteModule(index) {
  localModules.splice(index, 1);
  renderModules(localModules);
  persistModules();
}

function normalizeColor(color) {
  if (!color) return '#ffffff';
  if (color.startsWith('#')) return color;
  // Fallback if API returns rgb/other; browsers normalize to hex on input set
  const ctx = document.createElement('canvas').getContext('2d');
  ctx.fillStyle = color;
  return ctx.fillStyle;
}

async function persistModules() {
  try {
    await submitRequest('/modules', { modules: localModules }, null, workspaceStatus, {
      auth: true,
      method: 'PUT',
      quiet: true,
    });
  } catch {
    // Ignore persist failures for UX smoothness
  }
}

function getFormData(form) {
  const formData = new FormData(form);
  return Object.fromEntries(formData.entries());
}

function setStatus(message, variant = 'neutral', node = authStatus) {
  if (!node) return;
  node.textContent = message || '';
  node.classList.remove('error', 'success');
  if (variant === 'error') node.classList.add('error');
  if (variant === 'success') node.classList.add('success');
}

function clearStatus(node = authStatus) {
  if (!node) return;
  node.textContent = '';
  node.classList.remove('error', 'success');
}

async function submitRequest(path, payload, successMessage, statusNode = authStatus, options = {}) {
  const { method = 'POST', auth = false, quiet = false, pendingMessage = 'Talking to the Modulo API...' } = options;
  if (!quiet) setStatus(pendingMessage, 'neutral', statusNode);
  try {
    const headers = {
      ...(payload ? { 'Content-Type': 'application/json' } : {}),
      ...(auth ? authHeader() : {}),
      ...(options.headers || {}),
    };

    const response = await fetch(`${API_BASE}${path}`, {
      method,
      headers,
      body: payload ? JSON.stringify(payload) : undefined,
    });

    if (!response.ok) {
      const errorBody = await safeJson(response);
      const detail = errorBody?.message || response.statusText || 'Unable to complete request.';
      throw new Error(detail);
    }

    const body = await safeJson(response);
    if (successMessage && !quiet) setStatus(body?.message || successMessage, 'success', statusNode);
    return body;
  } catch (error) {
    if (!quiet) setStatus(error.message || 'Network error. Please try again.', 'error', statusNode);
    throw error;
  }
}

async function safeJson(response) {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

function authHeader() {
  const token = getToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

function getToken() {
  return localStorage.getItem(TOKEN_KEY);
}

function handleLogout() {
  localStorage.removeItem(TOKEN_KEY);
  window.location.href = 'index.html';
}

