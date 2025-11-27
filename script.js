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
const layoutModeSelect = document.getElementById('layoutMode');
const addModuleBtn = document.getElementById('addModuleBtn');
const logoutBtn = document.getElementById('logoutBtn');
let localModules = [];
const sizeDefaults = { small: 280, medium: 360, large: 520 };
let layoutMode = localStorage.getItem('moduloLayoutMode') || 'snap';

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
    localModules = sampleModules().map(normalizeModule);
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

  if (layoutModeSelect) {
    layoutModeSelect.value = layoutMode;
    layoutModeSelect.addEventListener('change', () => {
      layoutMode = layoutModeSelect.value;
      localStorage.setItem('moduloLayoutMode', layoutMode);
      renderModules(localModules);
    });
  }
}

async function loadModules() {
  try {
    const modules = (await fetchModules()).map(normalizeModule);
    const fallback = sampleModules().map(normalizeModule);
    localModules = modules.length ? modules : fallback;
    renderModules(localModules);
    clearStatus(workspaceStatus);
  } catch (error) {
    localModules = sampleModules().map(normalizeModule);
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
  moduleGrid.classList.toggle('free-layout', layoutMode === 'free');
  moduleGrid.classList.toggle('snap-layout', layoutMode !== 'free');
  if (layoutMode === 'free') {
    assignFreePositions(modules);
  }
  moduleGrid.innerHTML = '';
  modules.forEach((mod, index) => moduleGrid.appendChild(renderModuleCard(mod, index)));
}

function renderModuleCard(module, index) {
  const isFree = layoutMode === 'free';
  const card = document.createElement('div');
  card.className = `module-card size-${module.size || 'medium'}`;
  card.style.background = module.color || '#ffffff';
  card.style.width = `${module.width || sizeDefaults[module.size || 'medium'] || 360}px`;
  card.style.height = `${module.height || 260}px`;
  card.draggable = false;
  card.style.position = isFree ? 'absolute' : 'relative';
  if (isFree) {
    const { x = 12, y = 12 } = module.position || {};
    card.style.left = `${x}px`;
    card.style.top = `${y}px`;
  } else {
    card.style.left = '';
    card.style.top = '';
  }
  card.dataset.index = index;

  if (!isFree) {
    card.addEventListener('dragover', (e) => handleDragOver(e, card));
    card.addEventListener('drop', (e) => handleDrop(e, card));
    card.addEventListener('dragend', () => card.classList.remove('dragging'));
  }

  const title = module.title || prettifyType(module.type);
  const chipLabel = module.type ? prettifyType(module.type) : 'Module';

  const header = document.createElement('header');
  header.className = 'module-header';
  header.draggable = !isFree;
  if (isFree) {
    header.addEventListener('pointerdown', (e) => startFreeDrag(e, card, index));
  } else {
    header.addEventListener('dragstart', (e) => handleDragStart(e, card));
    header.addEventListener('dragend', () => card.classList.remove('dragging'));
  }
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
  ['pointerdown', 'mousedown', 'click', 'dragstart'].forEach((evt) =>
    sizeSelect.addEventListener(evt, (e) => e.stopPropagation())
  );
  sizeSelect.addEventListener('change', () =>
    updateModule(index, { size: sizeSelect.value, width: sizeDefaults[sizeSelect.value] })
  );

  const colorInput = document.createElement('input');
  colorInput.type = 'color';
  colorInput.className = 'color-input';
  colorInput.value = normalizeColor(module.color || '#ffffff');
  ['pointerdown', 'mousedown', 'click', 'dragstart'].forEach((evt) =>
    colorInput.addEventListener(evt, (e) => e.stopPropagation())
  );
  colorInput.addEventListener('input', () => {
    updateModule(index, { color: colorInput.value }, { render: false, persist: false });
    const hostCard = colorInput.closest('.module-card');
    if (hostCard) hostCard.style.background = colorInput.value;
  });
  colorInput.addEventListener('change', () => persistModules());

  const deleteBtn = document.createElement('button');
  deleteBtn.className = 'icon-btn';
  deleteBtn.type = 'button';
  deleteBtn.title = 'Delete module';
  deleteBtn.textContent = 'X';
  ['pointerdown', 'mousedown', 'click', 'dragstart'].forEach((evt) =>
    deleteBtn.addEventListener(evt, (e) => e.stopPropagation())
  );
  deleteBtn.addEventListener('click', () => deleteModule(index));

  actions.appendChild(sizeSelect);
  actions.appendChild(colorInput);
  actions.appendChild(deleteBtn);

  header.appendChild(left);
  header.appendChild(actions);

  const content = document.createElement('div');
  content.className = 'module-content';
  content.appendChild(renderModuleContent(module, index));

  card.appendChild(header);
  card.appendChild(buildResizeHandle(card, index));
  card.appendChild(content);
  return card;
}

function renderModuleContent(module, index) {
  const type = module.type || 'note';
  if (type === 'calendar') {
    return renderCalendar(module, index);
  }

  if (type === 'task-list') {
    return renderTasks(module, index);
  }

  return renderNotes(module, index);
}

function renderNotes(module, index) {
  const container = document.createElement('div');
  container.className = 'editable-list';

  const list = document.createElement('div');
  list.className = 'editable-list-items';
  const notes = module.items?.length ? module.items : [{ id: createId(), text: 'Capture ideas...' }];

  notes.forEach((note, noteIndex) => {
    const row = document.createElement('div');
    row.className = 'editable-row';

    const textarea = document.createElement('textarea');
    textarea.value = note.text || '';
    textarea.placeholder = 'Note text';
    textarea.rows = 2;
    textarea.addEventListener('input', (e) => {
      const next = cloneItems(index);
      next[noteIndex] = { ...next[noteIndex], text: e.target.value };
      updateModule(index, { items: next }, { render: false, persist: false });
    });
    textarea.addEventListener('blur', () => persistModules());

    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'mini-btn';
    deleteBtn.type = 'button';
    deleteBtn.textContent = 'Delete';
    deleteBtn.addEventListener('click', () => {
      const next = cloneItems(index);
      next.splice(noteIndex, 1);
      updateModule(index, { items: next.length ? next : [{ id: createId(), text: '' }] });
    });

    row.appendChild(textarea);
    row.appendChild(deleteBtn);
    list.appendChild(row);
  });

  const addForm = document.createElement('form');
  addForm.className = 'add-row';
  const input = document.createElement('input');
  input.type = 'text';
  input.placeholder = 'Add note';
  const addBtn = document.createElement('button');
  addBtn.type = 'submit';
  addBtn.textContent = 'Add';
  addForm.appendChild(input);
  addForm.appendChild(addBtn);
  addForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const value = input.value.trim();
    if (!value) return;
    const next = cloneItems(index);
    next.push({ id: createId(), text: value });
    updateModule(index, { items: next });
    input.value = '';
  });

  container.appendChild(list);
  container.appendChild(addForm);
  return container;
}

