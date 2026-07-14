#!/usr/bin/env python3
"""Generate all Expo app icon assets from moodfood-logo.png using Pillow."""

from PIL import Image, ImageDraw
import os

ASSETS = os.path.join(os.path.dirname(__file__), '..', 'assets')
LOGO_PATH = os.path.join(ASSETS, 'moodfood-logo.png')

logo = Image.open(LOGO_PATH).convert('RGBA')

# ── helpers ──────────────────────────────────────────────────────────────────

def make_square_white(size: int) -> Image.Image:
    """Logo centred on a white 1024×1024 canvas (for iOS icon)."""
    canvas = Image.new('RGBA', (size, size), (255, 255, 255, 255))
    pad = int(size * 0.08)
    inner = size - pad * 2
    thumb = logo.copy()
    thumb.thumbnail((inner, inner), Image.LANCZOS)
    x = (size - thumb.width) // 2
    y = (size - thumb.height) // 2
    canvas.paste(thumb, (x, y), thumb)
    return canvas

def make_android_foreground(size: int) -> Image.Image:
    """Logo on transparent background, scaled to 66% safe-zone (Android adaptive foreground)."""
    canvas = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    safe = int(size * 0.66)
    thumb = logo.copy()
    thumb.thumbnail((safe, safe), Image.LANCZOS)
    x = (size - thumb.width) // 2
    y = (size - thumb.height) // 2
    canvas.paste(thumb, (x, y), thumb)
    return canvas

def make_android_background(size: int, color=(249, 115, 22, 255)) -> Image.Image:
    """Solid orange background for Android adaptive icon."""
    return Image.new('RGBA', (size, size), color)

def make_monochrome(size: int) -> Image.Image:
    """White silhouette of the logo on transparent black for Android monochrome."""
    canvas = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    safe = int(size * 0.60)
    thumb = logo.copy().convert('RGBA')
    thumb.thumbnail((safe, safe), Image.LANCZOS)
    # Convert to white silhouette: keep alpha, set RGB to white
    r, g, b, a = thumb.split()
    white_fg = Image.merge('RGBA', (
        Image.new('L', thumb.size, 255),
        Image.new('L', thumb.size, 255),
        Image.new('L', thumb.size, 255),
        a,
    ))
    x = (size - white_fg.width) // 2
    y = (size - white_fg.height) // 2
    canvas.paste(white_fg, (x, y), white_fg)
    return canvas

def make_favicon(size: int) -> Image.Image:
    """Small favicon, logo on white."""
    canvas = Image.new('RGBA', (size, size), (255, 255, 255, 255))
    pad = int(size * 0.06)
    inner = size - pad * 2
    thumb = logo.copy()
    thumb.thumbnail((inner, inner), Image.LANCZOS)
    x = (size - thumb.width) // 2
    y = (size - thumb.height) // 2
    canvas.paste(thumb, (x, y), thumb)
    return canvas

def save(img: Image.Image, name: str):
    path = os.path.join(ASSETS, name)
    img.convert('RGBA').save(path, 'PNG', optimize=True)
    size_kb = os.path.getsize(path) // 1024
    print(f'  ✔ {name}  ({img.width}×{img.height})  {size_kb} KB')

# ── generate ─────────────────────────────────────────────────────────────────

print('Generating MoodFood icon assets...\n')
save(make_square_white(1024),        'icon.png')
save(make_android_foreground(1024),  'android-icon-foreground.png')
save(make_android_background(1024),  'android-icon-background.png')
save(make_monochrome(1024),          'android-icon-monochrome.png')
save(make_favicon(200),              'splash-icon.png')
save(make_favicon(48),               'favicon.png')
print('\nDone! Rebuild the app with `npx expo run:android` or EAS Build to pick up the new icons.')
