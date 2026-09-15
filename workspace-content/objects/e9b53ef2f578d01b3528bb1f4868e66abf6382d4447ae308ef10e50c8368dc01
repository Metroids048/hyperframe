#!/usr/bin/env python3
"""Generate the HyperFrames project (index.html + compositions/) from the measured tables in tools/.

Output: index.html (root: sub-comp mounts, figure video, audio) + compositions/{lockup,chat,headline}.html.
Every visible thing is a DOM/SVG element with GSAP tweens on window.__timelines, so the Studio can inspect it.
Frame tables are reduced to knots (Douglas-Peucker per channel, tolerance in table units) before becoming keyframes.
"""
import json, os, re, shutil
from PIL import ImageFont

TOOLS = os.path.dirname(os.path.abspath(__file__))
HERE = os.path.normpath(os.path.join(TOOLS, ".."))  # project root
T = json.load(open(f"{TOOLS}/tables.json"))
CAL = json.load(open(f"{TOOLS}/cal.json"))
FPS = 60
FRAMES = T["meta"]["frames"]
CS, CG = T["meta"]["comp_rgb_saturated"], T["meta"]["comp_rgb_grey"]
FONTS = f"{HERE}/assets/fonts"

def clamp(v, a, b): return max(a, min(b, v))
def rgb(c, sat=False, a=None):
    k = CS if sat else CG
    r, g, b = (int(clamp(round(c[i] + k[i]), 0, 255)) for i in range(3))
    return f"rgb({r},{g},{b})" if a is None else f"rgba({r},{g},{b},{a})"
def lut(tab, f, col=1):
    if f <= tab[0][0]: return tab[0][col]
    for i in range(1, len(tab)):
        if f <= tab[i][0]:
            a, b = tab[i - 1], tab[i]; t = (f - a[0]) / (b[0] - a[0]); return a[col] + (b[col] - a[col]) * t
    return tab[-1][col]
def fmt(v):
    if isinstance(v, float): return f"{v:.4g}" if abs(v) < 1e-3 or abs(v) >= 1e4 else f"{round(v, 3):g}"
    return str(v)

# ---------- knot reduction ----------
def dp(idx, vals, tol):
    """Douglas-Peucker on (idx, vals); returns kept indices (positions into the arrays)."""
    keep = {0, len(idx) - 1}
    def rec(i0, i1):
        if i1 - i0 < 2: return
        x0, y0, x1, y1 = idx[i0], vals[i0], idx[i1], vals[i1]
        best, bi = -1, -1
        for i in range(i0 + 1, i1):
            yl = y0 + (y1 - y0) * (idx[i] - x0) / (x1 - x0)
            d = abs(vals[i] - yl)
            if d > best: best, bi = d, i
        if best > tol:
            keep.add(bi); rec(i0, bi); rec(bi, i1)
    rec(0, len(idx) - 1)
    return sorted(keep)

def knots(rows, cols, tols):
    """rows: [[f, v1, v2, ...]]; cols: column indices to keep; tols: per-column tolerance. Returns [[f, v...]] at union knots."""
    fr = [r[0] for r in rows]
    keep = set()
    for c, tol in zip(cols, tols):
        keep |= set(dp(fr, [r[c] for r in rows], tol))
    return [[rows[i][0]] + [rows[i][c] for c in cols] for i in sorted(keep)]

def kf_js(rows, names, f0, ease="none"):
    """keyframes array literal from knot rows [[f, v...]] with names per value column; times relative to frame f0."""
    parts = []
    for i, r in enumerate(rows):
        dur = 0 if i == 0 else (r[0] - rows[i - 1][0]) / FPS
        kv = ", ".join(f"{n}: {fmt(v)}" for n, v in zip(names, r[1:]))
        parts.append(f"{{{kv}, duration: {fmt(dur)}}}")
    return "[" + ", ".join(parts) + "]"

def tl_kf(sel, rows, names, f0, sceneF0, extra=""):
    """tl.to(sel, {keyframes: [...], ease:'none'}, t0) — first knot is a zero-duration set at its frame."""
    t0 = (rows[0][0] - sceneF0) / FPS
    return f"tl.to({sel}, {{ keyframes: {kf_js(rows, names, f0)}, ease: 'none'{extra} }}, {fmt(t0)});"

def curve_rows(f_on, values, scale=1.0):
    return [[f_on + i, v * scale] for i, v in enumerate(values)]

# ---------- fonts (PIL metrics == browser advances) ----------
def font(path, px): return ImageFont.truetype(path, int(round(px)))
INTER = {w: f"{FONTS}/Inter-{w}.ttf" for w in (400, 500, 600)}
HEEBO = f"{FONTS}/Heebo-900.ttf"

