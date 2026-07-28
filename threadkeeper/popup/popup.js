/* Threadkeeper — popup/popup.js
 * Controller: shared utilities, tab switching, and the History tab. Each other tab
 * lives in its own module (TK.popup.single / .bulk / .settings) with a show() hook. */
(function () {
  "use strict";
  window.TK = window.TK || {};
  TK.popup = TK.popup || {};

  // ---- Content-script injection support --------------------------------------
  // Must stay in sync with manifest.json > content_scripts[0].js (same order).
  var CONTENT_FILES = [
    "shared/base64.js",
    "shared/idle-chunk.js",
    "shared/storage.js",
    "content/adapters/chatgpt.js",
    "content/adapters/claude.js",
    "content/adapters/gemini.js",
    "content/extractor.js",
    "render/markdown.js",
    "render/html.js",
    "render/pdf.js",
    "content/export-button.js",
    "content/main.js"
  ];

  var SUPPORTED_HOSTS = /^https:\/\/(chatgpt\.com|chat\.openai\.com|claude\.ai|gemini\.google\.com)\//i;

  function isSupportedUrl(url) { return !!url && SUPPORTED_HOSTS.test(url); }

  function wait(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

  function ping(tabId) {
    return new Promise(function (resolve) {
      try {
        chrome.tabs.sendMessage(tabId, { type: "PING" }, function (resp) {
          if (chrome.runtime.lastError) { resolve(false); return; }
          resolve(!!(resp && resp.ready));
        });
      } catch (e) { resolve(false); }
    });
  }

  // ---- Shared utilities used by the tab modules ------------------------------

  TK.popup.util = {
    getActiveTab: function () {
      return new Promise(function (resolve) {
        chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
          resolve(tabs && tabs[0] ? tabs[0] : null);
        });
      });
    },
    sendToTab: function (tabId, msg) {
      return new Promise(function (resolve, reject) {
        try {
          chrome.tabs.sendMessage(tabId, msg, function (resp) {
            if (chrome.runtime.lastError) { reject(new Error(chrome.runtime.lastError.message)); return; }
            resolve(resp);
          });
        } catch (e) { reject(e); }
      });
    },

    isSupportedUrl: isSupportedUrl,

    /**
     * Chrome only auto-injects content scripts into pages loaded AFTER the
     * extension was installed/updated. A tab that was already open therefore has
     * no content script and can't answer messages. Rather than making the user
     * reload, we detect that case and inject on demand with chrome.scripting.
     * Resolves to 'ready' | 'unsupported' | 'failed'.
     */
    ensureContentScript: async function (tabId, url) {
      if (!isSupportedUrl(url)) return "unsupported";
      if (await ping(tabId)) return "ready";
      try {
        await new Promise(function (resolve, reject) {
          chrome.scripting.executeScript({ target: { tabId: tabId }, files: CONTENT_FILES }, function () {
            if (chrome.runtime.lastError) { reject(new Error(chrome.runtime.lastError.message)); return; }
            resolve();
          });
        });
      } catch (e) {
        return "failed";
      }
      // Give the freshly injected scripts a moment to register their listener.
      for (var i = 0; i < 8; i++) {
        if (await ping(tabId)) return "ready";
        await wait(120);
      }
      return "failed";
    },
    getRadio: function (name) {
      var el = document.querySelector('input[name="' + name + '"]:checked');
      return el ? el.value : null;
    },
    setRadio: function (name, val) {
      var el = document.querySelector('input[name="' + name + '"][value="' + val + '"]');
      if (el) el.checked = true;
    },
    download: function (blob, filename) {
      var url = URL.createObjectURL(blob);
      var a = document.createElement("a");
      a.href = url;
      a.download = filename;
      a.style.display = "none";
      document.body.appendChild(a);
      a.click();
      setTimeout(function () {
        try { document.body.removeChild(a); } catch (e) {}
        URL.revokeObjectURL(url);
      }, 4000);
    }
  };

  // ---- Tab switching ---------------------------------------------------------

  var tabButtons, panels;

  function switchTab(name) {
    tabButtons.forEach(function (b) { b.classList.toggle("is-active", b.dataset.tab === name); });
    panels.forEach(function (p) { p.classList.toggle("is-active", p.id === "panel-" + name); });
    var mod = TK.popup[name];
    if (mod && typeof mod.show === "function") {
      try { mod.show(); } catch (e) { /* keep the popup responsive */ }
    }
    if (name === "history") renderHistory();
  }

  // ---- History tab -----------------------------------------------------------

  async function renderHistory() {
    var listEl = document.getElementById("history-list");
    var emptyEl = document.getElementById("history-empty");
    var items = await TK.storage.getHistory();
    listEl.innerHTML = "";
    if (!items.length) {
      emptyEl.hidden = false;
      return;
    }
    emptyEl.hidden = true;
    items.forEach(function (it) {
      var row = document.createElement("div");
      row.className = "tk-hist";

      var left = document.createElement("div");
      left.className = "h-title";
      var badge = document.createElement("span");
      badge.className = "tk-badge";
      badge.textContent = it.format === "pdf" ? "PDF" : it.format === "html" ? "HTML" : "MD";
      left.appendChild(badge);
      left.appendChild(document.createTextNode(it.title || "Conversation"));
      left.title = it.title || "";

      var meta = document.createElement("div");
      meta.className = "h-meta";
      meta.textContent = prettySite(it.site) + " · " + relTime(it.ts);

      row.appendChild(left);
      row.appendChild(meta);
      listEl.appendChild(row);
    });
  }

  function prettySite(s) {
    return s === "chatgpt" ? "ChatGPT" : s === "claude" ? "Claude" : s === "gemini" ? "Gemini" : (s || "");
  }

  function relTime(ts) {
    if (!ts) return "";
    var diff = Date.now() - ts;
    var sec = Math.floor(diff / 1000);
    if (sec < 60) return "just now";
    var min = Math.floor(sec / 60);
    if (min < 60) return min + "m ago";
    var hr = Math.floor(min / 60);
    if (hr < 24) return hr + "h ago";
    var day = Math.floor(hr / 24);
    if (day < 7) return day + "d ago";
    var d = new Date(ts);
    return d.toLocaleDateString();
  }

  // ---- Boot ------------------------------------------------------------------

  function boot() {
    tabButtons = Array.prototype.slice.call(document.querySelectorAll(".tk-tab"));
    panels = Array.prototype.slice.call(document.querySelectorAll(".tk-panel"));
    tabButtons.forEach(function (b) {
      b.addEventListener("click", function () { switchTab(b.dataset.tab); });
    });
    var clear = document.getElementById("history-clear");
    if (clear) clear.addEventListener("click", async function () {
      await TK.storage.clearHistory();
      renderHistory();
    });
    // Show the default tab.
    switchTab("single");
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
