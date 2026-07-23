/**
 * Firefox API Mock Engine for Portable-Darkument-Format Unit & Integration Testing
 * Simulates Firefox MV3 WebExtension environment (Promise-native `browser.*` and `chrome.*`).
 *
 * Implements:
 * - browser.runtime (getBrowserInfo, getManifest, getURL, sendMessage, onInstalled, onMessage)
 * - browser.permissions (contains)
 * - browser.storage.local & browser.storage.onChanged (Promise-returning)
 * - browser.tabs (query, update, reload, get, create, sendMessage)
 * - browser.scripting (executeScript)
 * - browser.webRequest (onHeadersReceived)
 * - browser.webNavigation (onBeforeNavigate)
 * - browser.alarms (create, clear, get, getAll, onAlarm)
 */

const fs = require('fs');
const path = require('path');

class MockFirefoxStorageArea {
  constructor() {
    this.store = {};
    this.onChangedEvent = null;
  }

  get(keys, callback) {
    let result = {};
    if (keys === null || keys === undefined) {
      result = { ...this.store };
    } else if (typeof keys === 'string') {
      if (keys in this.store) {
        result[keys] = this.store[keys];
      }
    } else if (Array.isArray(keys)) {
      keys.forEach(key => {
        if (key in this.store) {
          result[key] = this.store[key];
        }
      });
    } else if (typeof keys === 'object') {
      result = { ...keys };
      Object.keys(keys).forEach(key => {
        if (key in this.store && this.store[key] !== undefined) {
          result[key] = this.store[key];
        }
      });
    }

    if (typeof callback === 'function') {
      try { callback(result); } catch (err) {}
    }
    return Promise.resolve(result);
  }

  set(items, callback) {
    const changes = {};
    if (items && typeof items === 'object') {
      Object.keys(items).forEach(key => {
        const oldValue = this.store[key];
        const newValue = items[key];
        if (oldValue !== newValue) {
          changes[key] = { oldValue, newValue };
          this.store[key] = newValue;
        }
      });
    }

    if (Object.keys(changes).length > 0 && this.onChangedEvent) {
      this.onChangedEvent.dispatch(changes, 'local');
    }

    if (typeof callback === 'function') {
      try { callback(); } catch (err) {}
    }
    return Promise.resolve();
  }

  remove(keys, callback) {
    const keysArray = Array.isArray(keys) ? keys : [keys];
    const changes = {};
    keysArray.forEach(key => {
      if (key in this.store) {
        changes[key] = { oldValue: this.store[key], newValue: undefined };
        delete this.store[key];
      }
    });

    if (Object.keys(changes).length > 0 && this.onChangedEvent) {
      this.onChangedEvent.dispatch(changes, 'local');
    }

    if (typeof callback === 'function') {
      try { callback(); } catch (err) {}
    }
    return Promise.resolve();
  }

  clear(callback) {
    const changes = {};
    Object.keys(this.store).forEach(key => {
      changes[key] = { oldValue: this.store[key], newValue: undefined };
    });
    this.store = {};

    if (Object.keys(changes).length > 0 && this.onChangedEvent) {
      this.onChangedEvent.dispatch(changes, 'local');
    }

    if (typeof callback === 'function') {
      try { callback(); } catch (err) {}
    }
    return Promise.resolve();
  }
}

class MockFirefoxEvent {
  constructor() {
    this.listeners = [];
  }

  addListener(callback) {
    if (typeof callback === 'function' && !this.listeners.includes(callback)) {
      this.listeners.push(callback);
    }
  }

  removeListener(callback) {
    this.listeners = this.listeners.filter(l => l !== callback);
  }

  hasListener(callback) {
    return this.listeners.includes(callback);
  }

  dispatch(...args) {
    const results = [];
    for (const listener of [...this.listeners]) {
      try {
        results.push(listener(...args));
      } catch (err) {
        console.error('Error in Firefox event listener:', err);
      }
    }
    return results;
  }
}

function loadFirefoxManifest() {
  try {
    const manifestPath = path.join(__dirname, '..', '..', 'manifest.firefox.json');
    const content = fs.readFileSync(manifestPath, 'utf8');
    return JSON.parse(content);
  } catch (e) {
    return {
      manifest_version: 3,
      name: "PDF Dark Mode - High Contrast Reader",
      version: "2.4.0",
      browser_specific_settings: {
        gecko: {
          id: "pdf-dark-mode@extension.org",
          strict_min_version: "109.0"
        }
      }
    };
  }
}