def path_d(svg): return re.search(r' d="([^"]+)"', open(svg).read()).group(1)
OPENAI_D = path_d(f"{TOOLS}/logos/openai.svg")
OUTLINE = json.load(open(f"{TOOLS}/logos/codex_outline_ref24.json"))

os.makedirs(f"{HERE}/compositions", exist_ok=True)

W, H = 3840, 2160
GSAP = '<script src="https://cdn.jsdelivr.net/npm/gsap@3.12.5/dist/gsap.min.js"></script>'  # CDN on purpose: vendoring would redistribute GSAP from a public repo

def subcomp(cid, style, body, script):
    return f"""<!doctype html>
<html>
<head><meta charset="utf-8"></head>
<body>
<template>
<style>
#root {{ position: absolute; inset: 0; width: {W}px; height: {H}px; overflow: hidden; }}
.layer {{ position: absolute; left: 0; top: 0; width: {W}px; height: {H}px; overflow: visible; }}
{style}
</style>
<div id="root" data-composition-id="{cid}" data-width="{W}" data-height="{H}">
{body}
</div>
<script>
(function () {{
  const tl = gsap.timeline({{ paused: true }});
{script}
  window.__timelines["{cid}"] = tl;
}})();
</script>
</template>
</body>
</html>
"""

# =====================================================================================
# 1. LOCKUP  f0..212  — flower -> blob morph, wordmark substitutions, zoom
# =====================================================================================
WM, MO, ZM = T["wordmark"], T["morph"], T["zoom"]
L0, L1 = 0, 212
def lt(f): return (f - L0) / FPS

def wm_glyphs(state):
    """per-glyph static placement: ink-left at x0, baseline at WM.baseline, x-scale to measured ink width, y-scale to measured ink height."""
    fnt = font(INTER[WM["weight"]], WM["font_px"]); out = []
    for i, ch in enumerate(state["text"]):
        if ch == " ": out.append(None); continue
        x0, x1 = state["glyph_x0"][i], state["glyph_x1"][i]
        l, t, r, b = fnt.getbbox(ch)  # ink bbox relative to pen origin (baseline at y=ascent)
        asc = fnt.getmetrics()[0]
        inkL, inkW, inkH = l, r - l, b - t
        sx = (x1 - x0 + 1) / max(1, inkW)
        sy = 1.0
        if state.get("glyph_y0") and state["glyph_y0"][i] is not None:
            sy = (state["glyph_y1"][i] - state["glyph_y0"][i] + 1) / max(1, inkH)
        out.append(dict(ch=ch, x0=x0, sx=sx, sy=sy, inkL=inkL))
    return out

def wm_text_el(g, gid, fill):
    base = WM["baseline"]
    return (f'<g id="{gid}"><text x="{g["x0"] - g["inkL"]}" y="{base}" fill="{fill}" '
            f'transform="translate({g["x0"]} {base}) scale({g["sx"]:.4f} {g["sy"]:.4f}) translate({-g["x0"]} {-base})">{g["ch"]}</text></g>')

lock_body, lock_js = [], []
fb = WM["flower_bbox"]; bb = MO["blob_bbox"]
# flower (OpenAI mark) — svgl path, viewBox 256x260
lock_body.append(f'<div id="zoomg" class="layer"><div id="lockup" class="layer">')
lock_body.append(f'<svg id="flower" class="mark" style="left:{fb[0]}px;top:{fb[1]}px;width:{fb[2]-fb[0]}px;height:{fb[3]-fb[1]}px" viewBox="0 0 256 260"><path d="{OPENAI_D}" fill="{rgb(MO["flower_rgb"])}"/></svg>')
# blob — traced silhouette polygon, gradient + rim, authored >_ glyph
pts = " ".join(f"{p[0]:.3f},{p[1]:.3f}" for p in OUTLINE)
stops = "".join(f'<stop offset="{s[0]}" stop-color="{rgb(s[1], True)}"/>' for s in MO["gradient_stops"])
ro = MO["rim_overlay"]; G = MO["glyph"]
chev = " ".join(f"{p[0]},{p[1]}" for p in G["chevron"])
lock_body.append(f'''<svg id="blob" class="mark" style="left:{bb[0]}px;top:{bb[1]}px;width:{bb[2]-bb[0]}px;height:{bb[3]-bb[1]}px" viewBox="0 0 24 24">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0" y2="24" gradientUnits="userSpaceOnUse">{stops}</linearGradient>
    <radialGradient id="rim" cx="12" cy="12" r="{ro['r1']}" gradientUnits="userSpaceOnUse"><stop offset="{ro['r0']/ro['r1']:.3f}" stop-color="{rgb(ro['rgb'], True, 0)}"/><stop offset="1" stop-color="{rgb(ro['rgb'], True, ro['alpha'])}"/></radialGradient>
    <clipPath id="sil"><polygon points="{pts}"/></clipPath>
  </defs>
  <g id="blob-k"><g id="blob-s">
    <polygon id="blob-fill" points="{pts}" fill="url(#bg)"/>
    <rect x="0" y="0" width="24" height="24" fill="url(#rim)" clip-path="url(#sil)"/>
    <g id="glyph" stroke="{rgb(G['rgb'], True)}" stroke-width="{G['stroke']}" stroke-linecap="round" stroke-linejoin="round" fill="none">
      <polyline id="chev" points="{chev}"/>
      <line id="under" x1="{G['underscore'][0][0]}" y1="{G['underscore'][0][1]}" x2="{G['underscore'][1][0]}" y2="{G['underscore'][1][1]}"/>
    </g>
  </g></g>
</svg>''')
# wordmark: three states as SVG text layers
ga, gb, gc = wm_glyphs(WM["states"]["chatgpt"]), wm_glyphs(WM["states"]["tibo"]), wm_glyphs(WM["states"]["codex"])
KBLACK, PURPLE = rgb(WM["states"]["chatgpt"]["rgb"]), rgb(WM["states"]["tibo"]["rgb"], True)
def wm_layer(lid, glyphs, fill):
    els = [wm_text_el(g, f"{lid}-{i}", fill) for i, g in enumerate(glyphs) if g]
    return f'<svg id="{lid}" class="layer wm" viewBox="0 0 {W} {H}">' + "".join(els) + "</svg>"
