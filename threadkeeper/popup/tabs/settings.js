/* Threadkeeper — popup/tabs/settings.js
 * Default preferences, persisted to chrome.storage.sync. Auto-saves on change. */
(function () {
  "use strict";
  window.TK = window.TK || {};
  TK.popup = TK.popup || {};

  var els = {};
  var initialized = false;
  var savedTimer = null;

  function grab() {
    els.timestamps = document.getElementById("set-timestamps");
    els.rolelabels = document.getElementById("set-rolelabels");
    els.saved = document.getElementById("settings-saved");
  }

  function initOnce() {
    if (initialized) return;
    grab();
    // Radio groups + checkboxes all trigger a save on change.
    ["sformat", "sscope", "simage", "sbulk"].forEach(function (name) {
      document.querySelectorAll('input[name="' + name + '"]').forEach(function (r) {
        r.addEventListener("change", save);
      });
    });
    els.timestamps.addEventListener("change", save);
    els.rolelabels.addEventListener("change", save);
    initialized = true;
  }

  async function show() {
    initOnce();
    var u = TK.popup.util;
    var s = await TK.storage.getSettings();
    u.setRadio("sformat", s.format);
    u.setRadio("sscope", s.scope);
    u.setRadio("simage", s.imageMode);
    u.setRadio("sbulk", s.bulkOutput);
    els.timestamps.checked = !!s.includeTimestamps;
    els.rolelabels.checked = !!s.includeRoleLabels;
  }

  async function save() {
    var u = TK.popup.util;
    var settings = {
      format: u.getRadio("sformat") || "markdown",
      scope: u.getRadio("sscope") || "full",
      imageMode: u.getRadio("simage") || "embed",
      bulkOutput: u.getRadio("sbulk") || "zip",
      includeTimestamps: els.timestamps.checked,
      includeRoleLabels: els.rolelabels.checked
    };
    await TK.storage.saveSettings(settings);
    flashSaved();
  }

  function flashSaved() {
    els.saved.classList.add("show");
    if (savedTimer) clearTimeout(savedTimer);
    savedTimer = setTimeout(function () { els.saved.classList.remove("show"); }, 1400);
  }

  TK.popup.settings = { show: show };
})();
