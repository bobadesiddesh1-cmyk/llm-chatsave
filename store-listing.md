# Threadkeeper — Chrome Web Store listing copy

Paste-ready text for each field in the Web Store developer dashboard.

---

## Name (75 max)

```
Threadkeeper — Export Your AI Conversations
```

## Summary / short description (132 max)

```
Export any ChatGPT, Claude, or Gemini chat to Markdown, PDF, or HTML in one click. Bulk-export your history. 100% local.
```

## Category

`Workflow & Planning` (or `Productivity` if the older category list is shown)

## Language

`English (United States)`

---

## Description (16,000 max)

```
Lost a conversation you needed? Threadkeeper saves it before that happens.

One click turns any ChatGPT, Claude, or Gemini conversation into a clean file on
your computer — Markdown, PDF, or HTML. Formatting survives the trip: headings,
nested lists, tables, code blocks with syntax highlighting, links, quotes, images,
and math all come through looking like the original.


WHAT YOU CAN DO

• Export a conversation in one click, from the toolbar or a button right inside
  the chat page.
• Choose your format — Markdown for notes and repos, HTML for a self-contained
  page you can open anywhere, PDF for sharing and printing.
• Choose what to include — the whole conversation, only your messages, or only
  the AI's replies.
• Bulk-export your history — select conversations from your sidebar and download
  them all as a single ZIP, with a progress bar and a cancel button.
• Keep exports readable offline — images are embedded directly in the file, so an
  export still works with no internet connection.


WHO IT'S FOR

Consultants and freelancers who hand AI sessions to clients as documentation.
Researchers archiving their work. Developers keeping the answer that actually
solved the bug. Anyone who has closed a tab and wished they hadn't.


PRIVACY — THE SHORT VERSION

Threadkeeper collects nothing.

There's no account, no sign-in, and no server. Your conversations are read on your
own machine and written straight to your own downloads folder. Nothing is uploaded,
logged, or sent anywhere. There is no analytics or telemetry of any kind.

The only network request Threadkeeper ever makes is fetching the images already
shown in the conversation you're exporting, so they can be embedded into your file.
That's it.

Your settings and a short list of your recent exports (titles only — never the
contents) are stored locally in your browser.


SUPPORTED SITES

• chatgpt.com
• claude.ai
• gemini.google.com

Threadkeeper only runs on those three sites and does nothing anywhere else.


NOTES

PDF export uses your browser's own print dialog — pick "Save as PDF" when it opens.
This keeps the text selectable and respects your page setup.

Bulk export is capped at 200 conversations per run and processes them one at a
time, so it doesn't hammer the site. If a conversation fails or was deleted, it's
listed at the end and the rest of the batch still completes.

These sites change their layouts often. Threadkeeper ships several fallback
strategies for each one, and if it truly can't read a page it greys out its icon
rather than breaking the page you're on.
```

---

## Privacy practices tab

**Single purpose**

```
Threadkeeper exports the user's own AI chat conversations from ChatGPT, Claude, and
Gemini into local files (Markdown, PDF, or HTML) saved to their computer.
```

**Permission justifications**

- `storage` —
  ```
  Stores the user's export preferences (default format, scope, whether to include
  timestamps and role labels) and a local list of their 20 most recent exports
  (titles and dates only, never conversation content). Nothing is transmitted.
  ```
- `activeTab` —
  ```
  Reads the conversation on the tab the user is actively exporting, only when they
  click the extension.
  ```
- `scripting` —
  ```
  Injects the content script into a supported chat page when it isn't already
  present — for example on a tab that was open before the extension was installed —
  so the user doesn't have to reload the page to export.
  ```
- `tabs` —
  ```
  Bulk export opens each conversation the user selected in a background tab, one at
  a time, to read its contents, then closes it.
  ```
- Host permissions (chatgpt.com, claude.ai, gemini.google.com) —
  ```
  These are the three sites whose conversations the extension exports. It reads page
  content only on these hosts and has no access to any other site.
  ```
- Remote code —
  ```
  No. All code is included in the extension package. Nothing is fetched or evaluated
  at runtime.
  ```

**Data usage** — tick nothing. Then confirm all three certification checkboxes:
not sold to third parties, not used for unrelated purposes, not used to determine
creditworthiness or for lending.

A privacy policy URL is only required if you declare data collection. Threadkeeper
declares none, so the field can stay empty.