lock_body.append(wm_layer("wm-a", ga, KBLACK))
lock_body.append(wm_layer("wm-b", gb, PURPLE))
lock_body.append(wm_layer("wm-c", gc, PURPLE))
lock_body.append("</div></div>")

lock_style = f"""
.mark {{ position: absolute; overflow: visible; }}
.wm text {{ font-family: Inter; font-weight: {WM['weight']}; font-size: {WM['font_px']}px; }}
#zoomg {{ transform-origin: {ZM['ref_point'][0]}px {ZM['ref_point'][1]}px; }}
#lockup {{ transform-origin: {WM['anchor'][0]}px {WM['anchor'][1]}px; }}
"""
# --- lockup fade-in (scale about anchor, opacity) f0-14
lock_js.append("  // entrance: whole lockup scales in about the measured anchor while fading up (f0-14)")
lock_js.append("  " + tl_kf("'#lockup'", [[r[0], r[1], r[2]] for r in WM["fade_in"]], ["scale", "opacity"], L0, L0))
# --- flower spin/shrink f39-60, fade f57-62
lock_js.append("  // flower: measured IoU spin (clockwise) with shrink, then fades as the blob takes over")
fs = knots([[r[0], r[1], lut(MO["flower_rot"], r[0])] for r in MO["flower_scale"]], [1, 2], [0.002, 0.5])
lock_js.append("  " + tl_kf("'#flower'", fs, ["scale", "rotation"], L0, L0, ", transformOrigin: '50% 50%'"))
lock_js.append("  " + tl_kf("'#flower'", MO["flower_alpha"], ["opacity"], L0, L0))
# --- blob: alpha in, spring scale, glyph spin, blink, silhouette k, fade at zoom end
lock_js.append("  // blob: fade in, spring scale about its centre (viewBox 12,12)")
lock_js.append(f"  gsap.set('#blob', {{ opacity: 0 }});")
lock_js.append("  " + tl_kf("'#blob'", MO["blob_alpha"], ["opacity"], L0, L0))
bs = knots(MO["blob_scale"], [1], [0.002])
lock_js.append("  " + tl_kf("'#blob-s'", bs, ["scale"], L0, L0, ", svgOrigin: '12 12'"))
lock_js.append("  // >_ glyph spins in about the blob centre: measured underscore angle, exponential settle to 0 by f108")
gr = knots(MO["glyph_rot"], [1], [0.4])
lock_js.append("  " + tl_kf("'#glyph'", gr, ["rotation"], L0, L0, ", svgOrigin: '12 12'"))
lock_js.append("  // blink f112-125: the chevron squashes to a dash (points tween keeps the stroke width)")
ccx = (G["chevron"][0][0] + G["chevron"][1][0]) / 2; ccy = (G["chevron"][0][1] + G["chevron"][2][1]) / 2
def chev_pts(sy):
    sx = 1 + MO.get("blink_widen", 0) * (1 - sy)
    return " ".join(f"{ccx + (p[0]-ccx)*sx:.3f},{ccy + (p[1]-ccy)*sy:.3f}" for p in G["chevron"])
