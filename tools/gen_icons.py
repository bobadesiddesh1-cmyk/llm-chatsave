#!/usr/bin/env python3
"""Generate Threadkeeper action icons (normal + disabled) with no external deps.
Renders at 4x supersample then box-downsamples for clean anti-aliased edges.
Glyph: a downward 'export' arrow dropping into a tray -> reads as 'save/export'."""
import struct, zlib, os

OUT = os.path.join(os.path.dirname(__file__), "..", "..", "..", "..", "..")  # not used
TARGET_DIR = os.environ.get("ICON_DIR", "icons")

def rounded_rect(px, py, w, r):
    """coverage-ish: return True if point (px,py) inside rounded square of size w, radius r."""
    x, y = px, py
    if x < 0 or y < 0 or x >= w or y >= w:
        return False
    # clamp to corner circle centers
    cx = min(max(x, r), w - r)
    cy = min(max(y, r), w - r)
    dx = x - cx
    dy = y - cy
    return (dx*dx + dy*dy) <= r*r

def in_rect(x, y, x0, y0, x1, y1):
    return x0 <= x <= x1 and y0 <= y <= y1

def in_down_triangle(x, y, ax, ay, bx, by, apex_x, apex_y):
    """triangle with base (ax,ay)-(bx,by) and apex below at (apex_x,apex_y)."""
    def sign(px, py, qx, qy, rx, ry):
        return (px - rx) * (qy - ry) - (qx - rx) * (py - ry)
    d1 = sign(x, y, ax, ay, bx, by)
    d2 = sign(x, y, bx, by, apex_x, apex_y)
    d3 = sign(x, y, apex_x, apex_y, ax, ay)
    has_neg = (d1 < 0) or (d2 < 0) or (d3 < 0)
    has_pos = (d1 > 0) or (d2 > 0) or (d3 > 0)
    return not (has_neg and has_pos)

def glyph(x, y, w):
    """return True if (x,y) is part of the white export glyph (unit coords * w)."""
    u = lambda f: f * w
    # vertical stem of the arrow
    if in_rect(x, y, u(0.445), u(0.235), u(0.555), u(0.55)):
        return True
    # arrowhead (points down)
    if in_down_triangle(x, y, u(0.35), u(0.5), u(0.65), u(0.5), u(0.5), u(0.7)):
        return True
    # tray: bottom bar + two short uprights (an open box catching the arrow)
    if in_rect(x, y, u(0.28), u(0.79), u(0.72), u(0.86)):   # bottom
        return True
    if in_rect(x, y, u(0.28), u(0.70), u(0.35), u(0.86)):   # left upright
        return True
    if in_rect(x, y, u(0.65), u(0.70), u(0.72), u(0.86)):   # right upright
        return True
    return False

def render(size, bg, glyph_rgba):
    ss = 4
    W = size * ss
    r = 0.24 * W
    buf = bytearray()
    # supersample buffer
    hi = [[(0, 0, 0, 0)] * W for _ in range(W)]
    for y in range(W):
        for x in range(W):
            inside = rounded_rect(x + 0.5, y + 0.5, W, r)
            if not inside:
                hi[y][x] = (0, 0, 0, 0)
                continue
            if glyph(x + 0.5, y + 0.5, W):
                hi[y][x] = glyph_rgba
            else:
                hi[y][x] = bg
    # downsample box filter
    raw = bytearray()
    for y in range(size):
        raw.append(0)  # filter type 0 per scanline
        for x in range(size):
            ar = ag = ab = aa = 0
            for dy in range(ss):
                for dx in range(ss):
                    px = hi[y*ss+dy][x*ss+dx]
                    a = px[3]
                    ar += px[0] * a
                    ag += px[1] * a
                    ab += px[2] * a
                    aa += a
            n = ss * ss
            outa = aa // n
            if aa == 0:
                raw += bytes((0, 0, 0, 0))
            else:
                raw += bytes((ar // aa, ag // aa, ab // aa, outa))
    return png(size, size, raw)

def png(w, h, raw):
    def chunk(tag, data):
        c = struct.pack(">I", len(data)) + tag + data
        c += struct.pack(">I", zlib.crc32(tag + data) & 0xffffffff)
        return c
    sig = b"\x89PNG\r\n\x1a\n"
    ihdr = struct.pack(">IIBBBBB", w, h, 8, 6, 0, 0, 0)  # 8-bit RGBA
    idat = zlib.compress(bytes(raw), 9)
    return sig + chunk(b"IHDR", ihdr) + chunk(b"IDAT", idat) + chunk(b"IEND", b"")

def main():
    os.makedirs(TARGET_DIR, exist_ok=True)
    brand = (109, 90, 230, 255)       # indigo/violet
    off_bg = (120, 124, 132, 255)     # muted grey
    white = (255, 255, 255, 255)
    faint = (255, 255, 255, 205)
    for s in (16, 32, 48, 128):
        with open(os.path.join(TARGET_DIR, f"icon{s}.png"), "wb") as f:
            f.write(render(s, brand, white))
        with open(os.path.join(TARGET_DIR, f"icon-off{s}.png"), "wb") as f:
            f.write(render(s, off_bg, faint))
        print("wrote", s)

if __name__ == "__main__":
    main()