function renderTasks(module, index) {
  const container = document.createElement('div');
  container.className = 'editable-list';

  const list = document.createElement('div');
  list.className = 'editable-list-items';
  const tasks = module.items || [];

  tasks.forEach((task, taskIndex) => {
    const row = document.createElement('div');
    row.className = 'editable-row';
    if (task.done) row.classList.add('done');

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = Boolean(task.done);
    checkbox.addEventListener('change', () => {
      const next = cloneItems(index);
      next[taskIndex] = { ...next[taskIndex], done: checkbox.checked };
      updateModule(index, { items: next }, { render: false });
      row.classList.toggle('done', checkbox.checked);
    });

    const input = document.createElement('input');
    input.type = 'text';
    input.value = task.text || '';
    input.placeholder = 'Task description';
    input.addEventListener('input', (e) => {
      const next = cloneItems(index);
      next[taskIndex] = { ...next[taskIndex], text: e.target.value };
      updateModule(index, { items: next }, { render: false, persist: false });
    });
    input.addEventListener('blur', () => persistModules());

    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'mini-btn';
    deleteBtn.type = 'button';
    deleteBtn.textContent = 'Delete';
    deleteBtn.addEventListener('click', () => {
      const next = cloneItems(index);
      next.splice(taskIndex, 1);
      updateModule(index, { items: next });
    });

    row.appendChild(checkbox);
    row.appendChild(input);
    row.appendChild(deleteBtn);
    list.appendChild(row);
  });

  const addForm = document.createElement('form');
  addForm.className = 'add-row';
  const input = document.createElement('input');
  input.type = 'text';
  input.placeholder = 'Add task';
  const addBtn = document.createElement('button');
  addBtn.type = 'submit';
  addBtn.textContent = 'Add';
  addForm.appendChild(input);
  addForm.appendChild(addBtn);
  addForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const value = input.value.trim();
    if (!value) return;
    const next = cloneItems(index);
    next.push({ id: createId(), text: value, done: false });
    updateModule(index, { items: next });
    input.value = '';
  });

  container.appendChild(list);
  container.appendChild(addForm);
  return container;
}

