import io, json, os, sys
from fontTools.ttLib import TTFont
from fontTools.varLib import instancer
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen
from fontTools.pens.boundsPen import BoundsPen
import cairosvg
from PIL import Image
from shapely.geometry import LineString, box

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = sys.argv[1]

C = {
    "blue": "#1D4ED8", "blue-dark": "#3B82F6",
    "rose": "#F43F5E", "rose-dark": "#FB7185",
    "ink": "#141A33", "paper": "#FFFFFF",
    "mist": "#EEF1F8", "night": "#0E1224",
    "snow": "#F2F4FA", "slate": "#5B6380",
}


def font_instance(wght):
    f = TTFont(os.path.join(HERE, "BricolageGrotesque[opsz,wdth,wght].ttf"))
    return instancer.instantiateVariableFont(f, {"wght": wght, "opsz": 96, "wdth": 100})


BOLD, BOOK = font_instance(700), font_instance(450)


def text_path(font, text, size, x, baseline, tracking=0.0):
    """Outline text so files don't depend on the font being installed."""
    gs, cmap, hmtx = font.getGlyphSet(), font.getBestCmap(), font["hmtx"]
    s = size / font["head"].unitsPerEm
    d, cx = [], x
    for ch in text:
        name = cmap[ord(ch)]
        pen = SVGPathPen(gs)
        gs[name].draw(TransformPen(pen, (s, 0, 0, -s, cx, baseline)))
        d.append(pen.getCommands())
        cx += hmtx[name][0] * s + tracking * size
    return " ".join(d), cx - tracking * size - x


def glyph_top(font, ch):
    gs = font.getGlyphSet()
    bp = BoundsPen(gs)
    gs[font.getBestCmap()[ord(ch)]].draw(bp)
    return bp.bounds[3] / font["head"].unitsPerEm


# Mark geometry in a 64-unit grid. The check and divider are cut out of the body as real holes
# (not masks) so they stay transparent everywhere and survive renderers without mask support.
def body_path(small):
    shape = box(10, 14, 54, 56).buffer(-7).buffer(7, quad_segs=16)
    check = LineString([(22, 39), (29, 46), (43, 32)]).buffer((6.5 if small else 5) / 2, quad_segs=16)
    shape = shape.difference(check)
    if not small:
        shape = shape.difference(box(8, 24, 56, 26))
    polys = shape.geoms if hasattr(shape, "geoms") else [shape]
    rings = [r for p in polys for r in (p.exterior, *p.interiors)]
    return " ".join("M" + " L".join(f"{x:.2f} {y:.2f}" for x, y in r.coords[:-1]) + "Z" for r in rings)


BODY = {False: body_path(False), True: body_path(True)}


def mark(body, ring, uid, small=False, x=0, y=0, scale=1):
    return f'''<g transform="translate({x} {y}) scale({scale})">
  <path d="{BODY[small]}" fill="{body}" fill-rule="evenodd"/>
  <path d="M21 8 v10 M43 8 v10" fill="none" stroke="{ring}" stroke-width="5" stroke-linecap="round"/>
</g>'''


MARK_BOX = "5 3.5 54 54"  # mark content spans x 10–54, y 5.5–56


def svg(vb, body, w=None, h=None, bg=None):
    size = f' width="{w}" height="{h}"' if w else ""
    _, _, vw, vh = vb.split()
    x0, y0 = vb.split()[:2]
    back = f'<rect x="{x0}" y="{y0}" width="{vw}" height="{vh}" fill="{bg}"/>' if bg else ""
    return f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{vb}"{size}>{back}{body}</svg>\n'


def write(path, text):
    p = os.path.join(OUT, path)
    os.makedirs(os.path.dirname(p), exist_ok=True)
    with open(p, "w") as f:
        f.write(text)
    return p


def png(svg_text, path, w, h=None):
    p = os.path.join(OUT, path)
    os.makedirs(os.path.dirname(p), exist_ok=True)
    cairosvg.svg2png(bytestring=svg_text.encode(), write_to=p, output_width=w, output_height=h or w)


def png_img(svg_text, w, h=None):
    return Image.open(io.BytesIO(cairosvg.svg2png(bytestring=svg_text.encode(), output_width=w, output_height=h or w))).convert("RGBA")


