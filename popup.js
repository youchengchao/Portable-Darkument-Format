const BUILT_IN_PROFILES = {
  'default': {
    id: 'default',
    name: 'Default Dark',
    isBuiltIn: true,
    mode: 'enhanced',
    theme: 'oled',
    brightness: 100,
    contrast: 100,
    grayscale: 0,
    rulerHeight: 40,
    bionicReading: false,
    protectDiagrams: true,
    settings: {
      mode: 'enhanced',
      theme: 'oled',
      brightness: 100,
      contrast: 100,
      grayscale: 0,
      rulerHeight: 40,
      bionicReading: false,
      protectDiagrams: true
    }
  },
  'built_in_night': {
    id: 'built_in_night',
    name: 'Deep Night Focus',
    isBuiltIn: true,
    mode: 'enhanced',
    theme: 'slate',
    brightness: 80,
    contrast: 110,
    grayscale: 10,
    rulerHeight: 30,
    bionicReading: false,
    protectDiagrams: true,
    settings: {
      mode: 'enhanced',
      theme: 'slate',
      brightness: 80,
      contrast: 110,
      grayscale: 10,
      rulerHeight: 30,
      bionicReading: false,
      protectDiagrams: true
    }
  },
  'built_in_ereader': {
    id: 'built_in_ereader',
    name: 'Warm E-Reader',
    isBuiltIn: true,
    mode: 'enhanced',
    theme: 'sepia',
    brightness: 90,
    contrast: 95,
    grayscale: 0,
    rulerHeight: 50,
    bionicReading: true,
    protectDiagrams: true,
    settings: {
      mode: 'enhanced',
      theme: 'sepia',
      brightness: 90,
      contrast: 95,
      grayscale: 0,
      rulerHeight: 50,
      bionicReading: true,
      protectDiagrams: true
    }
  }
};

const DEFAULTS = {
  active: true,
  mode: 'enhanced',
  theme: 'oled',
  brightness: 100,
  contrast: 100,
  grayscale: 0,
  protectDiagrams: true,
  bionicReading: false,
  readingRuler: false,
  rulerHeight: 40,
  autoNightSchedule: {
    enabled: false,
    mode: 'system',
    startTime: '20:00',
    endTime: '07:00'
  },
  supporter: {
    isSupporter: false,
    goldAccent: false,
    promptDismissedCount: 0,
    lastPromptDate: ''
  },
  activeProfileId: 'default',
  profiles: BUILT_IN_PROFILES
};

// UI Elements
const masterToggle = typeof document !== 'undefined' ? document.getElementById('master-toggle') : null;
const modeRadios = typeof document !== 'undefined' ? document.getElementsByName('rendering-mode') : [];
const themeRadios = typeof document !== 'undefined' ? document.getElementsByName('color-theme') : [];
const themeSection = typeof document !== 'undefined' ? document.getElementById('theme-section') : null;
const sliderBrightness = typeof document !== 'undefined' ? document.getElementById('slider-brightness') : null;
const sliderContrast = typeof document !== 'undefined' ? document.getElementById('slider-contrast') : null;
const sliderGrayscale = typeof document !== 'undefined' ? document.getElementById('slider-grayscale') : null;
const protectDiagramsToggle = typeof document !== 'undefined' ? document.getElementById('protect-diagrams-toggle') : null;
const isSupporterToggle = typeof document !== 'undefined' ? document.getElementById('is-supporter-toggle') : null;
const goldAccentToggle = typeof document !== 'undefined' ? document.getElementById('gold-accent-toggle') : null;
const popupSupporterBadge = typeof document !== 'undefined' ? document.getElementById('popup-supporter-badge') : null;

// Focus & Eye Care Elements
const bionicReadingToggle = typeof document !== 'undefined' ? document.getElementById('bionic-reading-toggle') : null;
const readingRulerToggle = typeof document !== 'undefined' ? document.getElementById('reading-ruler-toggle') : null;
const sliderRulerHeight = typeof document !== 'undefined' ? document.getElementById('slider-ruler-height') : null;
const valRulerHeight = typeof document !== 'undefined' ? document.getElementById('ruler-height-val') : null;

// Auto-Night Schedule Elements
const autoNightToggle = typeof document !== 'undefined' ? document.getElementById('auto-night-toggle') : null;
const scheduleModeRadios = typeof document !== 'undefined' ? document.getElementsByName('schedule-mode') : [];
const scheduleStartTimeInput = typeof document !== 'undefined' ? document.getElementById('schedule-start-time') : null;
const scheduleEndTimeInput = typeof document !== 'undefined' ? document.getElementById('schedule-end-time') : null;
const scheduleTimeRow = typeof document !== 'undefined' ? document.getElementById('schedule-time-row') : null;

const valBrightness = typeof document !== 'undefined' ? document.getElementById('brightness-val') : null;
const valContrast = typeof document !== 'undefined' ? document.getElementById('contrast-val') : null;
const valGrayscale = typeof document !== 'undefined' ? document.getElementById('grayscale-val') : null;

const resetLink = typeof document !== 'undefined' ? document.getElementById('reset-settings') : null;
const fileUrlWarning = typeof document !== 'undefined' ? document.getElementById('file-url-warning') : null;

