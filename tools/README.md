# tools/

Design source for the Threadkeeper extension icons.

- `icon.svg` — the normal (enabled) toolbar icon: a chat bubble with a save/export
  arrow, on an indigo→violet gradient squircle.
- `icon-off.svg` — the disabled/greyed variant, shown when a site's adapters can't
  detect a conversation.

These SVGs are the editable master. The shipped raster icons live in
`../threadkeeper/icons/` at 16 / 32 / 48 / 128 px (plus `icon-off*` at the same sizes).

## Regenerate the PNGs

Rasterize each SVG to the four sizes and write them into `threadkeeper/icons/`.
Any SVG rasterizer works (Inkscape, rsvg-convert, resvg, a headless browser…), e.g.:

```sh
for s in 16 32 48 128; do
  rsvg-convert -w $s -h $s tools/icon.svg     -o threadkeeper/icons/icon$s.png
  rsvg-convert -w $s -h $s tools/icon-off.svg -o threadkeeper/icons/icon-off$s.png
done
```

For the crispest small sizes, render at 4× and downsample with a high-quality filter.
Keep transparency (the squircle has transparent corners).
