/* Threadkeeper — shared/storage.js
 * Thin wrapper around chrome.storage. Settings live in sync; the export-history log
 * (metadata only, capped at 20) lives in local. Safe defaults everywhere. */
(function () {
  "use strict";
  window.TK = window.TK || {};

  var DEFAULTS = {
    format: "markdown",        // 'markdown' | 'html' | 'pdf'
    scope: "full",             // 'full' | 'user' | 'assistant'
    includeTimestamps: false,
    includeRoleLabels: true,
    imageMode: "embed",        // 'embed' | 'reference'
    bulkOutput: "zip",         // 'zip' | 'individual'
    autoCapture: false         // auto-archive open conversations to the Library
  };

  var HISTORY_KEY = "tk_history";
  var HISTORY_MAX = 20;

  function getSettings() {
    return new Promise(function (resolve) {
      try {
        chrome.storage.sync.get(DEFAULTS, function (items) {
          if (chrome.runtime.lastError || !items) return resolve(Object.assign({}, DEFAULTS));
          resolve(Object.assign({}, DEFAULTS, items));
        });
      } catch (e) {
        resolve(Object.assign({}, DEFAULTS));
      }
    });
  }

  function saveSettings(partial) {
    return new Promise(function (resolve) {
      try {
        chrome.storage.sync.set(partial, function () { resolve(); });
      } catch (e) { resolve(); }
    });
  }

  function getHistory() {
    return new Promise(function (resolve) {
      try {
        chrome.storage.local.get([HISTORY_KEY], function (items) {
          if (chrome.runtime.lastError || !items || !items[HISTORY_KEY]) return resolve([]);
          resolve(items[HISTORY_KEY]);
        });
      } catch (e) { resolve([]); }
    });
  }

  /** entry: { title, site, format, count, ts } */
  async function addHistory(entry) {
    var list = await getHistory();
    list.unshift(entry);
    if (list.length > HISTORY_MAX) list = list.slice(0, HISTORY_MAX);
    return new Promise(function (resolve) {
      try {
        var o = {}; o[HISTORY_KEY] = list;
        chrome.storage.local.set(o, function () { resolve(list); });
      } catch (e) { resolve(list); }
    });
  }

  function clearHistory() {
    return new Promise(function (resolve) {
      try {
        var o = {}; o[HISTORY_KEY] = [];
        chrome.storage.local.set(o, function () { resolve(); });
      } catch (e) { resolve(); }
    });
  }

  TK.storage = {
    DEFAULTS: DEFAULTS,
    getSettings: getSettings,
    saveSettings: saveSettings,
    getHistory: getHistory,
    addHistory: addHistory,
    clearHistory: clearHistory
  };
})();
