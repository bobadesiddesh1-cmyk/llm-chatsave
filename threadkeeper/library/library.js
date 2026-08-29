/* Threadkeeper — library/library.js
 * The Library: a full-tab, on-device archive of every captured conversation.
 * Reads the extension-origin IndexedDB directly (writes from chat pages arrive
 * via the background worker), re-renders any record through the same renderers
 * the exporter uses, and adds three things on top:
 *   - full-text search across every archived conversation
 *   - optional on-device AI summaries (Chrome's built-in Summarizer; no network)
 *   - handoff: continue any archived conversation in another AI's composer
 */
(function () {
  "use strict";

  var state = {
    site: "",          // '' = all sites
    query: "",
    activeKey: null,
    rec: null,         // full record currently open in the reader
    importing: false,
    importPort: null
  };

  var els = {};
  var SITE_LABEL = { chatgpt: "ChatGPT", claude: "Claude", gemini: "Gemini" };
  var SITE_HOSTS = { "chatgpt.com": "chatgpt", "chat.openai.com": "chatgpt", "claude.ai": "claude", "gemini.google.com": "gemini" };
  var HANDOFF_MAX_CHARS = 6000;

  function $(id) { return document.getElementById(id); }

  function grab() {
    ["lb-stats", "lb-search", "lb-filters", "lb-list", "lb-empty",
     "lb-reader", "lb-reader-empty", "lb-title", "lb-meta", "lb-summary", "lb-frame",
     "lb-export-md", "lb-export-html", "lb-summarize", "lb-handoff", "lb-delete",
     "lb-import", "lb-import-panel", "lb-import-close", "lb-import-scan", "lb-import-status",
     "lb-import-tabs", "lb-import-list", "lb-import-run-row", "lb-import-run",
     "lb-import-cancel", "lb-import-progress", "lb-import-fill", "lb-import-label",
     "lb-wipe", "lb-toast"].forEach(function (id) {
      els[id.replace(/^lb-/, "").replace(/-([a-z])/g, function (m, c) { return c.toUpperCase(); })] = $(id);
    });
  }

  // ---- Toast -----------------------------------------------------------------

  var toastTimer = null;
  function toast(text, ms) {
    els.toast.textContent = text;
    els.toast.hidden = false;
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { els.toast.hidden = true; }, ms || 3200);
  }

  // ---- List + stats ----------------------------------------------------------

  function relTime(ts) {
    if (!ts) return "";
    var diff = Date.now() - ts, min = Math.floor(diff / 60000);
    if (min < 1) return "just now";
    if (min < 60) return min + "m ago";
    var hr = Math.floor(min / 60);
    if (hr < 24) return hr + "h ago";
    var day = Math.floor(hr / 24);
    if (day < 7) return day + "d ago";
    return new Date(ts).toLocaleDateString();
  }

  async function refresh() {
    var opts = { site: state.site || null };
    var rows = state.query
      ? await TK.archive.search(state.query, opts)
      : await TK.archive.list(opts);

    els.list.innerHTML = "";
    els.empty.hidden = rows.length > 0 || !!state.query;
    if (state.query && !rows.length) {
      var none = document.createElement("div");
      none.className = "lb-hint";
      none.style.padding = "14px 8px";
      none.textContent = "No conversations match “" + state.query + "”.";
      els.list.appendChild(none);
    }

    rows.forEach(function (meta) {
      var row = document.createElement("button");
      row.className = "lb-item" + (meta.key === state.activeKey ? " is-on" : "");
      row.setAttribute("role", "listitem");

      var t = document.createElement("span");
      t.className = "t";
      t.textContent = meta.title || "Conversation";
      row.appendChild(t);

      var m = document.createElement("span");
      m.className = "m";
      var site = document.createElement("span");
      site.className = "site";
      site.textContent = SITE_LABEL[meta.site] || meta.site;
      var count = document.createElement("span");
      count.textContent = (meta.messageCount || 0) + " msgs";
      var when = document.createElement("span");
      when.textContent = relTime(meta.updatedAt);
      m.appendChild(site); m.appendChild(count); m.appendChild(when);
      row.appendChild(m);

      var snipText = meta.snippet || meta.summary || meta.preview;
      if (snipText) {
        var snip = document.createElement("span");
        snip.className = "snip";
        snip.textContent = snipText;
        row.appendChild(snip);
      }

      row.addEventListener("click", function () { openReader(meta.key); });
      els.list.appendChild(row);
    });

    var total = await TK.archive.count();
    els.stats.textContent = total === 0
      ? "Nothing archived yet"
      : total + " conversation" + (total === 1 ? "" : "s") + " archived · 100% on this device";
  }

  // ---- Reader ----------------------------------------------------------------

  async function openReader(key) {
    var rec = await TK.archive.get(key);
    if (!rec) { toast("That conversation is no longer in the archive."); refresh(); return; }
    state.activeKey = key;
    state.rec = rec;

    els.readerEmpty.hidden = true;
    els.reader.hidden = false;
    els.title.textContent = rec.title || "Conversation";
    els.title.title = rec.title || "";
    var bits = [SITE_LABEL[rec.site] || rec.site, (rec.messageCount || 0) + " messages", "updated " + relTime(rec.updatedAt)];
    if (rec.url) bits.push(rec.url);
    els.meta.textContent = bits.join(" · ");

    els.summary.hidden = !rec.summary;
    els.summary.textContent = rec.summary || "";
    els.summarize.hidden = !summarizerPresent();
    els.summarize.disabled = false;
    els.summarize.textContent = rec.summary ? "Re-summarize" : "Summarize";

    // The same standalone HTML the exporter produces, in a fully sandboxed
    // iframe (no scripts in the document, none allowed either).
    var html = TK.html.render(
      { title: rec.title, site: rec.site, messages: rec.ir || [] },
      { includeRoleLabels: true, includeTimestamps: false }
    );
    els.frame.srcdoc = html;

    // Reflect selection in the list without a full re-render.
    Array.prototype.forEach.call(els.list.querySelectorAll(".lb-item"), function (r) { r.classList.remove("is-on"); });
    refreshSelection();
  }

  function refreshSelection() {
    // Cheap: re-run refresh only when needed elsewhere; here just re-mark rows.
    // (Rows carry no key attribute; simplest correct behavior is a refresh.)
    refresh();
  }

  function fileBase(rec) {
    return (rec.title || "conversation").replace(/[\/\\:*?"<>|]/g, " ").replace(/\s+/g, " ").trim().slice(0, 120) || "conversation";
  }

  function download(content, mime, filename) {
    var blob = new Blob([content], { type: mime + ";charset=utf-8" });
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    a.href = url; a.download = filename; a.style.display = "none";
    document.body.appendChild(a);
    a.click();
    setTimeout(function () {
      try { document.body.removeChild(a); } catch (e) {}
      URL.revokeObjectURL(url);
    }, 4000);
  }

  function exportCurrent(format) {
    var rec = state.rec;
    if (!rec) return;
    var conv = { title: rec.title, site: rec.site, messages: rec.ir || [] };
    var settings = { includeRoleLabels: true, includeTimestamps: false };
    if (format === "md") download(TK.markdown.render(conv, settings), "text/markdown", fileBase(rec) + ".md");
    else download(TK.html.render(conv, settings), "text/html", fileBase(rec) + ".html");
    toast("Exported " + fileBase(rec) + "." + format);
  }

  async function deleteCurrent() {
    if (!state.rec) return;
    if (!confirm("Delete “" + (state.rec.title || "this conversation") + "” from your Library? The original on the site is untouched.")) return;
    await TK.archive.remove(state.activeKey);
    state.activeKey = null; state.rec = null;
    els.reader.hidden = true;
    els.readerEmpty.hidden = false;
    refresh();
  }

  async function wipeAll() {
    var n = await TK.archive.count();
    if (!n) { toast("The archive is already empty."); return; }
    if (!confirm("Wipe all " + n + " archived conversations from this device? This can't be undone (the originals on each site are untouched).")) return;
    await TK.archive.clearAll();
    state.activeKey = null; state.rec = null;
    els.reader.hidden = true;
    els.readerEmpty.hidden = false;
    refresh();
    toast("Archive wiped.");
  }

  // ---- On-device AI summaries (Chrome built-in Summarizer) -------------------
  // Feature-detected; when the API or model isn't available on this machine the
  // button simply never appears. Summarization runs locally — no network.

  function summarizerPresent() {
    return !!(self.Summarizer || (self.ai && self.ai.summarizer));
  }

  async function createSummarizer() {
    var opts = { type: "key-points", format: "plain-text", length: "short" };
    if (self.Summarizer) {
      if (Summarizer.availability) {
        var a = await Summarizer.availability();
        if (a === "unavailable") return null;
      }
      return await Summarizer.create(opts);
    }
    if (self.ai && self.ai.summarizer) {
      var caps = self.ai.summarizer.capabilities ? await self.ai.summarizer.capabilities() : null;
      if (caps && caps.available === "no") return null;
      return await self.ai.summarizer.create(opts);
    }
    return null;
  }

  async function summarizeCurrent() {
    var rec = state.rec;
    if (!rec) return;
    els.summarize.disabled = true;
    els.summarize.textContent = "Summarizing…";
    try {
      var s = await createSummarizer();
      if (!s) throw new Error("On-device AI isn't available on this machine");
      var text = (rec.plainText || TK.archive.irToPlainText(rec.ir || [])).slice(0, 12000);
      var summary = await s.summarize(text);
      if (s.destroy) { try { s.destroy(); } catch (e) {} }
      rec.summary = String(summary || "").trim();
      await TK.archive.upsert(rec);
      els.summary.textContent = rec.summary;
      els.summary.hidden = !rec.summary;
      els.summarize.textContent = "Re-summarize";
      toast("Summarized on-device — nothing left this machine.");
    } catch (e) {
      toast("Couldn't summarize: " + String(e && e.message || e));
      els.summarize.textContent = state.rec && state.rec.summary ? "Re-summarize" : "Summarize";
    } finally {
      els.summarize.disabled = false;
    }
  }

  // ---- Handoff ("Continue in …") ---------------------------------------------

  function buildHandoffText(rec, targetSite) {
    var transcript = TK.archive.irToPlainText(rec.ir || []);
    if (transcript.length > HANDOFF_MAX_CHARS) {
      transcript = "[earlier messages trimmed]\n…" +
        transcript.slice(transcript.length - HANDOFF_MAX_CHARS);
    }
    return "I'm continuing a conversation that started in " + (SITE_LABEL[rec.site] || rec.site) +
      ". Here is the transcript so far:\n\n---\n" + transcript + "\n---\n\n" +
      "Please read the transcript and pick up right where it left off.";
  }

  async function handoffTo(targetSite) {
    var rec = state.rec;
    if (!rec || !targetSite) return;
    var text = buildHandoffText(rec, targetSite);
    toast("Opening " + (SITE_LABEL[targetSite] || targetSite) + "…");
    chrome.runtime.sendMessage({ type: "HANDOFF", site: targetSite, text: text }, function (resp) {
      void chrome.runtime.lastError;
      if (resp && resp.ok) return; // inserted into the composer — nothing else to say
      // Fallback: put the transcript on the clipboard so it's one paste away.
      navigator.clipboard.writeText(text).then(function () {
        toast("Couldn't insert automatically — the transcript is on your clipboard, just paste it into the composer.", 6000);
      }, function () {
        toast("Couldn't reach " + (SITE_LABEL[targetSite] || targetSite) + ": " + ((resp && resp.error) || "unknown error"), 6000);
      });
    });
  }

  // ---- History import (backfill) ---------------------------------------------
  // Reuses the bulk engine: the background opens each selected conversation in a
  // background tab, extracts its IR, and saves it straight into this archive.

  function contentFiles() {
    try { return chrome.runtime.getManifest().content_scripts[0].js; } catch (e) { return []; }
  }

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

  async function ensureContentScript(tabId) {
    if (await ping(tabId)) return true;
    try {
      await new Promise(function (resolve, reject) {
        chrome.scripting.executeScript({ target: { tabId: tabId }, files: contentFiles() }, function () {
          if (chrome.runtime.lastError) { reject(new Error(chrome.runtime.lastError.message)); return; }
          resolve();
        });
      });
    } catch (e) { return false; }
    for (var i = 0; i < 8; i++) {
      if (await ping(tabId)) return true;
      await new Promise(function (r) { setTimeout(r, 150); });
    }
    return false;
  }

  function siteOfUrl(url) {
    try { return SITE_HOSTS[new URL(url).hostname.replace(/^www\./, "")] || null; } catch (e) { return null; }
  }

  async function scanTabs() {
    els.importStatus.textContent = "Looking for open chat tabs…";
    els.importTabs.innerHTML = "";
    els.importList.hidden = true;
    els.importRunRow.hidden = true;
    var tabs = await new Promise(function (resolve) { chrome.tabs.query({}, resolve); });
    var found = (tabs || []).filter(function (t) { return t.url && siteOfUrl(t.url); });
    if (!found.length) {
      els.importStatus.textContent = "No ChatGPT, Claude, or Gemini tabs are open. Open one, then scan again.";
      return;
    }
    els.importStatus.textContent = "Pick a site to read history from:";
    found.forEach(function (t) {
      var site = siteOfUrl(t.url);
      var chip = document.createElement("button");
      chip.className = "lb-chip";
      chip.textContent = SITE_LABEL[site] + " tab";
      chip.addEventListener("click", function () { loadImportList(t.id, site); });
      els.importTabs.appendChild(chip);
    });
  }

  var importCandidates = [];

  async function loadImportList(tabId, site) {
    els.importStatus.textContent = "Reading " + SITE_LABEL[site] + " history (scrolling to load more)…";
    if (!(await ensureContentScript(tabId))) {
      els.importStatus.textContent = "Couldn't reach that tab — reload it and scan again.";
      return;
    }
    var res = await new Promise(function (resolve) {
      chrome.tabs.sendMessage(tabId, { type: "GET_LIST" }, function (r) {
        void chrome.runtime.lastError; resolve(r);
      });
    });
    if (!res || !res.ok || !(res.list || []).length) {
      els.importStatus.textContent = "No conversations found in that tab's sidebar.";
      return;
    }
    importCandidates = res.list;
    els.importStatus.textContent = res.list.length + " conversations found — untick any you don't want.";
    els.importList.innerHTML = "";
    res.list.forEach(function (conv, i) {
      var row = document.createElement("label");
      row.className = "lb-pick-item";
      var cb = document.createElement("input");
      cb.type = "checkbox"; cb.checked = true; cb.dataset.index = String(i);
      var t = document.createElement("span");
      t.className = "t"; t.textContent = conv.title || "Conversation";
      row.appendChild(cb); row.appendChild(t);
      if (!conv.url) {
        var warn = document.createElement("span");
        warn.className = "lb-hint"; warn.textContent = "no url";
        row.appendChild(warn);
        cb.checked = false;
      }
      els.importList.appendChild(row);
    });
    els.importList.hidden = false;
    els.importRunRow.hidden = false;
  }

  function runImport() {
    var selected = [];
    els.importList.querySelectorAll("input[type=checkbox]").forEach(function (cb) {
      if (cb.checked) selected.push(importCandidates[parseInt(cb.dataset.index, 10)]);
    });
    if (!selected.length) { toast("Nothing selected."); return; }

    state.importing = true;
    var done = 0, failed = 0, total = selected.length;
    els.importProgress.hidden = false;
    els.importCancel.hidden = false;
    els.importRun.disabled = true;
    els.importFill.style.width = "0%";
    els.importLabel.textContent = "Importing 1 of " + total + "…";

    var port = chrome.runtime.connect({ name: "tk-bulk" });
    state.importPort = port;
    port.onMessage.addListener(function (msg) {
      if (!msg) return;
      if (msg.cmd === "progress") {
        if (msg.phase === "done") done++;
        else if (msg.phase === "fail") failed++;
        var processed = done + failed;
        els.importFill.style.width = Math.round((processed / total) * 100) + "%";
        els.importLabel.textContent = processed < total
          ? "Importing " + Math.min(processed + 1, total) + " of " + total + "…"
          : "Finishing…";
        if (msg.phase === "done") refresh();
      } else if (msg.cmd === "done" || msg.cmd === "cancelled") {
        state.importing = false;
        state.importPort = null;
        els.importFill.style.width = "100%";
        els.importLabel.textContent = (msg.cmd === "cancelled" ? "Cancelled — " : "Done — ") +
          done + " imported" + (failed ? ", " + failed + " failed" : "") + ".";
        els.importCancel.hidden = true;
        els.importRun.disabled = false;
        refresh();
      }
    });
    port.postMessage({
      cmd: "start",
      list: selected,
      settings: { mode: "archive", scope: "full", imageMode: "reference", includeRoleLabels: true }
    });
  }

  function cancelImport() {
    if (state.importPort) { try { state.importPort.postMessage({ cmd: "cancel" }); } catch (e) {} }
    els.importLabel.textContent = "Cancelling…";
  }

  // ---- Boot ------------------------------------------------------------------

  var searchTimer = null;

  function boot() {
    grab();

    els.search.addEventListener("input", function () {
      if (searchTimer) clearTimeout(searchTimer);
      searchTimer = setTimeout(function () {
        state.query = els.search.value.trim();
        refresh();
      }, 180);
    });

    els.filters.addEventListener("click", function (e) {
      var chip = e.target.closest(".lb-chip");
      if (!chip) return;
      els.filters.querySelectorAll(".lb-chip").forEach(function (c) { c.classList.remove("is-on"); });
      chip.classList.add("is-on");
      state.site = chip.dataset.site || "";
      refresh();
    });

    els.exportMd.addEventListener("click", function () { exportCurrent("md"); });
    els.exportHtml.addEventListener("click", function () { exportCurrent("html"); });
    els.summarize.addEventListener("click", summarizeCurrent);
    els.delete.addEventListener("click", deleteCurrent);
    els.handoff.addEventListener("change", function () {
      var site = els.handoff.value;
      els.handoff.value = "";
      if (site) handoffTo(site);
    });

    els.import.addEventListener("click", function () {
      els.importPanel.hidden = !els.importPanel.hidden;
      if (!els.importPanel.hidden) scanTabs();
    });
    els.importClose.addEventListener("click", function () { els.importPanel.hidden = true; });
    els.importScan.addEventListener("click", scanTabs);
    els.importRun.addEventListener("click", runImport);
    els.importCancel.addEventListener("click", cancelImport);
    els.wipe.addEventListener("click", wipeAll);

    refresh();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();

  // Exposed for the test harness.
  self.TKLIB = { refresh: refresh, openReader: openReader, buildHandoffText: buildHandoffText, _state: state };
})();