// Preference Profile Elements
const profileSelect = typeof document !== 'undefined' ? document.getElementById('profile-select') : null;
const btnApplyProfile = typeof document !== 'undefined' ? document.getElementById('btn-apply-profile') : null;
const btnDeleteProfile = typeof document !== 'undefined' ? document.getElementById('btn-delete-profile') : null;
const profileNameInput = typeof document !== 'undefined' ? document.getElementById('profile-name-input') : null;
const btnSaveProfile = typeof document !== 'undefined' ? document.getElementById('btn-save-profile') : null;

// Load settings on open
if (typeof document !== 'undefined') {
  document.addEventListener('DOMContentLoaded', () => {
    // Setup tab switching & export triggers
    setupTabSwitching();
    setupPopupExportListeners();
    renderPopupStats();

    // Check file access permission
    if (typeof BrowserCompat !== 'undefined' && typeof BrowserCompat.isAllowedFileSchemeAccess === 'function') {
      BrowserCompat.isAllowedFileSchemeAccess((isAllowed) => {
        if (fileUrlWarning) {
          fileUrlWarning.style.display = isAllowed ? 'none' : 'flex';
        }
      });
    } else if (typeof chrome !== 'undefined' && chrome.extension && chrome.extension.isAllowedFileSchemeAccess) {
      chrome.extension.isAllowedFileSchemeAccess((isAllowed) => {
        if (fileUrlWarning) {
          fileUrlWarning.style.display = isAllowed ? 'none' : 'flex';
        }
      });
    }

    // Load and apply settings
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
      chrome.storage.local.get(null, (settings) => {
        const activeSettings = { ...DEFAULTS, ...settings };
        applySettingsToUI(activeSettings);
      });

      chrome.storage.onChanged.addListener((changes, area) => {
        if (area === 'local') {
          chrome.storage.local.get(null, (settings) => {
            const activeSettings = { ...DEFAULTS, ...settings };
            applySettingsToUI(activeSettings);
          });
        }
      });
    }
  });
}

// Apply settings to UI controls
function applySettingsToUI(settings) {
  if (!settings) settings = DEFAULTS;
  
  if (masterToggle) {
    masterToggle.checked = settings.active !== false;
  }
  toggleContainerState(settings.active !== false);

  // Mode radio buttons
  for (const radio of modeRadios) {
    if (radio.value === settings.mode) {
      radio.checked = true;
    }
    radio.disabled = !settings.active;
  }

  // Map legacy theme names to current 5 premium schemes
  let currentTheme = (settings.theme || 'oled').toString().toLowerCase();
  if (currentTheme === 'dark') currentTheme = 'oled';
  if (currentTheme === 'warm') currentTheme = 'sepia';
  if (currentTheme === 'cool') currentTheme = 'slate';

  // Theme selection
  for (const radio of themeRadios) {
    if (radio.value === currentTheme) {
      radio.checked = true;
      if (radio.parentElement) radio.parentElement.classList.add('selected');
    } else {
      if (radio.parentElement) radio.parentElement.classList.remove('selected');
    }
    radio.disabled = !settings.active;
  }

  // Diagram protection toggle
  if (protectDiagramsToggle) {
    protectDiagramsToggle.checked = settings.protectDiagrams !== false;
    protectDiagramsToggle.disabled = !settings.active;
  }
  
  // Sliders
  if (sliderBrightness) {
    sliderBrightness.value = settings.brightness !== undefined ? settings.brightness : 100;
    sliderBrightness.disabled = !settings.active;
  }
  if (valBrightness) {
    valBrightness.textContent = `${settings.brightness !== undefined ? settings.brightness : 100}%`;
  }

  if (sliderContrast) {
    sliderContrast.value = settings.contrast !== undefined ? settings.contrast : 100;
    sliderContrast.disabled = !settings.active;
  }
  if (valContrast) {
    valContrast.textContent = `${settings.contrast !== undefined ? settings.contrast : 100}%`;
  }

  if (sliderGrayscale) {
    sliderGrayscale.value = settings.grayscale !== undefined ? settings.grayscale : 0;
    sliderGrayscale.disabled = !settings.active;
  }
  if (valGrayscale) {
    valGrayscale.textContent = `${settings.grayscale !== undefined ? settings.grayscale : 0}%`;
  }

  // Supporter settings
  const supporterState = settings.supporter || DEFAULTS.supporter;
  if (isSupporterToggle) {
    isSupporterToggle.checked = supporterState.isSupporter === true;
  }
  if (goldAccentToggle) {
    goldAccentToggle.checked = supporterState.goldAccent === true;
  }
  if (popupSupporterBadge) {
    if (supporterState.isSupporter) {
      popupSupporterBadge.classList.remove('hidden');
    } else {
      popupSupporterBadge.classList.add('hidden');
    }
  }

  // Bionic Reading Toggle
  if (bionicReadingToggle) {
    bionicReadingToggle.checked = settings.bionicReading === true;
    bionicReadingToggle.disabled = !settings.active;
  }

  // Reading Ruler Toggle & Height
  if (readingRulerToggle) {
    readingRulerToggle.checked = settings.readingRuler === true;
    readingRulerToggle.disabled = !settings.active;
  }
  if (sliderRulerHeight) {
    sliderRulerHeight.value = settings.rulerHeight !== undefined ? settings.rulerHeight : 40;
    sliderRulerHeight.disabled = !settings.active;
  }
  if (valRulerHeight) {
    valRulerHeight.textContent = `${settings.rulerHeight !== undefined ? settings.rulerHeight : 40}px`;
  }

  // Auto-Night Schedule
  const schedule = settings.autoNightSchedule || DEFAULTS.autoNightSchedule;
  if (autoNightToggle) {
    autoNightToggle.checked = schedule.enabled === true;
    autoNightToggle.disabled = !settings.active;
  }
  for (const radio of scheduleModeRadios) {
    if (radio.value === (schedule.mode || 'system')) {
      radio.checked = true;
    }
    radio.disabled = !settings.active || !schedule.enabled;
  }
  if (scheduleStartTimeInput) {
    scheduleStartTimeInput.value = schedule.startTime || '20:00';
    scheduleStartTimeInput.disabled = !settings.active || !schedule.enabled || schedule.mode === 'system';
  }
  if (scheduleEndTimeInput) {
    scheduleEndTimeInput.value = schedule.endTime || '07:00';
    scheduleEndTimeInput.disabled = !settings.active || !schedule.enabled || schedule.mode === 'system';
  }

  if (typeof document !== 'undefined' && document.body) {
    if (supporterState.goldAccent) {
      document.body.classList.add('theme-gold-accent');
    } else {
      document.body.classList.remove('theme-gold-accent');
    }
  }

  // Preference Profile dropdown update
  const currentProfiles = { ...BUILT_IN_PROFILES, ...(settings.profiles || {}) };
  const currentActiveProfileId = settings.activeProfileId || 'default';
  renderProfileDropdown(currentProfiles, currentActiveProfileId);
}

