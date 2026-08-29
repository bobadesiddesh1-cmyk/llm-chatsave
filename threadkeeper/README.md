# Threadkeeper — Export Your AI Conversations

**One click turns any ChatGPT, Claude, or Gemini conversation into a clean
Markdown, PDF, or HTML file — formatting, code blocks, and images preserved.
And since 2.0: the Library, a searchable on-device archive of every AI
conversation you've had, with history import, optional auto-archiving,
on-device AI summaries, and "continue in another AI" handoff. 100% local.
No account, no cloud, no data collected.**

Threadkeeper is a Manifest V3 Chrome extension written in plain vanilla JavaScript.
**No build step, no frameworks, no bundler** — the `threadkeeper/` folder loads
unpacked as-is and works immediately.

---

## Install (load unpacked)

1. Open `chrome://extensions` in Chrome (or any Chromium browser).
2. Toggle **Developer mode** on (top-right).
3. Click **Load unpacked** and select the **`threadkeeper/`** folder.
4. Open a conversation on **chatgpt.com**, **claude.ai**, or **gemini.google.com**.
5. Click the Threadkeeper toolbar icon — or the small **⬇ Export** button that
   appears in the bottom-right of the chat — and export.

The icon greys out with a `!` badge on a supported site when it can't detect a
conversation (e.g. the site changed its markup); it never breaks the page.

---

## Features

- **Single-conversation export** — pick Markdown / PDF / HTML, choose scope
  (full chat / only your messages / only AI replies), toggle timestamps and role
  labels, export.
- **Inline export button** — one-click export near the composer using your
  last-used settings (rendered in an isolated Shadow DOM).
- **Bulk export** — select conversations from your history and export them all as
  a single ZIP (or individual files), with a live progress bar and a cancel button.
  Failures are listed at the end and never abort the batch.
- **Faithful conversion** — headings, nested lists, tables (with alignment),
  fenced code blocks (with language + light syntax highlighting in HTML),
  inline formatting, links, blockquotes, images, and LaTeX math.
- **Self-contained exports** — images are embedded as base64 data URIs by default
  so exported files work fully offline (toggle to reference URLs for smaller files).
- **100% local** — the only network requests are fetches of the conversation's own
  images (for embedding). No telemetry, no analytics, no external calls.
- **The Library (2.0)** — a full-tab, on-device archive: save any conversation with
  one click (or turn on auto-archive), import your whole history per site, search
  everything full-text, re-read conversations in a clean reader, re-export any of it,
  summarize on-device via Chrome's built-in AI when available, and hand any thread to
  another AI ("Continue in ChatGPT/Claude/Gemini"). Stored in the extension's own
  IndexedDB; wipe it any time.

---

## Format support matrix (per site)

| Capability                     | ChatGPT | Claude | Gemini |
|--------------------------------|:-------:|:------:|:------:|
| Single export → Markdown       |   ✅    |   ✅   |   ✅   |
| Single export → HTML           |   ✅    |   ✅   |   ✅   |
| Single export → PDF            |   ✅    |   ✅   |   ✅   |
| Inline composer export button  |   ✅    |   ✅   |   ✅   |
| Scope (full / mine / AI)       |   ✅    |   ✅   |   ✅   |
| Headings / lists / tables      |   ✅    |   ✅   |   ✅   |
| Fenced code blocks + language  |   ✅    |   ✅   |   ✅   |
| Inline formatting / links      |   ✅    |   ✅   |   ✅   |
| Images embedded (offline)      |   ✅    |   ✅   |   ✅   |
| LaTeX / math (KaTeX source)    |   ✅    |   ✅   |   ✅¹  |
| Bulk export (ZIP / individual) |   ✅    |   ✅   |   ⚠️²  |

¹ Math is recovered from the KaTeX `application/x-tex` annotation; where a site
renders math without that annotation, Threadkeeper falls back to `[math expression]`
inline rather than crashing.

² Gemini's sidebar history items don't always expose a directly-navigable
conversation URL in the DOM. Conversations without a recoverable URL are still
listed but reported as failures in the bulk results (never silently dropped).
Single-conversation export of the currently-open Gemini chat is fully supported.

Because these are single-page apps whose markup changes often, each site has its
own adapter (`content/adapters/*.js`) with **2–3 fallback selector strategies**, and
a `MutationObserver` re-runs detection on SPA navigation.

---

## PDF path (what ships)

Threadkeeper generates PDFs via the **hidden-iframe `window.print()`** path
(`render/pdf.js`): the same standalone HTML used by the HTML export is written into
an off-screen `<iframe>`, its images are awaited, and `iframe.contentWindow.print()`
is invoked. Chrome scopes the print job to that iframe, so you get the conversation
(not the host page) in the print dialog — choose **Save as PDF**. The print
stylesheet adds `page-break-inside: avoid` on message and code boundaries so blocks
avoid splitting across pages where possible.

This path yields selectable text and honors your page setup, at the cost of one
interaction (the print dialog) — standard for "Save as PDF" in the browser. See
`DECISIONS.md` for why a hand-rolled PDF byte-writer was not chosen.

---

## ZIP implementation note

The bulk ZIP is produced by a **hand-written, dependency-free, store-only (method 0,
no compression) ZIP writer** in `render/zip.js`, with **CRC-32 implemented from
scratch** (standard reflected polynomial `0xEDB88320`, table-driven). It writes
local file headers, per-entry data, the central directory, and the End Of Central
Directory record, all little-endian per the PKZIP APPNOTE, and sets general-purpose
bit 11 (`0x0800`) to declare UTF-8 filenames.

