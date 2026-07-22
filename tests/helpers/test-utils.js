/**
 * Test Utilities for Portable-Darkument-Format
 * Environment setup, DOM emulation, and Extension handler simulations.
 */

const { setupGlobalChromeMock } = require('../mocks/chrome-api-mock');
const viewer = require('../../viewer');

// Set up Chrome global mock
const chromeMock = setupGlobalChromeMock();

/**
 * Initialize simulated Chrome storage defaults according to PROJECT.md schema
 */
function getDefaultStorageState() {
  return {
    active: true,
    mode: 'enhanced',
    theme: 'oled',
    brightness: 100,
    contrast: 100,
    protectDiagrams: true,
    readingPositions: {},
    highlights: {},
    bionicReading: false,
    readingRuler: false,
    rulerHeight: 40,
    autoNightSchedule: {
      enabled: false,
      mode: 'system',
      startTime: '20:00',
      endTime: '07:00'
    },
    analytics: {
      totalReadingTimeSeconds: 0,
      totalPagesRead: 0,
      dailyStats: {},
      currentStreak: 0,
      lastReadDate: ''
    },
    supporter: {
      isSupporter: false,
      goldAccent: false,
      promptDismissedCount: 0,
      lastPromptDate: ''
    }
  };
}

/**
 * Simulates Background Service Worker message passing and event handling
 */