// Toggle enabled/disabled layout styling
function toggleContainerState(isActive) {
  if (typeof document !== 'undefined' && document.body) {
    if (isActive) {
      document.body.classList.remove('disabled-state');
    } else {
      document.body.classList.add('disabled-state');
    }
  }
}

// Save setting helper
function saveSetting(key, value) {
  if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
    chrome.storage.local.set({ [key]: value });
  }
}

// Event Listeners

if (masterToggle) {
  masterToggle.addEventListener('change', (e) => {
    const active = e.target.checked;
    saveSetting('active', active);
    toggleContainerState(active);
    
    // Update other inputs' disabled state
    if (typeof document !== 'undefined') {
      for (const input of document.querySelectorAll('input:not(#master-toggle)')) {
        input.disabled = !active;
      }
    }
  });
}

// Mode Radios
for (const radio of modeRadios) {
  radio.addEventListener('change', (e) => {
    if (e.target.checked) {
      saveSetting('mode', e.target.value);
      
      if (typeof chrome !== 'undefined' && chrome.tabs) {
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
          if (tabs[0] && tabs[0].url) {
            const url = tabs[0].url.toLowerCase();
            if (url.endsWith('.pdf') || url.includes('viewer.html') || url.startsWith('file:///')) {
              chrome.tabs.reload(tabs[0].id);
            }
          }
        });
      }
    }
  });
}

// Theme Radios
for (const radio of themeRadios) {
  radio.addEventListener('change', (e) => {
    if (e.target.checked) {
      for (const rad of themeRadios) {
        if (rad.parentElement) rad.parentElement.classList.remove('selected');
      }
      if (e.target.parentElement) e.target.parentElement.classList.add('selected');
      saveSetting('theme', e.target.value);
    }
  });
}

// Diagram Protection Toggle
if (protectDiagramsToggle) {
  protectDiagramsToggle.addEventListener('change', (e) => {
    saveSetting('protectDiagrams', e.target.checked);
  });
}

// Sliders
if (sliderBrightness) {
  sliderBrightness.addEventListener('input', (e) => {
    const val = e.target.value;
    if (valBrightness) valBrightness.textContent = `${val}%`;
    saveSetting('brightness', parseInt(val));
  });
}

if (sliderContrast) {
  sliderContrast.addEventListener('input', (e) => {
    const val = e.target.value;
    if (valContrast) valContrast.textContent = `${val}%`;
    saveSetting('contrast', parseInt(val));
  });
}

if (sliderGrayscale) {
  sliderGrayscale.addEventListener('input', (e) => {
    const val = e.target.value;
    if (valGrayscale) valGrayscale.textContent = `${val}%`;
    saveSetting('grayscale', parseInt(val));
  });
}

// Focus & Eye Care Event Listeners
if (bionicReadingToggle) {
  bionicReadingToggle.addEventListener('change', (e) => {
    saveSetting('bionicReading', e.target.checked);
  });
}

if (readingRulerToggle) {
  readingRulerToggle.addEventListener('change', (e) => {
    saveSetting('readingRuler', e.target.checked);
  });
}

if (sliderRulerHeight) {
  sliderRulerHeight.addEventListener('input', (e) => {
    const val = parseInt(e.target.value);
    if (valRulerHeight) valRulerHeight.textContent = `${val}px`;
    saveSetting('rulerHeight', val);
  });
}

// Auto-Night Schedule Helper & Event Listeners
function saveAutoNightSchedule(key, value) {
  if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
    chrome.storage.local.get(['autoNightSchedule'], (res) => {
      const current = res.autoNightSchedule || { enabled: false, mode: 'system', startTime: '20:00', endTime: '07:00' };
      current[key] = value;
      chrome.storage.local.set({ autoNightSchedule: current });
    });
  }
}

if (autoNightToggle) {
  autoNightToggle.addEventListener('change', (e) => {
    saveAutoNightSchedule('enabled', e.target.checked);
  });
}

for (const radio of scheduleModeRadios) {
  radio.addEventListener('change', (e) => {
    if (e.target.checked) {
      saveAutoNightSchedule('mode', e.target.value);
    }
  });
}

