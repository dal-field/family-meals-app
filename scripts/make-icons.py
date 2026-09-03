#!/usr/bin/env python3
import struct
import zlib
from pathlib import Path

OUT = Path(__file__).resolve().parents[1] / "public"


def chunk(tag: bytes, data: bytes) -> bytes:
    return struct.pack(">I", len(data)) + tag + data + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF)


def write_png(path: Path, width: int, pixels: list[tuple[int, int, int, int]]) -> None:
    raw = bytearray()
    for y in range(width):
        raw.append(0)
        for x in range(width):
            raw.extend(pixels[y * width + x])
    png = b"\x89PNG\r\n\x1a\n"
    png += chunk(b"IHDR", struct.pack(">IIBBBBB", width, width, 8, 6, 0, 0, 0))
    png += chunk(b"IDAT", zlib.compress(bytes(raw), 9))
    png += chunk(b"IEND", b"")
    path.write_bytes(png)


def lerp(a, b, t):
    return int(a + (b - a) * t)


def draw(size: int, maskable: bool) -> list[tuple[int, int, int, int]]:
    pixels = []
    cx = cy = (size - 1) / 2
    margin = size * (0.18 if maskable else 0.08)
    plate_r = size * (0.28 if maskable else 0.32)
    inner_r = plate_r * 0.62
    corner = size * 0.22
    sage = (79, 93, 63)
    cream = (244, 239, 230)
    gold = (201, 161, 90)
    well = (239, 228, 200)

    for y in range(size):
        for x in range(size):
            # rounded sage square
            dx = min(x, size - 1 - x)
            dy = min(y, size - 1 - y)
            if dx < corner and dy < corner:
                rx = corner - dx
                ry = corner - dy
                if rx * rx + ry * ry > corner * corner:
                    pixels.append((244, 239, 230, 0 if maskable else 255))
                    continue
            px = x - cx
            py = y - cy
            r = (px * px + py * py) ** 0.5
            color = sage
            if r <= plate_r:
                color = cream
            if r <= inner_r:
                color = well
            # simple steam / leaf arc
            steam_y = y / size
            steam_x = x / size
            if 0.22 < steam_y < 0.42:
                center = 0.50 + 0.04 * (0.32 - steam_y) * 12 * (0.5 - steam_x)
                if abs(steam_x - center) < 0.035 and r > plate_r * 0.2:
                    color = gold
            pixels.append((*color, 255))
    return pixels


def main() -> None:
    OUT.mkdir(exist_ok=True)
    for size, name, maskable in [
        (192, "icon-192.png", False),
        (512, "icon-512.png", False),
        (192, "icon-192-maskable.png", True),
        (512, "icon-512-maskable.png", True),
        (180, "apple-touch-icon.png", False),
    ]:
        write_png(OUT / name, size, draw(size, maskable))
        print("wrote", name)


if __name__ == "__main__":
    main()