function renderCalendar(module, index) {
  const container = document.createElement('div');
  container.className = 'calendar-shell';
  const events = module.items || [];
  const view = module.view || 'monthly';
  const baseDate = module.viewDate || todaysDate();

  const controls = document.createElement('div');
  controls.className = 'calendar-controls';

  const viewSelect = document.createElement('select');
  viewSelect.innerHTML = `
    <option value="daily">Daily</option>
    <option value="weekly">Weekly</option>
    <option value="monthly">Monthly</option>
  `;
  viewSelect.value = view;
  ['pointerdown', 'mousedown', 'click', 'dragstart'].forEach((evt) =>
    viewSelect.addEventListener(evt, (e) => e.stopPropagation())
  );
  viewSelect.addEventListener('change', () => updateModule(index, { view: viewSelect.value }));

  const datePicker = document.createElement('input');
  datePicker.type = 'date';
  datePicker.value = baseDate;
  ['pointerdown', 'mousedown', 'click', 'dragstart'].forEach((evt) =>
    datePicker.addEventListener(evt, (e) => e.stopPropagation())
  );
  datePicker.addEventListener('change', () => updateModule(index, { viewDate: datePicker.value || todaysDate() }));

  controls.appendChild(viewSelect);
  controls.appendChild(datePicker);

  const body = document.createElement('div');
  body.className = 'calendar-view';

  if (view === 'daily') {
    body.appendChild(renderDailyCalendar(events, baseDate));
  } else if (view === 'weekly') {
    body.appendChild(renderWeeklyCalendar(events, baseDate));
  } else {
    body.appendChild(renderMonthlyCalendar(events, baseDate));
  }

  const editor = document.createElement('div');
  editor.className = 'calendar-editor';
  events.forEach((event, eventIndex) => {
    const row = document.createElement('div');
    row.className = 'editable-row calendar-editor-row';

    const dateInput = document.createElement('input');
    dateInput.type = 'date';
    dateInput.value = event.date || todaysDate();
    dateInput.addEventListener('change', (e) => {
      const next = cloneItems(index);
      next[eventIndex] = { ...next[eventIndex], date: e.target.value };
      updateModule(index, { items: next }, { render: false });
      persistModules();
    });

    const textInput = document.createElement('input');
    textInput.type = 'text';
    textInput.placeholder = 'Event';
    textInput.value = event.text || '';
    textInput.addEventListener('input', (e) => {
      const next = cloneItems(index);
      next[eventIndex] = { ...next[eventIndex], text: e.target.value };
      updateModule(index, { items: next }, { render: false, persist: false });
    });
    textInput.addEventListener('blur', () => persistModules());

    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'mini-btn';
    deleteBtn.type = 'button';
    deleteBtn.textContent = 'Delete';
    deleteBtn.addEventListener('click', () => {
      const next = cloneItems(index);
      next.splice(eventIndex, 1);
      updateModule(index, { items: next });
    });

    row.appendChild(dateInput);
    row.appendChild(textInput);
    row.appendChild(deleteBtn);
    editor.appendChild(row);
  });

  const addForm = document.createElement('form');
  addForm.className = 'add-row calendar-add';
  const addDateInput = document.createElement('input');
  addDateInput.type = 'date';
  addDateInput.value = baseDate;
  const addTextInput = document.createElement('input');
  addTextInput.type = 'text';
  addTextInput.placeholder = 'Add calendar item';
  const addBtn = document.createElement('button');
  addBtn.type = 'submit';
  addBtn.textContent = 'Add';
  addForm.appendChild(addDateInput);
  addForm.appendChild(addTextInput);
  addForm.appendChild(addBtn);
  addForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const text = addTextInput.value.trim();
    if (!text) return;
    const next = cloneItems(index);
    next.push({ id: createId(), date: addDateInput.value || todaysDate(), text });
    updateModule(index, { items: next });
    addTextInput.value = '';
  });

  container.appendChild(controls);
  container.appendChild(body);
  container.appendChild(editor);
  container.appendChild(addForm);
  return container;
}

