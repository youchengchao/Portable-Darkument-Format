/**
 * Chrome API Mock Infrastructure for Portable-Darkument-Format E2E & Unit Testing
 * Implements robust in-memory mocks for:
 * - chrome.storage.local & chrome.storage.onChanged
 * - chrome.runtime
 * - chrome.webNavigation
 * - chrome.webRequest
 * - chrome.tabs
 * - chrome.extension
 */

class MockStorageArea {
  constructor() {
    this.store = {};
    this.onChangedListeners = new Set();
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
      callback(result);
    }
    return Promise.resolve(result);
  }

  set(items, callback) {
    const changes = {};
    Object.keys(items).forEach(key => {
      const oldValue = this.store[key];
      const newValue = items[key];
      if (oldValue !== newValue) {
        changes[key] = { oldValue, newValue };
        this.store[key] = newValue;
      }
    });

    if (Object.keys(changes).length > 0) {
      this._notifyOnChanged(changes);
    }

    if (typeof callback === 'function') {
      callback();
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

    if (Object.keys(changes).length > 0) {
      this._notifyOnChanged(changes);
    }

    if (typeof callback === 'function') {
      callback();
    }
    return Promise.resolve();
  }

  clear(callback) {
    const changes = {};
    Object.keys(this.store).forEach(key => {
      changes[key] = { oldValue: this.store[key], newValue: undefined };
    });
    this.store = {};

    if (Object.keys(changes).length > 0) {
      this._notifyOnChanged(changes);
    }

    if (typeof callback === 'function') {
      callback();
    }
    return Promise.resolve();
  }

  _notifyOnChanged(changes) {
    if (this.onChangedEvent) {
      this.onChangedEvent.dispatch(changes, 'local');
    } else if (this.onChangedListeners) {
      this.onChangedListeners.forEach(listener => {
        try {
          listener(changes, 'local');
        } catch (err) {
          console.error('Error in storage.onChanged listener:', err);
        }
      });
    }
  }
}

class MockEvent {
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
        console.error('Error in event listener:', err);
      }
    }
    return results;
  }
}