if (scheduleStartTimeInput) {
  scheduleStartTimeInput.addEventListener('change', (e) => {
    saveAutoNightSchedule('startTime', e.target.value);
  });
}

if (scheduleEndTimeInput) {
  scheduleEndTimeInput.addEventListener('change', (e) => {
    saveAutoNightSchedule('endTime', e.target.value);
  });
}

// Supporter Settings Helpers & Listeners
function saveSupporterSetting(key, value) {
  if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
    chrome.storage.local.get(['supporter'], (res) => {
      const current = res.supporter || { isSupporter: false, goldAccent: false, promptDismissedCount: 0, lastPromptDate: '' };
      current[key] = value;
      chrome.storage.local.set({ supporter: current });
    });
  }
}

if (isSupporterToggle) {
  isSupporterToggle.addEventListener('change', (e) => {
    saveSupporterSetting('isSupporter', e.target.checked);
  });
}

if (goldAccentToggle) {
  goldAccentToggle.addEventListener('change', (e) => {
    saveSupporterSetting('goldAccent', e.target.checked);
  });
}

// Profile Event Listeners
if (btnApplyProfile) {
  btnApplyProfile.addEventListener('click', () => {
    const selected = profileSelect ? profileSelect.value : 'default';
    applyProfile(selected);
  });
}

if (btnSaveProfile) {
  btnSaveProfile.addEventListener('click', () => {
    saveCurrentProfile();
  });
}

if (btnDeleteProfile) {
  btnDeleteProfile.addEventListener('click', () => {
    const selected = profileSelect ? profileSelect.value : null;
    if (selected) deleteProfile(selected);
  });
}

if (profileSelect) {
  profileSelect.addEventListener('change', (e) => {
    const val = e.target.value;
    if (btnDeleteProfile) {
      const isBuiltIn = val === 'default' || val === 'built_in_night' || val === 'built_in_ereader';
      btnDeleteProfile.disabled = isBuiltIn;
    }
  });
}

// Reset Settings
if (resetLink) {
  resetLink.addEventListener('click', (e) => {
    e.preventDefault();
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
      chrome.storage.local.set(DEFAULTS, () => {
        applySettingsToUI(DEFAULTS);
        
        if (chrome.tabs) {
          chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            if (tabs[0] && tabs[0].url) {
              const url = tabs[0].url.toLowerCase();
              if (url.endsWith('.pdf') || url.includes('viewer.html') || url.startsWith('file:///')) {
                chrome.tabs.reload(tabs[0].id);
              }
            }
          });
        }
      });
    }
  });
}

// -------------------------------------------------------------------------
// Tab Switching & Popup Notes Management (Module 3)
// -------------------------------------------------------------------------

function setupTabSwitching() {
  if (typeof document === 'undefined') return;
  const tabBtns = document.querySelectorAll('.popup-tab-btn');
  const tabPanes = document.querySelectorAll('.tab-pane');
  const btnPopupOpenFile = document.getElementById('btn-popup-open-file');

  if (btnPopupOpenFile) {
    btnPopupOpenFile.addEventListener('click', () => {
      if (typeof chrome !== 'undefined' && chrome.tabs && chrome.runtime) {
        chrome.tabs.create({ url: chrome.runtime.getURL('viewer.html') });
      } else {
        window.open('viewer.html', '_blank');
      }
    });
  }

  tabBtns.forEach(btn => {

    btn.addEventListener('click', () => {
      const targetTab = btn.dataset.tab;
      tabBtns.forEach(b => b.classList.remove('active'));
      tabPanes.forEach(p => p.classList.add('hidden'));

      btn.classList.add('active');
      const pane = document.getElementById(targetTab);
      if (pane) pane.classList.remove('hidden');

      if (targetTab === 'tab-bookmarks') {
        renderPopupBookmarks();
        renderPopupNotes();
      } else if (targetTab === 'tab-stats') {
        renderPopupStats();
      }
    });
  });
}

// -------------------------------------------------------------------------
// Reading Analytics & Streak Counter (Module 5)
// -------------------------------------------------------------------------

function calculateActiveStreak(analytics) {
  if (!analytics || !analytics.lastReadDate) return 0;
  
  const todayStr = new Date().toISOString().split('T')[0];
  const lastReadDateStr = analytics.lastReadDate;
  
  if (lastReadDateStr >= todayStr) {
    return analytics.currentStreak || 1;
  }
  
  const lastDate = new Date(lastReadDateStr);
  const today = new Date(todayStr);
  const diffDays = Math.floor((today - lastDate) / (86400 * 1000));
  
  if (diffDays <= 1 && diffDays >= 0) {
    return analytics.currentStreak || 1;
  }
  
  return 0;
}