function renderDailyCalendar(events, baseDate) {
  const wrapper = document.createElement('div');
  wrapper.className = 'calendar-daily';
  const header = document.createElement('div');
  header.className = 'calendar-view-header';
  header.textContent = formatDateLabel(baseDate, { long: true });
  wrapper.appendChild(header);

  const dayEvents = events.filter((ev) => isSameDay(ev.date, baseDate));
  if (!dayEvents.length) {
    const empty = document.createElement('p');
    empty.className = 'calendar-empty';
    empty.textContent = 'No events for this day.';
    wrapper.appendChild(empty);
    return wrapper;
  }

  const list = document.createElement('div');
  list.className = 'calendar-event-list';
  dayEvents.forEach((ev) => {
    const chip = document.createElement('div');
    chip.className = 'calendar-chip';
    chip.textContent = ev.text || 'Untitled';
    list.appendChild(chip);
  });
  wrapper.appendChild(list);
  return wrapper;
}

function renderWeeklyCalendar(events, baseDate) {
  const wrapper = document.createElement('div');
  wrapper.className = 'calendar-week';
  const weekDates = getWeekDates(baseDate);

  weekDates.forEach((dateStr) => {
    const col = document.createElement('div');
    col.className = 'calendar-week-day';
    const title = document.createElement('div');
    title.className = 'calendar-week-title';
    title.textContent = formatDateLabel(dateStr);
    col.appendChild(title);

    const dayEvents = events.filter((ev) => isSameDay(ev.date, dateStr));
    if (!dayEvents.length) {
      const empty = document.createElement('p');
      empty.className = 'calendar-empty';
      empty.textContent = '—';
      col.appendChild(empty);
    } else {
      dayEvents.forEach((ev) => {
        const chip = document.createElement('div');
        chip.className = 'calendar-chip';
        chip.textContent = ev.text || 'Untitled';
        col.appendChild(chip);
      });
    }
    wrapper.appendChild(col);
  });
  return wrapper;
}

function renderMonthlyCalendar(events, baseDate) {
  const wrapper = document.createElement('div');
  wrapper.className = 'calendar-month';
  const cells = getMonthCells(baseDate);
  cells.forEach((cell) => {
    const day = document.createElement('div');
    day.className = 'calendar-month-cell';
    if (!cell.inMonth) day.classList.add('muted');
    if (cell.isToday) day.classList.add('today');
    if (cell.date === baseDate) day.classList.add('active');

    const label = document.createElement('div');
    label.className = 'calendar-month-label';
    label.textContent = cell.label;
    day.appendChild(label);

    const dayEvents = events.filter((ev) => isSameDay(ev.date, cell.date));
    dayEvents.slice(0, 3).forEach((ev) => {
      const chip = document.createElement('div');
      chip.className = 'calendar-chip';
      chip.textContent = ev.text || 'Untitled';
      day.appendChild(chip);
    });
    if (dayEvents.length > 3) {
      const more = document.createElement('div');
      more.className = 'calendar-more';
      more.textContent = `+${dayEvents.length - 3} more`;
      day.appendChild(more);
    }

    wrapper.appendChild(day);
  });
  return wrapper;
}

