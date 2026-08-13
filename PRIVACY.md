# Privacy Policy — Threadkeeper

**Effective:** August 1, 2026
**Applies to:** the Threadkeeper browser extension, all versions

Threadkeeper does not collect, transmit, or store any of your data outside your
own browser. There is no account, no server, and nothing to opt out of —
because there is nothing being sent anywhere in the first place.

## What Threadkeeper does

Threadkeeper is a browser extension that reads a conversation you have open on
ChatGPT, Claude, or Gemini, and converts it into a Markdown, HTML, or PDF file
that it saves to your own computer. That conversion happens entirely inside
your browser.

## Data we collect

| Category | Collected? | Notes |
|---|---|---|
| Conversation content | **Not collected** | Read locally to build your export; never transmitted or stored by us. |
| Account or identity info | **Not collected** | There is no sign-in and no account of any kind. |
| Analytics or usage tracking | **Not collected** | No analytics library, no telemetry, no crash reporting. |
| Your export settings | Stored locally | Format, scope, and label preferences, kept in your browser's own `chrome.storage` and never sent anywhere. |
| Recent export log | Stored locally | Titles and dates of your last 20 exports, for your own reference. Never the conversation contents. Never leaves your browser. |

## Network requests

The only outbound request Threadkeeper ever makes is fetching an image that is
already part of the conversation you're exporting — so it can be embedded into
your file and the export still works offline. That request goes to the image's
own address (the same site or CDN the conversation is already loaded from).
Nothing else is ever contacted: no analytics endpoint, no update server, no
third party of any kind.

## Permissions, and why each is needed

| Permission | Why it's requested |
|---|---|
| `storage` | Saves your export preferences and the local export log described above. |
| `activeTab` | Reads the conversation on the tab you're viewing, only when you click the extension to export it. |
| `scripting` | Loads the export functionality into a chat tab that was already open before you installed the extension, so you don't have to reload the page first. |
| `tabs` | Bulk export opens each conversation you selected in a background tab, one at a time, then closes it. |
| Host access | `chatgpt.com`, `claude.ai`, `gemini.google.com` — the three sites Threadkeeper reads conversations from. It has no access to any other site. |

## Children's privacy

Threadkeeper does not knowingly collect information from anyone, including
children, because it does not collect information from anyone at all.

## Changes to this policy

If this policy ever changes, the effective date above will change with it.
Given that Threadkeeper's entire design is to avoid collecting data, any future
change would need to be a deliberate, visible decision — not something that
happens quietly in a version bump.

## Contact

Questions about this policy, or about how Threadkeeper handles (or rather,
doesn't handle) your data, can be raised as an issue on the project's
repository: [github.com/bobadesiddesh1-cmyk/llm-chatsave/issues](https://github.com/bobadesiddesh1-cmyk/llm-chatsave/issues).

Threadkeeper is open source — read the code yourself at
[github.com/bobadesiddesh1-cmyk/llm-chatsave](https://github.com/bobadesiddesh1-cmyk/llm-chatsave).

Built by [buildwithsiddesh.com](https://www.buildwithsiddesh.com/).
