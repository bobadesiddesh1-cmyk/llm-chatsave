/* Threadkeeper — content/adapters/gemini.js
 * Adapter for gemini.google.com (Angular custom elements). User queries and model
 * responses live in <user-query> / <model-response> hosts. Bulk history URLs are
 * not always recoverable from the DOM — see DECISIONS.md; such items are still
 * listed and reported as failures rather than silently dropped. */
(function () {
  "use strict";
  window.TK = window.TK || {};
  TK.adapters = TK.adapters || {};

  function byDocOrder(a, b) {
    var pos = a.el.compareDocumentPosition(b.el);
    if (pos & Node.DOCUMENT_POSITION_FOLLOWING) return -1;
    if (pos & Node.DOCUMENT_POSITION_PRECEDING) return 1;
    return 0;
  }

  var adapter = {
    id: "gemini",

    matches: function () { return /(^|\.)gemini\.google\.com$/i.test(location.hostname); },

    getConversationTitle: function () {
      try {
        var selected = document.querySelector(
          '.conversation.selected .conversation-title, [data-test-id="conversation"].selected .conversation-title, .selected .conversation-title'
        );
        if (selected && selected.textContent.trim()) return clean(selected.textContent);
        var t = (document.title || "").replace(/\s*[-–|]\s*Gemini\s*$/i, "").trim();
        if (t && !/^gemini$/i.test(t)) return t;
        var firstQ = document.querySelector(".query-text, user-query .query-text");
        if (firstQ) return snippet(firstQ.textContent);
      } catch (e) {}
      return "Gemini Conversation";
    },

    getMessages: function () {
      var tagged = [];

      // ---- User queries ----
      try {
        var queries = document.querySelectorAll("user-query, .query-content");
        queries.forEach(function (q) {
          var inner = q.querySelector(".query-text") || q.querySelector('[class*="query-text"]') || q;
          tagged.push({ role: "user", el: inner });
        });
      } catch (e) {}

      // ---- Model responses ----
      try {
        var responses = document.querySelectorAll("model-response, message-content.model-response-text, .model-response-text");
        responses.forEach(function (r) {
          var inner = r.querySelector(".markdown") ||
                      r.querySelector("message-content") ||
                      r.querySelector('[class*="markdown"]') || r;
          tagged.push({ role: "assistant", el: inner });
        });
      } catch (e) {}

      if (tagged.length) {
        try { tagged.sort(byDocOrder); } catch (e) {}
        // Deduplicate nested matches (e.g. model-response wrapping model-response-text).
        var seen = [];
        var out = [];
        tagged.forEach(function (t) {
          for (var i = 0; i < seen.length; i++) {
            if (seen[i].contains(t.el) || t.el.contains(seen[i])) return;
          }
          seen.push(t.el);
          out.push({ role: t.role, el: t.el, timestamp: null });
        });
        return out;
      }

      return [];
    },

    getConversationList: function () {
      var out = [];
      try {
        var items = document.querySelectorAll(
          '[data-test-id="conversation"], .conversation-items-container .conversation, .conversation'
        );
        items.forEach(function (it) {
          var titleEl = it.querySelector(".conversation-title") || it;
          var title = clean(titleEl.textContent) || "Conversation";
          // Try to recover a navigable URL / id.
          var url = null, id = null;
          var a = it.querySelector('a[href*="/app/"]') || it.closest && it.closest('a[href*="/app/"]');
          if (a && a.getAttribute("href")) {
            var href = a.getAttribute("href");
            url = href.charAt(0) === "/" ? location.origin + href : href;
            var mm = href.match(/\/app\/([\w-]+)/);
            id = mm ? mm[1] : href;
          } else {
            var jslog = it.getAttribute("jslog") || it.getAttribute("data-conversation-id") || "";
            var cm = jslog.match(/c_([\w-]+)/) || jslog.match(/([0-9a-f]{16,})/i);
            if (cm) { id = cm[1]; url = location.origin + "/app/" + id; }
          }
          if (!id) id = "gemini-" + out.length; // still listed; url may be null
          out.push({ id: id, title: title, url: url });
        });
      } catch (e) {}
      return out;
    },

    getHistoryScrollContainer: function () {
      try {
        var c = document.querySelector(".conversation-items-container, [data-test-id=\"conversations-list\"]");
        if (c) return c;
        var any = document.querySelector('[data-test-id="conversation"], .conversation');
        var el = any && any.parentElement;
        while (el && el !== document.body) {
          var oy = getComputedStyle(el).overflowY;
          if ((oy === "auto" || oy === "scroll") && el.scrollHeight > el.clientHeight) return el;
          el = el.parentElement;
        }
      } catch (e) {}
      return null;
    },

    getConversationId: function () {
      try {
        var m = location.pathname.match(/\/app\/([\w-]+)/);
        return m ? m[1] : null;
      } catch (e) { return null; }
    },

    getComposer: function () {
      try {
        return document.querySelector("rich-textarea .ql-editor") ||
          document.querySelector(".ql-editor") ||
          document.querySelector('rich-textarea div[contenteditable="true"]') ||
          document.querySelector("textarea");
      } catch (e) { return null; }
    }
  };

  function clean(s) { return (s || "").replace(/\s+/g, " ").trim(); }
  function snippet(s) { s = clean(s); return s.length > 60 ? s.slice(0, 57) + "…" : s; }

  TK.adapters.gemini = adapter;
})();
