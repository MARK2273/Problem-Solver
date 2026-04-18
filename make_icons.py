"""Generate simple gradient PNG icons for the extension (no external deps)."""
import struct, zlib, os

def make_png(path, size):
    # Gradient from purple (#7c5cff) to green (#3ddc97), with rounded-ish mask.
    c1 = (124, 92, 255)
    c2 = (61, 220, 151)
    r_outer = size / 2 - 0.5
    cx = cy = (size - 1) / 2
    corner = size * 0.22  # rounded corner radius

    raw = bytearray()
    for y in range(size):
        raw.append(0)  # filter byte per row
        for x in range(size):
            # Rounded-square mask: distance from nearest corner center.
            inside = True
            if x < corner and y < corner:
                d = ((corner - x) ** 2 + (corner - y) ** 2) ** 0.5
                inside = d <= corner
            elif x > size - corner - 1 and y < corner:
                d = ((x - (size - corner - 1)) ** 2 + (corner - y) ** 2) ** 0.5
                inside = d <= corner
            elif x < corner and y > size - corner - 1:
                d = ((corner - x) ** 2 + (y - (size - corner - 1)) ** 2) ** 0.5
                inside = d <= corner
            elif x > size - corner - 1 and y > size - corner - 1:
                d = ((x - (size - corner - 1)) ** 2 + (y - (size - corner - 1)) ** 2) ** 0.5
                inside = d <= corner

            if not inside:
                raw.extend((0, 0, 0, 0))
                continue

            t = (x + y) / (2 * (size - 1))
            r = int(c1[0] + (c2[0] - c1[0]) * t)
            g = int(c1[1] + (c2[1] - c1[1]) * t)
            b = int(c1[2] + (c2[2] - c1[2]) * t)

            # Simple "AI" mark: draw a diagonal slash + dot in the center darker.
            mark = False
            # slash
            if abs((x - cx) + (y - cy)) < max(1, size * 0.05) and size * 0.25 < x < size * 0.75:
                mark = True
            # dot
            if (x - cx) ** 2 + (y - cy) ** 2 < (size * 0.07) ** 2:
                mark = True
            if mark:
                r = max(0, r - 120)
                g = max(0, g - 120)
                b = max(0, b - 120)

            raw.extend((r, g, b, 255))

    def chunk(tag, data):
        return (struct.pack(">I", len(data)) + tag + data
                + struct.pack(">I", zlib.crc32(tag + data) & 0xffffffff))

    sig = b"\x89PNG\r\n\x1a\n"
    ihdr = struct.pack(">IIBBBBB", size, size, 8, 6, 0, 0, 0)  # 8-bit RGBA
    idat = zlib.compress(bytes(raw), 9)
    png = sig + chunk(b"IHDR", ihdr) + chunk(b"IDAT", idat) + chunk(b"IEND", b"")
    with open(path, "wb") as f:
        f.write(png)

os.makedirs("icons", exist_ok=True)
for s in (16, 48, 128):
    make_png(f"icons/icon{s}.png", s)
    print("wrote", f"icons/icon{s}.png")
