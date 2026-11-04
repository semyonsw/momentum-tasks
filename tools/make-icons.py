#!/usr/bin/env python3
"""
The Tasks and Expenses launcher icons, drawn from the Momentum mark.

    python3 tools/make-icons.py            # writes assets/{icon,adaptive-icon}-{workout,tasks,expenses}.png
    python3 tools/make-icons.py --preview [out.png]  # also a side-by-side of all three at launcher size

Since 3.0.0 Momentum is three APKs (`src/lib/appVariant.ts`), and three icons on
one launcher that all wear the combined mark — ring plus three glyphs — would
be three identical tiles. Each app keeps the mark's language — the near-black
tile, the three-arc ring, the Material Symbols glyph the nav bar already uses
for that section — and narrows it to its own sphere: the ring is drawn in
three steps of the section's colour instead of the theme's three, the corner
glow is that colour, and the one glyph sits large in the middle. Colour alone
would not do it (the Tasks green and the Expenses teal are neighbours, and a
launcher may be greyscale-themed); the glyph alone would not either at 48dp.
Both together tell them apart at a glance.

Workout is drawn too, with the dumbbell alone. Keeping the 2.x combined mark
for it was tried and rejected: beside a Tasks and an Expenses icon, a Workout
tile still wearing their check and wallet reads as the old all-in-one app.

The geometry is `src/components/AppMark.tsx`'s 180 grid — ring r 62, stroke 13,
dash 110/280 rotated -80 — and the glyph paths are read from
`src/components/symbolPaths.ts`, so this cannot drift from the in-app mark.
The adaptive foreground is the same drawing on transparent, scaled to the 2/3
safe zone the 2.x `adaptive-icon.png` used. Needs `cairosvg` and Pillow.
"""

import pathlib
import re
import sys
import tempfile

import cairosvg

ROOT = pathlib.Path(__file__).resolve().parent.parent
SIZE = 1024
BG = (6, 8, 7)  # NEUTRALS.bg
GLOW_BASE = (0x0C, 0x14, 0x10)  # AppMark's gradient: mixSrgb(c, '#0C1410', 0.28)

# The section colours are the Fintech Lime stops the 2.x icon was exported in:
# c1 lime for training, c2 green for tasks, c3 teal for money. Each ring runs
# light -> full -> deep around the section's own colour.
VARIANTS = {
    'workout': {
        'glyph': 'fitness_center',
        'color': '#C5F23A',
        'ring': ['#E2FA94', '#C5F23A', '#8DB41C'],
    },
    'tasks': {
        'glyph': 'task_alt',
        'color': '#3DDC84',
        'ring': ['#8DF0B5', '#3DDC84', '#1E9E5C'],
    },
    'expenses': {
        'glyph': 'account_balance_wallet',
        'color': '#00A389',
        'ring': ['#4FD8BE', '#00A389', '#00705E'],
    },
}


def symbol_fill(name: str) -> str:
    src = (ROOT / 'src/components/symbolPaths.ts').read_text(encoding='utf-8')
    m = re.search(name + r":\s*\{.*?fill:\s*'([^']+)'", src, re.S)
    if not m:
        sys.exit(f'{name} not found in symbolPaths.ts')
    return m.group(1)


def mix(hex_a: str, base, weight: float) -> str:
    a = [int(hex_a[i : i + 2], 16) for i in (1, 3, 5)]
    return '#' + ''.join(f'{round(a[i] * weight + base[i] * (1 - weight)):02X}' for i in range(3))


def mark(v: dict, tile: bool) -> str:
    """The SVG on AppMark's 180 grid. `tile` false is the adaptive foreground."""
    arcs = ''.join(
        f'<circle cx="90" cy="90" r="62" fill="none" stroke="{c}" stroke-width="13" '
        f'stroke-linecap="round" stroke-dasharray="110 280" stroke-dashoffset="{-130 * i}"/>'
        for i, c in enumerate(v['ring'])
    )
    # One glyph, centred: 72 on the grid is as large as it goes with the
    # wallet's corners still well clear of the ring's inner edge (r 55.5).
    g = 72
    gx = gy = 90 - g / 2
    glyph = (
        f'<g transform="translate({gx} {gy + g}) scale({g / 960})">'
        f'<path d="{symbol_fill(v["glyph"])}" fill="{v["color"]}"/></g>'
    )
    body = f'<g transform="rotate(-80 90 90)">{arcs}</g>{glyph}'
    if tile:
        bg = (
            '<defs><radialGradient id="bg" cx="30%" cy="20%" r="67%">'
            f'<stop offset="0%" stop-color="{mix(v["color"], GLOW_BASE, 0.28)}"/>'
            f'<stop offset="100%" stop-color="#{BG[0]:02X}{BG[1]:02X}{BG[2]:02X}"/>'
            '</radialGradient></defs><rect width="180" height="180" rx="44" fill="url(#bg)"/>'
        )
        inner = bg + body
    else:
        inner = f'<g transform="translate(90 90) scale(0.67) translate(-90 -90)">{body}</g>'
    return f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 180 180">{inner}</svg>'


def main() -> None:
    out = ROOT / 'assets'
    written = []
    for name, v in VARIANTS.items():
        for tile, stem in ((True, 'icon'), (False, 'adaptive-icon')):
            path = out / f'{stem}-{name}.png'
            cairosvg.svg2png(
                bytestring=mark(v, tile).encode(),
                write_to=str(path),
                output_width=SIZE,
                output_height=SIZE,
            )
            written.append(path)
    for p in written:
        print(p.relative_to(ROOT))

    if '--preview' in sys.argv:
        from PIL import Image

        sheet = Image.new('RGBA', (3 * 220 + 40, 2 * 220 + 40), (40, 44, 52, 255))
        for col, name in enumerate(('workout', 'tasks', 'expenses')):
            for row, stem in enumerate(('icon', 'adaptive-icon')):
                im = Image.open(out / f'{stem}-{name}.png').convert('RGBA')
                if stem == 'adaptive-icon':  # as a launcher masks it: bg + circle
                    base = Image.new('RGBA', im.size, BG + (255,))
                    im = Image.alpha_composite(base, im)
                im = im.resize((192, 192), Image.LANCZOS)
                sheet.alpha_composite(im, (34 + col * 220, 34 + row * 220))
        dest = pathlib.Path(sys.argv[sys.argv.index('--preview') + 1]) if len(sys.argv) > 2 else pathlib.Path(tempfile.gettempdir()) / 'momentum-icons.png'
        sheet.save(dest)
        print('preview:', dest)


if __name__ == '__main__':
    main()
