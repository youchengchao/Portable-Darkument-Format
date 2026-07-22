// Initialize settings on installation & open Welcome Page
chrome.runtime.onInstalled.addListener((details) => {
  if (details && details.reason === 'install') {
    if (chrome.tabs && chrome.runtime.getURL) {
      chrome.tabs.create({ url: chrome.runtime.getURL('welcome.html') });
    }
  }

  chrome.storage.local.get([
    'active',
    'mode',
    'theme',
    'brightness',
    'contrast',
    'grayscale',
    'invertImages'
  ], (result) => {
    const defaults = {
      active: true,
      mode: 'enhanced', // Set 'enhanced' as default for robust PDF interception
      theme: 'dark',     // 'dark', 'warm', 'cool', 'sepia', 'mono'
      brightness: 90,    // percentage
      contrast: 100,     // percentage
      grayscale: 0,      // percentage
      invertImages: false,
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
      }
    };

    const updates = {};
    for (const key in defaults) {
      if (result[key] === undefined) {
        updates[key] = defaults[key];
      }
    }

    if (Object.keys(updates).length > 0) {
      chrome.storage.local.set(updates);
    }
  });
});

// Handle Global Keyboard Shortcut Commands
if (typeof chrome !== 'undefined' && chrome.commands) {
  chrome.commands.onCommand.addListener((command) => {
    if (command === 'toggle-dark-mode') {
      chrome.storage.local.get('active', (res) => {
        chrome.storage.local.set({ active: !(res.active !== false) });
      });
    } else if (command === 'toggle-bionic-reading') {
      chrome.storage.local.get('bionicReading', (res) => {
        chrome.storage.local.set({ bionicReading: !Boolean(res.bionicReading) });
      });
    } else if (command === 'toggle-reading-ruler') {
      chrome.storage.local.get('readingRuler', (res) => {
        chrome.storage.local.set({ readingRuler: !Boolean(res.readingRuler) });
      });
    }
  });
}


// Helper to check if URL is a PDF file based on path
function isPdfUrl(url) {
  try {
    if (!url || typeof url !== 'string') return false;
    if (url.includes('viewer.html') || url.includes('native=true')) {
      return false;
    }
    // Local file:/// PDFs are rendered natively in Dark Mode by content.js
    // This avoids Chromium extension tab CORS errors and prevents dropzone screens.
    if (url.startsWith('file:///')) {
      return false;
    }
    const cleanUrl = url.split('?')[0].split('#')[0].toLowerCase();
    if (cleanUrl.endsWith('.pdf')) {
      return true;
    }
    const parsed = new URL(url);
    return parsed.search.includes('pdf=true');
  } catch (e) {
    return false;
  }
}




// Redirect tab to custom viewer
function redirectToViewer(tabId, url) {
  const viewerPrefix = chrome.runtime.getURL('viewer.html');
  const isNative = url.includes('native=true');
  if (url.startsWith(viewerPrefix) || isNative) {
    return;
  }
  const viewerUrl = viewerPrefix + '?file=' + encodeURIComponent(url);
  chrome.tabs.update(tabId, { url: viewerUrl });
}

// 1. Intercept via webNavigation (URL checks - catches file:/// URLs)
chrome.webNavigation.onBeforeNavigate.addListener((details) => {
  // Only target main frame page load
  if (details.frameId === 0 && details.url) {
    chrome.storage.local.get(['active', 'mode'], (settings) => {
      if (settings.active && settings.mode === 'enhanced' && isPdfUrl(details.url)) {
        redirectToViewer(details.tabId, details.url);
      }
    });
  }
});

// 2. Intercept via webRequest Content-Type detection (for dynamic PDFs)
chrome.webRequest.onHeadersReceived.addListener(
  (details) => {
    // Only care about main frame document loads
    if (details.tabId !== -1 && details.type === 'main_frame' && details.url) {
      const contentTypeHeader = details.responseHeaders.find(
        h => h.name.toLowerCase() === 'content-type'
      );
      if (contentTypeHeader && contentTypeHeader.value.toLowerCase().includes('application/pdf')) {
        chrome.storage.local.get(['active', 'mode'], (settings) => {
          if (settings.active && settings.mode === 'enhanced') {
            redirectToViewer(details.tabId, details.url);
          }
        });
      }
    }
  },
  { urls: ['<all_urls>'] },
  ['responseHeaders']
);

