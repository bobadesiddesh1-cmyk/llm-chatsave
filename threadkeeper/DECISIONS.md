# Threadkeeper — Design Decisions

This file records every non-obvious decision made while building the extension, so
future maintainers understand *why* things are the way they are. Where the product
brief left something unspecified, the chosen default is logged here.

## Product

- **Name:** `Threadkeeper` (brief shipped as "ChatSave"; renamed for a distinct,
  brandable identity that leans into the "never lose a valuable thread" angle).
- **Version:** `1.0.0`.

## Architecture

- **No build step, no frameworks, no bundler.** Every file is plain ES5/ES2017
  vanilla JS loaded directly by Chrome. Loads unpacked as-is.
- **Shared namespace instead of ES modules.** Content scripts run in a single shared
  isolated world, but Chrome content scripts can't use `import`/`export` without
  `web_accessible_resources` gymnastics. So every content-side file attaches to a
  global `window.TK` object (e.g. `TK.extractor`, `TK.markdown`). Manifest lists the
  files in dependency order. The popup loads the same files via `<script>` tags in
  `popup.html`, giving it its own `window.TK`.
- **Where each thing runs:**
  - *Extraction + rendering* runs in the **page** (content script), because it needs
    the live conversation DOM and page-origin fetch for images.
  - *Single-export download / print* also runs in the **page** — it has a real DOM,
    so both the popup's "Export" button and the injected in-composer button call the
    exact same `TK.core.runExport()` routine.
  - *Bulk orchestration* runs in the **background service worker**: it opens each
    conversation in a background tab, asks that tab's content script to
    extract+render, collects the rendered strings, and streams progress to the popup
    over a long-lived `Port` (which also keeps the SW alive during the run).
  - *ZIP assembly + bulk download* runs in the **popup**, because MV3 service workers
    have no DOM and no `URL.createObjectURL`, so the Blob→anchor download pattern
    can't run there. The popup receives file bytes/strings from the background and
    builds the archive.

## Downloads

- **No `downloads` permission.** All files are delivered with the
  `Blob` + `URL.createObjectURL` + programmatic `<a>` click pattern, per the brief.
  This is why downloads happen in a page/popup context, never the worker.

## PDF path (shipped approach)

- **Hidden-iframe `window.print()`** is the shipped path (`render/pdf.js`). We render
  the same standalone HTML used by the HTML export into an off-screen `<iframe>`,
  wait for its images to load, then call `iframe.contentWindow.print()`. Chrome scopes
  that print job to the iframe's document, so the user gets the conversation (not the
  host page) in the print dialog and picks **Save as PDF**.
- The print stylesheet adds `page-break-inside: avoid` on message blocks and `<pre>`
  so code blocks and individual turns avoid splitting across pages where possible.
- **Why not a pure programmatic PDF byte-writer?** Producing spec-correct PDF with
  embedded fonts, wrapped text, and images by hand (no libraries, no build step) is
  far larger and more fragile than the print path, and the print path yields
  selectable text and honors the user's page setup. The trade-off: it requires one
  user interaction (the print dialog), which is standard and expected for "Save as
  PDF" in the browser.

## ZIP writer (shipped approach)

- **Hand-written, store-only (method 0, no compression)** — `render/zip.js`.
  Implements CRC-32 from scratch (standard reflected polynomial `0xEDB88320`,
  table-driven), local file headers, per-entry data, the central directory, and the
  End Of Central Directory record, all little-endian per the PKZIP APPNOTE.
- General-purpose bit flag sets **bit 11 (0x0800)** to declare UTF-8 filenames, so
  non-ASCII conversation titles unzip correctly on macOS Finder, Windows Explorer,
  and 7-Zip.
- Store method keeps the code small and the output trivially verifiable; conversation
  exports (text + already-compressed PNG/JPEG images) don't benefit much from DEFLATE
  anyway.
- We do **not** use ZIP64. The 200-conversation cap and typical export sizes stay far
  under the 4 GiB / 65535-entry limits where ZIP64 would be required.

## Adapters

- **One adapter per site**, each with 2–3 fallback selector strategies, so a single
  DOM change on a site doesn't break extraction. Adapters never throw — every public
  method is wrapped and returns a safe empty value on failure.
- **Role detection by DOM order:** for Claude and Gemini we query user and assistant
  elements separately, tag each with its role, then sort by `compareDocumentPosition`
  to reconstruct conversation order.
- **Gemini bulk limitation (logged honestly):** Gemini's sidebar history items don't
  always expose a directly-navigable conversation URL in the DOM. When a URL can't be
  recovered, that conversation is still listed but is reported as a failure in the
  bulk results (rather than silently dropped). Single-conversation export of the
  currently-open Gemini chat is unaffected.

## Content conversion (the core IP)

- The extractor walks each message element into a **format-agnostic Intermediate
  Representation (IR)** of block + inline nodes. All three renderers (Markdown, HTML,
  PDF-via-HTML) consume the *same* IR, guaranteeing structural consistency across
  formats.
- **Mixed inline/block children** (the classic HTML-to-blocks problem) are handled by
  buffering consecutive inline nodes and flushing them as a paragraph whenever a
  block-level element is encountered.
- **Math/LaTeX:** KaTeX is the common renderer on all three sites. We recover the
  original TeX from the `<annotation encoding="application/x-tex">` node KaTeX emits.
  If no annotation is found, we fall back to `[math expression]` inline and count it
  as a fallback extraction (never crash, never duplicate the MathML+HTML text).
- **Fallback safety net:** every element walk is wrapped in `try/catch`. Anything
  unrecognized or that errors falls back to `.textContent` rather than being dropped,
  and increments a counter surfaced to the user as "N elements used fallback text
  extraction" when > 0.
- **Images:** default is base64 data-URI embedding (fetched from the page origin so
  the export is fully offline-capable and self-contained) for **all** formats,
  including Markdown. A settings toggle switches Markdown (and the others) to
  reference the original URL instead, for smaller files. Image fetch failures are
  counted and surfaced, and the original URL is kept as a graceful fallback.

## Performance

- Conversations with **> 50 messages** are processed through `TK.idle.processInChunks`,
  which yields to the UI between chunks via `requestIdleCallback` (falling back to
  `setTimeout(0)`), so large exports never freeze the tab.

## Bulk export defaults

- **Default output: single ZIP** (`bulkOutput: 'zip'`), with an "individual downloads"
  fallback toggle in settings.
- **Cap: 200 conversations** per bulk run.
- **Concurrency: 1** — conversations are processed strictly sequentially to avoid
  tripping site rate limits.
- **Per-conversation timeout: 45s.** A conversation that errors, is deleted, or times
  out is logged in the end-of-run results list and does **not** abort the batch.

## Icons

- Generated by `tools/gen_icons.py` at the repo root (kept for reproducibility, not
  part of the loaded extension). Two sets: the normal indigo icon and
  a muted-grey `icon-off*` set. `background.js` swaps to the grey set via
  `chrome.action.setIcon` when a tab's adapter reports it can't detect the site,
  giving the disabled/greyed state required by the brief.

## Privacy / network

- **Zero network requests** except `fetch()` of the AI-generated images already part
  of the open conversation (same-origin or the site's own CDN) for base64 embedding.
  No telemetry, no analytics, no external endpoints. All settings/history live in
  `chrome.storage` only.

## Storage layout

- `chrome.storage.sync` → user settings (defaults for format, scope, timestamps, role
  labels, image mode, bulk output).
- `chrome.storage.local` → the "last 20 single exports" log (metadata only: title,
  site, format, timestamp — never conversation content).
