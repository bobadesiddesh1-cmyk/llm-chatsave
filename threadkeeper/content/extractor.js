/* Threadkeeper — content/extractor.js
 * THE CORE IP. Walks a message's DOM element into a format-agnostic Intermediate
 * Representation (IR) of block + inline nodes. All renderers consume this same IR,
 * so Markdown / HTML / PDF stay structurally consistent.
 *
 * IR block node types:
 *   { type:'heading', level:1-6, children:[inline] }
 *   { type:'paragraph', children:[inline] }
 *   { type:'list', ordered:bool, start:number, items:[{ children:[block] }] }
 *   { type:'code', lang:string, text:string }
 *   { type:'blockquote', children:[block] }
 *   { type:'table', align:[l|c|r|null], header:[[inline]], rows:[[[inline]]] }
 *   { type:'image', src, alt }
 *   { type:'math', latex, display:true }
 *   { type:'hr' }
 *   { type:'rawtext', text }            // fallback safety net
 *
 * IR inline node types:
 *   { type:'text', text }
 *   { type:'strong'|'em'|'del', children:[inline] }
 *   { type:'code', text }
 *   { type:'link', href, children:[inline] }
 *   { type:'image', src, alt }
 *   { type:'math', latex }              // inline math
 *   { type:'br' }
 */