// 3. Messaging receiver
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'pdf_detected') {
    const tabId = sender.tab ? sender.tab.id : null;
    if (tabId) {
      chrome.storage.local.get(['active', 'mode'], (settings) => {
        if (settings.active && settings.mode === 'enhanced') {
          redirectToViewer(tabId, message.url);
        }
      });
    }
  } else if (message.action === 'get_settings') {
    chrome.storage.local.get(null, (settings) => {
      sendResponse(settings);
    });
    return true;
  } else if (message.action === 'update_settings') {
    if (message.settings) {
      chrome.storage.local.set(message.settings, () => {
        sendResponse({ success: true });
      });
      return true;
    }
  } else if (message.action === 'save_position') {
    if (message.url) {
      chrome.storage.local.get('readingPositions', (result) => {
        const positions = (typeof result.readingPositions === 'object' && result.readingPositions !== null)
          ? result.readingPositions
          : {};
        positions[message.url] = {
          page: message.page || 1,
          scrollTop: Math.max(0, message.scrollTop || 0),
          scrollLeft: Math.max(0, message.scrollLeft || 0),
          zoom: message.zoom || 1.0,
          updatedAt: Date.now()
        };
        chrome.storage.local.set({ readingPositions: positions }, () => {
          sendResponse({ success: true });
        });
      });
      return true;
    }
  } else if (message.action === 'track_reading') {
    handleTrackReading(message, sendResponse);
    return true;
  } else if (message.action === 'record_page_view') {
    handleTrackReading({ action: 'track_reading', seconds: 0, pages: 1 }, sendResponse);
    return true;
  } else if (message.action === 'record_reading_time') {
    const secs = typeof message.seconds === 'number' ? message.seconds : ((message.minutes || 1) * 60);
    handleTrackReading({ action: 'track_reading', seconds: secs, pages: 0 }, sendResponse);
    return true;
  }
});

// Update reading analytics & daily streak counter
function handleTrackReading(message, callback) {
  const todayISO = message.dateISO || new Date().toISOString().split('T')[0];

  chrome.storage.local.get(['analytics', 'supporter'], (result) => {
    let analytics = result.analytics;
    if (!analytics || typeof analytics !== 'object') {
      analytics = {
        totalReadingTimeSeconds: 0,
        totalPagesRead: 0,
        dailyStats: {},
        currentStreak: 0,
        lastReadDate: ''
      };
    }

    const rawSeconds = message.seconds;
    const secondsToAdd = (typeof rawSeconds === 'number' && !isNaN(rawSeconds) && rawSeconds > 0) ? rawSeconds : 0;

    let pagesToAdd = 0;
    if (typeof message.pages === 'number' && !isNaN(message.pages) && message.pages >= 0) {
      pagesToAdd = message.pages;
    } else if (typeof message.pageCount === 'number' && !isNaN(message.pageCount) && message.pageCount >= 0) {
      pagesToAdd = message.pageCount;
    } else if (typeof message.page === 'number' && !isNaN(message.page)) {
      if (message.page >= 50) {
        pagesToAdd = message.page;
      } else if (message.page > 0) {
        pagesToAdd = 1;
      }
    } else if (message.page) {
      pagesToAdd = 1;
    }

    analytics.totalReadingTimeSeconds = (analytics.totalReadingTimeSeconds || 0) + secondsToAdd;
    analytics.totalPagesRead = (analytics.totalPagesRead || 0) + pagesToAdd;

    const dailyStats = analytics.dailyStats || {};
    const todayStat = dailyStats[todayISO] || { seconds: 0, pages: 0 };
    todayStat.seconds = (todayStat.seconds || 0) + secondsToAdd;
    todayStat.pages = (todayStat.pages || 0) + pagesToAdd;
    dailyStats[todayISO] = todayStat;
    analytics.dailyStats = dailyStats;

    // Prune stats older than 365 days if too large
    const dates = Object.keys(analytics.dailyStats);
    if (dates.length > 365) {
      dates.sort();
      const toRemove = dates.slice(0, dates.length - 365);
      toRemove.forEach(d => delete analytics.dailyStats[d]);
    }

    // Streak logic
    if (analytics.lastReadDate !== todayISO) {
      if (!analytics.lastReadDate) {
        analytics.currentStreak = 1;
      } else {
        const lastDate = new Date(analytics.lastReadDate);
        const currentDate = new Date(todayISO);
        const diffDays = Math.floor((currentDate - lastDate) / (86400 * 1000));
        if (diffDays === 1) {
          analytics.currentStreak = (analytics.currentStreak || 0) + 1;
        } else if (diffDays > 1) {
          analytics.currentStreak = 1;
        }
      }
      analytics.lastReadDate = todayISO;
    }

    chrome.storage.local.set({ analytics }, () => {
      let response = { success: true, analytics };
      if (analytics.currentStreak >= 7 || analytics.totalPagesRead >= 50) {
        const supporter = result.supporter || {};
        if (!supporter.isSupporter && (supporter.promptDismissedCount || 0) < 3) {
          response.triggerDonationPrompt = true;
          response.reason = analytics.currentStreak >= 7 ? '7-day streak milestone' : '50 pages read milestone';
        }
      }
      if (callback) callback(response);
    });
  });
}