The output was round-tripped through the standard `unzip` tool during development:
`unzip -t` reports **"No errors detected"** (all CRC checks pass), and the
from-scratch CRC-32 matches zlib's byte-for-byte. Archives open in macOS Finder,
Windows Explorer, and 7-Zip. (No ZIP64 — the 200-conversation cap keeps output far
under the format's 4 GiB / 65535-entry limits.)

---

## Permissions

`storage`, `activeTab`, `scripting`, `tabs`. Content scripts run only on
`chatgpt.com`, `claude.ai`, and `gemini.google.com`. Downloads use the
`Blob` + anchor-click pattern, so **no `downloads` permission** is requested.

---

## Acceptance tests (walkthrough)

Load the extension unpacked, then:

1. **Zero console errors on all three sites.** Open each site with DevTools open;
   Threadkeeper injects, reports status, and shows the inline button on an open chat
   without throwing.
2. **ChatGPT → Markdown** on a chat with code blocks, a list, and bold text:
   structure is preserved and code blocks are fenced with the right language.
3. **Same chat → HTML:** opens standalone in a browser with no external
   dependencies, styled cleanly, code lightly syntax-colored, images inline.
4. **Same chat → PDF:** the print dialog opens scoped to the conversation; "Save as
   PDF" produces a readable, paginated document.
5. **Chat with an image → HTML/PDF:** the image is embedded (base64) and visible
   with the network disconnected.
6. **Bulk export 5 conversations → ZIP:** a valid ZIP downloads and opens in your OS
   file explorer with 5 correctly named files.
7. **One conversation in the batch fails** (deleted / no URL / timeout): the batch
   completes, that item is listed as a failure, the other four succeed.
8. **100+ message conversation** exports without freezing the tab (rendering is
   chunked with `requestIdleCallback`).
9. **Claude / Gemini:** the same feature set works via their adapters.

### Repo self-checks

- Every `.js` file passes `node --check` (syntax).
- The extractor → Markdown/HTML renderers were exercised against a representative
  message fixture (headings, nested lists, table, fenced code, blockquote, inline
  formatting, image, inline math) to confirm consistent structure across formats.
- The ZIP writer was verified byte-for-byte against `unzip -t` and zlib CRC-32.

---

## Project structure

```
threadkeeper/
├── manifest.json
├── background.js                 # bulk-mode tab orchestration; icon/badge state
├── content/
│   ├── adapters/
│   │   ├── chatgpt.js            # per-site DOM adapters, 2–3 fallbacks each
│   │   ├── claude.js
│   │   └── gemini.js
│   ├── extractor.js             # DOM walk → intermediate representation (core IP)
│   ├── export-button.js         # inline Shadow-DOM export button
│   └── main.js                  # wiring, messaging, single export, SPA detection
├── render/
│   ├── markdown.js              # IR → Markdown
│   ├── html.js                  # IR → standalone HTML (+ inline CSS, highlighting)
│   ├── pdf.js                   # HTML → print/PDF path
│   └── zip.js                   # hand-written store-only ZIP writer + CRC-32
├── popup/
│   ├── popup.html / popup.css / popup.js
│   └── tabs/{single.js, bulk.js, settings.js}
├── shared/
│   ├── base64.js                # image → data URI, UTF-8 bytes
│   ├── idle-chunk.js            # requestIdleCallback chunking for big chats
│   └── storage.js               # settings (sync) + history log (local)
├── icons/                       # 16/32/48/128 (normal + greyed "off" set)
├── DECISIONS.md
└── README.md
```

---

## Privacy

Threadkeeper collects nothing and phones home to nowhere. Settings and a 20-item
export log (titles/metadata only — never conversation content) live in
`chrome.storage` on your machine. The only outbound requests are to fetch the
images already displayed in your open conversation, so they can be embedded into
your export.

---

## Chrome Web Store listing (draft)

**Name:** Threadkeeper — Export Your AI Conversations

**Summary (132 chars):**
Export any ChatGPT, Claude, or Gemini chat to Markdown, PDF, or HTML in one click. Bulk-export your history. 100% local & private.

**Description:**

> Never lose a valuable AI conversation again.
>
> Threadkeeper turns any ChatGPT, Claude, or Gemini conversation into a clean,
> portable file — Markdown, PDF, or HTML — with one click. Formatting, code blocks,
> tables, images, and math are preserved faithfully, so your export looks like the
> real thing.
>
> ✔ One-click export from the toolbar or right inside the chat
> ✔ Markdown, PDF, and HTML — pick what you need
> ✔ Choose what to include: the full chat, only your messages, or only the AI's
> ✔ Bulk-export your entire history into a single ZIP
> ✔ Images embedded so exports work completely offline
> ✔ Light syntax highlighting for code in HTML exports
>
> Built for anyone who's lost a great chat, consultants who deliver AI sessions as
> client documentation, and researchers archiving their work.
>
> 100% local. No account. No cloud. No data collected. The only network requests
> Threadkeeper makes are to fetch the images already in your conversation, so they
> can be embedded in your file. Nothing you export ever leaves your computer.

**Category:** Productivity
**Single purpose:** Export the user's AI chat conversations to local files.
**Permission justifications:**
- `storage` — remember export preferences and a short local history of exports.
- `activeTab` / `scripting` — read the conversation on the tab you're exporting.
- `tabs` — open your selected conversations in background tabs during bulk export.
- Host access (chatgpt.com, claude.ai, gemini.google.com) — read conversation
  content on exactly those three sites and nowhere else.