function renderDailyChart(container, dailyStats) {
  if (!container) return;
  container.innerHTML = '';
  const days = [];
  const now = new Date();
  
  for (let i = 6; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    const dateISO = d.toISOString().split('T')[0];
    const dayName = d.toLocaleDateString('en-US', { weekday: 'short' });
    const stat = dailyStats[dateISO] || { seconds: 0, pages: 0 };
    const mins = Math.round((stat.seconds || 0) / 60);
    days.push({ dateISO, dayName, mins, pages: stat.pages || 0, isToday: i === 0 });
  }

  const maxMins = Math.max(15, ...days.map(d => d.mins));

  days.forEach(day => {
    const col = document.createElement('div');
    col.className = `chart-bar-col ${day.isToday ? 'today' : ''}`;

    const valEl = document.createElement('span');
    valEl.className = 'chart-bar-val';
    valEl.textContent = day.mins > 0 ? `${day.mins}m` : '0m';

    const barWrapper = document.createElement('div');
    barWrapper.className = 'chart-bar-wrapper';
    barWrapper.title = `${day.dateISO}: ${day.mins} mins, ${day.pages} pages`;

    const fillEl = document.createElement('div');
    fillEl.className = 'chart-bar-fill';
    const pct = Math.max(4, Math.round((day.mins / maxMins) * 100));
    fillEl.style.height = `${pct}%`;
    if (day.mins === 0) {
      fillEl.style.opacity = '0.3';
    }

    barWrapper.appendChild(fillEl);

    const lblEl = document.createElement('span');
    lblEl.className = 'chart-bar-label';
    lblEl.textContent = day.dayName;

    col.appendChild(valEl);
    col.appendChild(barWrapper);
    col.appendChild(lblEl);

    container.appendChild(col);
  });
}

function renderReadingHeatmap(dailyStats = {}, isSupporter = false, goldAccent = false) {
  if (typeof document === 'undefined') return;
  const gridEl = document.getElementById('reading-heatmap-grid');
  const totalDaysEl = document.getElementById('heatmap-total-days');
  const wrapperEl = document.getElementById('reading-heatmap-wrapper');

  if (!gridEl) return;

  const isGold = Boolean(isSupporter || goldAccent);
  const cardEl = gridEl.closest ? gridEl.closest('.heatmap-card') : null;
  [cardEl, wrapperEl, gridEl].forEach(el => {
    if (el && el.classList) {
      if (isGold) {
        el.classList.add('supporter-heatmap');
        el.classList.add('theme-gold-accent');
      } else {
        el.classList.remove('supporter-heatmap');
        el.classList.remove('theme-gold-accent');
      }
    }
  });

  gridEl.innerHTML = '';
  let activeDaysCount = 0;
  const now = new Date();

  // Generate grid cells for 365 days ending today
  for (let i = 364; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    const dateISO = d.toISOString().split('T')[0];
    const stat = (dailyStats && dailyStats[dateISO]) ? dailyStats[dateISO] : {};
    const seconds = stat.seconds || 0;
    const pages = stat.pages !== undefined ? stat.pages : (stat.pagesRead !== undefined ? stat.pagesRead : 0);
    const mins = Math.round(seconds / 60);

    let level = 0;
    if (mins >= 60) {
      level = 4;
    } else if (mins >= 30) {
      level = 3;
    } else if (mins >= 15) {
      level = 2;
    } else if (mins >= 1) {
      level = 1;
    } else {
      level = 0;
    }

    if (mins > 0) {
      activeDaysCount++;
    }

    const cell = document.createElement('div');
    cell.className = `heatmap-cell level-${level}`;
    const titleText = `${dateISO}: ${mins} mins, ${pages} pages`;
    cell.title = titleText;
    if (cell.setAttribute) {
      cell.setAttribute('title', titleText);
    }
    if (cell.dataset) {
      cell.dataset.date = dateISO;
      cell.dataset.mins = mins;
      cell.dataset.pages = pages;
    }

    gridEl.appendChild(cell);
  }

  if (totalDaysEl) {
    totalDaysEl.textContent = `${activeDaysCount} active day${activeDaysCount === 1 ? '' : 's'} in past year`;
  }

  if (wrapperEl) {
    wrapperEl.scrollLeft = wrapperEl.scrollWidth;
  }
}

function renderPopupStats() {
  if (typeof document === 'undefined') return;
  const streakBadgeEl = document.getElementById('top-streak-badge');
  const streakValEl = document.getElementById('popup-streak-val');
  const timeValEl = document.getElementById('popup-time-val');
  const pagesValEl = document.getElementById('popup-pages-val');
  const chartContainer = document.getElementById('daily-chart-container');

  if (typeof chrome === 'undefined' || !chrome.storage || !chrome.storage.local) {
    if (streakBadgeEl) streakBadgeEl.textContent = '🔥 0 Day Streak';
    if (streakValEl) streakValEl.textContent = '0 Day Streak';
    renderReadingHeatmap({}, false, false);
    return;
  }

  chrome.storage.local.get(['analytics', 'supporter'], (result) => {
    const analytics = result.analytics || {
      totalReadingTimeSeconds: 0,
      totalPagesRead: 0,
      dailyStats: {},
      currentStreak: 0,
      lastReadDate: ''
    };
    const supporter = result.supporter || {
      isSupporter: false,
      goldAccent: false
    };

    const activeStreak = calculateActiveStreak(analytics);
    const streakBadgeText = `🔥 ${activeStreak} Day Streak`;
    const streakValText = `${activeStreak} Day Streak`;
    
    if (streakBadgeEl) streakBadgeEl.textContent = streakBadgeText;
    if (streakValEl) streakValEl.textContent = streakValText;

    const totalSecs = analytics.totalReadingTimeSeconds || 0;
    let timeText = '0 min';
    if (totalSecs > 0) {
      const hrs = Math.floor(totalSecs / 3600);
      const mins = Math.floor((totalSecs % 3600) / 60);
      if (hrs > 0) {
        timeText = `${hrs}h ${mins}m`;
      } else {
        timeText = `${mins} min`;
      }
    }
    if (timeValEl) timeValEl.textContent = timeText;

    const totalPages = analytics.totalPagesRead || 0;
    if (pagesValEl) pagesValEl.textContent = `${totalPages} Pages`;

    if (chartContainer) {
      renderDailyChart(chartContainer, analytics.dailyStats || {});
    }

    renderReadingHeatmap(
      analytics.dailyStats || {},
      supporter.isSupporter === true,
      supporter.goldAccent === true
    );
  });
}

