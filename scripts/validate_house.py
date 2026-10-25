"""Check src/data/house.json and draw it over the architect's plan sheets.

usage: python scripts/validate_house.py src/data/house.json --out plan_check.png
           [--gf "ASHIQ FINAL GF PLAN.pdf"] [--ff "ASHIQ FINAL FF PLAN3.pdf"]

Errors (exit code 1): openings that sit on no wall, overlapping floors, rooms whose clear size is more
than 0.2 m off the size written on the plan. Warnings: sizes 0.05-0.2 m off.
The background sheets are optional (needs pymupdf); without them the plan is drawn on white.
"""
import argparse, json, sys
from collections import defaultdict
from PIL import Image, ImageDraw, ImageFont

ap = argparse.ArgumentParser()
ap.add_argument("house")
ap.add_argument("--out", default="plan_check.png")
ap.add_argument("--gf", default=r"C:/Users/Administrator/Downloads/ASHIQ FINAL GF PLAN.pdf")
ap.add_argument("--ff", default=r"C:/Users/Administrator/Downloads/ASHIQ FINAL FF PLAN3.pdf")
a = ap.parse_args()
cfg = json.load(open(a.house))
T = cfg.get("wallThickness", 0.2)
errors, warns = [], []

# Sheet calibration (see build_house_json.py): 28.54 pt per metre; plan origin on each sheet in pt.
SCALE = 28.54
SHEETS = {0: (a.gf, 154.76, 164.56), 1: (a.ff, 154.76 - 1.67 * SCALE, 164.56 - 0.20 * SCALE)}

# ---------- wall lines from room edges (same rules as src/lib/world.ts) ----------
def union(ivs):
    out = []
    for s, e in sorted(ivs):
        if out and s <= out[-1][1] + 1e-6: out[-1][1] = max(out[-1][1], e)
        else: out.append([s, e])
    return out

def subtract(ivs, s0, e0):
    out = []
    for s, e in ivs:
        if e <= s0 + 1e-6 or s >= e0 - 1e-6: out.append([s, e]); continue
        if s < s0 - 1e-6: out.append([s, s0])
        if e > e0 + 1e-6: out.append([e0, e])
    return out

lines = {}
for r in cfg["rooms"]:
    kind = r.get("kind", "room")
    if not r.get("walls", kind == "room"): continue
    op_ = set(r.get("openSides", []))
    edges = [("top", "x", r["z1"], r["x1"], r["x2"]), ("bottom", "x", r["z2"], r["x1"], r["x2"]),
             ("left", "z", r["x1"], r["z1"], r["z2"]), ("right", "z", r["x2"], r["z1"], r["z2"])]
    for side, axis, c, s, e in edges:
        if side in op_: continue
        k = (r["floor"], axis, round(c * 100))
        L = lines.setdefault(k, dict(floor=r["floor"], axis=axis, c=c, ivs=[], solid=[]))
        L["ivs"].append([min(s, e), max(s, e)])
for L in lines.values():
    L["ivs"] = union(L["ivs"]); L["solid"] = [iv[:] for iv in L["ivs"]]

placed = []
for o in cfg.get("openings", []):
    axis = "x" if abs(o["z1"] - o["z2"]) < 1e-6 else ("z" if abs(o["x1"] - o["x2"]) < 1e-6 else None)
    if not axis: errors.append(f"opening {o} is not horizontal or vertical"); continue
    c = o["z1"] if axis == "x" else o["x1"]
    s, e = sorted((o["x1"], o["x2"]) if axis == "x" else (o["z1"], o["z2"]))
    best, bd = None, 0.12
    for L in lines.values():
        if L["floor"] != o["floor"] or L["axis"] != axis: continue
        if abs(L["c"] - c) < bd and any(ie > s + 1e-6 and is_ < e - 1e-6 for is_, ie in L["ivs"]):
            best, bd = L, abs(L["c"] - c)
    if not best:
        errors.append(f"FL{o['floor']} {o['type']} at ({o['x1']},{o['z1']})-({o['x2']},{o['z2']}) sits on no wall"); continue
    cover = sum(max(0, min(e, ie) - max(s, is_)) for is_, ie in best["ivs"])
    if cover < (e - s) - 0.02:
        warns.append(f"FL{o['floor']} {o['type']} at ({o['x1']},{o['z1']})-({o['x2']},{o['z2']}) runs past the end of its wall")
    best["solid"] = subtract(best["solid"], s, e)
    placed.append((o, best, s, e))

