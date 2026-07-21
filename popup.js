const DEFAULTS = {
  active: true,
  mode: 'enhanced',
  theme: 'dark',
  brightness: 90,
  contrast: 100,
  grayscale: 0,
  invertImages: false
};

// UI Elements
const masterToggle = document.getElementById('master-toggle');
const modeRadios = document.getElementsByName('rendering-mode');
const themeRadios = document.getElementsByName('color-theme');
const themeSection = document.getElementById('theme-section');
const sliderBrightness = document.getElementById('slider-brightness');
const sliderContrast = document.getElementById('slider-contrast');
const sliderGrayscale = document.getElementById('slider-grayscale');

const valBrightness = document.getElementById('brightness-val');
const valContrast = document.getElementById('contrast-val');
const valGrayscale = document.getElementById('grayscale-val');

const resetLink = document.getElementById('reset-settings');
const fileUrlWarning = document.getElementById('file-url-warning');

// Load settings on open
document.addEventListener('DOMContentLoaded', () => {
  // Check file access permission
  if (chrome.extension && chrome.extension.isAllowedFileSchemeAccess) {
    chrome.extension.isAllowedFileSchemeAccess((isAllowed) => {
      if (isAllowed) {
        fileUrlWarning.style.display = 'none';
      } else {
        fileUrlWarning.style.display = 'flex';
      }
    });
  }

  // Load and apply settings
  chrome.storage.local.get(null, (settings) => {
    // Merge loaded settings with defaults
    const activeSettings = { ...DEFAULTS, ...settings };
    applySettingsToUI(activeSettings);
  });
});

// Apply settings to UI controls
function applySettingsToUI(settings) {
  masterToggle.checked = settings.active;
  toggleContainerState(settings.active);

  // Mode radio buttons
  for (const radio of modeRadios) {
    if (radio.value === settings.mode) {
      radio.checked = true;
    }
    radio.disabled = !settings.active;
  }

  // Theme selection
  for (const radio of themeRadios) {
    if (radio.value === settings.theme) {
      radio.checked = true;
      // Add active visual state class if needed
      radio.parentElement.classList.add('selected');
    } else {
      radio.parentElement.classList.remove('selected');
    }
    radio.disabled = !settings.active;
  }

  // Hide theme selection in enhanced mode if it uses built-in styling
  // Actually, we'll keep it visible since our custom PDF.js viewer will support the same themes!
  
  // Sliders
  sliderBrightness.value = settings.brightness;
  sliderBrightness.disabled = !settings.active;
  valBrightness.textContent = `${settings.brightness}%`;

  sliderContrast.value = settings.contrast;
  sliderContrast.disabled = !settings.active;
  valContrast.textContent = `${settings.contrast}%`;

  sliderGrayscale.value = settings.grayscale;
  sliderGrayscale.disabled = !settings.active;
  valGrayscale.textContent = `${settings.grayscale}%`;
}

// Toggle enabled/disabled layout styling
function toggleContainerState(isActive) {
  if (isActive) {
    document.body.classList.remove('disabled-state');
  } else {
    document.body.classList.add('disabled-state');
  }
}

// Save setting helper
function saveSetting(key, value) {
  chrome.storage.local.set({ [key]: value });
}

// Event Listeners

// Master Toggle
masterToggle.addEventListener('change', (e) => {
  const active = e.target.checked;
  saveSetting('active', active);
  toggleContainerState(active);
  
  // Update other inputs' disabled state
  for (const input of document.querySelectorAll('input:not(#master-toggle)')) {
    input.disabled = !active;
  }
});

// Mode Radios
for (const radio of modeRadios) {
  radio.addEventListener('change', (e) => {
    if (e.target.checked) {
      saveSetting('mode', e.target.value);
      
      // Reload current tab if it is a PDF to apply mode change immediately
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

// Theme Radios
for (const radio of themeRadios) {
  radio.addEventListener('change', (e) => {
    if (e.target.checked) {
      // Remove 'selected' class from all theme-options
      for (const rad of themeRadios) {
        rad.parentElement.classList.remove('selected');
      }
      e.target.parentElement.classList.add('selected');
      saveSetting('theme', e.target.value);
    }
  });
}

// Sliders
sliderBrightness.addEventListener('input', (e) => {
  const val = e.target.value;
  valBrightness.textContent = `${val}%`;
  saveSetting('brightness', parseInt(val));
});

sliderContrast.addEventListener('input', (e) => {
  const val = e.target.value;
  valContrast.textContent = `${val}%`;
  saveSetting('contrast', parseInt(val));
});

sliderGrayscale.addEventListener('input', (e) => {
  const val = e.target.value;
  valGrayscale.textContent = `${val}%`;
  saveSetting('grayscale', parseInt(val));
});

// Reset Settings
resetLink.addEventListener('click', (e) => {
  e.preventDefault();
  chrome.storage.local.set(DEFAULTS, () => {
    applySettingsToUI(DEFAULTS);
    
    // Reload if PDF tab to reset filters instantly
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0] && tabs[0].url) {
        const url = tabs[0].url.toLowerCase();
        if (url.endsWith('.pdf') || url.includes('viewer.html') || url.startsWith('file:///')) {
          chrome.tabs.reload(tabs[0].id);
        }
      }
    });
  });
});