bl = [f"{{attr: {{points: '{chev_pts(r[1])}'}}, duration: {fmt(0 if i == 0 else (r[0]-MO['blink_sy'][i-1][0])/FPS)}}}" for i, r in enumerate(MO["blink_sy"])]
lock_js.append(f"  tl.to('#chev', {{ keyframes: [{', '.join(bl)}], ease: 'none' }}, {fmt(lt(MO['blink_sy'][0][0]))});")
lock_js.append("  // silhouette breathes slightly relative to the glyph during the zoom (f165-175), then the blue fades out")
lock_js.append("  " + tl_kf("'#blob-k'", ZM["blob_k"], ["scale"], L0, L0, ", svgOrigin: '12 12'"))
lock_js.append("  " + tl_kf("'#blob'", ZM["blob_alpha_fade"], ["opacity"], L0, L0))
# --- wordmark substitutions
ex, en = WM["exit_curve"], WM["enter_curve"]; ov = WM["enter_overshoot_px"]
lock_js.append("  // wordmark A 'ChatGPT' exits: each glyph squashes to its cap line (5 f)")
for i, g in enumerate(ga):
    es = WM["sub1"]["exit_start"][i]
    rows = curve_rows(es, ex)
    lock_js.append("  " + tl_kf(f"'#wm-a-{i}'", rows, ["scaleY"], L0, L0, f", svgOrigin: '{g['x0']} {WM['cap_top']}'"))
lock_js.append("  // wordmark B 'Tibo Please' grows from the baseline (11 f, purple), then exits per sub2")
for i, g in enumerate(gb):
    if not g: continue
    e0, x0 = WM["sub1"]["enter_start"][i], WM["sub2"]["exit_start"][i]
    lock_js.append(f"  gsap.set('#wm-b-{i}', {{ scaleY: 0, svgOrigin: '{g['x0']} {WM['baseline']}' }});")
    rows = [[e0 + k, en[k], ov[k]] for k in range(len(en))]
    lock_js.append("  " + tl_kf(f"'#wm-b-{i}'", rows, ["scaleY", "y"], L0, L0, f", svgOrigin: '{g['x0']} {WM['baseline']}'"))
    if x0 is not None:
        lock_js.append(f"  tl.set('#wm-b-{i}', {{ y: 0, svgOrigin: '{g['x0']} {WM['cap_top']}', immediateRender: false }}, {fmt(lt(x0))});")
        lock_js.append("  " + tl_kf(f"'#wm-b-{i}'", curve_rows(x0, ex), ["scaleY"], L0, L0, f", svgOrigin: '{g['x0']} {WM['cap_top']}'"))
lock_js.append("  // wordmark C 'Codex' grows from the baseline (8 f, purple) and settles to black")
for i, g in enumerate(gc):
    e0 = WM["sub2"]["enter_start"][i]
    lock_js.append(f"  gsap.set('#wm-c-{i}', {{ scaleY: 0, svgOrigin: '{g['x0']} {WM['baseline']}' }});")
    n = 8; rows = [[e0 + k, en[min(len(en) - 1, round(k * 11 / 8))], ov[min(len(ov) - 1, round(k * 11 / 8))]] for k in range(n + 1)]
    lock_js.append("  " + tl_kf(f"'#wm-c-{i}'", rows, ["scaleY", "y"], L0, L0, f", svgOrigin: '{g['x0']} {WM['baseline']}'"))
    sw = WM["sub2"]["to_black_frames"][i] - WM["sub2"].get("to_black_lead", 0)
    lock_js.append(f"  tl.to('#wm-c-{i} text', {{ fill: '{KBLACK}', duration: {fmt(WM['sub2']['to_black_dur']/FPS)}, ease: 'power1.out' }}, {fmt(lt(sw))});")
lock_js.append(f"  tl.set('#wm-c', {{ autoAlpha: 0, immediateRender: false }}, {fmt(lt(175))}); // zoomed far off-canvas by now (canvas build stopped drawing it here too)")
# --- zoom f145-211: translate to the measured anchor, scale about the '_' glyph centre
zr = knots(ZM["table"], [1, 2, 3], [0.01, 0.5, 0.5])
zr = [[r[0], r[1], r[2] - ZM["ref_point"][0], r[3] - ZM["ref_point"][1]] for r in zr]
lock_js.append("  // zoom into the Codex blob: per-frame (scale, anchor) table reduced to knots; origin = '_' glyph centre")
lock_js.append("  " + tl_kf("'#zoomg'", zr, ["scale", "x", "y"], L0, L0))

open(f"{HERE}/compositions/lockup.html", "w").write(subcomp("lockup", lock_style, "\n".join(lock_body), "\n".join(lock_js)))

