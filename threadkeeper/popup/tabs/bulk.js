/* Threadkeeper — popup/tabs/bulk.js
 * Bulk export tab. Loads conversation history from the active tab, then drives the
 * background worker over a Port to open + extract each selected conversation, and
 * assembles the results into a ZIP (or individual downloads) here in the popup. */
(function () {
  "use strict";
  window.TK = window.TK || {};
  TK.popup = TK.popup || {};

  var els = {};
  var initialized = false;
  var tabId = null;
  var imageMode = "embed";
  var list = [];
  var port = null;
  var files = [];
  var completed = 0;
  var useZip = true;

  function grab() {
    els.unsupported = document.getElementById("bulk-unsupported");
    els.body = document.getElementById("bulk-body");
    els.load = document.getElementById("bulk-load");
    els.loadStatus = document.getElementById("bulk-load-status");
    els.listWrap = document.getElementById("bulk-list-wrap");
    els.selectall = document.getElementById("bulk-selectall");
    els.selcount = document.getElementById("bulk-selcount");
    els.list = document.getElementById("bulk-list");
    els.timestamps = document.getElementById("bulk-timestamps");
    els.zip = document.getElementById("bulk-zip");
    els.export = document.getElementById("bulk-export");
    els.progress = document.getElementById("bulk-progress");
    els.fill = document.getElementById("bulk-progress-fill");
    els.progressLabel = document.getElementById("bulk-progress-label");
    els.cancel = document.getElementById("bulk-cancel");
    els.results = document.getElementById("bulk-results");
  }

  function initOnce() {
    if (initialized) return;
    grab();
    els.load.addEventListener("click", onLoad);
    els.selectall.addEventListener("change", onSelectAll);
    els.export.addEventListener("click", onExport);
    els.cancel.addEventListener("click", onCancel);
    initialized = true;
  }

  async function show() {
    initOnce();
    var u = TK.popup.util;
    var settings = await TK.storage.getSettings();
    imageMode = settings.imageMode || "embed";
    u.setRadio("bformat", settings.format === "pdf" ? "markdown" : settings.format);
    u.setRadio("bscope", settings.scope);
    els.timestamps.checked = !!settings.includeTimestamps;
    els.zip.checked = settings.bulkOutput !== "individual";

    var tab = await u.getActiveTab();
    if (!tab) { showUnsupported(); return; }
    tabId = tab.id;
    try {
      var status = await u.sendToTab(tab.id, { type: "GET_STATUS" });
      if (!status || !status.supported) { showUnsupported(); return; }
      els.unsupported.hidden = true;
      els.body.hidden = false;
    } catch (e) { showUnsupported(); }
  }

  function showUnsupported() {
    els.unsupported.hidden = false;
    els.body.hidden = true;
  }

  async function onLoad() {
    var u = TK.popup.util;
    els.load.disabled = true;
    els.loadStatus.textContent = "Loading history… (scrolling to load more)";
    try {
      var res = await u.sendToTab(tabId, { type: "GET_LIST" });
      if (!res || !res.ok) throw new Error((res && res.error) || "Failed to load history");
      list = res.list || [];
      renderList();
      var capped = list.length >= 200 ? " (capped at 200)" : "";
      els.loadStatus.textContent = list.length + " conversation" + (list.length === 1 ? "" : "s") + " found" + capped;
      els.listWrap.hidden = list.length === 0;
    } catch (e) {
      els.loadStatus.textContent = "Could not load history: " + String(e && e.message || e);
    } finally {
      els.load.disabled = false;
    }
  }

  function renderList() {
    els.list.innerHTML = "";
    list.forEach(function (conv, i) {
      var row = document.createElement("label");
      row.className = "tk-list-item";
      var cb = document.createElement("input");
      cb.type = "checkbox";
      cb.checked = true;
      cb.dataset.index = String(i);
      cb.addEventListener("change", updateSelCount);
      var t = document.createElement("span");
      t.className = "t";
      t.textContent = conv.title || "Conversation";
      t.title = conv.title || "";
      row.appendChild(cb);
      row.appendChild(t);
      if (!conv.url) {
        var warn = document.createElement("span");
        warn.className = "tk-badge";
        warn.textContent = "no url";
        warn.title = "This conversation has no openable URL and will be skipped.";
        row.appendChild(warn);
      }
      els.list.appendChild(row);
    });
    els.selectall.checked = true;
    updateSelCount();
  }

  function selectedIndexes() {
    var out = [];
    els.list.querySelectorAll('input[type="checkbox"]').forEach(function (cb) {
      if (cb.checked) out.push(parseInt(cb.dataset.index, 10));
    });
    return out;
  }

  function updateSelCount() {
    var n = selectedIndexes().length;
    els.selcount.textContent = n + " selected";
  }

  function onSelectAll() {
    var on = els.selectall.checked;
    els.list.querySelectorAll('input[type="checkbox"]').forEach(function (cb) { cb.checked = on; });
    updateSelCount();
  }

  async function onExport() {
    var u = TK.popup.util;
    var idxs = selectedIndexes();
    var selected = idxs.map(function (i) { return list[i]; });
    if (!selected.length) { els.loadStatus.textContent = "Select at least one conversation."; return; }

    var settings = {
      format: u.getRadio("bformat") || "markdown",
      scope: u.getRadio("bscope") || "full",
      includeTimestamps: els.timestamps.checked,
      includeRoleLabels: true,
      imageMode: imageMode,
      bulkOutput: els.zip.checked ? "zip" : "individual"
    };
    // Persist the choices as new defaults.
    TK.storage.saveSettings({
      format: settings.format, scope: settings.scope,
      includeTimestamps: settings.includeTimestamps, bulkOutput: settings.bulkOutput
    });

    files = [];
    completed = 0;
    useZip = settings.bulkOutput === "zip";
    els.results.hidden = true;
    els.results.innerHTML = "";
    els.progress.hidden = false;
    setProgress(0, selected.length, "Starting…");
    setBusy(true);

    port = chrome.runtime.connect({ name: "tk-bulk" });
    port.onMessage.addListener(function (msg) { onPortMessage(msg, selected.length); });
    port.onDisconnect.addListener(function () { /* worker gone; finalize handled on 'done' */ });
    port.postMessage({ cmd: "start", list: selected, settings: settings });
  }

  function onPortMessage(msg, total) {
    if (!msg) return;
    if (msg.cmd === "progress") {
      if (msg.phase === "start") {
        setProgress(completed, total, "Exporting " + (msg.index + 1) + " of " + total + ": " + trunc(msg.title));
      } else if (msg.phase === "done") {
        completed++;
        if (msg.file) files.push(addUnique(msg.file));
        addResult(true, msg.title, warnText(msg.warnings));
        setProgress(completed, total, "Exported " + completed + " of " + total);
      } else if (msg.phase === "fail") {
        completed++;
        addResult(false, msg.title, msg.error || "failed");
        setProgress(completed, total, "Exported " + completed + " of " + total);
      }
    } else if (msg.cmd === "done") {
      finalize(msg.error);
    } else if (msg.cmd === "cancelled") {
      finalize(null, true);
    }
  }

  async function finalize(error, cancelled) {
    setBusy(false);
    try { if (port) port.disconnect(); } catch (e) {}
    port = null;

    if (files.length) {
      if (useZip) {
        var blob = await TK.zip.createZip(files, new Date());
        TK.popup.util.download(blob, "threadkeeper-export-" + stamp() + ".zip");
      } else {
        for (var i = 0; i < files.length; i++) {
          var f = files[i];
          var b = new Blob([f.data], { type: (f.mime || "text/plain") + ";charset=utf-8" });
          TK.popup.util.download(b, f.name);
          await wait(400); // stagger so the browser doesn't drop downloads
        }
      }
    }

    var okCount = files.length;
    var label;
    if (cancelled) label = "Cancelled — " + okCount + " exported before stopping.";
    else if (error) label = "Finished with an error: " + error;
    else label = "Done — " + okCount + " exported" + (useZip && okCount ? " into one ZIP." : ".");
    els.progressLabel.textContent = label;
    els.fill.style.width = "100%";
    els.results.hidden = els.results.children.length === 0;
  }

  function onCancel() {
    if (port) { try { port.postMessage({ cmd: "cancel" }); } catch (e) {} }
    els.progressLabel.textContent = "Cancelling…";
    els.cancel.disabled = true;
  }

  // ---- helpers ---------------------------------------------------------------

  function addUnique(file) {
    // Ensure filenames are unique within the batch.
    var name = file.name;
    var base = name.replace(/\.[^.]+$/, "");
    var ext = (name.match(/\.[^.]+$/) || [""])[0];
    var n = 1, candidate = name;
    var existing = {};
    files.forEach(function (f) { existing[f.name] = 1; });
    while (existing[candidate]) { n++; candidate = base + " (" + n + ")" + ext; }
    return { name: candidate, data: file.content, mime: file.mime };
  }

  function setProgress(done, total, label) {
    var pct = total ? Math.round((done / total) * 100) : 0;
    els.fill.style.width = pct + "%";
    els.progressLabel.textContent = label;
  }

  function setBusy(b) {
    els.export.disabled = b;
    els.load.disabled = b;
    els.cancel.disabled = !b;
  }

  function addResult(ok, title, note) {
    var row = document.createElement("div");
    row.className = "tk-res-item " + (ok ? "ok" : "err");
    var ico = document.createElement("span");
    ico.className = "r-ico";
    ico.textContent = ok ? "✓" : "✕";
    var t = document.createElement("span");
    t.className = "r-title";
    t.textContent = title || "Conversation";
    t.title = title || "";
    row.appendChild(ico);
    row.appendChild(t);
    if (note) {
      var n = document.createElement("span");
      n.className = "r-note";
      n.textContent = note;
      row.appendChild(n);
    }
    els.results.appendChild(row);
    els.results.hidden = false;
  }

  function warnText(w) {
    if (!w) return "";
    var parts = [];
    if (w.fallbackCount > 0) parts.push(w.fallbackCount + " fallback");
    if (w.imageFailures > 0) parts.push(w.imageFailures + " img skipped");
    return parts.join(", ");
  }

  function trunc(s) { s = s || "Conversation"; return s.length > 30 ? s.slice(0, 28) + "…" : s; }
  function wait(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
  function stamp() {
    var d = new Date();
    function p(n) { return (n < 10 ? "0" : "") + n; }
    return d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate()) + "-" + p(d.getHours()) + p(d.getMinutes());
  }

  TK.popup.bulk = { show: show };
})();
