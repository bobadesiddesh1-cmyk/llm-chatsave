# store-assets/

Graphics for the Chrome Web Store listing. Not part of the shipped extension
package — these are uploaded separately in the developer dashboard.

All files are generated from the real product: the popup panels are actual
screenshots of `threadkeeper/popup/popup.html`, and the icon comes from
`tools/icon.svg`. Nothing here is a mockup of a UI that doesn't exist.

## Format requirements (why these files look the way they do)

| Asset | Canvas | Format |
|---|---|---|
| `store-icon-128.png` | 128×128 | PNG **with** alpha; artwork inset to 96×96 with 16px transparent padding |
| `screenshot-*.png` | 1280×800 | **24-bit** PNG, colour type 2, **no alpha** |
| `promo-small-440x280.png` | 440×280 | 24-bit PNG, no alpha |
| `promo-marquee-1400x560.png` | 1400×560 | 24-bit PNG, no alpha |

Two traps worth remembering:

1. **The store icon is inset, the toolbar icons are not.** Do not upload
   `threadkeeper/icons/icon128.png` as the store icon — it fills its whole canvas
   (correct for a toolbar) and renders oversized in the listing.
2. **Screenshots and promo tiles must have no alpha channel.** A browser canvas
   always emits 32-bit RGBA, so a plain screenshot is rejected. `png24.mjs`
   re-encodes to colour type 2 after compositing onto an opaque background.

## Screenshots (upload in this order)

1. `screenshot-1-export` — one-click export, popup beside a real conversation
2. `screenshot-2-formats` — formatting fidelity in the exported document
3. `screenshot-3-bulk` — bulk export with progress
4. `screenshot-4-privacy` — the local-only guarantee
5. `screenshot-5-history` — format/scope choices and the export log

Promo tiles are optional; they're used if the listing gets featured.

## Regenerating

The generator lives outside the repo (session scratchpad). To rebuild: render each
frame at its exact canvas size in a headless browser, decode the PNG, and re-encode
as colour type 2. Verify afterwards by reading byte 25 of the file — it must be `2`
for screenshots/tiles and `6` for the store icon.

## privacy-policy.html

Source for the hosted privacy policy (published as a Claude Artifact; paste that
URL into the Web Store's "Privacy policy URL" field). Documents, in plain language,
that Threadkeeper collects nothing, plus a table justifying each requested
permission — the same justifications used in the dashboard's permission-justification
fields, kept consistent with them on purpose.

**Before submitting:** the Artifact must be set to public/shareable from its own
share menu. Artifacts are private by default — a reviewer hitting a private link
is a rejection, not a delay.

## threadkeeper-demo.mp4

30fps, 1280x720, h264, ~14s, ~600KB. LinkedIn-ready demo video.

Built entirely from the real product: every popup frame is a genuine screenshot
of `threadkeeper/popup/popup.html` responding to real clicks (format toggle,
Export, tab switches, a real bulk-run progress sequence), and the "exported
document" scene is rendered through the actual `content/extractor.js` +
`render/html.js` pipeline against a fixture matching the running example —
not a mockup of a UI that doesn't exist. Scenes are composited into 1280x720
frames in the product's ink/gold visual language, then assembled with ffmpeg's
`xfade` crossfades.

Regenerating requires the full (non-Playwright-bundled) ffmpeg — the one
shipped alongside Playwright's browsers is a stripped build with only
webm/vp8 output and no filters, built solely for Playwright's own internal
video-recording feature. `apt-get install ffmpeg` pulls a build with
libx264/xfade support.