# =====================================================================================
# 2. CHAT  f211..608 — box settle + camera pan, placeholder, caret, icons, typed text, send
# =====================================================================================
BX, PH, CR, IC, TY, PAN = T["box"], T["placeholder"], T["caret"], T["icons"], T["typed"], T["pan"]
C0 = 211
def ct(f): return (f - C0) / FPS
fin = BX["final"]; BH = fin["bottom"] - fin["top"]; BW = fin["width"]; th = fin["thick"]
chat_body, chat_js = [], []
# box: final geometry, transform (x,y,scale) from the measured table (left, top, bottom)
box_rows = [[r[0], r[1] - fin["left_content"], r[2] - fin["top"], (r[3] - r[2]) / BH] for r in BX["table"]]
box_k = knots(box_rows, [1, 2, 3], [1.0, 1.0, 0.002])
sc_at = lambda f: lut([[r[0], (r[3] - r[2]) / BH] for r in BX["table"]], f)
# box-relative svg (outer-box coordinates: 0,0 = outer top-left)
ic = IC["plus"]; sl = IC["slider"]; S = IC["send"]
kr = sl["knob_r"]; gap = kr + 4; hw = sl["stroke"] / 2
mstroke = IC["mic"]["stroke"]
capX0, capX1 = 2860 + 3360 + mstroke / 2, 2947 + 3360 - mstroke / 2; capY0, capY1 = 1348 - 548 + mstroke / 2, 1447 - 548 - mstroke / 2; cr = (capX1 - capX0) / 2
ux0, ux1 = 6188 + mstroke / 2, 6339 - mstroke / 2; uy0, uy1 = 1440 - 548, 1538 - 548 - mstroke / 2; ur = (ux1 - ux0) / 2
sx_ = (6188 + 6339) / 2; my1 = 1563 - 548
dcx, dcy = 6597, 1452.5 - 548
ab = S["arrow_bbox_rel"]; a_top = ab[1] + S["arrow_stroke"] / 2; a_bot = ab[3] - S["arrow_stroke"] / 2; a_hw = (ab[2] - ab[0]) / 2 - S["arrow_stroke"] / 2
arrow_d = f"M0 {a_bot} L0 {a_top} M{-a_hw} {a_top + a_hw} L0 {a_top} L{a_hw} {a_top + a_hw}"
ph_px = PH["font_px"] * CAL.get("ph_scale", 1)
chat_body.append(f'''<div id="box">
  <svg id="box-ui" viewBox="0 0 {BW:g} {BH}" width="{BW:g}" height="{BH}">
    <text id="placeholder" x="{PH['box_rel']['x'] + CAL.get('ph_dx', 0)}" y="{PH['box_rel']['top'] + CAL.get('ph_cap', 87)}" fill="{rgb(PH['rgb'])}" font-family="Inter" font-weight="{PH['weight']}" font-size="{ph_px:g}" letter-spacing="{CAL.get('ph_ls', 0)}" opacity="0">{PH['text']}</text>
    <rect id="caret" x="{CR['x_rel']}" y="{CR['y0_rel']}" width="{CR['w']}" height="{CR['y1_rel'] - CR['y0_rel']}" fill="{rgb(CR['rgb'], True)}" opacity="0"/>
    <g id="icons" stroke="{rgb(IC['rgb'])}" fill="none" stroke-linecap="round" stroke-linejoin="round" opacity="0">
      <path id="plus" stroke-width="{ic['stroke']}" stroke-linecap="butt" d="M{ic['cx_rel'] - ic['arm']/2} {ic['cy_rel']} H{ic['cx_rel'] + ic['arm']/2} M{ic['cx_rel']} {ic['cy_rel'] - ic['arm']/2} V{ic['cy_rel'] + ic['arm']/2}"/>
      <g id="slider" stroke-width="{sl['stroke']}">
        <path d="M{sl['x0_rel'] + hw} {sl['y_top_rel']} H{sl['knob_top_x_rel'] - gap} M{sl['knob_top_x_rel'] + gap} {sl['y_top_rel']} H{sl['x1_rel'] - hw}"/>
        <path d="M{sl['x0_rel'] + hw} {sl['y_bot_rel']} H{sl['knob_bot_x_rel'] - gap} M{sl['knob_bot_x_rel'] + gap} {sl['y_bot_rel']} H{sl['x1_rel'] - hw}"/>
        <circle cx="{sl['knob_top_x_rel']}" cy="{sl['y_top_rel']}" r="{kr - sl['stroke']/2}"/>
        <circle cx="{sl['knob_bot_x_rel']}" cy="{sl['y_bot_rel']}" r="{kr - sl['stroke']/2}"/>
      </g>
    </g>
    <g id="mic" stroke="{rgb(IC['rgb'])}" fill="none" stroke-width="{mstroke}" stroke-linecap="round" stroke-linejoin="round">
      <path d="M{capX0} {capY0 + cr} A{cr} {cr} 0 0 1 {capX1} {capY0 + cr} V{capY1 - cr} A{cr} {cr} 0 0 1 {capX0} {capY1 - cr} Z"/>
      <path d="M{ux0} {uy0} V{uy1 - ur} A{ur} {ur} 0 0 0 {ux1} {uy1 - ur} V{uy0}"/>
      <path stroke-linecap="butt" d="M{sx_} {uy1} V{my1}"/>
    </g>
    <g id="send" transform="translate({dcx} {dcy})">
      <circle id="send-disc" r="{S['disc_r']}" fill="{rgb([18, 18, 20])}"/>
      <path id="send-arrow-light" d="{arrow_d}" stroke="#ffffff" fill="none" stroke-width="{S['arrow_stroke']}" stroke-linecap="round" stroke-linejoin="round"/>
      <path id="send-arrow-dark" d="{arrow_d}" stroke="{rgb(IC['rgb'])}" fill="none" stroke-width="{S['arrow_stroke']}" stroke-linecap="round" stroke-linejoin="round" opacity="0"/>
    </g>
  </svg>
</div>''')
# typed text: content-space glyphs, camera pan = -P(f)
ty_px = TY["font_px"] * CAL.get("ty_scale", 1); ty_ls = CAL.get("ty_ls", 0)
tf = font(INTER[TY["weight"]], ty_px)
x = TY["x_start_content"] + CAL.get("ty_x0", 0); tglyphs = []
for ch in TY["text"]:
    adv = tf.getlength(ch) + ty_ls
    if ch != " ":
        right = x + tf.getbbox(ch)[2]
        tglyphs.append(dict(ch=ch, x=x, onset=int(round(lut(TY["onset_by_content_x"], right)))))
    x += adv