# ---------- Mark ----------
VARIANTS = {
    "color": (C["blue"], C["rose"]),
    "color-on-dark": (C["blue-dark"], C["rose-dark"]),
    "mono-black": ("#000000", "#000000"),
    "mono-white": ("#FFFFFF", "#FFFFFF"),
    "mono-ink": (C["ink"], C["ink"]),
}
for v, (b, r) in VARIANTS.items():
    s = svg(MARK_BOX, mark(b, r, "m"))
    write(f"logo/svg/mark-{v}.svg", s)
    for px in (64, 128, 256, 512, 1024):
        png(s, f"logo/png/mark-{v}-{px}.png", px)

# ---------- Wordmark & lockups ----------
WORD = "nudge"
# Size type so the 'd' ascender matches the mark's body height (14–56 → 42 units), baseline on the body's bottom edge.
asc = glyph_top(BOLD, "d")
FS = 42 / asc
TRACK = -0.015


def wordmark_svg(color, pad=2):
    d, width = text_path(BOLD, WORD, FS, pad, 56, TRACK)
    gs = BOLD.getGlyphSet()
    bp = BoundsPen(gs)
    gs[BOLD.getBestCmap()[ord("g")]].draw(bp)
    desc = -bp.bounds[1] / 1000 * FS
    top = 56 - 42
    vb = f"0 {top - pad} {width + 2 * pad:.2f} {42 + desc + 2 * pad:.2f}"
    return svg(vb, f'<path d="{d}" fill="{color}"/>'), (width + 2 * pad, 42 + desc + 2 * pad)


def lockup_h(body, ring, text, bg=None):
    gap = 12
    tx = 54 + gap
    d, width = text_path(BOLD, WORD, FS, tx, 56, TRACK)
    gs = BOLD.getGlyphSet()
    bp = BoundsPen(gs)
    gs[BOLD.getBestCmap()[ord("g")]].draw(bp)
    bottom = 56 - bp.bounds[1] / 1000 * FS
    pad = 5
    vb = f"{10 - pad} {5.5 - pad} {tx + width - 10 + 2 * pad:.2f} {bottom - 5.5 + 2 * pad:.2f}"
    body_svg = mark(body, ring, "h") + f'<path d="{d}" fill="{text}"/>'
    return svg(vb, body_svg, bg=bg), (tx + width - 10 + 2 * pad, bottom - 5.5 + 2 * pad)


def lockup_v(body, ring, text, bg=None):
    s = 0.62  # wordmark relative to mark
    fs = FS * s
    _, width = text_path(BOLD, WORD, fs, 0, 0, TRACK)
    total_w = max(44, width)
    cx = 10 + 22
    tx = cx - width / 2
    base = 56 + 12 + 42 * s
    d, _ = text_path(BOLD, WORD, fs, tx, base, TRACK)
    gs = BOLD.getGlyphSet()
    bp = BoundsPen(gs)
    gs[BOLD.getBestCmap()[ord("g")]].draw(bp)
    bottom = base - bp.bounds[1] / 1000 * fs
    pad = 5
    x0 = cx - total_w / 2 - pad
    vb = f"{x0:.2f} {5.5 - pad} {total_w + 2 * pad:.2f} {bottom - 5.5 + 2 * pad:.2f}"
    return svg(vb, mark(body, ring, "v") + f'<path d="{d}" fill="{text}"/>', bg=bg), (total_w + 2 * pad, bottom - 5.5 + 2 * pad)


LOCKUPS = {
    "color": (C["blue"], C["rose"], C["ink"]),
    "color-on-dark": (C["blue-dark"], C["rose-dark"], C["snow"]),
    "mono-black": ("#000000",) * 3,
    "mono-white": ("#FFFFFF",) * 3,
}
for v, (b, r, t) in LOCKUPS.items():
    for kind, fn in (("horizontal", lockup_h), ("stacked", lockup_v)):
        s, (w, h) = fn(b, r, t)
        write(f"logo/svg/lockup-{kind}-{v}.svg", s)
        for target_h in (64, 128, 256, 512):
            png(s, f"logo/png/lockup-{kind}-{v}-{target_h}h.png", round(w / h * target_h), target_h)

for v, col in (("ink", C["ink"]), ("on-dark", C["snow"]), ("black", "#000000"), ("white", "#FFFFFF")):
    s, (w, h) = wordmark_svg(col)
    write(f"logo/svg/wordmark-{v}.svg", s)
    for target_h in (64, 128, 256):
        png(s, f"logo/png/wordmark-{v}-{target_h}h.png", round(w / h * target_h), target_h)

