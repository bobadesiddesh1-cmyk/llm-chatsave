/* Threadkeeper — popup/tabs/single.js
 * Single-conversation export tab. Talks to the active tab's content script, which
 * does the actual extraction + download/print. */
(function () {
  "use strict";
  window.TK = window.TK || {};
  TK.popup = TK.popup || {};

  var els = {};
  var initialized = false;
  var current = null;   // last-loaded settings
  var tabId = null;

  function grab() {
    els.unsupported = document.getElementById("single-unsupported");
    els.form = document.getElementById("single-form");
    els.title = document.getElementById("single-title");
    els.count = document.getElementById("single-count");
    els.timestamps = document.getElementById("single-timestamps");
    els.rolelabels = document.getElementById("single-rolelabels");
    els.exportBtn = document.getElementById("single-export");
    els.result = document.getElementById("single-result");
  }

  function initOnce() {
    if (initialized) return;
    grab();
    els.exportBtn.addEventListener("click", onExport);
    initialized = true;
  }

  async function show() {
    initOnce();
    var u = TK.popup.util;
    els.result.hidden = true;
    current = await TK.storage.getSettings();
    u.setRadio("format", current.format);
    u.setRadio("scope", current.scope);
    els.timestamps.checked = !!current.includeTimestamps;
    els.rolelabels.checked = !!current.includeRoleLabels;

    var tab = await u.getActiveTab();
    if (!tab) { showUnsupported(); return; }
    tabId = tab.id;
    try {
      var status = await u.sendToTab(tab.id, { type: "GET_STATUS" });
      if (!status || !status.supported) { showUnsupported(); return; }
      els.unsupported.hidden = true;
      els.form.hidden = false;
      var title = status.title || "Conversation";
      els.title.textContent = title;
      els.title.title = title;
      var n = status.messageCount || 0;
      if (status.probableFailure) {
        els.count.textContent = "Couldn't detect messages — try scrolling the chat, then reopen.";
      } else {
        els.count.textContent = n + " message" + (n === 1 ? "" : "s") + " detected";
      }
    } catch (e) {
      showUnsupported();
    }
  }

  function showUnsupported() {
    els.unsupported.hidden = false;
    els.form.hidden = true;
  }

  async function onExport() {
    var u = TK.popup.util;
    var settings = {
      format: u.getRadio("format") || "markdown",
      scope: u.getRadio("scope") || "full",
      includeTimestamps: els.timestamps.checked,
      includeRoleLabels: els.rolelabels.checked,
      imageMode: (current && current.imageMode) || "embed"
    };
    await TK.storage.saveSettings(settings);

    els.exportBtn.disabled = true;
    if (settings.format === "pdf") {
      showResult("Opening the print dialog in the page… choose “Save as PDF”.", "ok");
    } else {
      showResult("Exporting…", "ok");
    }

    try {
      var res = await u.sendToTab(tabId, { type: "EXPORT", settings: settings });
      if (res && res.ok) {
        showResult("Exported ✓", "ok", res.warnings);
      } else {
        showResult("Export failed: " + ((res && res.error) || "unknown error"), "err");
      }
    } catch (e) {
      // For PDF the popup often closes as the print dialog opens; that's expected.
      if (settings.format === "pdf") {
        showResult("Print dialog opened in the page.", "ok");
      } else {
        showResult("Export failed: " + String(e && e.message || e), "err");
      }
    } finally {
      els.exportBtn.disabled = false;
    }
  }

  function showResult(text, kind, warnings) {
    els.result.hidden = false;
    els.result.className = "tk-result " + (kind || "ok");
    els.result.textContent = text;
    var w = warnText(warnings);
    if (w) {
      var span = document.createElement("span");
      span.className = "tk-warn";
      span.textContent = w;
      els.result.appendChild(span);
    }
  }

  function warnText(w) {
    if (!w) return "";
    var parts = [];
    if (w.fallbackCount > 0) parts.push(w.fallbackCount + " element" + (w.fallbackCount > 1 ? "s" : "") + " used fallback text extraction");
    if (w.imageFailures > 0) parts.push(w.imageFailures + " image" + (w.imageFailures > 1 ? "s" : "") + " couldn't be embedded (kept original URL)");
    return parts.join(" · ");
  }

  TK.popup.single = { show: show };
})();