tels = "".join(f'<text id="ty-{i}" x="{g["x"]:.1f}" y="{TY["baseline"]}" opacity="0" data-layout-allow-occlusion data-layout-allow-overlap>{g["ch"]}</text>' for i, g in enumerate(tglyphs))  # the figure cutout covers the sentence in the reference
chat_body.append(f'<svg id="typed" class="layer" viewBox="0 0 {W} {H}" fill="{rgb(TY["rgb_enter"], True)}">{tels}</svg>')

chat_style = f"""
#box {{ position: absolute; left: {fin['left_content']}px; top: {fin['top']}px; width: {BW:g}px; height: {BH}px; box-sizing: border-box; border: {th}px solid {rgb(BX['border_authored'])}; border-radius: {fin['radius']}px; background: #fff; transform-origin: 0 0; }}
#box-ui {{ position: absolute; left: {-th}px; top: {-th}px; overflow: visible; }}
#typed text {{ font-family: Inter; font-weight: {TY['weight']}; font-size: {ty_px:g}px; letter-spacing: {ty_ls}px; }}
"""
chat_js.append("  // box: measured left/top/height per frame -> translate + uniform scale about the outer top-left; after f268 x follows the camera pan")
chat_js.append("  " + tl_kf("'#box'", box_k, ["x", "y", "scale"], C0, C0))
bc = rgb(BX["border_authored"])
chat_js.append(f"  gsap.set('#box', {{ borderColor: '{bc.replace('rgb', 'rgba').replace(')', ',0)')}' }});")
chat_js.append(f"  tl.to('#box', {{ borderColor: '{bc}', duration: {fmt(4/FPS)}, ease: 'none' }}, {fmt(ct(211))});")
chat_js.append("  // placeholder + caret + icons fade per measured alpha tables")
chat_js.append("  " + tl_kf("'#placeholder'", PH["alpha"], ["opacity"], C0, C0))
chat_js.append("  " + tl_kf("'#caret'", CR["alpha"], ["opacity"], C0, C0))
chat_js.append("  " + tl_kf("'#icons'", IC["alpha"], ["opacity"], C0, C0))
chat_js.append("  // send: dark disc + white arrow crossfades to bare dark arrow (f393-410) with a 3% pulse")
chat_js.append("  " + tl_kf("'#send-disc'", S["fill_alpha"], ["opacity"], C0, C0))
chat_js.append("  " + tl_kf("'#send-arrow-light'", S["fill_alpha"], ["opacity"], C0, C0))
chat_js.append("  " + tl_kf("'#send-arrow-dark'", [[r[0], 1 - r[1]] for r in S["fill_alpha"]], ["opacity"], C0, C0))
chat_js.append("  " + tl_kf("'#send'", S["pulse"], ["scale"], C0, C0, f", svgOrigin: '{dcx} {dcy}'"))
chat_js.append("  // camera pan: the typed layer slides left by P(f) as the sentence types (box x already carries it)")
pk = knots(PAN["table"], [1], [1.0])
chat_js.append("  " + tl_kf("'#typed'", [[r[0], -r[1]] for r in pk], ["x"], C0, C0))
chat_js.append("  // typed glyphs: spring drop-in (17 f), fade 4 f, purple -> black from onset+8 over 4 f")
spring = TY["spring_y"]; ain = TY["alpha_in"]
chat_js.append(f"  const SPRING = {json.dumps(spring)}, AIN = {json.dumps(ain)};")
chat_js.append("  const springKf = SPRING.map((v, i) => ({ y: v, duration: i ? 1 / 60 : 0 }));")
chat_js.append("  const alphaKf = AIN.map((v, i) => ({ opacity: v, duration: i ? 1 / 60 : 0 }));")
chat_js.append(f"  const TY_ONSET = {json.dumps([g['onset'] for g in tglyphs])};")
chat_js.append(f"""  TY_ONSET.forEach((f, i) => {{
    const t = (f - {C0}) / 60, el = '#ty-' + i;
    tl.to(el, {{ keyframes: springKf, ease: 'none' }}, t);
    tl.to(el, {{ keyframes: alphaKf, ease: 'none' }}, t);
    tl.to(el, {{ fill: '{rgb(TY["rgb_settled"])}', duration: {TY['to_black_dur']} / 60, ease: 'none' }}, t + {TY['to_black_start']} / 60);
  }});""")