function createFirefoxMock(options = {}) {
  const localStorageArea = new MockFirefoxStorageArea();
  const storageOnChanged = new MockFirefoxEvent();
  localStorageArea.onChangedEvent = storageOnChanged;

  const runtimeOnInstalled = new MockFirefoxEvent();
  const runtimeOnMessage = new MockFirefoxEvent();
  const commandsOnCommand = new MockFirefoxEvent();
  const webNavigationOnBeforeNavigate = new MockFirefoxEvent();
  const webRequestOnHeadersReceived = new MockFirefoxEvent();
  const alarmsOnAlarm = new MockFirefoxEvent();

  const sentMessages = [];
  const tabsMap = new Map();
  const alarmsMap = new Map();
  let fileSchemeAllowed = true;
  let nextTabId = 1;

  tabsMap.set(1, { id: 1, active: true, currentWindow: true, url: 'https://example.com/doc.pdf', reloaded: false });

  const firefoxManifest = options.manifest || loadFirefoxManifest();

  const firefoxMock = {
    runtime: {
      getBrowserInfo: (callback) => {
        const info = { name: 'Firefox', vendor: 'Mozilla', version: '115.0', buildID: '20230701000000' };
        if (typeof callback === 'function') callback(info);
        return Promise.resolve(info);
      },
      getManifest: () => {
        return JSON.parse(JSON.stringify(firefoxManifest));
      },
      getURL: (pathStr) => `moz-extension://pdf-dark-firefox-id/${(pathStr || '').replace(/^\//, '')}`,
      sendMessage: (message, callback) => {
        sentMessages.push(message);
        let handled = false;
        let responseData = undefined;

        for (const listener of [...runtimeOnMessage.listeners]) {
          const sendResponse = (res) => {
            handled = true;
            responseData = res;
          };
          const result = listener(message, { tab: { id: 1, url: 'https://example.com' } }, sendResponse);
          if (result === true) {
            handled = true;
          }
        }

        if (typeof callback === 'function') callback(responseData);
        return Promise.resolve(responseData);
      },
      onInstalled: runtimeOnInstalled,
      onMessage: runtimeOnMessage,
      lastError: null
    },
    permissions: {
      contains: (permissionsObj, callback) => {
        let allowed = true;
        if (permissionsObj && Array.isArray(permissionsObj.permissions)) {
          if (permissionsObj.permissions.includes('file:///*')) {
            allowed = fileSchemeAllowed;
          }
        } else if (permissionsObj && Array.isArray(permissionsObj.origins)) {
          if (permissionsObj.origins.includes('file:///*')) {
            allowed = fileSchemeAllowed;
          }
        }
        if (typeof callback === 'function') callback(allowed);
        return Promise.resolve(allowed);
      }
    },
    storage: {
      local: localStorageArea,
      onChanged: storageOnChanged
    },
    tabs: {
      update: (tabId, updateProps, callback) => {
        const tab = tabsMap.get(tabId) || { id: tabId };
        Object.assign(tab, updateProps);
        tabsMap.set(tabId, tab);
        if (typeof callback === 'function') callback(tab);
        return Promise.resolve(tab);
      },
      query: (queryInfo, callback) => {
        const result = Array.from(tabsMap.values()).filter(tab => {
          for (const key in queryInfo) {
            if (tab[key] !== queryInfo[key]) return false;
          }
          return true;
        });
        if (typeof callback === 'function') callback(result);
        return Promise.resolve(result);
      },
      reload: (tabId, callback) => {
        const tab = tabsMap.get(tabId);
        if (tab) tab.reloaded = true;
        if (typeof callback === 'function') callback(tab);
        return Promise.resolve(tab);
      },
      get: (tabId, callback) => {
        const tab = tabsMap.get(tabId);
        if (typeof callback === 'function') callback(tab);
        return Promise.resolve(tab);
      },
      create: (createProps, callback) => {
        const id = nextTabId++;
        const tab = { id, active: true, currentWindow: true, ...createProps };
        tabsMap.set(id, tab);
        if (typeof callback === 'function') callback(tab);
        return Promise.resolve(tab);
      },
      sendMessage: (tabId, message, options, callback) => {
        if (typeof options === 'function') {
          callback = options;
          options = {};
        }
        sentMessages.push({ tabId, message });
        const res = { success: true };
        if (typeof callback === 'function') callback(res);
        return Promise.resolve(res);
      }
    },
    scripting: {
      executeScript: (details, callback) => {
        let executionResult = null;
        if (details && typeof details.func === 'function') {
          try {
            const args = details.args || [];
            executionResult = details.func(...args);
          } catch (e) {
            executionResult = null;
          }
        }

        return Promise.resolve(executionResult).then(res => {
          const formatted = [{ result: res }];
          if (typeof callback === 'function') callback(formatted);
          return formatted;
        });
      }
    },
    webRequest: {
      onHeadersReceived: {
        addListener: (callback, filter, extraOptSpec) => {
          webRequestOnHeadersReceived.addListener(callback);
        },
        removeListener: (callback) => {
          webRequestOnHeadersReceived.removeListener(callback);
        },
        hasListener: (callback) => webRequestOnHeadersReceived.hasListener(callback),
        dispatch: (...args) => webRequestOnHeadersReceived.dispatch(...args)
      }
    },
    webNavigation: {
      onBeforeNavigate: webNavigationOnBeforeNavigate
    },
    alarms: {
      create: (name, alarmInfo) => {
        alarmsMap.set(name, { name, ...alarmInfo });
        return Promise.resolve();
      },
      clear: (name, callback) => {
        const cleared = alarmsMap.delete(name);
        if (typeof callback === 'function') callback(cleared);
        return Promise.resolve(cleared);
      },
      get: (name, callback) => {
        const alarm = alarmsMap.get(name);
        if (typeof callback === 'function') callback(alarm);
        return Promise.resolve(alarm);
      },
      getAll: (callback) => {
        const list = Array.from(alarmsMap.values());
        if (typeof callback === 'function') callback(list);
        return Promise.resolve(list);
      },
      onAlarm: alarmsOnAlarm
    },
    commands: {
      onCommand: commandsOnCommand
    },
    extension: {
      isAllowedFileSchemeAccess: (callback) => {
        if (typeof callback === 'function') callback(fileSchemeAllowed);
        return Promise.resolve(fileSchemeAllowed);
      },
      getViews: () => []
    },

    __helpers: {
      reset: () => {
        localStorageArea.store = {};
        sentMessages.length = 0;
        storageOnChanged.listeners.length = 0;
        runtimeOnInstalled.listeners.length = 0;
        runtimeOnMessage.listeners.length = 0;
        commandsOnCommand.listeners.length = 0;
        webNavigationOnBeforeNavigate.listeners.length = 0;
        webRequestOnHeadersReceived.listeners.length = 0;
        alarmsOnAlarm.listeners.length = 0;
        tabsMap.clear();
        alarmsMap.clear();
        nextTabId = 1;
        tabsMap.set(1, { id: 1, active: true, currentWindow: true, url: 'https://example.com/doc.pdf', reloaded: false });
        fileSchemeAllowed = true;
      },
      setFileSchemeAccess: (allowed) => {
        fileSchemeAllowed = Boolean(allowed);
      },
      getSentMessages: () => [...sentMessages],
      setTab: (tabId, tabData) => {
        tabsMap.set(tabId, { id: tabId, ...tabData });
      },
      getTab: (tabId) => tabsMap.get(tabId),
      getAllTabs: () => Array.from(tabsMap.values())
    }
  };

  return firefoxMock;
}

