# store-assets/

Graphics for the Chrome Web Store listing. These are **not** part of the shipped
extension package — they're uploaded separately in the developer dashboard.

## store-icon-128.png

The listing's "Store icon" field. Per the Web Store image guidelines this has a
different spec from the toolbar icons in `threadkeeper/icons/`:

- 128×128 PNG overall
- artwork drawn at **96×96, centred**, with **16px transparent padding** each side
- alpha channel present, no border around the canvas, no large drop shadow

Do not substitute `threadkeeper/icons/icon128.png` here — that one fills its whole
canvas (correct for a toolbar icon) and would render oversized in the store.

Regenerate from `tools/icon.svg` by rendering the SVG at 96×96 (supersample and
downsample for clean edges) and compositing it centred onto a 128×128 transparent
canvas.

## Still needed for submission

- At least one **1280×800** screenshot (up to 5). Optional but recommended:
  a 440×280 small promo tile.