function handleBackgroundMessage(message, sender = { tab: { id: 1, url: 'https://example.com/doc.pdf' } }) {
  const store = chrome.storage.local.store;
  
  switch (message.action) {
    case 'get_settings':
      return { ...store };

    case 'update_settings':
      chrome.storage.local.set(message.settings);
      return { success: true };

    case 'read_file_bytes':
      if (store.pendingLocalPdf && store.pendingLocalPdf.data && (!message.url || store.pendingLocalPdf.url === message.url)) {
        return { success: true, data: store.pendingLocalPdf.data };
      }
      return { success: false, error: 'File data unavailable' };

    case 'save_position':
      if (message.url) {
        const positions = store.readingPositions || {};
        positions[message.url] = {
          page: message.page || 1,
          scrollTop: message.scrollTop || 0,
          scrollLeft: message.scrollLeft || 0,
          zoom: message.zoom || 1.0,
          updatedAt: Date.now()
        };
        chrome.storage.local.set({ readingPositions: positions });
      }
      return { success: true };

    case 'add_highlight':
      if (message.url && message.highlight) {
        const highlights = store.highlights || {};
        const urlHighlights = highlights[message.url] || [];
        urlHighlights.push({
          id: message.highlight.id || `hl_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
          page: message.highlight.page || 1,
          text: message.highlight.text || '',
          color: message.highlight.color || 'amber',
          note: message.highlight.note || '',
          timestamp: Date.now()
        });
        highlights[message.url] = urlHighlights;
        chrome.storage.local.set({ highlights });
      }
      return { success: true };

    case 'track_reading': {
      const analytics = store.analytics || {
        totalReadingTimeSeconds: 0,
        totalPagesRead: 0,
        dailyStats: {},
        currentStreak: 0,
        lastReadDate: ''
      };
      
      const rawSeconds = message.seconds;
      const secondsToAdd = (typeof rawSeconds === 'number' && !isNaN(rawSeconds) && rawSeconds > 0) ? rawSeconds : 0;
      const pagesToAdd = message.pages !== undefined ? message.pages : (message.pageCount !== undefined ? message.pageCount : (typeof message.page === 'number' && message.page >= 50 ? message.page : (message.page ? 1 : 0)));
      
      analytics.totalReadingTimeSeconds += secondsToAdd;
      analytics.totalPagesRead += pagesToAdd;
      
      const todayISO = message.dateISO || new Date().toISOString().split('T')[0];
      const dailyStats = analytics.dailyStats || {};
      const todayStat = dailyStats[todayISO] || { seconds: 0, pages: 0 };
      todayStat.seconds += secondsToAdd;
      todayStat.pages += pagesToAdd;
      dailyStats[todayISO] = todayStat;
      analytics.dailyStats = dailyStats;

      // Streak logic
      if (analytics.lastReadDate !== todayISO) {
        if (!analytics.lastReadDate) {
          analytics.currentStreak = 1;
        } else {
          const lastDate = new Date(analytics.lastReadDate);
          const currentDate = new Date(todayISO);
          const diffDays = Math.floor((currentDate - lastDate) / (86400 * 1000));
          if (diffDays === 1) {
            analytics.currentStreak += 1;
          } else if (diffDays > 1) {
            analytics.currentStreak = 1;
          }
        }
        analytics.lastReadDate = todayISO;
      }
      
      chrome.storage.local.set({ analytics });
      
      // Check donation prompt trigger condition
      if (analytics.currentStreak >= 7 || analytics.totalPagesRead >= 50) {
        const supporter = store.supporter || {};
        if (!supporter.isSupporter && supporter.promptDismissedCount < 3) {
          return {
            success: true,
            triggerDonationPrompt: true,
            reason: analytics.currentStreak >= 7 ? '7-day streak milestone' : '50 pages read milestone'
          };
        }
      }
      
      return { success: true };
    }

    case 'trigger_donation_prompt':
      return {
        promptShown: true,
        reason: message.reason || 'milestone'
      };

    default:
      return { error: 'Unknown action' };
  }
}

/**
 * Helper to compute dark filter string from settings
 */
function computeDarkFilter(rawSettings) {
  const settings = viewer.sanitizeSettings(rawSettings);
  if (!settings || !settings.active) return 'none';

  const filterParts = [];
  switch (settings.theme) {
    case 'dark':
    case 'oled':
      filterParts.push('invert(0.9) hue-rotate(180deg)');
      break;
    case 'warm':
    case 'sepia':
      filterParts.push('invert(0.9) hue-rotate(180deg) sepia(0.35)');
      break;
    case 'cool':
    case 'slate':
      filterParts.push('invert(0.9) hue-rotate(200deg)');
      break;
    case 'mono':
      filterParts.push('invert(0.9) hue-rotate(180deg) grayscale(1)');
      break;
    case 'classic':
      filterParts.push('invert(1)');
      break;
    default:
      filterParts.push('invert(0.9) hue-rotate(180deg)');
  }

  if (settings.brightness !== 100) {
    filterParts.push(`brightness(${settings.brightness / 100})`);
  }
  if (settings.contrast !== 100) {
    filterParts.push(`contrast(${settings.contrast / 100})`);
  }
  if (settings.grayscale > 0) {
    filterParts.push(`grayscale(${settings.grayscale / 100})`);
  }

  return filterParts.join(' ');
}

/**
 * Bionic reading algorithm helper
 */
function applyBionicReading(text) {
  if (!text) return '';
  return text.split(' ').map(word => {
    if (word.length <= 2) return `<b>${word}</b>`;
    const mid = Math.ceil(word.length / 2);
    return `<b>${word.substring(0, mid)}</b>${word.substring(mid)}`;
  }).join(' ');
}

/**
 * Auto night schedule logic helper
 */
function isNightTime(schedule, nowTimeStr) {
  if (!schedule || !schedule.enabled) return false;
  if (schedule.mode === 'system') return true; // simulated system dark preference

  const [startH, startM] = schedule.startTime.split(':').map(Number);
  const [endH, endM] = schedule.endTime.split(':').map(Number);
  const [nowH, nowM] = nowTimeStr.split(':').map(Number);

  const startMins = startH * 60 + startM;
  const endMins = endH * 60 + endM;
  const nowMins = nowH * 60 + nowM;

  if (startMins > endMins) {
    // Overnight (e.g. 20:00 to 07:00)
    return nowMins >= startMins || nowMins < endMins;
  } else {
    // Same day (e.g. 18:00 to 23:00)
    return nowMins >= startMins && nowMins < endMins;
  }
}

/**
 * Export highlights helper (Markdown & Plain Text)
 */
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

const background = require('../../background');
const contentScript = require('../../content');

module.exports = {
  chromeMock,
  getDefaultStorageState,
  handleBackgroundMessage,
  computeDarkFilter,
  applyBionicReading,
  isNightTime,
  exportHighlights,
  isProtectedElement: viewer.isProtectedElement,
  getReverseFilter: viewer.getReverseFilter,
  tagProtectedElements: viewer.tagProtectedElements,
  sanitizeSettings: viewer.sanitizeSettings,
  clampNumber: viewer.clampNumber,
  transformWordToBionic: viewer.transformWordToBionic,
  transformTextToBionic: viewer.transformTextToBionic,
  setupAutoNightAlarm: background.setupAutoNightAlarm,
  checkAutoNightSchedule: background.checkAutoNightSchedule,
  sanitizeFileUrl: viewer.sanitizeFileUrl,
  loadPdf: viewer.loadPdf,
  setupEventListeners: viewer.setupEventListeners,
  handleParameterlessStartup: viewer.handleParameterlessStartup,
  isPdfUrl: background.isPdfUrl,
  handleReadFileBytes: background.handleReadFileBytes,
  arrayBufferToBase64: contentScript.arrayBufferToBase64,
  handleLocalPdf: contentScript.handleLocalPdf
};