# extra walls count as walls for the clear-size check (glass railings do not)
extra = []
for w in cfg.get("walls", []):
    axis = "x" if abs(w["z1"] - w["z2"]) < 1e-6 else "z"
    c = w["z1"] if axis == "x" else w["x1"]
    s, e = sorted((w["x1"], w["x2"]) if axis == "x" else (w["z1"], w["z2"]))
    extra.append(dict(floor=w.get("floor", 0), axis=axis, c=c, s=s, e=e, t=w.get("thickness", 0.04 if w.get("material") == "glass" else 0.15),
                      glass=w.get("material") == "glass", y=w.get("y"), h=w.get("height"), mat=w.get("material", "paint")))

def side_wall(floor, axis, c, s, e):
    """Thickness of the wall that closes a room side: a room wall, or a solid extra wall."""
    for L in lines.values():
        if L["floor"] == floor and L["axis"] == axis and abs(L["c"] - c) < 0.02:
            cov = sum(max(0, min(e, ie) - max(s, is_)) for is_, ie in L["ivs"])
            if cov > 0.5 * (e - s): return T
    for w in extra:
        if w["floor"] == floor and w["axis"] == axis and abs(w["c"] - c) < 0.02 and not w["glass"]:
            if min(e, w["e"]) - max(s, w["s"]) > 0.5 * (e - s): return w["t"]
    return 0.0

# ---------- clear sizes vs. the plan ----------
report = []
for r in cfg["rooms"]:
    if "dims" not in r: continue
    want = sorted(float(v) for v in r["dims"].lower().split("x"))
    want = [v / 100 if v > 20 else v for v in want]  # "0.90x150" on the GF sheet means 1.50
    w = r["x2"] - r["x1"] - (side_wall(r["floor"], "z", r["x1"], r["z1"], r["z2"]) + side_wall(r["floor"], "z", r["x2"], r["z1"], r["z2"])) / 2
    d = r["z2"] - r["z1"] - (side_wall(r["floor"], "x", r["z1"], r["x1"], r["x2"]) + side_wall(r["floor"], "x", r["z2"], r["x1"], r["x2"])) / 2
    got = sorted([w, d])
    diff = max(abs(got[0] - want[0]), abs(got[1] - want[1]))
    report.append((r["id"], r["name"], r["dims"], f"{w:.2f} x {d:.2f}", diff))
    msg = f"{r['id']} ({r['name']}): plan {r['dims']}, model clear {w:.2f} x {d:.2f}"
    if diff > 0.2: errors.append(msg + f"  (off by {diff:.2f} m)")
    elif diff > 0.05: warns.append(msg + f"  (off by {diff:.2f} m)")

# ---------- floor overlaps ----------
for f in {r["floor"] for r in cfg["rooms"]}:
    rs = [r for r in cfg["rooms"] if r["floor"] == f]
    for i, p in enumerate(rs):
        for q in rs[i + 1:]:
            ox = min(p["x2"], q["x2"]) - max(p["x1"], q["x1"]); oz = min(p["z2"], q["z2"]) - max(p["z1"], q["z1"])
            if ox > 0.01 and oz > 0.01: errors.append(f"FL{f}: {p['id']} overlaps {q['id']} by {ox:.2f} x {oz:.2f}")

# ---------- drawing ----------
X0, Z0, X1, Z1, PX = -1.0, -2.0, 17.6, 11.0, 60
W, Hh = int((X1 - X0) * PX), int((Z1 - Z0) * PX)
try: font = ImageFont.truetype("arial.ttf", 15); small = ImageFont.truetype("arial.ttf", 12)
except OSError: font = small = ImageFont.load_default()

def background(floor):
    path, ox, oz = SHEETS[floor]
    try:
        import pymupdf
        page = pymupdf.open(path)[0]
        k = PX / SCALE
        pm = page.get_pixmap(matrix=pymupdf.Matrix(k, k))
        im = Image.frombytes("RGB", (pm.width, pm.height), pm.samples)
        l, t = round((ox + X0 * SCALE) * k), round((oz + Z0 * SCALE) * k)
        im = im.crop((l, t, l + W, t + Hh))
        return Image.blend(Image.new("RGB", im.size, "white"), im, 0.55)
    except Exception as ex:  # no pymupdf or no sheet: plain white
        warns.append(f"plan sheet for floor {floor} not drawn ({ex.__class__.__name__})")
        return Image.new("RGB", (W, Hh), "white")

