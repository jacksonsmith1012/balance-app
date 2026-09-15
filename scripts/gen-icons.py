"""Generates PWA icon PNGs with no external dependencies (pure zlib/struct PNG encoder).
Draws the Balance mark: deep blue-gray background + vertical bars in slider accent colors.
Run: python3 scripts/gen-icons.py
"""
import struct
import zlib
import os

BG = (0x1E, 0x2A, 0x3A)
BARS = [
    (0x7C, 0x8C, 0xF8),  # sleep - indigo
    (0xF8, 0x71, 0x71),  # love - rose
    (0xFB, 0xBF, 0x24),  # hobbies - amber
    (0x34, 0xD3, 0x99),  # school - teal
    (0xFB, 0x92, 0x3C),  # fitness - orange
]

def write_png(path, size, maskable=False):
    w = h = size
    pixels = [[BG for _ in range(w)] for _ in range(h)]

    # Safe zone: maskable icons need ~40% padding from edges for the visible circle
    margin = int(size * (0.22 if maskable else 0.14))
    inner_w = w - 2 * margin
    inner_h = h - 2 * margin

    n = len(BARS)
    gap = max(1, int(inner_w * 0.06))
    bar_w = (inner_w - gap * (n - 1)) // n

    # Each bar has a random-ish "fill height" to evoke satisfaction sliders
    heights = [0.55, 0.85, 0.4, 0.7, 0.6]

    x = margin
    for i, color in enumerate(BARS):
        bar_h = int(inner_h * heights[i])
        y_top = margin + (inner_h - bar_h)
        y_bottom = margin + inner_h
        radius = max(2, bar_w // 5)
        for yy in range(y_top, y_bottom):
            for xx in range(x, x + bar_w):
                # rounded top corners only
                if yy < y_top + radius:
                    cx = x + radius if xx < x + radius else (x + bar_w - radius if xx > x + bar_w - radius else None)
                    if cx is not None:
                        dx = xx - cx
                        dy = yy - (y_top + radius)
                        if dx * dx + dy * dy > radius * radius:
                            continue
                if 0 <= yy < h and 0 <= xx < w:
                    pixels[yy][xx] = color
        x += bar_w + gap

    raw = bytearray()
    for row in pixels:
        raw.append(0)  # filter type 0
        for (r, g, b) in row:
            raw.extend((r, g, b))

    def chunk(tag, data):
        return (struct.pack(">I", len(data)) + tag + data +
                struct.pack(">I", zlib.crc32(tag + data) & 0xffffffff))

    sig = b"\x89PNG\r\n\x1a\n"
    ihdr = struct.pack(">IIBBBBB", w, h, 8, 2, 0, 0, 0)
    idat = zlib.compress(bytes(raw), 9)
    png = sig + chunk(b"IHDR", ihdr) + chunk(b"IDAT", idat) + chunk(b"IEND", b"")

    with open(path, "wb") as f:
        f.write(png)
    print(f"wrote {path} ({size}x{size})")

if __name__ == "__main__":
    out_dir = os.path.join(os.path.dirname(__file__), "..", "icons")
    os.makedirs(out_dir, exist_ok=True)
    write_png(os.path.join(out_dir, "icon-192.png"), 192)
    write_png(os.path.join(out_dir, "icon-512.png"), 512)
    write_png(os.path.join(out_dir, "icon-maskable-192.png"), 192, maskable=True)
    write_png(os.path.join(out_dir, "icon-maskable-512.png"), 512, maskable=True)
    write_png(os.path.join(out_dir, "apple-touch-icon.png"), 180, maskable=True)
