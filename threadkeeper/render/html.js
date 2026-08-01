/* Threadkeeper — render/html.js
 * IR -> standalone, self-contained HTML (inline <style>, no external deps).
 * Includes a tiny dependency-free, regex/scan-based syntax highlighter and a
 * print-friendly stylesheet (also used as the source doc for the PDF path). */
(function () {
  "use strict";
  window.TK = window.TK || {};

  function roleLabel(role) { return role === "user" ? "You" : "Assistant"; }

  /**
   * conversation: { title, site, messages:[{ role, blocks, timestamp }] }
   * settings: { includeTimestamps, includeRoleLabels }
   */
  function render(conversation, settings) {
    settings = settings || {};
    var title = conversation.title || "Conversation";
    var body = [];
    body.push('<header class="tk-header"><h1>' + esc(title) + "</h1>");
    var meta = [];
    if (conversation.site) meta.push(esc(prettySite(conversation.site)));
    meta.push(esc((conversation.messages || []).length) + " messages");
    body.push('<p class="tk-meta">' + meta.join(" &middot; ") + "</p></header>");

    var msgs = conversation.messages || [];
    for (var i = 0; i < msgs.length; i++) {
      var m = msgs[i];
      var cls = m.role === "user" ? "tk-msg tk-user" : "tk-msg tk-assistant";
      body.push('<section class="' + cls + '">');
      if (settings.includeRoleLabels || (settings.includeTimestamps && m.timestamp)) {
        body.push('<div class="tk-role">');
        if (settings.includeRoleLabels) body.push('<span class="tk-role-name">' + esc(roleLabel(m.role)) + "</span>");
        if (settings.includeTimestamps && m.timestamp) body.push('<span class="tk-time">' + esc(m.timestamp) + "</span>");
        body.push("</div>");
      }
      body.push('<div class="tk-content">' + renderBlocks(m.blocks) + "</div>");
      body.push("</section>");
    }

    return doc(title, body.join("\n"));
  }

  function prettySite(site) {
    if (site === "chatgpt") return "ChatGPT";
    if (site === "claude") return "Claude";
    if (site === "gemini") return "Gemini";
    return site;
  }

  function renderBlocks(blocks) {
    var out = [];
    for (var i = 0; i < blocks.length; i++) out.push(renderBlock(blocks[i]));
    return out.join("\n");
  }

  function renderBlock(b) {
    switch (b.type) {
      case "heading":
        var lvl = Math.min(6, Math.max(1, b.level));
        return "<h" + lvl + ">" + inline(b.children) + "</h" + lvl + ">";
      case "paragraph":
        return "<p>" + inline(b.children) + "</p>";
      case "code":
        return codeHtml(b);
      case "list":
        return renderList(b);
      case "blockquote":
        return "<blockquote>" + renderBlocks(b.children) + "</blockquote>";
      case "table":
        return renderTable(b);
      case "image":
        return '<p class="tk-img"><img alt="' + esc(b.alt || "") + '" src="' + escAttr(b.src || "") + '"></p>';
      case "math":
        return '<pre class="tk-math">' + esc(b.latex || "") + "</pre>";
      case "hr":
        return "<hr>";
      case "rawtext":
        return "<p>" + esc(b.text || "") + "</p>";
      default:
        return "";
    }
  }

  function renderList(b) {
    var tag = b.ordered ? "ol" : "ul";
    var startAttr = (b.ordered && b.start && b.start !== 1) ? ' start="' + b.start + '"' : "";
    var out = ["<" + tag + startAttr + ">"];
    for (var i = 0; i < b.items.length; i++) {
      out.push("<li>" + renderItemBlocks(b.items[i].children) + "</li>");
    }
    out.push("</" + tag + ">");
    return out.join("");
  }

  function renderItemBlocks(blocks) {
    // Collapse a single leading paragraph so list items read tightly.
    var out = [];
    for (var i = 0; i < blocks.length; i++) {
      var b = blocks[i];
      if (b.type === "paragraph" && (i === 0 || blocks[i - 1].type !== "paragraph")) {
        // Only unwrap the first paragraph to keep tight items.
        out.push(inline(b.children));
      } else {
        out.push(renderBlock(b));
      }
    }
    return out.join("");
  }

  function renderTable(b) {
    var cols = b.header.length || (b.rows[0] ? b.rows[0].length : 0);
    var out = ['<div class="tk-table-wrap"><table>'];
    if (b.header.length) {
      out.push("<thead><tr>");
      for (var i = 0; i < cols; i++) out.push("<th" + alignAttr(b.align[i]) + ">" + inline(b.header[i] || []) + "</th>");
      out.push("</tr></thead>");
    }
    out.push("<tbody>");
    for (var r = 0; r < b.rows.length; r++) {
      out.push("<tr>");
      for (var c = 0; c < cols; c++) out.push("<td" + alignAttr(b.align[c]) + ">" + inline(b.rows[r][c] || []) + "</td>");
      out.push("</tr>");
    }
    out.push("</tbody></table></div>");
    return out.join("");
  }

  function alignAttr(a) {
    if (a === "c") return ' style="text-align:center"';
    if (a === "r") return ' style="text-align:right"';
    if (a === "l") return ' style="text-align:left"';
    return "";
  }

  // ---- Inline ----------------------------------------------------------------

  function inline(nodes) {
    if (!nodes) return "";
    var s = "";
    for (var i = 0; i < nodes.length; i++) s += inlineNode(nodes[i]);
    return s;
  }

  function inlineNode(n) {
    switch (n.type) {
      case "text": return esc(n.text || "");
      case "strong": return "<strong>" + inline(n.children) + "</strong>";
      case "em": return "<em>" + inline(n.children) + "</em>";
      case "del": return "<s>" + inline(n.children) + "</s>";
      case "code": return "<code>" + esc(n.text || "") + "</code>";
      case "link": return '<a href="' + escAttr(n.href || "") + '" target="_blank" rel="noopener">' + (inline(n.children) || esc(n.href || "")) + "</a>";
      case "image": return '<img class="tk-inline-img" alt="' + esc(n.alt || "") + '" src="' + escAttr(n.src || "") + '">';
      case "math": return '<code class="tk-math-inline">' + esc(n.latex || "") + "</code>";
      case "br": return "<br>";
      default: return "";
    }
  }

  // ---- Code + tiny syntax highlighter ---------------------------------------

  function codeHtml(b) {
    var langClass = b.lang ? ' class="language-' + escAttr(b.lang) + '"' : "";
    var langBadge = b.lang ? '<span class="tk-lang">' + esc(b.lang) + "</span>" : "";
    return '<div class="tk-code">' + langBadge + "<pre><code" + langClass + ">" +
      highlight(b.text || "", b.lang || "") + "</code></pre></div>";
  }

  var KEYWORDS = {};
  (
    "abstract as async await boolean break byte case catch char class const continue " +
    "debugger def default del delete do double elif else enum export extends false final " +
    "finally float for from func function global goto if implements import in instanceof " +
    "int interface is lambda let long namespace native new nil none not null or package " +
    "pass print private protected public raise return short static struct super switch " +
    "synchronized this throw throws transient true try typeof var void volatile while with " +
    "yield and echo fn impl match mod move mut pub ref trait unsafe use where fmt select " +
    "type map range chan defer go interface"
  ).split(" ").forEach(function (k) { KEYWORDS[k] = 1; });

  function isIdentStart(c) { return /[A-Za-z_$]/.test(c); }
  function isIdent(c) { return /[A-Za-z0-9_$]/.test(c); }
  function isDigit(c) { return c >= "0" && c <= "9"; }

  function highlight(code, lang) {
    var hashComments = !/^(c|cpp|c\+\+|cs|csharp|java|js|javascript|ts|typescript|go|rust|rs|json|swift|kotlin|scala|php)$/i.test(lang);
    var out = "";
    var i = 0, n = code.length;
    while (i < n) {
      var c = code.charAt(i);
      var two = code.substr(i, 2);
      // Line comments
      if (two === "//" || (hashComments && c === "#")) {
        var j = code.indexOf("\n", i);
        if (j === -1) j = n;
        out += span("c", code.slice(i, j));
        i = j;
        continue;
      }
      // Block comments
      if (two === "/*") {
        var end = code.indexOf("*/", i + 2);
        if (end === -1) end = n; else end += 2;
        out += span("c", code.slice(i, end));
        i = end;
        continue;
      }
      // Strings
      if (c === '"' || c === "'" || c === "`") {
        var k = i + 1;
        while (k < n) {
          if (code.charAt(k) === "\\") { k += 2; continue; }
          if (code.charAt(k) === c) { k++; break; }
          k++;
        }
        out += span("s", code.slice(i, k));
        i = k;
        continue;
      }
      // Numbers
      if (isDigit(c) || (c === "." && isDigit(code.charAt(i + 1)))) {
        var m = i;
        while (m < n && /[0-9a-fx._]/i.test(code.charAt(m))) m++;
        out += span("n", code.slice(i, m));
        i = m;
        continue;
      }
      // Identifiers / keywords
      if (isIdentStart(c)) {
        var p = i;
        while (p < n && isIdent(code.charAt(p))) p++;
        var word = code.slice(i, p);
        if (KEYWORDS[word]) out += span("k", word);
        else out += esc(word);
        i = p;
        continue;
      }
      out += esc(c);
      i++;
    }
    return out;
  }

  function span(kind, text) { return '<span class="tk-' + kind + '">' + esc(text) + "</span>"; }

  // ---- Escaping --------------------------------------------------------------

  function esc(s) {
    if (s == null) return "";
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }
  function escAttr(s) {
    return esc(s).replace(/"/g, "&quot;");
  }

  // ---- Document shell + CSS ---------------------------------------------------

  function doc(title, bodyHtml) {
    return "<!DOCTYPE html>\n<html lang=\"en\"><head>\n<meta charset=\"utf-8\">\n" +
      '<meta name="viewport" content="width=device-width, initial-scale=1">\n' +
      "<title>" + esc(title) + "</title>\n<style>\n" + CSS + "</style>\n</head>\n<body>\n" +
      '<main class="tk-doc">\n' + bodyHtml + "\n</main>\n" +
      '<footer class="tk-footer">Exported with Threadkeeper</footer>\n</body></html>';
  }

  var CSS = [
    ":root{--bg:#FBFAF8;--fg:#171A19;--muted:#8A867E;--border:#E3E0D9;--code-bg:#F3F1ED;--code-fg:#171A19;--user-bg:#F1EFE9;--accent:#15211F;--rule:#A9741C;--kw:#8C3A6B;--str:#2F6B45;--com:#8A867E;--num:#A9741C;}",
    "@media (prefers-color-scheme: dark){:root{--bg:#131615;--fg:#F1F0EC;--muted:#7B7A73;--border:#272B2A;--code-bg:#191D1C;--code-fg:#F1F0EC;--user-bg:#191D1C;--accent:#F1F0EC;--rule:#E0A33E;--kw:#E6A3C8;--str:#8FD9A8;--com:#7B7A73;--num:#E0A33E;}}",
    "*{box-sizing:border-box;}",
    "body{margin:0;background:var(--bg);color:var(--fg);font-variant-numeric:tabular-nums;-webkit-font-smoothing:antialiased;font:16px/1.65 ui-sans-serif,-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;}",
    ".tk-doc{max-width:760px;margin:0 auto;padding:52px 24px 24px;}",
    ".tk-header{border-bottom:2px solid var(--rule);padding-bottom:14px;margin-bottom:30px;}",
    ".tk-header h1{font-size:1.85rem;line-height:1.2;margin:0 0 5px;letter-spacing:-.02em;}",
    ".tk-meta{color:var(--muted);font-size:.8rem;margin:0;letter-spacing:.02em;}",
    ".tk-msg{padding:16px 18px;margin:0 0 14px;border:1px solid var(--border);border-radius:10px;}",
    ".tk-user{background:var(--user-bg);}",
    ".tk-role{display:flex;align-items:baseline;gap:10px;margin-bottom:8px;}",
    ".tk-role-name{font-weight:700;color:var(--muted);font-size:.68rem;letter-spacing:.09em;text-transform:uppercase;}",
    ".tk-time{color:var(--muted);font-size:.75rem;}",
    ".tk-content>*:first-child{margin-top:0;}.tk-content>*:last-child{margin-bottom:0;}",
    ".tk-content p{margin:0 0 14px;}",
    ".tk-content h1,.tk-content h2,.tk-content h3,.tk-content h4,.tk-content h5,.tk-content h6{line-height:1.3;margin:22px 0 10px;}",
    ".tk-content ul,.tk-content ol{margin:0 0 14px;padding-left:1.6em;}",
    ".tk-content li{margin:4px 0;}",
    "a{color:var(--accent);text-decoration:none;}a:hover{text-decoration:underline;}",
    "img{max-width:100%;height:auto;border-radius:6px;}",
    ".tk-inline-img{vertical-align:middle;}",
    "blockquote{margin:0 0 14px;padding:2px 16px;border-left:2px solid var(--rule);color:var(--muted);}",
    "code{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,'Liberation Mono',monospace;font-size:.89em;background:var(--code-bg);padding:.15em .4em;border-radius:4px;}",
    ".tk-code{position:relative;margin:0 0 16px;}",
    ".tk-code pre{margin:0;background:var(--code-bg);color:var(--code-fg);padding:14px 16px;border-radius:8px;overflow-x:auto;border:1px solid var(--border);}",
    ".tk-code pre code{background:none;padding:0;font-size:.85rem;line-height:1.55;white-space:pre;}",
    ".tk-lang{position:absolute;top:0;right:0;color:var(--muted);font:700 .62rem/1 ui-monospace,monospace;padding:7px 10px;text-transform:uppercase;letter-spacing:.09em;}",
    ".tk-k{color:var(--kw);font-weight:600;}.tk-s{color:var(--str);}.tk-c{color:var(--com);font-style:italic;}.tk-n{color:var(--num);}",
    ".tk-table-wrap{overflow-x:auto;margin:0 0 16px;}",
    "table{border-collapse:collapse;width:100%;font-size:.92rem;}",
    "th,td{border:1px solid var(--border);padding:7px 11px;text-align:left;}",
    "thead th{background:var(--code-bg);}",
    ".tk-math,.tk-math-inline{font-family:ui-monospace,monospace;background:var(--code-bg);}",
    ".tk-math{padding:10px 14px;border-radius:8px;overflow-x:auto;}",
    "hr{border:none;border-top:1px solid var(--border);margin:20px 0;}",
    ".tk-footer{max-width:820px;margin:0 auto;padding:16px 24px 40px;color:var(--muted);font-size:.75rem;text-align:center;}",
    /* ---- Print / PDF ---- */
    "@media print{",
    "  :root{--bg:#fff;--fg:#111;--user-bg:#f4f6ff;}",
    "  body{font-size:12pt;}",
    "  .tk-doc{max-width:none;padding:0;}",
    "  .tk-footer{display:none;}",
    "  .tk-msg{break-inside:avoid;page-break-inside:avoid;border-color:#ccc;}",
    "  .tk-code,pre,blockquote,table,.tk-img{break-inside:avoid;page-break-inside:avoid;}",
    "  a{color:inherit;text-decoration:underline;}",
    "  @page{margin:16mm;}",
    "}"
  ].join("\n");

  TK.html = { render: render, _highlight: highlight, _css: CSS };
})();