P = lambda x, z: ((x - X0) * PX, (z - Z0) * PX)
COL = dict(door=(230, 120, 0), sliding=(150, 60, 200), window=(0, 170, 220), ventilator=(0, 120, 160), opening=(40, 170, 60))
panels = []
for f, fl in enumerate(cfg["floors"]):
    im = background(f).convert("RGBA"); ov = Image.new("RGBA", im.size); d = ImageDraw.Draw(ov)
    for r in cfg["rooms"]:
        if r["floor"] != f: continue
        kind = r.get("kind", "room")
        fill = (120, 170, 110, 40) if kind == "outdoor" else ((0, 0, 0, 0) if kind == "void" else (255, 220, 150, 45))
        d.rectangle([P(r["x1"], r["z1"]), P(r["x2"], r["z2"])], fill=fill, outline=(200, 80, 0, 160), width=1)
    for L in lines.values():
        if L["floor"] != f: continue
        for s, e in L["solid"]:
            if L["axis"] == "x": d.rectangle([P(s - T / 2, L["c"] - T / 2), P(e + T / 2, L["c"] + T / 2)], fill=(200, 0, 0, 120))
            else: d.rectangle([P(L["c"] - T / 2, s - T / 2), P(L["c"] + T / 2, e + T / 2)], fill=(200, 0, 0, 120))
    for w in extra:
        if w["floor"] != f: continue
        t = max(w["t"], 0.06); col = (0, 140, 255, 170) if w["glass"] else (150, 0, 150, 120)
        if w["axis"] == "x": d.rectangle([P(w["s"], w["c"] - t / 2), P(w["e"], w["c"] + t / 2)], fill=col)
        else: d.rectangle([P(w["c"] - t / 2, w["s"]), P(w["c"] + t / 2, w["e"])], fill=col)
    for o, L, s, e in placed:
        if o["floor"] != f: continue
        c = L["c"]
        if L["axis"] == "x": d.rectangle([P(s, c - T / 2 - 0.03), P(e, c + T / 2 + 0.03)], outline=COL[o["type"]] + (255,), width=3)
        else: d.rectangle([P(c - T / 2 - 0.03, s), P(c + T / 2 + 0.03, e)], outline=COL[o["type"]] + (255,), width=3)
    for s_ in cfg.get("stairs", []):
        lvl = fl["y"]
        if (f == 0 and min(s_["y0"], s_["y1"]) < cfg["floors"][1]["y"] - 0.01) or (f == 1):
            d.rectangle([P(s_["x1"], s_["z1"]), P(s_["x2"], s_["z2"])], outline=(0, 60, 255, 220), width=2)
            cx, cz = (s_["x1"] + s_["x2"]) / 2, (s_["z1"] + s_["z2"]) / 2
            if s_["y0"] != s_["y1"]:
                dz = {"+z": (0, 0.6), "-z": (0, -0.6), "+x": (0.6, 0), "-x": (-0.6, 0)}[s_["dir"]]
                d.line([P(cx - dz[0], cz - dz[1]), P(cx + dz[0], cz + dz[1])], fill=(0, 60, 255, 255), width=3)
                d.ellipse([P(cx + dz[0] - 0.08, cz + dz[1] - 0.08), P(cx + dz[0] + 0.08, cz + dz[1] + 0.08)], fill=(0, 60, 255, 255))
    for fu in cfg.get("furniture", []):
        if fu["floor"] != f or fu["type"] == "car": continue
        d.ellipse([P(fu["x"] - 0.07, fu["z"] - 0.07), P(fu["x"] + 0.07, fu["z"] + 0.07)], fill=(90, 50, 20, 230))
        d.text(P(fu["x"] + 0.1, fu["z"] - 0.1), fu["type"], fill=(90, 50, 20, 255), font=small)
    for r in cfg["rooms"]:
        if r["floor"] != f or r.get("menu") is False: continue
        d.text(P((r["x1"] + r["x2"]) / 2 - 0.6, (r["z1"] + r["z2"]) / 2 - 0.4), r["name"], fill=(140, 40, 0, 255), font=font)
    if f == 0:
        sp = cfg["spawn"]; d.text(P(-0.9, 10.6), f"spawn at ({sp['x']}, {sp['z']}) outside this frame", fill=(0, 0, 0, 255), font=small)
    d.text((10, 8), f"{fl['name']} (level {fl['y']:.2f})  red = walls, magenta = solid extra walls, blue = glass, "
                    "orange = doors, cyan = windows, purple = sliding, green = open, blue arrow = stair up", fill=(0, 0, 0, 255), font=font)
    panels.append(Image.alpha_composite(im, ov).convert("RGB"))

out = Image.new("RGB", (W, Hh * len(panels) + 10 * (len(panels) - 1)), "white")
for i, p in enumerate(panels): out.paste(p, (0, i * (Hh + 10)))
out.save(a.out)

print("Clear sizes (plan vs model):")
for rid, name, dims, got, diff in report:
    print(f"  {rid:14s} {name:18s} plan {dims:10s} model {got:13s} {'OK' if diff <= 0.05 else ('~' if diff <= 0.2 else 'X')}  ({diff:.2f})")
for w in warns: print("WARNING:", w)
for e in errors: print("ERROR:", e)
print(f"{len(errors)} errors, {len(warns)} warnings -> {a.out}")
sys.exit(1 if errors else 0)