function renderPopupBookmarks() {
  if (typeof document === 'undefined') return;
  const listContainer = document.getElementById('popup-bookmarks-list');
  if (!listContainer) return;

  if (typeof chrome === 'undefined' || !chrome.storage || !chrome.storage.local) {
    listContainer.innerHTML = '<div class="bookmarks-empty-state">Storage API unavailable</div>';
    return;
  }

  chrome.storage.local.get(['readingPositions'], (result) => {
    const positions = result.readingPositions || {};
    const urls = Object.keys(positions);

    if (urls.length === 0) {
      listContainer.innerHTML = '<div class="bookmarks-empty-state">No saved reading positions found.</div>';
      return;
    }

    listContainer.innerHTML = '';
    urls.forEach(url => {
      const pos = positions[url] || {};
      const card = document.createElement('div');
      card.className = 'bookmark-card';

      let filename = url;
      try {
        filename = decodeURIComponent(url.substring(url.lastIndexOf('/') + 1));
      } catch (e) {}

      card.innerHTML = `
        <div class="bookmark-title">${escapeHtml(filename || 'PDF Document')}</div>
        <div class="bookmark-meta">
          <span>Page ${pos.page || 1} (${Math.round((pos.zoom || 1) * 100)}%)</span>
          <span>${pos.updatedAt ? new Date(pos.updatedAt).toLocaleDateString() : ''}</span>
        </div>
      `;

      card.addEventListener('click', () => {
        if (typeof chrome !== 'undefined' && chrome.tabs) {
          const viewerUrl = chrome.runtime.getURL('viewer.html') + '?file=' + encodeURIComponent(url);
          chrome.tabs.create({ url: viewerUrl });
        }
      });

      listContainer.appendChild(card);
    });
  });
}

function exportHighlights(highlightsArray, format = 'markdown') {
  if (!highlightsArray || highlightsArray.length === 0) return '';

  if (format === 'markdown') {
    return highlightsArray.map(hl => {
      let out = `## Page ${hl.page}\n> ${hl.text}`;
      if (hl.note) out += `\n*Note: ${hl.note}*`;
      return out;
    }).join('\n\n');
  } else {
    return highlightsArray.map(hl => {
      let out = `Page ${hl.page}: "${hl.text}"`;
      if (hl.note) out += ` [Note: ${hl.note}]`;
      return out;
    }).join('\n');
  }
}

function renderPopupNotes() {
  if (typeof document === 'undefined') return;
  const listContainer = document.getElementById('popup-notes-list');
  if (!listContainer) return;

  if (typeof chrome === 'undefined' || !chrome.storage || !chrome.storage.local) {
    listContainer.innerHTML = '<div class="notes-empty-state">Storage API unavailable</div>';
    return;
  }

  chrome.storage.local.get(['highlights'], (result) => {
    const highlights = result.highlights || {};
    let allNotes = [];
    Object.keys(highlights).forEach(url => {
      if (Array.isArray(highlights[url])) {
        highlights[url].forEach(h => allNotes.push({ ...h, url }));
      }
    });

    if (allNotes.length === 0) {
      listContainer.innerHTML = '<div class="notes-empty-state">No highlights or notes recorded yet. Highlight text in any PDF document to manage them here.</div>';
      return;
    }

    allNotes.sort((a, b) => (a.page || 0) - (b.page || 0));
    listContainer.innerHTML = '';

    allNotes.forEach(hl => {
      const card = document.createElement('div');
      card.className = 'note-card';
      const colorClass = hl.color || 'amber';
      card.innerHTML = `
        <div class="note-card-header">
          <span class="note-page-badge">
            <span class="color-indicator ${colorClass}"></span>
            Page ${hl.page || 1}
          </span>
          <button class="note-delete-btn" data-url="${escapeHtml(hl.url)}" data-id="${escapeHtml(hl.id)}" title="Delete note">🗑️</button>
        </div>
        <blockquote class="note-text-snippet ${colorClass}">${escapeHtml(hl.text)}</blockquote>
        <div class="note-user-content">
          ${hl.note ? `<span>${escapeHtml(hl.note)}</span>` : '<span style="opacity:0.5; font-style:italic;">No note attached</span>'}
        </div>
      `;

      const delBtn = card.querySelector('.note-delete-btn');
      if (delBtn) {
        delBtn.addEventListener('click', () => {
          const targetUrl = delBtn.dataset.url;
          const targetId = delBtn.dataset.id;
          chrome.storage.local.get(['highlights'], (res) => {
            const hls = res.highlights || {};
            if (hls[targetUrl]) {
              hls[targetUrl] = hls[targetUrl].filter(h => h.id !== targetId);
              chrome.storage.local.set({ highlights: hls }, () => {
                renderPopupNotes();
              });
            }
          });
        });
      }

      listContainer.appendChild(card);
    });
  });
}