class MockSpeechSynthesisUtterance {
  constructor(text = '') {
    this.text = text;
    this.lang = 'en-US';
    this.voice = null;
    this.volume = 1.0;
    this.rate = 1.0;
    this.pitch = 1.0;
    this.onstart = null;
    this.onend = null;
    this.onerror = null;
    this.onpause = null;
    this.onresume = null;
    this.onboundary = null;
    this._eventListeners = {};
  }

  addEventListener(type, listener) {
    if (!this._eventListeners[type]) {
      this._eventListeners[type] = [];
    }
    if (!this._eventListeners[type].includes(listener)) {
      this._eventListeners[type].push(listener);
    }
  }

  removeEventListener(type, listener) {
    if (this._eventListeners[type]) {
      this._eventListeners[type] = this._eventListeners[type].filter(l => l !== listener);
    }
  }

  _dispatchEvent(type, eventObj) {
    if (typeof this[`on${type}`] === 'function') {
      try { this[`on${type}`](eventObj); } catch (e) {}
    }
    if (this._eventListeners[type]) {
      for (const fn of [...this._eventListeners[type]]) {
        try { fn(eventObj); } catch (e) {}
      }
    }
  }
}

class MockSpeechSynthesis {
  constructor() {
    this.speaking = false;
    this.paused = false;
    this.pending = false;
    this.onvoiceschanged = null;
    this.queue = [];
    this.currentUtterance = null;
    this.autoFinish = false;
    this._voices = [
      { name: 'Alex', lang: 'en-US', voiceURI: 'Alex', default: true },
      { name: 'Victoria', lang: 'en-US', voiceURI: 'Victoria', default: false }
    ];
  }