open(f"{HERE}/compositions/chat.html", "w").write(subcomp("chat", chat_style, "\n".join(chat_body), "\n".join(chat_js)))

# =====================================================================================
# 3. HEADLINE  f453..608 — glyphs on the measured cubic, tangent rotation, ghost -> overshoot -> settle
# =====================================================================================
HL = T["headline"]; H0 = 453
def ht(f): return (f - H0) / FPS
hf = font(HEEBO, HL["font_px"] * CAL.get("hl_scale", 1)); gsx = HL.get("glyph_scale_x", 1)
chs = list(HL["text"]); nat = 0; npairs = 0
for ci, ch in enumerate(chs):
    nxt = chs[ci + 1] if ci + 1 < len(chs) else ""
    w = hf.getlength(ch) * gsx
    nat += w / 2 if (ci == 0 or ci == len(chs) - 1) else w
    if nxt and ch != " " and nxt != " ": npairs += 1
ls = (HL["target_span"] - nat) / max(1, npairs)
P3 = HL["curve_poly"]; off = HL["baseline_offset_from_black_bottom"] + CAL.get("hl_dy", 0)
yOf = lambda x: ((P3[0] * x + P3[1]) * x + P3[2]) * x + P3[3] + off
slope = lambda x: (3 * P3[0] * x + 2 * P3[1]) * x + P3[2]
import math
xs = 397 - hf.getlength(chs[0]) * gsx / 2 + CAL.get("hl_x0", 0); x = xs; hglyphs = []
for ci, ch in enumerate(chs):
    nxt = chs[ci + 1] if ci + 1 < len(chs) else ""
    pairLs = 0 if (nxt == "" or ch == " " or nxt == " ") else ls
    w = hf.getlength(ch) * gsx
    sl_ = slope(x + w / 2); cosf = 1 / math.sqrt(1 + sl_ * sl_); dxg = w * cosf; dxp = pairLs * cosf
    if ch != " ":
        xc = x + dxg / 2; rp = HL["rot_parabola"]
        rot = math.degrees(math.atan(2 * rp[0] * xc + rp[1]))
        onset = HL["onset_linear"]["f0"] + HL["onset_linear"]["slope"] * (xc - HL["onset_linear"]["x0"])
        hglyphs.append(dict(ch=ch, xc=xc, yc=yOf(xc), rot=rot, onset=onset))
    x += dxg + dxp
sh = HL["shadow"]["layers"]
shadow_css = " ".join(f"drop-shadow({L['dx']}px {L['dy']}px {L['blur']/2:g}px rgba(0,0,0,{L['alpha']}))" for L in sh)
hels = "".join(f'<g class="hg" transform="translate({g["xc"]:.1f} {g["yc"]:.1f}) rotate({g["rot"]:.2f})"><g id="hl-{i}" class="pop"><text data-layout-allow-overlap>{g["ch"]}</text></g></g>' for i, g in enumerate(hglyphs))
hl_body = f'<svg id="hl" class="layer" viewBox="0 0 {W} {H}">{hels}</svg>'
hl_style = f"""
@font-face {{ font-family: 'Heebo'; font-weight: 900; src: url(assets/fonts/Heebo-900.ttf) format('truetype'); }}
#hl text {{ font-family: Heebo; font-weight: {HL['weight']}; font-size: {HL['font_px'] * CAL.get('hl_scale', 1):g}px; text-anchor: middle; fill: #fff; filter: {shadow_css}; }}
"""
psc, pal, pdy, prot, pgrey = HL["pop_scale"], HL["pop_alpha"], HL["pop_dy"], HL["pop_rot_deg"], HL["pop_grey"]
n = max(len(psc), len(pal), len(pdy), len(prot), len(pgrey))
def at(a, i): return a[min(i, len(a) - 1)]
pop = [f"{{scaleX: {fmt(at(psc,i)*gsx)}, scaleY: {fmt(at(psc,i))}, y: {at(pdy,i)}, rotation: {at(prot,i)}, opacity: {at(pal,i)}, duration: {fmt(0 if i == 0 else 1/FPS)}}}" for i in range(n)]
grey = [f"{{fill: 'rgb({at(pgrey,i)},{at(pgrey,i)},{at(pgrey,i)})', duration: {fmt(0 if i == 0 else 1/FPS)}}}" for i in range(len(pgrey))]
hl_js = [f"  const ONSET = {json.dumps([round(g['onset'], 2) for g in hglyphs])}; // frame of each glyph's ghost appearance (linear in x)",
         f"  const POP = [{', '.join(pop)}];   // ghost (small, faint) -> 1.45x overshoot lifted with extra lean -> settle",
         f"  const GREY = [{', '.join(grey)}]; // grey ghost -> white",
         f"  gsap.set('.pop', {{ opacity: 0, transformOrigin: '0px 0px' }});",
         f"""  ONSET.forEach((f, i) => {{
    const t = (f - {H0}) / 60, el = '#hl-' + i;
    tl.to(el, {{ keyframes: POP, ease: 'none' }}, t);
    tl.to(el + ' text', {{ keyframes: GREY, ease: 'none' }}, t);
  }});"""]