function buildResizeHandle(card, index) {
  const handle = document.createElement('div');
  handle.className = 'resize-handle';
  let startX = 0;
  let startY = 0;
  let startW = 0;
  let startH = 0;

  const onPointerMove = (event) => {
    const deltaX = event.clientX - startX;
    const deltaY = event.clientY - startY;
    const newWidth = Math.max(240, startW + deltaX);
    const newHeight = Math.max(160, startH + deltaY);
    card.style.width = `${newWidth}px`;
    card.style.height = `${newHeight}px`;
  };

  const onPointerUp = (event) => {
    handle.releasePointerCapture(event.pointerId);
    window.removeEventListener('pointermove', onPointerMove);
    window.removeEventListener('pointerup', onPointerUp);
    const width = Math.round(parseFloat(card.style.width));
    const height = Math.round(parseFloat(card.style.height));
    updateModule(index, { width, height });
  };

  handle.addEventListener('pointerdown', (event) => {
    event.preventDefault();
    event.stopPropagation();
    const rect = card.getBoundingClientRect();
    startX = event.clientX;
    startY = event.clientY;
    startW = rect.width;
    startH = rect.height;
    handle.setPointerCapture(event.pointerId);
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
  });

  return handle;
}

function normalizeModule(module = {}) {
  const normalized = { ...module };
  normalized.type = module.type || 'note';
  normalized.size = module.size || 'medium';
  normalized.view = module.view || 'monthly';
  normalized.viewDate = module.viewDate || todaysDate();
  normalized.items = normalizeItems(module.items, normalized.type);
  normalized.width = module.width ? Number(module.width) : sizeDefaults[normalized.size] || 360;
  normalized.height = module.height ? Number(module.height) : 260;
  normalized.position =
    module.position && typeof module.position.x === 'number' && typeof module.position.y === 'number'
      ? { x: Number(module.position.x), y: Number(module.position.y) }
      : null;
  return normalized;
}

function normalizeItems(items, type = 'note') {
  const list = Array.isArray(items) ? items : [];
  if (type === 'calendar') {
    return list.map((item) => ({
      id: item?.id || createId(),
      date: item?.date || todaysDate(),
      text: item?.text || (typeof item === 'string' ? item : ''),
    }));
  }
  if (type === 'task-list') {
    return list.map((item) => ({
      id: item?.id || createId(),
      text: item?.text ?? (typeof item === 'string' ? item : ''),
      done: Boolean(item?.done),
    }));
  }
  return list.map((item) => ({
    id: item?.id || createId(),
    text: item?.text ?? (typeof item === 'string' ? item : ''),
  }));
}

function cloneItems(index) {
  const items = localModules[index]?.items || [];
  return items.map((item) => ({ ...item }));
}

function assignFreePositions(modules) {
  const gap = 14;
  const containerWidth = moduleGrid?.clientWidth || 1000;
  const columnWidth = 400;
  const columns = Math.max(1, Math.floor(containerWidth / columnWidth));
  const colHeights = new Array(columns).fill(gap);

  modules.forEach((mod, idx) => {
    if (mod.position) return;
    const targetCol = colHeights.indexOf(Math.min(...colHeights));
    const x = gap + targetCol * columnWidth;
    const y = colHeights[targetCol];
    mod.position = { x, y };
    colHeights[targetCol] += (mod.height || 260) + gap;
  });
}

function createId() {
  return Math.random().toString(36).slice(2, 9);
}

function todaysDate() {
  return new Date().toISOString().slice(0, 10);
}

function shiftDate(daysFromToday = 0) {
  const date = new Date();
  date.setDate(date.getDate() + daysFromToday);
  return date.toISOString().slice(0, 10);
}