# ---------- App icon ----------
def app_icon(bg, body, ring, inner_scale=0.62, rounded=False):
    # 1024 canvas; mark centered by its content box (44×50.5 units, center 32,30.75)
    k = 1024 * inner_scale / 54
    x = 512 - 32 * k
    y = 512 - 30.75 * k
    rx = ' rx="229"' if rounded else ""
    return f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024"><rect width="1024" height="1024"{rx} fill="{bg}"/>{mark(body, ring, "a", x=x, y=y, scale=k)}</svg>\n'


icon = app_icon(C["blue"], C["paper"], C["rose"])
icon_dark = app_icon(C["night"], C["blue-dark"], C["rose-dark"])
write("app-icon/app-icon.svg", icon)
write("app-icon/app-icon-dark.svg", icon_dark)
write("app-icon/app-icon-rounded.svg", app_icon(C["blue"], C["paper"], C["rose"], rounded=True))
for px in (1024, 512, 192, 180, 167, 152, 144, 120, 96, 72, 48):
    png(icon, f"app-icon/png/app-icon-{px}.png", px)
png(icon_dark, "app-icon/png/app-icon-dark-1024.png", 1024)
png(app_icon(C["blue"], C["paper"], C["rose"], rounded=True), "app-icon/png/app-icon-rounded-1024.png", 1024)
maskable = app_icon(C["blue"], C["paper"], C["rose"], inner_scale=0.48)  # stays inside the 80% safe zone
write("app-icon/app-icon-maskable.svg", maskable)
for px in (192, 512):
    png(maskable, f"app-icon/png/app-icon-maskable-{px}.png", px)