// Auto-Night Schedule Helpers and Alarm Manager
function isNightTime(schedule, nowTimeStr) {
  if (!schedule || !schedule.enabled) return false;
  if (schedule.mode === 'system') return true;

  const [startH, startM] = (schedule.startTime || '20:00').split(':').map(Number);
  const [endH, endM] = (schedule.endTime || '07:00').split(':').map(Number);
  let nowH, nowM;
  if (nowTimeStr) {
    [nowH, nowM] = nowTimeStr.split(':').map(Number);
  } else {
    const d = new Date();
    nowH = d.getHours();
    nowM = d.getMinutes();
  }

  const startMins = startH * 60 + startM;
  const endMins = endH * 60 + endM;
  const nowMins = nowH * 60 + nowM;

  if (startMins > endMins) {
    return nowMins >= startMins || nowMins < endMins;
  } else {
    return nowMins >= startMins && nowMins < endMins;
  }
}

function setupAutoNightAlarm(schedule) {
  if (typeof chrome !== 'undefined' && chrome.alarms) {
    if (schedule && schedule.enabled) {
      chrome.alarms.create('autoNightCheck', { periodInMinutes: 1 });
    } else {
      chrome.alarms.clear('autoNightCheck');
    }
  }
}

function checkAutoNightSchedule() {
  if (typeof chrome === 'undefined' || !chrome.storage || !chrome.storage.local) return;
  chrome.storage.local.get(['autoNightSchedule', 'active'], (result) => {
    const schedule = result.autoNightSchedule;
    if (schedule && schedule.enabled) {
      const shouldBeActive = isNightTime(schedule);
      if (result.active !== shouldBeActive) {
        chrome.storage.local.set({ active: shouldBeActive });
      }
    }
  });
}

if (typeof chrome !== 'undefined' && chrome.alarms) {
  chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm && alarm.name === 'autoNightCheck') {
      checkAutoNightSchedule();
    }
  });
}

if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.onChanged) {
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes.autoNightSchedule) {
      setupAutoNightAlarm(changes.autoNightSchedule.newValue);
      checkAutoNightSchedule();
    }
  });
}

function updateReadingStats(pagesToAdd = 0, minutesToAdd = 0, callback) {
  return handleTrackReading({ action: 'track_reading', seconds: minutesToAdd * 60, pages: pagesToAdd }, callback);
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    isPdfUrl,
    redirectToViewer,
    handleTrackReading,
    updateReadingStats,
    isNightTime,
    setupAutoNightAlarm,
    checkAutoNightSchedule
  };
}