open(f"{HERE}/compositions/headline.html", "w").write(subcomp("headline", hl_style, hl_body, "\n".join(hl_js)))

# =====================================================================================
# ROOT
# =====================================================================================
FG = T["figure"]; dur = (FRAMES - 0.15) / FPS
figstart = (FG["start_frame"] - 0.3) / FPS; figdur = (FRAMES - 1 - FG["start_frame"]) / FPS + 0.02
fk = knots(FG["d_table"], [1], [0.5])
fig_rows = [[r[0], CAL["fig_y"] + r[1]] for r in fk]
def mount(cid, f0, f1, track):
    return f'<div id="scene-{cid}" class="clip" data-composition-id="{cid}" data-composition-src="compositions/{cid}.html" data-start="{fmt(f0/FPS)}" data-duration="{fmt((f1 - f0)/FPS)}" data-track-index="{track}" data-width="{W}" data-height="{H}"></div>'
root = f"""<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width={W}, height={H}">
<title>codex-five-hour-limit-replica</title>
{GSAP}
<style>
@font-face {{ font-family: 'Inter'; font-weight: 400; src: url(assets/fonts/Inter-400.ttf) format('truetype'); }}
@font-face {{ font-family: 'Inter'; font-weight: 500; src: url(assets/fonts/Inter-500.ttf) format('truetype'); }}
@font-face {{ font-family: 'Inter'; font-weight: 600; src: url(assets/fonts/Inter-600.ttf) format('truetype'); }}
@font-face {{ font-family: 'Heebo'; font-weight: 900; src: url(assets/fonts/Heebo-900.ttf) format('truetype'); }}
html, body {{ margin: 0; background: #000; }}
#root {{ position: relative; width: {W}px; height: {H}px; overflow: hidden; background: #ffffff; }}
.clip {{ position: absolute; inset: 0; }}
#fig {{ position: absolute; left: 0; top: 0; width: 1080px; height: 1920px; inset: auto; transform-origin: 0 0; }}
</style>
</head>
<body>
<div id="root" data-composition-id="root" data-start="0" data-width="{W}" data-height="{H}" data-fps="{FPS}" data-duration="{dur:.4f}">
  {mount('lockup', L0, L1, 1)}
  {mount('chat', C0, FRAMES, 2)}
  <video id="fig" class="clip" src="assets/fig.webm" data-start="{figstart:.4f}" data-duration="{figdur:.4f}" data-track-index="3" muted playsinline preload="auto" width="1080" height="1920"></video>
  {mount('headline', H0, FRAMES, 4)}
  <!-- silent by design: the source clip's audio is a third party's track and is not redistributed -->
</div>
<script>
  // root timeline: the figure rises into frame (measured d(f), f407-437) while fading in
  const tl = gsap.timeline({{ paused: true }});
  gsap.set('#fig', {{ x: {CAL['fig_x']}, y: {fmt(fig_rows[0][1])}, scale: {CAL['fig_k']}, opacity: 0 }});
  {tl_kf("'#fig'", fig_rows, ["y"], 0, 0)}
  {tl_kf("'#fig'", FG["alpha"], ["opacity"], 0, 0)}
  window.__timelines["root"] = tl;
</script>
</body>
</html>
"""
open(f"{HERE}/index.html", "w").write(root)
print("written: index.html + compositions/{lockup,chat,headline}.html;",
      f"knots: zoom {len(zr)}, box {len(box_k)}, pan {len(pk)}, glyph_rot {len(gr)}; headline ls {ls:.2f}; typed glyphs {len(tglyphs)}")
