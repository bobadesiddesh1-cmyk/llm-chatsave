<div align="center">

<img src="threadkeeper/icons/icon128.png" width="88" height="88" alt="">

# Threadkeeper

**Export your ChatGPT, Claude, and Gemini conversations to Markdown, PDF, or HTML.**
One click. Formatting preserved. Runs entirely on your device.

Built by [buildwithsiddesh.com](https://www.buildwithsiddesh.com/) — own the tools, not just the output.

</div>

---

Lost a conversation you needed? Threadkeeper saves it before that happens.

It turns any ChatGPT, Claude, or Gemini conversation into a clean file on your own
computer. Headings, nested lists, tables, code blocks with syntax highlighting,
links, quotes, images, and math all come through looking like the original.

## Features

- **One-click export** from the toolbar, or from a button inside the chat page.
- **Three formats** — Markdown for notes and repos, HTML for a self-contained page
  that opens anywhere, PDF for sharing and printing.
- **Choose your scope** — the whole conversation, only your messages, or only the
  AI's replies.
- **Bulk export** — select conversations from your history and download them all as
  a single ZIP, with live progress and a cancel button.
- **Offline-ready** — images are embedded in the file, so exports work with no
  internet connection.

## Privacy

Threadkeeper collects nothing. There is no account, no sign-in, no server, and no
analytics. Conversations are read on your machine and written straight to your
downloads folder.

The only network request it ever makes is fetching the images already shown in the
conversation you're exporting, so they can be embedded into your file.

Settings and a short list of recent exports (titles only, never contents) are stored
locally in your browser.

## Install

**From source (unpacked):**

1. Download or clone this repository.
2. Open `chrome://extensions` and turn on **Developer mode**.
3. Click **Load unpacked** and select the **`threadkeeper/`** folder.
4. Open a conversation on chatgpt.com, claude.ai, or gemini.google.com.

## Supported sites

`chatgpt.com` · `claude.ai` · `gemini.google.com`

The extension runs only on these three sites and does nothing anywhere else.

## How it's built

Manifest V3, plain vanilla JavaScript. **No build step, no frameworks, no
dependencies** — the `threadkeeper/` folder loads unpacked exactly as it is.

| | |
|---|---|
| `content/extractor.js` | Walks message DOM into a format-agnostic intermediate representation |
| `render/markdown.js`, `render/html.js` | Render that same IR, so formats stay consistent |
| `render/pdf.js` | Prints a hidden iframe, so PDF text stays selectable |
| `render/zip.js` | Hand-written store-only ZIP writer with CRC-32 from scratch |
| `content/adapters/` | One adapter per site, each with fallback selector strategies |

Because these sites change their markup often, every adapter ships several fallback
strategies, and every DOM walk is wrapped so an unrecognised element degrades to
plain text rather than being dropped. If a page truly can't be read, the toolbar
icon greys out instead of breaking the page.

More detail: [`threadkeeper/README.md`](threadkeeper/README.md) ·
design notes in [`threadkeeper/DECISIONS.md`](threadkeeper/DECISIONS.md)

## Support

Found a bug, or an export that didn't come out right?
[Open an issue](../../issues) — including the site and what the conversation
contained (code blocks, tables, images) helps a lot.

## Privacy

Read the full [Privacy Policy](PRIVACY.md). Short version: nothing is collected.

## Built by

[**buildwithsiddesh.com**](https://www.buildwithsiddesh.com/) — an SEO leader turned
product builder, shipping AI growth systems in the open. Most teams rent their
growth; Threadkeeper is the same philosophy applied to your own conversations: no
account, no cloud, nothing rented — you own every file it produces.

## License

MIT