function createChromeMock() {
  const localStorageArea = new MockStorageArea();
  const storageOnChanged = new MockEvent();
  localStorageArea.onChangedEvent = storageOnChanged;
  localStorageArea.onChangedListeners = storageOnChanged.listeners;

  const runtimeOnInstalled = new MockEvent();
  const runtimeOnMessage = new MockEvent();
  const webNavigationOnBeforeNavigate = new MockEvent();
  const webRequestOnHeadersReceived = new MockEvent();
  const alarmsOnAlarm = new MockEvent();

  const sentMessages = [];
  const tabsMap = new Map();
  const alarmsMap = new Map();
  let fileSchemeAllowed = true;
  let nextTabId = 1;

  // Pre-seed tab 1
  tabsMap.set(1, { id: 1, active: true, currentWindow: true, url: 'https://example.com/doc.pdf', reloaded: false });

  const chromeMock = {
    alarms: {
      create: (name, alarmInfo) => {
        alarmsMap.set(name, { name, ...alarmInfo });
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
    storage: {
      local: localStorageArea,
      onChanged: storageOnChanged
    },
    runtime: {
      onInstalled: runtimeOnInstalled,
      onMessage: runtimeOnMessage,
      sendMessage: (message, callback) => {
        sentMessages.push(message);
        let handled = false;
        let responseData = undefined;

        runtimeOnMessage.listeners.forEach(listener => {
          const sendResponse = (res) => {
            handled = true;
            responseData = res;
          };
          const result = listener(message, { tab: { id: 1, url: 'https://example.com' } }, sendResponse);
          if (result === true) {
            handled = true;
          }
        });

        if (typeof callback === 'function') {
          callback(responseData);
        }
        return Promise.resolve(responseData);
      },
      getURL: (path) => `chrome-extension://pdf-dark-mock-id/${path.replace(/^\//, '')}`
    },
    webNavigation: {
      onBeforeNavigate: webNavigationOnBeforeNavigate
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
      }
    },
    extension: {
      isAllowedFileSchemeAccess: (callback) => {
        if (typeof callback === 'function') callback(fileSchemeAllowed);
        return Promise.resolve(fileSchemeAllowed);
      },
      getViews: () => []
    },

    // Mock management utilities
    __helpers: {
      reset: () => {
        localStorageArea.store = {};
        sentMessages.length = 0;
        storageOnChanged.listeners.length = 0;
        runtimeOnInstalled.listeners.length = 0;
        runtimeOnMessage.listeners.length = 0;
        webNavigationOnBeforeNavigate.listeners.length = 0;
        webRequestOnHeadersReceived.listeners.length = 0;
        tabsMap.clear();
        nextTabId = 1;
        tabsMap.set(1, { id: 1, active: true, currentWindow: true, url: 'https://example.com/doc.pdf', reloaded: false });
        fileSchemeAllowed = true;
      },
      setFileSchemeAccess: (allowed) => {
        fileSchemeAllowed = allowed;
      },
      getSentMessages: () => [...sentMessages],
      setTab: (tabId, tabData) => {
        tabsMap.set(tabId, { id: tabId, ...tabData });
      },
      getTab: (tabId) => tabsMap.get(tabId),
      getAllTabs: () => Array.from(tabsMap.values())
    }
  };

  return chromeMock;
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
      { name: 'Victoria', lang: 'en-US', voiceURI: 'Victoria', default: false },
      { name: 'Google US English', lang: 'en-US', voiceURI: 'Google US English', default: false }
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

    if (typeof utt.onstart === 'function') {
      try { utt.onstart({ type: 'start', utterance: utt }); } catch (e) {}
    }

    if (typeof utt.onboundary === 'function') {
      try { utt.onboundary({ type: 'boundary', name: 'word', charIndex: 0, utterance: utt }); } catch (e) {}
    }

    if (this.autoFinish) {
      this.finishCurrentUtterance();
    }
  }

  finishCurrentUtterance() {
    if (!this.currentUtterance) return;
    const utt = this.currentUtterance;
    this.speaking = false;
    this.currentUtterance = null;
    if (typeof utt.onend === 'function') {
      try { utt.onend({ type: 'end', utterance: utt }); } catch (e) {}
    }
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

  pause() {
    if (this.speaking && !this.paused) {
      this.paused = true;
      this.speaking = false;
      if (this.currentUtterance && typeof this.currentUtterance.onpause === 'function') {
        try { this.currentUtterance.onpause({ type: 'pause', utterance: this.currentUtterance }); } catch (e) {}
      }
    }
  }

  resume() {
    if (this.paused) {
      this.paused = false;
      if (this.currentUtterance) {
        this.speaking = true;
        if (typeof this.currentUtterance.onresume === 'function') {
          try { this.currentUtterance.onresume({ type: 'resume', utterance: this.currentUtterance }); } catch (e) {}
        }
      } else {
        this._processQueue();
      }
    }
  }
}

// Function to install chrome mock into global scope
function setupGlobalChromeMock() {
  const mock = createChromeMock();
  global.chrome = mock;
  globalThis.chrome = mock;

  const mockSynth = new MockSpeechSynthesis();
  global.speechSynthesis = mockSynth;
  global.SpeechSynthesisUtterance = MockSpeechSynthesisUtterance;

  if (typeof globalThis !== 'undefined') {
    globalThis.speechSynthesis = mockSynth;
    globalThis.SpeechSynthesisUtterance = MockSpeechSynthesisUtterance;
  }
  if (typeof window !== 'undefined') {
    window.speechSynthesis = mockSynth;
    window.SpeechSynthesisUtterance = MockSpeechSynthesisUtterance;
  }

  return mock;
}

module.exports = {
  createChromeMock,
  setupGlobalChromeMock,
  MockSpeechSynthesisUtterance,
  MockSpeechSynthesis
};

