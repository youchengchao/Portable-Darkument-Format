(function () {
  'use strict';

  // Safe reference to root global object across Browser environments, Web Workers, Node.js
  const root = (typeof globalThis !== 'undefined')
    ? globalThis
    : (typeof window !== 'undefined')
      ? window
      : (typeof self !== 'undefined')
        ? self
        : (typeof global !== 'undefined')
          ? global
          : this;

  // Polyfill globalThis.browser = globalThis.browser || globalThis.chrome;
  if (typeof root.browser === 'undefined' && typeof root.chrome !== 'undefined') {
    root.browser = root.chrome;
  }

  const BrowserCompat = {
    /**
     * Safely feature-detect extension file scheme access.
     * In Chrome: uses chrome.extension.isAllowedFileSchemeAccess.
     * In Firefox MV3: uses browser.permissions.contains or fallback true to avoid deprecation warnings.
     * Supports both callback parameter and Promise return.
     * @param {function} [callback]
     * @returns {Promise<boolean>}
     */
    isAllowedFileSchemeAccess: function (callback) {
      return new Promise((resolve) => {
        let called = false;
        const handleResult = (res) => {
          if (called) return;
          called = true;
          const allowed = (typeof res === 'boolean') ? res : true;
          if (typeof callback === 'function') {
            try {
              callback(allowed);
            } catch (e) {
              console.error('Error in isAllowedFileSchemeAccess callback:', e);
            }
          }
          resolve(allowed);
        };

        const browserObj = root.browser || root.chrome;

        if (browserObj && browserObj.extension && typeof browserObj.extension.isAllowedFileSchemeAccess === 'function') {
          try {
            const ret = browserObj.extension.isAllowedFileSchemeAccess((res) => {
              handleResult(res);
            });
            if (ret && typeof ret.then === 'function') {
              ret.then(res => handleResult(res)).catch(() => handleResult(true));
            }
          } catch (e) {
            handleResult(true);
          }
        } else if (browserObj && browserObj.permissions && typeof browserObj.permissions.contains === 'function') {
          try {
            const ret = browserObj.permissions.contains({ permissions: ['file:///*'] }, (res) => {
              handleResult(res);
            });
            if (ret && typeof ret.then === 'function') {
              ret.then(res => handleResult(res)).catch(() => handleResult(true));
            }
          } catch (e) {
            handleResult(true);
          }
        } else {
          handleResult(true);
        }
      });
    },

    /**
     * Storage local wrapper supporting callback and Promise usage patterns.
     */
    storage: {
      local: {
        get: function (keys, callback) {
          if (typeof keys === 'function') {
            callback = keys;
            keys = null;
          }
          return new Promise((resolve, reject) => {
            let called = false;
            const handleResult = (err, result) => {
              if (called) return;
              called = true;
              if (err) {
                if (typeof callback === 'function') callback(null);
                reject(err);
              } else {
                if (typeof callback === 'function') callback(result);
                resolve(result);
              }
            };

            const storageLocal = (root.browser && root.browser.storage && root.browser.storage.local) ||
                                 (root.chrome && root.chrome.storage && root.chrome.storage.local);

            if (!storageLocal || typeof storageLocal.get !== 'function') {
              handleResult(null, {});
              return;
            }

            try {
              const ret = storageLocal.get(keys, (result) => {
                const err = (root.chrome && root.chrome.runtime && root.chrome.runtime.lastError) ||
                            (root.browser && root.browser.runtime && root.browser.runtime.lastError);
                if (err) {
                  handleResult(err, null);
                } else {
                  handleResult(null, result);
                }
              });

              if (ret && typeof ret.then === 'function') {
                ret.then((res) => {
                  handleResult(null, res);
                }).catch((err) => {
                  handleResult(err, null);
                });
              }
            } catch (e) {
              handleResult(e, null);
            }
          });
        },

        set: function (items, callback) {
          return new Promise((resolve, reject) => {
            let called = false;
            const handleResult = (err) => {
              if (called) return;
              called = true;
              if (err) {
                if (typeof callback === 'function') callback();
                reject(err);
              } else {
                if (typeof callback === 'function') callback();
                resolve();
              }
            };

            const storageLocal = (root.browser && root.browser.storage && root.browser.storage.local) ||
                                 (root.chrome && root.chrome.storage && root.chrome.storage.local);

            if (!storageLocal || typeof storageLocal.set !== 'function') {
              handleResult(null);
              return;
            }

            try {
              const ret = storageLocal.set(items, () => {
                const err = (root.chrome && root.chrome.runtime && root.chrome.runtime.lastError) ||
                            (root.browser && root.browser.runtime && root.browser.runtime.lastError);
                handleResult(err);
              });

              if (ret && typeof ret.then === 'function') {
                ret.then(() => {
                  handleResult(null);
                }).catch((err) => {
                  handleResult(err);
                });
              }
            } catch (e) {
              handleResult(e);
            }
          });
        },

        remove: function (keys, callback) {
          return new Promise((resolve, reject) => {
            let called = false;
            const handleResult = (err) => {
              if (called) return;
              called = true;
              if (err) {
                if (typeof callback === 'function') callback();
                reject(err);
              } else {
                if (typeof callback === 'function') callback();
                resolve();
              }
            };

            const storageLocal = (root.browser && root.browser.storage && root.browser.storage.local) ||
                                 (root.chrome && root.chrome.storage && root.chrome.storage.local);

            if (!storageLocal || typeof storageLocal.remove !== 'function') {
              handleResult(null);
              return;
            }

            try {
              const ret = storageLocal.remove(keys, () => {
                const err = (root.chrome && root.chrome.runtime && root.chrome.runtime.lastError) ||
                            (root.browser && root.browser.runtime && root.browser.runtime.lastError);
                handleResult(err);
              });

              if (ret && typeof ret.then === 'function') {
                ret.then(() => {
                  handleResult(null);
                }).catch((err) => {
                  handleResult(err);
                });
              }
            } catch (e) {
              handleResult(e);
            }
          });
        }
      }
    },

    /**
     * Prevents Firefox garbage collection of active SpeechSynthesisUtterance objects mid-sentence.
     * Binds utterance to globalThis.__activeUtteranceGuard set/array.
     * @param {SpeechSynthesisUtterance} utterance
     * @returns {SpeechSynthesisUtterance}
     */
    protectUtterance: function (utterance) {
      if (!utterance) return utterance;

      if (!root.__activeUtteranceGuard) {
        root.__activeUtteranceGuard = new Set();
      }

      if (root.__activeUtteranceGuard instanceof Set) {
        root.__activeUtteranceGuard.add(utterance);
      } else if (Array.isArray(root.__activeUtteranceGuard)) {
        root.__activeUtteranceGuard.push(utterance);
      }

      const cleanup = () => {
        if (root.__activeUtteranceGuard) {
          if (typeof root.__activeUtteranceGuard.delete === 'function') {
            root.__activeUtteranceGuard.delete(utterance);
          } else if (Array.isArray(root.__activeUtteranceGuard)) {
            const idx = root.__activeUtteranceGuard.indexOf(utterance);
            if (idx !== -1) {
              root.__activeUtteranceGuard.splice(idx, 1);
            }
          }
        }
      };

      if (typeof utterance.addEventListener === 'function') {
        utterance.addEventListener('end', cleanup);
        utterance.addEventListener('error', cleanup);
      }

      ['onend', 'onerror'].forEach((evtProp) => {
        let userHandler = utterance[evtProp];
        const makeWrapped = (fn) => {
          return function (...args) {
            cleanup();
            if (typeof fn === 'function') {
              fn.apply(this, args);
            }
          };
        };

        let activeHandler = makeWrapped(userHandler);

        try {
          Object.defineProperty(utterance, evtProp, {
            configurable: true,
            enumerable: true,
            get() {
              return activeHandler;
            },
            set(newHandler) {
              userHandler = newHandler;
              activeHandler = makeWrapped(newHandler);
            }
          });
        } catch (e) {
          // Ignore if defineProperty is restricted
        }
      });

      return utterance;
    }
  };

  root.BrowserCompat = BrowserCompat;

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = BrowserCompat;
  }
})();