function escapeHtml(str) {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function triggerDownloadInPopup(filename, content, mimeType) {
  if (typeof document === 'undefined') return;
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function setupPopupExportListeners() {
  if (typeof document === 'undefined') return;
  const btnMd = document.getElementById('popup-export-md');
  const btnTxt = document.getElementById('popup-export-txt');

  if (btnMd) {
    btnMd.addEventListener('click', () => {
      if (typeof chrome === 'undefined' || !chrome.storage || !chrome.storage.local) return;
      chrome.storage.local.get(['highlights'], (result) => {
        const highlights = result.highlights || {};
        let allNotes = [];
        Object.keys(highlights).forEach(url => {
          if (Array.isArray(highlights[url])) {
            allNotes.push(...highlights[url]);
          }
        });
        const content = exportHighlights(allNotes, 'markdown');
        triggerDownloadInPopup('pdf_notes_export.md', content, 'text/markdown');
      });
    });
  }

  if (btnTxt) {
    btnTxt.addEventListener('click', () => {
      if (typeof chrome === 'undefined' || !chrome.storage || !chrome.storage.local) return;
      chrome.storage.local.get(['highlights'], (result) => {
        const highlights = result.highlights || {};
        let allNotes = [];
        Object.keys(highlights).forEach(url => {
          if (Array.isArray(highlights[url])) {
            allNotes.push(...highlights[url]);
          }
        });
        const content = exportHighlights(allNotes, 'plaintext');
        triggerDownloadInPopup('pdf_notes_export.txt', content, 'text/plain');
      });
    });
  }

  setupBackupRestoreListeners();
}

function setupBackupRestoreListeners() {
  if (typeof document === 'undefined') return;
  const btnBackup = document.getElementById('btn-backup-data');
  const btnRestoreTrigger = document.getElementById('btn-restore-trigger');
  const fileInputRestore = document.getElementById('file-input-restore');
  const langSelector = document.getElementById('lang-selector');

  if (btnBackup) {
    btnBackup.addEventListener('click', () => {
      if (typeof chrome === 'undefined' || !chrome.storage || !chrome.storage.local) return;
      chrome.storage.local.get(null, (allData) => {
        const jsonStr = JSON.stringify(allData, null, 2);
        triggerDownloadInPopup('pdf_dark_backup.json', jsonStr, 'application/json');
      });
    });
  }

  if (btnRestoreTrigger && fileInputRestore) {
    btnRestoreTrigger.addEventListener('click', () => fileInputRestore.click());
    fileInputRestore.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (file) {
        const reader = new FileReader();
        reader.onload = (evt) => {
          try {
            const restoredData = JSON.parse(evt.target.result);
            if (typeof restoredData === 'object' && restoredData !== null) {
              if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
                chrome.storage.local.set(restoredData, () => {
                  alert('Data & settings successfully restored!');
                  location.reload();
                });
              }
            }
          } catch (err) {
            alert('Invalid JSON backup file.');
          }
        };
        reader.readAsText(file);
      }
    });
  }

  if (langSelector) {
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
      chrome.storage.local.get('language', (res) => {
        if (res && res.language) langSelector.value = res.language;
      });
    }
    langSelector.addEventListener('change', (e) => {
      saveSetting('language', e.target.value);
    });
  }
}


// -------------------------------------------------------------------------
// Feature R1: Custom Preference Profiles Logic
// -------------------------------------------------------------------------

function renderProfileDropdown(profiles, activeProfileId) {
  const select = typeof document !== 'undefined' ? document.getElementById('profile-select') : null;
  const btnDelete = typeof document !== 'undefined' ? document.getElementById('btn-delete-profile') : null;
  if (!select) return;

  const currentProfiles = { ...BUILT_IN_PROFILES, ...(profiles || {}) };
  const currentActive = activeProfileId || 'default';

  select.innerHTML = '';
  Object.keys(currentProfiles).forEach(id => {
    const prof = currentProfiles[id];
    const opt = document.createElement('option');
    opt.value = id;
    opt.textContent = prof ? (prof.name || id) : id;
    if (id === currentActive) {
      opt.selected = true;
    }
    select.appendChild(opt);
  });

  select.value = currentActive;

  if (btnDelete) {
    const selectedVal = select.value;
    const selectedProf = currentProfiles[selectedVal];
    const isBuiltIn = selectedProf ? (selectedProf.isBuiltIn === true || selectedVal === 'default' || selectedVal === 'built_in_night' || selectedVal === 'built_in_ereader') : true;
    btnDelete.disabled = isBuiltIn;
  }
}