function toDate(dateLike) {
  const d = new Date(dateLike || todaysDate());
  return Number.isNaN(d.getTime()) ? new Date() : d;
}

function isSameDay(a, b) {
  const da = toDate(a);
  const db = toDate(b);
  return da.getFullYear() === db.getFullYear() && da.getMonth() === db.getMonth() && da.getDate() === db.getDate();
}

function formatDateLabel(dateStr, options = {}) {
  const d = toDate(dateStr);
  return d.toLocaleDateString(undefined, options.long ? { weekday: 'long', month: 'long', day: 'numeric' } : { weekday: 'short', day: 'numeric' });
}

function getWeekDates(anchor) {
  const base = toDate(anchor);
  const day = base.getDay();
  const diff = day === 0 ? -6 : 1 - day; // Monday start
  const monday = new Date(base);
  monday.setDate(base.getDate() + diff);
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    return d.toISOString().slice(0, 10);
  });
}

function getMonthCells(anchor) {
  const base = toDate(anchor);
  const year = base.getFullYear();
  const month = base.getMonth();
  const first = new Date(year, month, 1);
  const startDay = (first.getDay() + 6) % 7; // Monday start
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const totalCells = 42;
  const cells = [];
  for (let i = 0; i < totalCells; i++) {
    const dayNum = i - startDay + 1;
    const cellDate = new Date(year, month, dayNum);
    const inMonth = dayNum >= 1 && dayNum <= daysInMonth;
    const iso = cellDate.toISOString().slice(0, 10);
    cells.push({
      label: cellDate.getDate(),
      date: iso,
      inMonth,
      isToday: isSameDay(iso, todaysDate()),
    });
  }
  return cells;
}

function sampleModules() {
  return [
    {
      type: 'calendar',
      title: 'Team calendar',
      size: 'large',
      view: 'monthly',
      viewDate: todaysDate(),
      items: [
        { id: createId(), date: todaysDate(), text: 'Sprint planning' },
        { id: createId(), date: shiftDate(2), text: 'Data sync' },
      ],
    },
    {
      type: 'note',
      title: 'Notes',
      items: [
        { id: createId(), text: 'Welcome to your workspace' },
        { id: createId(), text: 'Connect the API to load your data' },
      ],
      size: 'small',
    },
    {
      type: 'task-list',
      title: 'Tasks',
      items: [
        { id: createId(), text: 'Sync data sources', done: false },
        { id: createId(), text: 'Review alerts', done: false },
        { id: createId(), text: 'Plan next sprint', done: true },
      ],
      size: 'medium',
    },
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

function startFreeDrag(event, card, index) {
  if (layoutMode !== 'free') return;
  event.preventDefault();
  const startX = event.clientX;
  const startY = event.clientY;
  const currentLeft = parseFloat(card.style.left) || 0;
  const currentTop = parseFloat(card.style.top) || 0;

  const onMove = (e) => {
    const deltaX = e.clientX - startX;
    const deltaY = e.clientY - startY;
    const newX = Math.max(0, currentLeft + deltaX);
    const newY = Math.max(0, currentTop + deltaY);
    card.style.left = `${newX}px`;
    card.style.top = `${newY}px`;
  };

  const onUp = () => {
    window.removeEventListener('pointermove', onMove);
    window.removeEventListener('pointerup', onUp);
    const finalX = Math.round(parseFloat(card.style.left) || 0);
    const finalY = Math.round(parseFloat(card.style.top) || 0);
    updateModule(index, { position: { x: finalX, y: finalY } }, { render: false });
    persistModules();
  };

  window.addEventListener('pointermove', onMove);
  window.addEventListener('pointerup', onUp);
}

function updateModule(index, changes, options = {}) {
  const updated = { ...localModules[index], ...changes };
  localModules[index] = normalizeModule(updated);
  if (options.render !== false) {
    renderModules(localModules);
  }
  if (options.persist !== false) {
    persistModules();
  }
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


