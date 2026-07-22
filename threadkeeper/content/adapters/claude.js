/* Threadkeeper — content/adapters/claude.js
 * Adapter for claude.ai. User and assistant messages live in separate containers,
 * so we tag each by role and re-sort into document order. Defensive throughout. */
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
    id: "claude",

    matches: function () { return /(^|\.)claude\.ai$/i.test(location.hostname); },

    getConversationTitle: function () {
      try {
        // Claude renders the conversation title in the header button.
        var header = document.querySelector('[data-testid="chat-menu-trigger"], button[data-testid="conversation-title"]');
        if (header && header.textContent.trim()) return clean(header.textContent);
        var active = document.querySelector('a[href^="/chat/"][data-active="true"], nav a[aria-current="page"]');
        if (active && active.textContent.trim()) return clean(active.textContent);
        var t = (document.title || "").replace(/\s*[-–|]\s*Claude\s*$/i, "").trim();
        if (t && !/^claude$/i.test(t)) return t;
      } catch (e) {}
      return "Claude Conversation";
    },

    getMessages: function () {
      var tagged = [];

      // ---- User messages ----
      try {
        var users = document.querySelectorAll('[data-testid="user-message"]');
        users.forEach(function (u) { tagged.push({ role: "user", el: u }); });
      } catch (e) {}

      // ---- Assistant messages ----
      try {
        var bots = document.querySelectorAll(".font-claude-message, .font-claude-response, [data-testid=\"assistant-message\"]");
        bots.forEach(function (b) {
          // Prefer the inner prose container to avoid action toolbars.
          var inner = b.querySelector(".prose") || b;
          tagged.push({ role: "assistant", el: inner });
        });
      } catch (e) {}

      if (tagged.length) {
        try { tagged.sort(byDocOrder); } catch (e) {}
        return tagged.map(function (t) { return { role: t.role, el: t.el, timestamp: null }; });
      }

      // ---- Fallback strategy: generic message containers ----
      try {
        var groups = document.querySelectorAll('div[class*="group"] .prose, [data-test-render-count] .prose');
        if (groups.length) {
          var res = [];
          groups.forEach(function (g, i) {
            res.push({ role: i % 2 === 0 ? "user" : "assistant", el: g, timestamp: null });
          });
          return res;
        }
      } catch (e) {}

      return [];
    },

    getConversationList: function () {
      var out = [];
      var seen = {};
      try {
        var links = document.querySelectorAll('a[href^="/chat/"]');
        links.forEach(function (a) {
          var href = a.getAttribute("href") || "";
          var m = href.match(/\/chat\/([\w-]+)/);
          if (!m || seen[m[1]]) return;
          seen[m[1]] = 1;
          var title = clean(a.textContent) || "Conversation";
          out.push({ id: m[1], title: title, url: location.origin + "/chat/" + m[1] });
        });
      } catch (e) {}
      return out;
    },

    getHistoryScrollContainer: function () {
      try {
        var anyLink = document.querySelector('a[href^="/chat/"]');
        if (!anyLink) return null;
        // Walk up to the nearest scrollable ancestor.
        var el = anyLink.parentElement;
        while (el && el !== document.body) {
          var oy = getComputedStyle(el).overflowY;
          if ((oy === "auto" || oy === "scroll") && el.scrollHeight > el.clientHeight) return el;
          el = el.parentElement;
        }
      } catch (e) {}
      return null;
    }
  };

  function clean(s) { return (s || "").replace(/\s+/g, " ").trim(); }

  TK.adapters.claude = adapter;
})();