function saveCurrentProfile(profileName, callback) {
  const inputEl = typeof document !== 'undefined' ? document.getElementById('profile-name-input') : null;
  const rawName = typeof profileName === 'string' ? profileName : (inputEl ? inputEl.value : '');
  const trimmedName = (rawName || '').trim().slice(0, 25);

  if (!trimmedName) {
    if (typeof callback === 'function') callback(false);
    return;
  }

  if (typeof chrome === 'undefined' || !chrome.storage || !chrome.storage.local) {
    if (typeof callback === 'function') callback(false);
    return;
  }

  chrome.storage.local.get(null, (store) => {
    const payload = {
      mode: store.mode || DEFAULTS.mode,
      theme: store.theme || DEFAULTS.theme,
      brightness: store.brightness !== undefined ? store.brightness : DEFAULTS.brightness,
      contrast: store.contrast !== undefined ? store.contrast : DEFAULTS.contrast,
      grayscale: store.grayscale !== undefined ? store.grayscale : DEFAULTS.grayscale,
      rulerHeight: store.rulerHeight !== undefined ? store.rulerHeight : DEFAULTS.rulerHeight,
      bionicReading: store.bionicReading !== undefined ? store.bionicReading : DEFAULTS.bionicReading,
      protectDiagrams: store.protectDiagrams !== undefined ? store.protectDiagrams : DEFAULTS.protectDiagrams
    };

    const newId = 'custom_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6);
    const newProfile = {
      id: newId,
      name: trimmedName,
      isBuiltIn: false,
      mode: payload.mode,
      theme: payload.theme,
      brightness: payload.brightness,
      contrast: payload.contrast,
      grayscale: payload.grayscale,
      rulerHeight: payload.rulerHeight,
      bionicReading: payload.bionicReading,
      protectDiagrams: payload.protectDiagrams,
      settings: payload
    };

    const existingProfiles = { ...BUILT_IN_PROFILES, ...(store.profiles || {}) };
    existingProfiles[newId] = newProfile;

    chrome.storage.local.set({ profiles: existingProfiles, activeProfileId: newId }, () => {
      if (inputEl) inputEl.value = '';
      renderProfileDropdown(existingProfiles, newId);
      if (typeof callback === 'function') callback(newProfile);
    });
  });
}

function applyProfile(profileId, callback) {
  if (typeof chrome === 'undefined' || !chrome.storage || !chrome.storage.local) return;

  chrome.storage.local.get(['profiles'], (res) => {
    const profiles = { ...BUILT_IN_PROFILES, ...(res.profiles || {}) };
    const targetProfile = profiles[profileId] || profiles['default'] || BUILT_IN_PROFILES['default'];
    const s = targetProfile.settings || targetProfile;

    const newSettings = {
      mode: s.mode,
      theme: s.theme,
      brightness: s.brightness,
      contrast: s.contrast,
      grayscale: s.grayscale,
      rulerHeight: s.rulerHeight,
      bionicReading: s.bionicReading,
      protectDiagrams: s.protectDiagrams,
      activeProfileId: profileId
    };

    chrome.storage.local.set(newSettings, () => {
      chrome.storage.local.get(null, (allSettings) => {
        applySettingsToUI(allSettings);

        if (chrome.tabs) {
          chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            if (tabs[0] && tabs[0].url) {
              const url = tabs[0].url.toLowerCase();
              if (url.endsWith('.pdf') || url.includes('viewer.html') || url.startsWith('file:///')) {
                chrome.tabs.reload(tabs[0].id);
              }
            }
          });
        }

        if (typeof callback === 'function') callback();
      });
    });
  });
}

function deleteProfile(profileId, callback) {
  const cb = typeof callback === 'function' ? callback : null;

  if (!profileId) {
    if (cb) cb(false);
    return;
  }

  const isBuiltIn = profileId === 'default' || profileId === 'built_in_night' || profileId === 'built_in_ereader' || (BUILT_IN_PROFILES[profileId] && BUILT_IN_PROFILES[profileId].isBuiltIn);
  if (isBuiltIn) {
    if (cb) cb(false);
    return;
  }

  if (typeof chrome === 'undefined' || !chrome.storage || !chrome.storage.local) {
    if (cb) cb(false);
    return;
  }

  chrome.storage.local.get(['profiles', 'activeProfileId'], (res) => {
    const profiles = { ...BUILT_IN_PROFILES, ...(res.profiles || {}) };
    if (profiles[profileId] && !profiles[profileId].isBuiltIn) {
      delete profiles[profileId];
      const activeWasDeleted = res.activeProfileId === profileId;
      const newActiveId = activeWasDeleted ? 'default' : (res.activeProfileId || 'default');

      if (activeWasDeleted) {
        const defaultProfile = profiles['default'] || BUILT_IN_PROFILES['default'];
        const s = defaultProfile.settings || defaultProfile;
        const newSettings = {
          profiles: profiles,
          activeProfileId: 'default',
          mode: s.mode,
          theme: s.theme,
          brightness: s.brightness,
          contrast: s.contrast,
          grayscale: s.grayscale,
          rulerHeight: s.rulerHeight,
          bionicReading: s.bionicReading,
          protectDiagrams: s.protectDiagrams
        };
        chrome.storage.local.set(newSettings, () => {
          chrome.storage.local.get(null, (allSettings) => {
            const activeSettings = { ...DEFAULTS, ...allSettings };
            applySettingsToUI(activeSettings);

            if (typeof chrome !== 'undefined' && chrome.tabs) {
              chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
                if (tabs[0] && tabs[0].url) {
                  const url = tabs[0].url.toLowerCase();
                  if (url.endsWith('.pdf') || url.includes('viewer.html') || url.startsWith('file:///')) {
                    chrome.tabs.reload(tabs[0].id);
                  }
                }
              });
            }

            if (cb) cb(true);
          });
        });
      } else {
        chrome.storage.local.set({ profiles: profiles, activeProfileId: newActiveId }, () => {
          renderProfileDropdown(profiles, newActiveId);
          if (cb) cb(true);
        });
      }
    } else {
      if (cb) cb(false);
    }
  });
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    DEFAULTS,
    BUILT_IN_PROFILES,
    applySettingsToUI,
    saveSetting,
    saveSupporterSetting,
    exportHighlights,
    calculateActiveStreak,
    renderDailyChart,
    renderReadingHeatmap,
    renderPopupStats,
    renderProfileDropdown,
    saveCurrentProfile,
    applyProfile,
    deleteProfile
  };
}