# ---------- Favicons ----------
FAV_BOX = "6 4.5 52 52"
fav_small = svg(FAV_BOX, mark(C["blue"], C["rose"], "f", small=True))
write("favicon/favicon.svg", f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="{FAV_BOX}">
<style>.b{{fill:{C["blue"]}}}.r{{stroke:{C["rose"]}}}@media (prefers-color-scheme:dark){{.b{{fill:{C["blue-dark"]}}}.r{{stroke:{C["rose-dark"]}}}}}</style>
{mark("x", "x", "f", small=True).replace('fill="x"', 'class="b"').replace('stroke="x"', 'class="r"')}
</svg>
''')
write("favicon/safari-pinned-tab.svg", svg(FAV_BOX, mark("#000000", "#000000", "p", small=True)))
fav_imgs = {}
for px in (16, 32, 48, 96):
    png(fav_small, f"favicon/favicon-{px}.png", px)
    fav_imgs[px] = png_img(fav_small, px)
fav_imgs[48].save(os.path.join(OUT, "favicon/favicon.ico"), sizes=[(16, 16), (32, 32), (48, 48)],
                  append_images=[fav_imgs[16], fav_imgs[32]])
apple = app_icon(C["blue"], C["paper"], C["rose"], inner_scale=0.6)
png(apple, "favicon/apple-touch-icon.png", 180)
png(icon, "favicon/android-chrome-192.png", 192)
png(icon, "favicon/android-chrome-512.png", 512)
png(maskable, "favicon/maskable-512.png", 512)
write("favicon/site.webmanifest", json.dumps({
    "name": "Nudge", "short_name": "Nudge",
    "icons": [
        {"src": "/android-chrome-192.png", "sizes": "192x192", "type": "image/png"},
        {"src": "/android-chrome-512.png", "sizes": "512x512", "type": "image/png"},
        {"src": "/maskable-512.png", "sizes": "512x512", "type": "image/png", "purpose": "maskable"},
    ],
    "theme_color": C["blue"], "background_color": C["paper"], "display": "standalone",
}, indent=2) + "\n")
write("favicon/head-snippet.html", f'''<link rel="icon" href="/favicon.ico" sizes="48x48">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<link rel="apple-touch-icon" href="/apple-touch-icon.png">
<link rel="mask-icon" href="/safari-pinned-tab.svg" color="{C["blue"]}">
<link rel="manifest" href="/site.webmanifest">
<meta name="theme-color" content="{C["paper"]}" media="(prefers-color-scheme: light)">
<meta name="theme-color" content="{C["night"]}" media="(prefers-color-scheme: dark)">
''')

# ---------- Social ----------
def social(bg, body, ring, text, sub):
    W, H = 1200, 630
    k = 4.2
    s, (lw, lh) = lockup_h(body, ring, text)
    vb = [float(v) for v in s.split('viewBox="')[1].split('"')[0].split()]
    inner = s.split(">", 1)[1].rsplit("</svg>", 1)[0]
    gx = (W - lw * k) / 2 - vb[0] * k
    gy = 200 - vb[1] * k
    tag, tw = text_path(BOOK, "Small pushes. Things get done.", 44, 0, 0)
    return f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}"><rect width="{W}" height="{H}" fill="{bg}"/>
<g transform="translate({gx:.1f} {gy:.1f}) scale({k})">{inner}</g>
<path d="{tag}" fill="{sub}" transform="translate({(W - tw) / 2:.1f} {200 + lh * k + 30:.1f})"/>
<rect x="0" y="{H - 14}" width="{W * 0.72:.0f}" height="14" fill="{body}"/><rect x="{W * 0.72:.0f}" y="{H - 14}" width="{W * 0.28:.0f}" height="14" fill="{ring}"/></svg>
'''


og = social(C["mist"], C["blue"], C["rose"], C["ink"], C["slate"])
og_dark = social(C["night"], C["blue-dark"], C["rose-dark"], C["snow"], "#A3ABC6")
write("social/og-image.svg", og)
write("social/og-image-dark.svg", og_dark)
png(og, "social/og-image.png", 1200, 630)
png(og_dark, "social/og-image-dark.png", 1200, 630)

# ---------- Colors ----------
TOKENS = [
    ("blue", C["blue"], "Primary brand. Mark body, primary buttons, links, focus ring on light."),
    ("blue-dark", C["blue-dark"], "Primary brand on dark backgrounds."),
    ("rose", C["rose"], "Accent. Calendar rings, due-today and badges. Use sparingly."),
    ("rose-dark", C["rose-dark"], "Accent on dark backgrounds."),
    ("ink", C["ink"], "Text and wordmark on light backgrounds."),
    ("slate", C["slate"], "Secondary text on light backgrounds."),
    ("paper", C["paper"], "Light surface (cards, app background)."),
    ("mist", C["mist"], "Light page background behind cards."),
    ("night", C["night"], "Dark page background."),
    ("snow", C["snow"], "Text and wordmark on dark backgrounds."),
]
write("colors/tokens.json", json.dumps({t[0]: {"value": t[1], "usage": t[2]} for t in TOKENS}, indent=2) + "\n")
write("colors/colors.css", f''':root {{
  --nudge-blue: {C["blue"]};
  --nudge-rose: {C["rose"]};
  --nudge-ink: {C["ink"]};
  --nudge-slate: {C["slate"]};
  --nudge-paper: {C["paper"]};
  --nudge-mist: {C["mist"]};
  --nudge-night: {C["night"]};
  --nudge-snow: {C["snow"]};

  --color-brand: var(--nudge-blue);
  --color-accent: var(--nudge-rose);
  --color-bg: var(--nudge-mist);
  --color-surface: var(--nudge-paper);
  --color-text: var(--nudge-ink);
  --color-text-muted: var(--nudge-slate);
}}

@media (prefers-color-scheme: dark) {{
  :root {{
    --color-brand: {C["blue-dark"]};
    --color-accent: {C["rose-dark"]};
    --color-bg: var(--nudge-night);
    --color-surface: #171C33;
    --color-text: var(--nudge-snow);
    --color-text-muted: #A3ABC6;
  }}
}}
''')
sw = 200
rows = "".join(
    f'<rect x="{i % 5 * sw}" y="{i // 5 * 240}" width="{sw}" height="170" fill="{v}"/>'
    f'<path d="{text_path(BOLD, n, 22, i % 5 * sw + 14, i // 5 * 240 + 202)[0]}" fill="{C["ink"]}"/>'
    f'<path d="{text_path(BOOK, v.upper(), 18, i % 5 * sw + 14, i // 5 * 240 + 228)[0]}" fill="{C["slate"]}"/>'
    for i, (n, v, _) in enumerate(TOKENS))
palette = f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 480"><rect width="1000" height="480" fill="#FFFFFF"/>{rows}</svg>\n'
write("colors/palette.svg", palette)
png(palette, "colors/palette.png", 2000, 960)
print("done")
