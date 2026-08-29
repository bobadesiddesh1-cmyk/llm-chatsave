/* Threadkeeper — background.js (MV3 service worker)
 * Four jobs:
 *   1. Reflect adapter status into the action icon/badge per tab (greyed when a
 *      site's adapters fail to detect an open conversation).
 *   2. Orchestrate bulk export: open each selected conversation in a background
 *      tab, ask its content script to extract+render, stream progress to the popup
 *      over a long-lived Port, and hand the rendered files back for ZIP assembly.
 *      The same port also runs mode:'archive' — extract IR and save straight into
 *      the Library instead of producing files (used by the Library's importer).
 *   3. Own all Library (IndexedDB) writes. Content scripts share the *page's*
 *      IndexedDB origin, not the extension's, so ARCHIVE_SAVE messages land here
 *      and are written to the extension-origin database the Library page reads.
 *   4. Handoff: open a target AI site and ask its content script to insert a
 *      transcript into the composer ("Continue in ..." from the Library).
 *
 * No DOM here (workers have none), so all downloads/ZIP assembly happen in the
 * popup. This worker never makes external network requests. */

"use strict";

importScripts("shared/archive.js");

var ICON_ON = {
  16: "icons/icon16.png", 32: "icons/icon32.png",
  48: "icons/icon48.png", 128: "icons/icon128.png"
};
var ICON_OFF = {
  16: "icons/icon-off16.png", 32: "icons/icon-off32.png",
  48: "icons/icon-off48.png", 128: "icons/icon-off128.png"
};

// ---- Message routing --------------------------------------------------------

chrome.runtime.onMessage.addListener(function (msg, sender, sendResponse) {
  if (!msg) return;

  if (msg.type === "ARCHIVE_SAVE") {
    handleArchiveSave(msg.conversation)
      .then(sendResponse)
      .catch(function (e) { sendResponse({ ok: false, error: String(e && e.message || e) }); });
    return true; // async
  }

  if (msg.type === "HANDOFF") {
    handleHandoff(msg)
      .then(sendResponse)
      .catch(function (e) { sendResponse({ ok: false, error: String(e && e.message || e) }); });
    return true; // async
  }

  if (msg.type !== "ADAPTER_STATUS") return;
  var tabId = sender && sender.tab && sender.tab.id;
  if (tabId == null) return;

  try {
    if (msg.probableFailure) {
      chrome.action.setIcon({ tabId: tabId, path: ICON_OFF });
      chrome.action.setBadgeText({ tabId: tabId, text: "!" });
      chrome.action.setBadgeBackgroundColor({ tabId: tabId, color: "#b3801e" });
      chrome.action.setTitle({ tabId: tabId, title: "Threadkeeper — couldn't detect this conversation (the site's layout may have changed)" });
    } else if (msg.supported) {
      chrome.action.setIcon({ tabId: tabId, path: ICON_ON });
      chrome.action.setBadgeText({ tabId: tabId, text: msg.hasConversation ? "" : "" });
      chrome.action.setTitle({ tabId: tabId, title: "Threadkeeper — export this conversation" });
    } else {
      chrome.action.setIcon({ tabId: tabId, path: ICON_OFF });
      chrome.action.setBadgeText({ tabId: tabId, text: "" });
      chrome.action.setTitle({ tabId: tabId, title: "Threadkeeper" });
    }
  } catch (e) { /* action APIs can race during tab teardown; ignore */ }
});

// ---- Library writes ---------------------------------------------------------

async function handleArchiveSave(c) {
  if (!c || !c.site || !c.messages) return { ok: false, error: "Nothing to archive" };
  var id = c.id || ("live-" + String(c.title || "conversation").toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 48));
  var key = TK.archive.makeKey(c.site, id);
  await TK.archive.upsert({
    key: key,
    site: c.site,
    title: c.title || "Conversation",
    url: c.url || null,
    ir: c.messages,
    plainText: TK.archive.irToPlainText(c.messages),
    messageCount: c.messageCount || c.messages.length
  });
  return { ok: true, key: key };
}

// ---- Handoff ("Continue in ...") --------------------------------------------

var HANDOFF_URLS = {
  chatgpt: "https://chatgpt.com/",
  claude: "https://claude.ai/new",
  gemini: "https://gemini.google.com/app"
};

async function handleHandoff(msg) {
  var url = HANDOFF_URLS[msg.site];
  if (!url) return { ok: false, error: "Unknown target site" };
  if (!msg.text) return { ok: false, error: "Nothing to hand off" };
  var tab = await createTabActive(url);
  await waitForReady(tab.id, function () { return false; });
  // Give the SPA time to mount its composer.
  await delay(1800);
  var resp = await sendTabMessage(tab.id, { type: "HANDOFF_INSERT", text: msg.text });
  return resp || { ok: false, error: "No response from the target tab" };
}

function createTabActive(url) {
  return new Promise(function (resolve, reject) {
    chrome.tabs.create({ url: url, active: true }, function (tab) {
      if (chrome.runtime.lastError || !tab) return reject(new Error(chrome.runtime.lastError ? chrome.runtime.lastError.message : "tab create failed"));
      resolve(tab);
    });
  });
}

// ---- Bulk orchestration -----------------------------------------------------

var CONV_TIMEOUT_MS = 45000;   // per-conversation hard timeout
var TAB_READY_TIMEOUT_MS = 30000;
var SETTLE_AFTER_READY_MS = 1200; // let the SPA paint the conversation

