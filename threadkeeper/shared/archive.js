/* Threadkeeper — shared/archive.js
 * The Library's storage layer: an IndexedDB database of archived conversations,
 * stored as the same intermediate representation the extractor produces (so the
 * existing renderers can re-export anything from the archive at any time).
 *
 * IMPORTANT ORIGIN NOTE: content scripts share the *page's* IndexedDB origin,
 * not the extension's. Every archive write from a chat page must therefore go
 * through the background service worker (ARCHIVE_SAVE message), which owns the
 * extension-origin database. The Library page and the service worker read/write
 * it directly; content scripts never touch this file.
 *
 * Attaches to globalThis so it works in the service worker (importScripts),
 * and in extension pages (script tag) alike. */
(function () {
  "use strict";
  var g = typeof globalThis !== "undefined" ? globalThis : self;
  g.TK = g.TK || {};

  var DB_NAME = "threadkeeper-archive";
  var DB_VERSION = 1;
  var STORE = "conversations";
  var PLAINTEXT_CAP = 400000;   // chars per conversation kept for search
  var SEARCH_MAX = 100;         // max results returned per query

  function openDB() {
    return new Promise(function (resolve, reject) {
      var req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = function () {
        var db = req.result;
        if (!db.objectStoreNames.contains(STORE)) {
          var s = db.createObjectStore(STORE, { keyPath: "key" });
          s.createIndex("updatedAt", "updatedAt");
          s.createIndex("site", "site");
        }
      };
      req.onsuccess = function () { resolve(req.result); };
      req.onerror = function () { reject(req.error || new Error("IndexedDB open failed")); };
    });
  }

  function withStore(mode, fn) {
    return openDB().then(function (db) {
      return new Promise(function (resolve, reject) {
        var tx = db.transaction(STORE, mode);
        var out = { value: undefined };
        fn(tx.objectStore(STORE), out);
        tx.oncomplete = function () { db.close(); resolve(out.value); };
        tx.onerror = function () { db.close(); reject(tx.error); };
        tx.onabort = function () { db.close(); reject(tx.error || new Error("aborted")); };
      });
    });
  }

  function makeKey(site, id) { return String(site) + ":" + String(id); }

  function metaOf(rec) {
    return {
      key: rec.key, site: rec.site, title: rec.title, url: rec.url || null,
      createdAt: rec.createdAt, updatedAt: rec.updatedAt,
      messageCount: rec.messageCount || 0,
      summary: rec.summary || null,
      preview: (rec.plainText || "").slice(0, 160)
    };
  }

  /** Insert or update a conversation record; preserves createdAt and summary. */
  function upsert(rec) {
    if (!rec || !rec.key) return Promise.reject(new Error("record needs a key"));
    return withStore("readwrite", function (store, out) {
      var getReq = store.get(rec.key);
      getReq.onsuccess = function () {
        var old = getReq.result;
        var now = Date.now();
        var merged = {
          key: rec.key,
          site: rec.site,
          title: rec.title || (old && old.title) || "Conversation",
          url: rec.url || (old && old.url) || null,
          ir: rec.ir !== undefined ? rec.ir : (old && old.ir) || [],
          plainText: (rec.plainText !== undefined ? rec.plainText : (old && old.plainText) || "").slice(0, PLAINTEXT_CAP),
          messageCount: rec.messageCount !== undefined ? rec.messageCount : (old && old.messageCount) || 0,
          summary: rec.summary !== undefined ? rec.summary : (old && old.summary) || null,
          createdAt: old ? old.createdAt : now,
          updatedAt: now
        };
        store.put(merged);
        out.value = { key: merged.key, updated: !!old };
      };
    });
  }

  function get(key) {
    return withStore("readonly", function (store, out) {
      var req = store.get(key);
      req.onsuccess = function () { out.value = req.result || null; };
    });
  }

  function remove(key) {
    return withStore("readwrite", function (store) { store.delete(key); });
  }

  function clearAll() {
    return withStore("readwrite", function (store) { store.clear(); });
  }

  function count() {
    return withStore("readonly", function (store, out) {
      var req = store.count();
      req.onsuccess = function () { out.value = req.result; };
    });
  }

  /** Newest-first metadata listing, optionally filtered by site. */
  function list(opts) {
    opts = opts || {};
    var site = opts.site || null;
    var limit = opts.limit || 500;
    return withStore("readonly", function (store, out) {
      var results = [];
      out.value = results;
      var idx = store.index("updatedAt");
      var req = idx.openCursor(null, "prev");
      req.onsuccess = function () {
        var cur = req.result;
        if (!cur || results.length >= limit) return;
        var rec = cur.value;
        if (!site || rec.site === site) results.push(metaOf(rec));
        cur.continue();
      };
    });
  }

  /** Full-text search: every whitespace-separated term must appear (AND) in
   * title+plainText, case-insensitive. Returns metas with a match snippet,
   * newest first. */
  function search(query, opts) {
    opts = opts || {};
    var site = opts.site || null;
    var terms = String(query || "").toLowerCase().split(/\s+/).filter(Boolean);
    if (!terms.length) return list(opts);
    return withStore("readonly", function (store, out) {
      var results = [];
      out.value = results;
      var idx = store.index("updatedAt");
      var req = idx.openCursor(null, "prev");
      req.onsuccess = function () {
        var cur = req.result;
        if (!cur || results.length >= SEARCH_MAX) return;
        var rec = cur.value;
        if (!site || rec.site === site) {
          var hay = ((rec.title || "") + "\n" + (rec.plainText || "")).toLowerCase();
          var all = true;
          for (var i = 0; i < terms.length; i++) {
            if (hay.indexOf(terms[i]) === -1) { all = false; break; }
          }
          if (all) {
            var meta = metaOf(rec);
            var at = hay.indexOf(terms[0]);
            var body = (rec.title || "") + "\n" + (rec.plainText || "");
            meta.snippet = body.slice(Math.max(0, at - 60), at + 100).replace(/\s+/g, " ").trim();
            results.push(meta);
          }
        }
        cur.continue();
      };
    });
  }

  // ---- IR -> plain text (for search + handoff transcripts) -------------------

  function inlineText(nodes) {
    var s = "";
    if (!nodes) return s;
    for (var i = 0; i < nodes.length; i++) {
      var n = nodes[i];
      if (!n) continue;
      if (n.type === "text") s += n.text || "";
      else if (n.type === "code") s += n.text || "";
      else if (n.type === "math") s += n.latex || "";
      else if (n.type === "image") s += n.alt ? "[" + n.alt + "]" : "";
      else if (n.type === "br") s += "\n";
      else if (n.children) s += inlineText(n.children);
    }
    return s;
  }

  function blocksText(blocks) {
    var parts = [];
    if (!blocks) return "";
    for (var i = 0; i < blocks.length; i++) {
      var b = blocks[i];
      if (!b) continue;
      switch (b.type) {
        case "heading": case "paragraph": parts.push(inlineText(b.children)); break;
        case "code": parts.push(b.text || ""); break;
        case "rawtext": parts.push(b.text || ""); break;
        case "math": parts.push(b.latex || ""); break;
        case "blockquote": parts.push(blocksText(b.children)); break;
        case "list":
          for (var j = 0; j < (b.items || []).length; j++) parts.push(blocksText(b.items[j].children));
          break;
        case "table":
          var rows = [b.header].concat(b.rows || []);
          for (var r = 0; r < rows.length; r++) {
            var cells = rows[r] || [];
            var line = [];
            for (var c = 0; c < cells.length; c++) line.push(inlineText(cells[c]));
            parts.push(line.join(" | "));
          }
          break;
        case "image": if (b.alt) parts.push("[" + b.alt + "]"); break;
      }
    }
    return parts.filter(Boolean).join("\n");
  }

  /** messages: [{role, blocks}] -> searchable/handoff-able plain text with role labels. */
  function irToPlainText(messages) {
    var parts = [];
    for (var i = 0; i < (messages || []).length; i++) {
      var m = messages[i];
      parts.push((m.role === "user" ? "You" : "Assistant") + ":\n" + blocksText(m.blocks));
    }
    return parts.join("\n\n");
  }

  TK.archive = {
    makeKey: makeKey,
    upsert: upsert,
    get: get,
    remove: remove,
    clearAll: clearAll,
    count: count,
    list: list,
    search: search,
    irToPlainText: irToPlainText,
    blocksText: blocksText
  };
})();