  getVoices() {
    return this._voices;
  }

  speak(utterance) {
    if (!utterance) return;
    this.queue.push(utterance);
    this.pending = this.queue.length > 1;

    if (!this.speaking && !this.paused) {
      this._processQueue();
    }
  }

  _processQueue() {
    if (this.queue.length === 0) {
      this.speaking = false;
      this.pending = false;
      this.currentUtterance = null;
      return;
    }

    const utt = this.queue.shift();
    this.currentUtterance = utt;
    this.speaking = true;
    this.pending = this.queue.length > 0;

    utt._dispatchEvent('start', { type: 'start', utterance: utt });
    utt._dispatchEvent('boundary', { type: 'boundary', name: 'word', charIndex: 0, utterance: utt });

    if (this.autoFinish) {
      this.finishCurrentUtterance();
    }
  }

  finishCurrentUtterance() {
    if (!this.currentUtterance) return;
    const utt = this.currentUtterance;
    this.speaking = false;
    this.currentUtterance = null;

    utt._dispatchEvent('end', { type: 'end', utterance: utt });

    if (!this.paused && this.queue.length > 0) {
      this._processQueue();
    }
  }

  cancel() {
    this.speaking = false;
    this.paused = false;
    this.pending = false;
    this.queue = [];
    this.currentUtterance = null;
  }
}

let savedGlobalState = null;

function setupGlobalFirefoxMock() {
  savedGlobalState = {
    browser: global.browser,
    chrome: global.chrome,
    speechSynthesis: global.speechSynthesis,
    SpeechSynthesisUtterance: global.SpeechSynthesisUtterance,
    __activeUtteranceGuard: globalThis.__activeUtteranceGuard
  };

  const mock = createFirefoxMock();

  global.browser = mock;
  globalThis.browser = mock;
  global.chrome = mock;
  globalThis.chrome = mock;

  const mockSynth = new MockSpeechSynthesis();
  global.speechSynthesis = mockSynth;
  globalThis.speechSynthesis = mockSynth;

  global.SpeechSynthesisUtterance = MockSpeechSynthesisUtterance;
  globalThis.SpeechSynthesisUtterance = MockSpeechSynthesisUtterance;

  globalThis.__activeUtteranceGuard = new Set();

  return mock;
}

function teardownGlobalFirefoxMock() {
  if (!savedGlobalState) return;

  if (savedGlobalState.browser !== undefined) {
    global.browser = savedGlobalState.browser;
    globalThis.browser = savedGlobalState.browser;
  } else {
    delete global.browser;
    delete globalThis.browser;
  }

  if (savedGlobalState.chrome !== undefined) {
    global.chrome = savedGlobalState.chrome;
    globalThis.chrome = savedGlobalState.chrome;
  } else {
    delete global.chrome;
    delete globalThis.chrome;
  }

  if (savedGlobalState.speechSynthesis !== undefined) {
    global.speechSynthesis = savedGlobalState.speechSynthesis;
    globalThis.speechSynthesis = savedGlobalState.speechSynthesis;
  } else {
    delete global.speechSynthesis;
    delete globalThis.speechSynthesis;
  }

  if (savedGlobalState.SpeechSynthesisUtterance !== undefined) {
    global.SpeechSynthesisUtterance = savedGlobalState.SpeechSynthesisUtterance;
    globalThis.SpeechSynthesisUtterance = savedGlobalState.SpeechSynthesisUtterance;
  } else {
    delete global.SpeechSynthesisUtterance;
    delete globalThis.SpeechSynthesisUtterance;
  }

  if (savedGlobalState.__activeUtteranceGuard !== undefined) {
    globalThis.__activeUtteranceGuard = savedGlobalState.__activeUtteranceGuard;
  } else {
    delete globalThis.__activeUtteranceGuard;
  }

  savedGlobalState = null;
}

module.exports = {
  createFirefoxMock,
  setupGlobalFirefoxMock,
  teardownGlobalFirefoxMock,
  MockSpeechSynthesisUtterance,
  MockSpeechSynthesis
};