(function () {
  "use strict";
  window.TK = window.TK || {};

  var BLOCK_TAGS = {
    P: 1, DIV: 1, SECTION: 1, ARTICLE: 1, MAIN: 1, HEADER: 1, FOOTER: 1, ASIDE: 1,
    UL: 1, OL: 1, LI: 1, PRE: 1, TABLE: 1, THEAD: 1, TBODY: 1, TFOOT: 1, TR: 1,
    BLOCKQUOTE: 1, HR: 1, FIGURE: 1, FIGCAPTION: 1, DL: 1, DD: 1, DT: 1,
    H1: 1, H2: 1, H3: 1, H4: 1, H5: 1, H6: 1
  };

  function tag(el) { return el && el.tagName ? el.tagName.toUpperCase() : ""; }

  function hasClass(el, needle) {
    if (!el || !el.className || typeof el.className !== "string") return false;
    return el.className.toLowerCase().indexOf(needle) !== -1;
  }

  function containsBlock(el) {
    // Does this element contain any block-level descendant?
    try {
      var kids = el.children;
      for (var i = 0; i < kids.length; i++) {
        var t = tag(kids[i]);
        if (BLOCK_TAGS[t]) return true;
        if (containsBlock(kids[i])) return true;
      }
    } catch (e) {}
    return false;
  }

  // ---- Math (KaTeX / MathJax) ------------------------------------------------

  function isMathEl(el) {
    return hasClass(el, "katex") || hasClass(el, "mathjax") || tag(el) === "MJX-CONTAINER" ||
      (el.getAttribute && el.getAttribute("data-katex") != null);
  }

  function extractLatex(el) {
    // KaTeX and many MathJax configs embed the TeX source in an annotation node.
    try {
      var ann = el.querySelector('annotation[encoding="application/x-tex"]');
      if (ann && ann.textContent) return ann.textContent.trim();
      // MathJax v2 leftover script tag.
      var script = el.querySelector('script[type^="math/tex"]');
      if (script && script.textContent) return script.textContent.trim();
      // Some renderers stash the source in a data attribute.
      var da = el.getAttribute && (el.getAttribute("data-latex") || el.getAttribute("data-tex"));
      if (da) return da.trim();
    } catch (e) {}
    return null;
  }

  function isDisplayMath(el) {
    return hasClass(el, "katex-display") || hasClass(el, "mathjax-display") ||
      (el.getAttribute && el.getAttribute("display") === "true");
  }

  // ---- Code blocks -----------------------------------------------------------

  function isCodeBlockEl(el) {
    var t = tag(el);
    if (t === "PRE") return true;
    // Site-specific wrappers that contain a single <pre> (e.g. ChatGPT/Gemini).
    if ((t === "DIV" || t === "CODE-BLOCK") && el.querySelector) {
      var pre = el.querySelector("pre");
      if (pre && el.querySelectorAll("pre").length === 1 && !containsProseSibling(el, pre)) return true;
    }
    return false;
  }

  function containsProseSibling(wrapper, pre) {
    // If the wrapper holds meaningful non-code text outside the <pre>, don't treat
    // the whole wrapper as a code block.
    try {
      var clone = wrapper.cloneNode(true);
      var innerPre = clone.querySelector("pre");
      if (innerPre) innerPre.remove();
      // Ignore common toolbar words.
      var txt = (clone.textContent || "").replace(/copy|edit|code/gi, "").trim();
      return txt.length > 3;
    } catch (e) { return false; }
  }

  function detectLang(preOrWrapper, codeEl) {
    // 1) language-* / lang-* class on the <code> or <pre>.
    var candidates = [codeEl, preOrWrapper];
    for (var i = 0; i < candidates.length; i++) {
      var c = candidates[i];
      if (!c || !c.className || typeof c.className !== "string") continue;
      var m = c.className.match(/(?:language|lang)-([a-z0-9+#.-]+)/i);
      if (m) return m[1].toLowerCase();
    }
    // 2) A visible language label near the block (ChatGPT/Gemini header row).
    try {
      var header = preOrWrapper.previousElementSibling || (preOrWrapper.parentElement && preOrWrapper.parentElement.firstElementChild);
      var scan = preOrWrapper.querySelector && preOrWrapper.querySelector("*");
      var labelHosts = [header];
      // ChatGPT nests a header div as the first child of the <pre> or its wrapper.
      if (preOrWrapper.firstElementChild) labelHosts.push(preOrWrapper.firstElementChild);
      for (var j = 0; j < labelHosts.length; j++) {
        var h = labelHosts[j];
        if (!h) continue;
        var first = (h.textContent || "").trim().split(/\s|\n/)[0].toLowerCase();
        if (first && first.length <= 20 && /^[a-z0-9+#.-]+$/.test(first) &&
            first !== "copy" && first !== "edit" && first !== "code") {
          return first;
        }
      }
    } catch (e) {}
    return "";
  }

  function codeBlock(el, ctx) {
    try {
      var codeEl = el.querySelector ? el.querySelector("code") : null;
      var textSource = codeEl || el;
      var lang = detectLang(el, codeEl);
      var text = textSource.textContent != null ? textSource.textContent : "";
      // Strip a single leading newline artifacts common in rendered blocks.
      text = text.replace(/\n$/, "");
      return { type: "code", lang: lang, text: text };
    } catch (e) {
      ctx.fallbackCount++;
      return { type: "rawtext", text: safeText(el) };
    }
  }

  // ---- Whitespace handling ---------------------------------------------------
  // In normal HTML, runs of whitespace (including the newlines/indentation in the
  // source) collapse to a single space. In a `white-space: pre*` context (e.g. a
  // ChatGPT user message in a pre-wrap div), newlines are significant. We honour
  // both: collapse in normal flow, preserve line breaks (as <br>) in pre contexts.

  function textNodeIsPre(node) {
    try {
      var ws = getComputedStyle(node.parentElement).whiteSpace;
      return !!ws && ws.slice(0, 3) === "pre";
    } catch (e) { return false; }
  }

  function emitText(out, node) {
    var raw = node.textContent || "";
    if (textNodeIsPre(node)) {
      var parts = raw.split("\n");
      for (var i = 0; i < parts.length; i++) {
        if (i > 0) out.push({ type: "br" });
        if (parts[i] !== "") out.push({ type: "text", text: parts[i] });
      }
    } else {
      out.push({ type: "text", text: raw.replace(/\s+/g, " ") });
    }
  }

  // ---- Inline walking --------------------------------------------------------

  function walkInline(el, ctx) {
    var out = [];
    var nodes = el.childNodes;
    for (var i = 0; i < nodes.length; i++) {
      try {
        pushInline(out, nodes[i], ctx);
      } catch (e) {
        ctx.fallbackCount++;
        out.push({ type: "text", text: safeText(nodes[i]) });
      }
    }
    return out;
  }

  function pushInline(out, node, ctx) {
    if (node.nodeType === 3) { // text
      emitText(out, node);
      return;
    }
    if (node.nodeType !== 1) return; // comments etc.
    var t = tag(node);

    if (isMathEl(node)) {
      var latex = extractLatex(node);
      if (latex != null) { out.push({ type: "math", latex: latex }); }
      else { ctx.fallbackCount++; out.push({ type: "text", text: "[math expression]" }); }
      return;
    }

    switch (t) {
      case "STRONG": case "B":
        out.push({ type: "strong", children: walkInline(node, ctx) }); return;
      case "EM": case "I":
        out.push({ type: "em", children: walkInline(node, ctx) }); return;
      case "DEL": case "S": case "STRIKE":
        out.push({ type: "del", children: walkInline(node, ctx) }); return;
      case "CODE": case "KBD": case "SAMP": case "TT":
        out.push({ type: "code", text: node.textContent || "" }); return;
      case "A":
        out.push({ type: "link", href: node.getAttribute("href") || "", children: walkInline(node, ctx) }); return;
      case "BR":
        out.push({ type: "br" }); return;
      case "IMG":
        out.push(imageInline(node)); return;
      case "SPAN": case "MARK": case "SUB": case "SUP": case "U": case "SMALL":
      case "FONT": case "ABBR": case "CITE": case "Q": case "TIME": case "WBR":
      case "INS": case "VAR": case "BDI": case "BDO":
        // Transparent inline wrappers: recurse.
        var kids = walkInline(node, ctx);
        for (var k = 0; k < kids.length; k++) out.push(kids[k]);
        return;
      default:
        // Unknown/likely-inline element: recurse; if it yields nothing, fall back.
        var rec = walkInline(node, ctx);
        if (rec.length) { for (var m = 0; m < rec.length; m++) out.push(rec[m]); }
        else { out.push({ type: "text", text: node.textContent || "" }); }
        return;
    }
  }

  function imageInline(node) {
    return {
      type: "image",
      src: node.getAttribute("src") || node.currentSrc || node.getAttribute("data-src") || "",
      alt: node.getAttribute("alt") || ""
    };
  }

  // ---- Block walking ---------------------------------------------------------

  function walkBlocks(container, ctx) {
    var blocks = [];
    var inlineBuf = [];

    function flush() {
      if (!inlineBuf.length) return;
      var buf = inlineBuf;
      inlineBuf = [];
      if (inlineHasContent(buf)) blocks.push({ type: "paragraph", children: buf });
    }
    function pushInlineBuf(arr) { for (var i = 0; i < arr.length; i++) inlineBuf.push(arr[i]); }

    var nodes = container.childNodes;
    for (var i = 0; i < nodes.length; i++) {
      var node = nodes[i];
      try {
        if (node.nodeType === 3) {
          if (node.textContent && node.textContent.trim() !== "") {
            emitText(inlineBuf, node);
          }
          continue;
        }
        if (node.nodeType !== 1) continue;
        var t = tag(node);

        // Display math is a block.
        if (isMathEl(node) && isDisplayMath(node)) {
          flush();
          var dl = extractLatex(node);
          if (dl != null) blocks.push({ type: "math", latex: dl, display: true });
          else { ctx.fallbackCount++; blocks.push({ type: "rawtext", text: "[math expression]" }); }
          continue;
        }
        // Inline math sitting directly among block children -> buffer as inline.
        if (isMathEl(node)) { pushInlineBuf([]); pushInline(inlineBuf, node, ctx); continue; }

        if (isCodeBlockEl(node)) { flush(); blocks.push(codeBlock(node, ctx)); continue; }

        switch (t) {
          case "H1": case "H2": case "H3": case "H4": case "H5": case "H6":
            flush();
            blocks.push({ type: "heading", level: parseInt(t.charAt(1), 10), children: walkInline(node, ctx) });
            break;
          case "P":
            flush();
            blocks.push({ type: "paragraph", children: walkInline(node, ctx) });
            break;
          case "UL": case "OL":
            flush();
            blocks.push(listBlock(node, ctx));
            break;
          case "TABLE":
            flush();
            blocks.push(tableBlock(node, ctx));
            break;
          case "BLOCKQUOTE":
            flush();
            blocks.push({ type: "blockquote", children: walkBlocks(node, ctx) });
            break;
          case "HR":
            flush();
            blocks.push({ type: "hr" });
            break;
          case "FIGURE":
            flush();
            appendFigure(blocks, node, ctx);
            break;
          case "IMG":
            inlineBuf.push(imageInline(node));
            break;
          case "BR":
            inlineBuf.push({ type: "br" });
            break;
          case "DL":
            flush();
            appendDefinitionList(blocks, node, ctx);
            break;
          case "DIV": case "SECTION": case "ARTICLE": case "MAIN":
          case "HEADER": case "FOOTER": case "ASIDE":
            if (containsBlock(node)) {
              flush();
              var inner = walkBlocks(node, ctx);
              for (var b = 0; b < inner.length; b++) blocks.push(inner[b]);
            } else {
              pushInlineBuf(walkInline(node, ctx));
            }
            break;
          default:
            // Inline-ish element among blocks: buffer it.
            pushInline(inlineBuf, node, ctx);
        }
      } catch (e) {
        ctx.fallbackCount++;
        flush();
        blocks.push({ type: "rawtext", text: safeText(node) });
      }
    }
    flush();
    return blocks;
  }

  function listBlock(listEl, ctx) {
    var ordered = tag(listEl) === "OL";
    var start = 1;
    if (ordered) {
      var s = parseInt(listEl.getAttribute("start"), 10);
      if (!isNaN(s)) start = s;
    }
    var items = [];
    var kids = listEl.children;
    for (var i = 0; i < kids.length; i++) {
      if (tag(kids[i]) !== "LI") continue;
      items.push({ children: walkBlocks(kids[i], ctx) });
    }
    return { type: "list", ordered: ordered, start: start, items: items };
  }

  function tableBlock(tableEl, ctx) {
    var header = [];
    var rows = [];
    var align = [];
    try {
      var trs = tableEl.querySelectorAll("tr");
      var headerDone = false;
      for (var r = 0; r < trs.length; r++) {
        var cells = trs[r].children;
        var isHeaderRow = false;
        var rowCells = [];
        for (var c = 0; c < cells.length; c++) {
          var cell = cells[c];
          var ct = tag(cell);
          if (ct !== "TD" && ct !== "TH") continue;
          if (ct === "TH") isHeaderRow = true;
          rowCells.push(walkInline(cell, ctx));
          if (!headerDone) {
            align.push(cellAlign(cell));
          }
        }
        if (!headerDone && isHeaderRow) {
          header = rowCells;
          headerDone = true;
        } else {
          rows.push(rowCells);
        }
      }
      // If no TH-based header was found, promote the first row.
      if (!header.length && rows.length) {
        header = rows.shift();
      }
    } catch (e) {
      ctx.fallbackCount++;
      return { type: "rawtext", text: safeText(tableEl) };
    }
    return { type: "table", align: align, header: header, rows: rows };
  }

  function cellAlign(cell) {
    try {
      var a = (cell.getAttribute("align") || "").toLowerCase();
      if (a === "left" || a === "center" || a === "right") return a.charAt(0) === "c" ? "c" : a.charAt(0);
      var ta = (cell.style && cell.style.textAlign) || "";
      if (ta.indexOf("center") !== -1) return "c";
      if (ta.indexOf("right") !== -1) return "r";
      if (ta.indexOf("left") !== -1) return "l";
    } catch (e) {}
    return null;
  }

  function appendFigure(blocks, figEl, ctx) {
    try {
      var img = figEl.querySelector("img");
      if (img) {
        var ii = imageInline(img);
        blocks.push({ type: "image", src: ii.src, alt: ii.alt });
      }
      var cap = figEl.querySelector("figcaption");
      if (cap && (cap.textContent || "").trim()) {
        blocks.push({ type: "paragraph", children: walkInline(cap, ctx) });
      }
      if (!img && !cap) {
        var inner = walkBlocks(figEl, ctx);
        for (var i = 0; i < inner.length; i++) blocks.push(inner[i]);
      }
    } catch (e) {
      ctx.fallbackCount++;
      blocks.push({ type: "rawtext", text: safeText(figEl) });
    }
  }

  function appendDefinitionList(blocks, dl, ctx) {
    // Render <dl> as a simple list of "term — definition" paragraphs.
    var kids = dl.children;
    var currentTerm = null;
    for (var i = 0; i < kids.length; i++) {
      var t = tag(kids[i]);
      if (t === "DT") currentTerm = walkInline(kids[i], ctx);
      else if (t === "DD") {
        var line = [];
        if (currentTerm) { line = currentTerm.concat([{ type: "text", text: " — " }]); }
        line = line.concat(walkInline(kids[i], ctx));
        blocks.push({ type: "paragraph", children: line });
        currentTerm = null;
      }
    }
  }

  // ---- Helpers ---------------------------------------------------------------

  function inlineHasContent(arr) {
    for (var i = 0; i < arr.length; i++) {
      var n = arr[i];
      if (n.type === "text") { if (n.text && n.text.trim() !== "") return true; }
      else if (n.type === "br") { /* ignore lone breaks */ }
      else return true;
    }
    return false;
  }

  function safeText(node) {
    try { return (node && node.textContent) ? node.textContent : ""; }
    catch (e) { return ""; }
  }

  // ---- Public: extract one message element -> IR blocks ----------------------

  function extractMessage(el) {
    var ctx = { fallbackCount: 0 };
    var blocks;
    try {
      blocks = walkBlocks(el, ctx);
    } catch (e) {
      ctx.fallbackCount++;
      blocks = [{ type: "rawtext", text: safeText(el) }];
    }
    // Absolute last resort: nothing meaningful extracted.
    if (!blocks.length) {
      var txt = safeText(el).trim();
      if (txt) blocks = [{ type: "paragraph", children: [{ type: "text", text: txt }] }];
    }
    return { blocks: blocks, fallbackCount: ctx.fallbackCount };
  }

  // ---- Public: resolve images (async) ---------------------------------------

  function collectImageNodes(blocks, acc) {
    for (var i = 0; i < blocks.length; i++) {
      var b = blocks[i];
      if (!b) continue;
      if (b.type === "image") acc.push(b);
      else if (b.type === "paragraph" || b.type === "heading") collectImageInline(b.children, acc);
      else if (b.type === "blockquote") collectImageNodes(b.children, acc);
      else if (b.type === "list") {
        for (var j = 0; j < b.items.length; j++) collectImageNodes(b.items[j].children, acc);
      } else if (b.type === "table") {
        collectTableInline(b.header, acc);
        for (var r = 0; r < b.rows.length; r++) collectTableInline(b.rows[r], acc);
      }
    }
  }
  function collectImageInline(inlines, acc) {
    for (var i = 0; i < inlines.length; i++) {
      var n = inlines[i];
      if (n.type === "image") acc.push(n);
      else if (n.children) collectImageInline(n.children, acc);
    }
  }
  function collectTableInline(cells, acc) {
    for (var i = 0; i < cells.length; i++) collectImageInline(cells[i], acc);
  }

  /**
   * Resolve every image node in the IR according to `mode`.
   * mode 'embed' -> replace src with a base64 data URI (offline-safe).
   * mode 'reference' -> leave the original URL.
   * Returns the number of images that FAILED to embed (kept original URL).
   */
  async function resolveImages(blocks, mode) {
    if (mode !== "embed") return 0;
    var imgs = [];
    collectImageNodes(blocks, imgs);
    var failures = 0;
    // Sequential-with-small-concurrency to be gentle on the site.
    var CONC = 4;
    var idx = 0;
    async function worker() {
      while (idx < imgs.length) {
        var my = idx++;
        var node = imgs[my];
        var res = await TK.base64.imageToDataUri(node.src);
        node.src = res.dataUri;
        if (!res.ok) failures++;
      }
    }
    var workers = [];
    for (var w = 0; w < Math.min(CONC, imgs.length); w++) workers.push(worker());
    await Promise.all(workers);
    return failures;
  }

  TK.extractor = {
    extractMessage: extractMessage,
    resolveImages: resolveImages,
    // exported for potential reuse/testing
    _walkBlocks: walkBlocks,
    _walkInline: walkInline
  };
})();