chrome.runtime.onConnect.addListener(function (port) {
  if (port.name !== "tk-bulk") return;
  var cancelled = false;

  port.onDisconnect.addListener(function () { cancelled = true; });

  port.onMessage.addListener(function (msg) {
    if (!msg) return;
    if (msg.cmd === "cancel") { cancelled = true; return; }
    if (msg.cmd === "start") {
      runBulk(port, msg.list || [], msg.settings || {}, function () { return cancelled; })
        .catch(function (e) {
          safePost(port, { cmd: "done", error: String(e && e.message || e), results: [] });
        });
    }
  });
});

async function runBulk(port, list, settings, isCancelled) {
  var total = list.length;
  var results = [];

  for (var i = 0; i < total; i++) {
    if (isCancelled()) {
      safePost(port, { cmd: "cancelled", results: results });
      return;
    }
    var conv = list[i];
    safePost(port, { cmd: "progress", index: i, total: total, title: conv.title, phase: "start" });

    var entry = { title: conv.title, id: conv.id, ok: false, error: null, file: null };

    if (!conv.url) {
      entry.error = "No conversation URL available (can't open in a background tab).";
      results.push(entry);
      safePost(port, { cmd: "progress", index: i, total: total, title: conv.title, phase: "fail", error: entry.error });
      continue;
    }

    var tabId = null;
    try {
      var result = await withTimeout(processConversation(conv, settings, isCancelled, function (id) { tabId = id; }), CONV_TIMEOUT_MS);
      entry.ok = true;
      entry.file = result.file;
      entry.warnings = result.warnings;
      safePost(port, {
        cmd: "progress", index: i, total: total, title: conv.title, phase: "done",
        file: result.file, warnings: result.warnings
      });
    } catch (e) {
      entry.error = String(e && e.message || e);
      safePost(port, { cmd: "progress", index: i, total: total, title: conv.title, phase: "fail", error: entry.error });
    } finally {
      if (tabId != null) { try { await removeTab(tabId); } catch (e) {} }
    }
    results.push(entry);
  }

  safePost(port, { cmd: "done", results: results });
}

async function processConversation(conv, settings, isCancelled, onTab) {
  var tab = await createTab(conv.url);
  onTab(tab.id);
  await waitForReady(tab.id, isCancelled);
  if (isCancelled()) throw new Error("Cancelled");
  // Give the SPA a moment to render the conversation body.
  await delay(SETTLE_AFTER_READY_MS);

  // mode:'archive' — the Library's history importer: extract the IR and save it
  // straight into the archive here (this worker owns the extension-origin DB);
  // no file is produced or downloaded.
  if (settings.mode === "archive") {
    var ir = await sendTabMessage(tab.id, { type: "EXTRACT_IR" });
    if (!ir || !ir.ok) throw new Error((ir && ir.error) || "Extraction failed");
    await handleArchiveSave(ir);
    return { archived: true, title: ir.title, warnings: null, file: null };
  }

  var resp = await sendTabMessage(tab.id, { type: "EXTRACT_RENDER", settings: settings });
  if (!resp || !resp.ok) throw new Error((resp && resp.error) || "Extraction failed");
  return { file: resp.file, warnings: resp.warnings };
}

// ---- tab + messaging helpers ------------------------------------------------

function createTab(url) {
  return new Promise(function (resolve, reject) {
    chrome.tabs.create({ url: url, active: false }, function (tab) {
      if (chrome.runtime.lastError || !tab) return reject(new Error(chrome.runtime.lastError ? chrome.runtime.lastError.message : "tab create failed"));
      resolve(tab);
    });
  });
}

function removeTab(tabId) {
  return new Promise(function (resolve) {
    chrome.tabs.remove(tabId, function () { void chrome.runtime.lastError; resolve(); });
  });
}

async function waitForReady(tabId, isCancelled) {
  var start = Date.now();
  while (Date.now() - start < TAB_READY_TIMEOUT_MS) {
    if (isCancelled()) throw new Error("Cancelled");
    var ok = await pingOnce(tabId);
    if (ok) return true;
    await delay(500);
  }
  throw new Error("Timed out waiting for the conversation tab to load");
}

function pingOnce(tabId) {
  return new Promise(function (resolve) {
    try {
      chrome.tabs.sendMessage(tabId, { type: "PING" }, function (resp) {
        if (chrome.runtime.lastError) { resolve(false); return; }
        resolve(!!(resp && resp.ready));
      });
    } catch (e) { resolve(false); }
  });
}

function sendTabMessage(tabId, message) {
  return new Promise(function (resolve, reject) {
    try {
      chrome.tabs.sendMessage(tabId, message, function (resp) {
        if (chrome.runtime.lastError) { reject(new Error(chrome.runtime.lastError.message)); return; }
        resolve(resp);
      });
    } catch (e) { reject(e); }
  });
}

function withTimeout(promise, ms) {
  return new Promise(function (resolve, reject) {
    var t = setTimeout(function () { reject(new Error("Timed out after " + Math.round(ms / 1000) + "s")); }, ms);
    promise.then(function (v) { clearTimeout(t); resolve(v); },
                 function (e) { clearTimeout(t); reject(e); });
  });
}

function delay(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

function safePost(port, msg) { try { port.postMessage(msg); } catch (e) {} }
