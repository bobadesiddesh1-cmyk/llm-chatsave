/* Threadkeeper — content/adapters/chatgpt.js
 * Adapter for chatgpt.com. Ships multiple fallback selector strategies. Every
 * public method is defensive and never throws. */
(function () {
  "use strict";
  window.TK = window.TK || {};
  TK.adapters = TK.adapters || {};

  function docOrder(a, b) {
    var pos = a.el.compareDocumentPosition(b.el);
    if (pos & Node.DOCUMENT_POSITION_FOLLOWING) return -1;
    if (pos & Node.DOCUMENT_POSITION_PRECEDING) return 1;
    return 0;
  }

  function contentElFor(turnEl, role) {
    // Prefer the rich markdown container; fall back progressively.
    return turnEl.querySelector(".markdown") ||
      turnEl.querySelector('[data-message-author-role] .prose') ||
      turnEl.querySelector(".whitespace-pre-wrap") ||
      turnEl.querySelector('[class*="markdown"]') ||
      turnEl;
  }

  var adapter = {
    id: "chatgpt",

    matches: function () {
      return /(^|\.)chatgpt\.com$/i.test(location.hostname) ||
             /(^|\.)chat\.openai\.com$/i.test(location.hostname);
    },

    getConversationTitle: function () {
      try {
        // Active sidebar item is the most reliable title source.
        var active = document.querySelector('nav a[data-active], nav a[aria-current="page"]');
        if (active && active.textContent.trim()) return clean(active.textContent);
        var t = (document.title || "").replace(/\s*[-–|]\s*ChatGPT\s*$/i, "").trim();
        if (t && !/^chatgpt$/i.test(t)) return t;
        // Fallback: first user message snippet.
        var first = adapter.getMessages()[0];
        if (first) return snippet(first.el.textContent);
      } catch (e) {}
      return "ChatGPT Conversation";
    },

    getMessages: function () {
      // Strategy 1: explicit author-role nodes.
      try {
        var nodes = document.querySelectorAll("[data-message-author-role]");
        if (nodes.length) {
          var out = [];
          nodes.forEach(function (n) {
            var role = n.getAttribute("data-message-author-role");
            role = role === "user" ? "user" : "assistant";
            out.push({ role: role, el: contentElFor(n, role), timestamp: readTs(n) });
          });
          return out;
        }
      } catch (e) {}

      // Strategy 2: conversation-turn articles, role inferred from a heading.
      try {
        var turns = document.querySelectorAll('article[data-testid^="conversation-turn"], article[data-testid*="conversation-turn"]');
        if (turns.length) {
          var res = [];
          turns.forEach(function (t) {
            var h = t.querySelector("h5, h6");
            var label = h ? h.textContent.toLowerCase() : "";
            var role = /you/.test(label) ? "user" : "assistant";
            var inner = t.querySelector(".markdown") || t.querySelector(".whitespace-pre-wrap") || t;
            res.push({ role: role, el: inner, timestamp: null });
          });
          return res;
        }
      } catch (e) {}

      return [];
    },

    getConversationList: function () {
      var out = [];
      try {
        var links = document.querySelectorAll('nav a[href^="/c/"], nav a[href^="/g/"][href*="/c/"]');
        links.forEach(function (a) {
          var href = a.getAttribute("href") || "";
          var m = href.match(/\/c\/([\w-]+)/);
          if (!m) return;
          var title = clean(a.textContent) || "Conversation";
          out.push({ id: m[1], title: title, url: location.origin + "/c/" + m[1] });
        });
      } catch (e) {}
      return out;
    },

    getHistoryScrollContainer: function () {
      try {
        var nav = document.querySelector("nav");
        if (!nav) return null;
        // Find the scrollable descendant (or the nav itself).
        var scroller = nav.querySelector('[class*="overflow-y-auto"], [class*="overflow-y-scroll"]');
        return scroller || nav;
      } catch (e) { return null; }
    }
  };

  function readTs(n) {
    try {
      var t = n.querySelector("time");
      if (t) return t.getAttribute("datetime") || t.textContent.trim();
    } catch (e) {}
    return null;
  }
  function clean(s) { return (s || "").replace(/\s+/g, " ").trim(); }
  function snippet(s) { s = clean(s); return s.length > 60 ? s.slice(0, 57) + "…" : s; }

  TK.adapters.chatgpt = adapter;
})();
