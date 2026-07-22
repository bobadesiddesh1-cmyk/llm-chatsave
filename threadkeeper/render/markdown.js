/* Threadkeeper — render/markdown.js
 * IR -> GitHub-flavored Markdown. Consumes the same IR the HTML renderer does. */
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
    var out = [];
    out.push("# " + escapeText(conversation.title || "Conversation"));
    out.push("");

    var msgs = conversation.messages || [];
    for (var i = 0; i < msgs.length; i++) {
      var m = msgs[i];
      if (settings.includeRoleLabels) {
        out.push("### " + roleLabel(m.role));
      }
      if (settings.includeTimestamps && m.timestamp) {
        out.push("*" + escapeText(m.timestamp) + "*");
        out.push("");
      } else if (settings.includeRoleLabels) {
        out.push("");
      }
      out.push(renderBlocks(m.blocks, 0).replace(/\n{3,}/g, "\n\n").trim());
      out.push("");
      if (i < msgs.length - 1) { out.push("---"); out.push(""); }
    }
    return out.join("\n").replace(/\n{3,}/g, "\n\n").trim() + "\n";
  }

  function renderBlocks(blocks, depth) {
    var parts = [];
    for (var i = 0; i < blocks.length; i++) {
      parts.push(renderBlock(blocks[i], depth));
    }
    return parts.join("\n\n");
  }

  function renderBlock(b, depth) {
    switch (b.type) {
      case "heading":
        return "#".repeat(Math.min(6, Math.max(1, b.level))) + " " + inline(b.children);
      case "paragraph":
        return inline(b.children);
      case "code":
        return fence(b);
      case "list":
        return renderList(b, depth);
      case "blockquote":
        return renderBlocks(b.children, depth)
          .split("\n").map(function (l) { return l.length ? "> " + l : ">"; }).join("\n");
      case "table":
        return renderTable(b);
      case "image":
        return "![" + escapeText(b.alt || "") + "](" + (b.src || "") + ")";
      case "math":
        return "$$\n" + (b.latex || "") + "\n$$";
      case "hr":
        return "---";
      case "rawtext":
        return escapeText(b.text || "");
      default:
        return "";
    }
  }

  function fence(b) {
    var text = b.text != null ? b.text : "";
    // Choose a fence long enough to not collide with backticks inside the code.
    var longest = 0, run = 0;
    for (var i = 0; i < text.length; i++) {
      if (text.charAt(i) === "`") { run++; if (run > longest) longest = run; }
      else run = 0;
    }
    var ticks = "`".repeat(Math.max(3, longest + 1));
    return ticks + (b.lang || "") + "\n" + text + "\n" + ticks;
  }

  function renderList(b, depth) {
    var lines = [];
    var indent = "  ".repeat(depth);
    for (var i = 0; i < b.items.length; i++) {
      var marker = b.ordered ? ((b.start || 1) + i) + ". " : "- ";
      var itemBlocks = b.items[i].children;
      var rendered = renderItemBlocks(itemBlocks, depth);
      // First line gets the marker; continuation lines are hanging-indented.
      var pad = " ".repeat(marker.length);
      var itemLines = rendered.split("\n");
      var first = true;
      for (var j = 0; j < itemLines.length; j++) {
        if (itemLines[j] === "" ) { lines.push(""); continue; }
        if (first) { lines.push(indent + marker + itemLines[j]); first = false; }
        else { lines.push(indent + pad + itemLines[j]); }
      }
    }
    return lines.join("\n");
  }

  function renderItemBlocks(blocks, depth) {
    // Within a list item, nested lists increase depth; other blocks render inline-ish.
    var parts = [];
    for (var i = 0; i < blocks.length; i++) {
      var b = blocks[i];
      if (b.type === "list") parts.push(renderList(b, depth + 1));
      else parts.push(renderBlock(b, depth + 1));
    }
    return parts.join("\n\n");
  }

  function renderTable(b) {
    var cols = b.header.length || (b.rows[0] ? b.rows[0].length : 0);
    if (!cols) return "";
    var headerCells = [];
    for (var i = 0; i < cols; i++) {
      headerCells.push(cellText(b.header[i] || []));
    }
    var sep = [];
    for (var c = 0; c < cols; c++) {
      var a = b.align[c];
      if (a === "c") sep.push(":---:");
      else if (a === "r") sep.push("---:");
      else if (a === "l") sep.push(":---");
      else sep.push("---");
    }
    var lines = [];
    lines.push("| " + headerCells.join(" | ") + " |");
    lines.push("| " + sep.join(" | ") + " |");
    for (var r = 0; r < b.rows.length; r++) {
      var row = [];
      for (var k = 0; k < cols; k++) row.push(cellText(b.rows[r][k] || []));
      lines.push("| " + row.join(" | ") + " |");
    }
    return lines.join("\n");
  }

  function cellText(inlines) {
    // Table cells can't contain raw newlines or unescaped pipes.
    return inline(inlines).replace(/\n+/g, " ").replace(/\|/g, "\\|").trim();
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
      case "text": return escapeText(n.text || "");
      case "strong": return "**" + inline(n.children) + "**";
      case "em": return "*" + inline(n.children) + "*";
      case "del": return "~~" + inline(n.children) + "~~";
      case "code": return inlineCode(n.text || "");
      case "link": {
        var txt = inline(n.children) || (n.href || "");
        return "[" + txt + "](" + (n.href || "") + ")";
      }
      case "image": return "![" + escapeText(n.alt || "") + "](" + (n.src || "") + ")";
      case "math": return "$" + (n.latex || "") + "$";
      case "br": return "  \n";
      default: return "";
    }
  }

  function inlineCode(text) {
    // Pick a backtick run longer than any inside the text.
    var longest = 0, run = 0;
    for (var i = 0; i < text.length; i++) {
      if (text.charAt(i) === "`") { run++; if (run > longest) longest = run; }
      else run = 0;
    }
    var ticks = "`".repeat(longest + 1);
    var pad = (text.charAt(0) === "`" || text.charAt(text.length - 1) === "`") ? " " : "";
    return ticks + pad + text + pad + ticks;
  }

  function escapeText(text) {
    if (text == null) return "";
    // Escape characters that would otherwise be interpreted as Markdown syntax.
    // Keep it conservative to preserve readability.
    return String(text).replace(/([\\`*_{}\[\]#<>])/g, "\\$1");
  }

  TK.markdown = { render: render };
})();
