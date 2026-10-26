"""Writes the exterior design styles 2 and 3 (src/data/styles/*.json). Style 1 comes from build_house_json.py.

Every coordinate is mapped onto the existing plan; nothing here moves a room, door or window.
Outer wall faces used below (plan metres):
  GF fronts : kitchen z 8.04 (x -0.01..2.87), dining + living z 8.46 (x 2.87..12.35), bedroom z 7.38 (x 12.35..16.13)
  FF fronts : bedroom 3 z 9.84 (x 2.86..7.25), cutout z 8.46 (x 7.25..12.11), balcony edge z 8.82 (x 12.11..16.13)
  FF wings  : left wing x 2.86..7.25, z -1.44..9.84 | stair x 7.25..9.28 | master block x 12.11..16.13, z 1.38..7.38
  right side x 16.13, roof slab top y 6.75, FF level 3.60, GF level 0.45, FF slab underside 3.45
"""
import json, os, random

GF, FF, ROOF, SLAB = 0.45, 3.60, 6.75, 3.45
OUT = os.path.join(os.path.dirname(__file__), "..", "src", "data", "styles")

def box(x1, x2, z1, z2, y0, y1, m, collide=False):
    return dict(type="box", x=round((x1 + x2) / 2, 3), z=round((z1 + z2) / 2, 3), w=round(x2 - x1, 3), d=round(z2 - z1, 3),
                y=round(y0, 3), h=round(y1 - y0, 3), material=m, collide=collide)

def plant(t, x, z, y=0, s=1.0, **kw):
    d = dict(type=t, x=x, z=z, y=y, scale=s); d.update(kw); return d

def bed(t, x1, x2, z, n, y=0, s=0.9, jitter=0.25, seed=1):
    r = random.Random(seed)
    return [plant(t, round(x1 + (x2 - x1) * (i + 0.5) / n + r.uniform(-jitter, jitter), 2), round(z + r.uniform(-jitter, jitter), 2), y, round(s * r.uniform(0.85, 1.15), 2)) for i in range(n)]

# ============================================================================================
# STYLE 2 - Contemporary Gable: Concrete & Laterite (Greenline Architects reference)
# ============================================================================================
g = []
# left wing upper floor: a projecting ledge, "glass wall" with sheer curtains and slim teak mullions, black railing, slim column
g += [box(2.86, 7.25, 9.84, 10.95, SLAB, FF, "exposedConcrete")]
g += [box(3.0, 7.1, 9.88, 9.90, FF + 0.1, ROOF - 0.15, "sheer")]
g += [dict(type="louvers", x1=3.0, z1=9.93, x2=7.1, z2=9.93, y0=FF, y1=ROOF - 0.12, count=6, dir="vertical", slat=0.06, depth=0.08, material="teak")]
g += [box(3.0, 7.1, 9.90, 9.94, ROOF - 0.2, ROOF - 0.12, "teak"), box(3.0, 7.1, 9.90, 9.94, FF + 0.02, FF + 0.1, "teak")]
g += [dict(type="railing", x1=2.95, z1=10.88, x2=7.16, z2=10.88, y=FF, h=1.0, material="blackMetal", balusters=True)]
g += [dict(type="column", x=6.75, z=10.75, y=FF, h=ROOF - FF + 0.1, r=0.09, material="paint", baseMaterial="copper")]
# centre: cantilevered board-formed concrete box frame in front of the cutout glazing, perforated terracotta + timber louvres inside
g += [dict(type="boxFrame", axis="x", a1=7.35, a2=12.05, c=8.46, y0=SLAB - 0.1, y1=ROOF + 0.05, depth=0.62, thickness=0.45, outward=1, material="exposedConcrete")]
g += [box(7.85, 9.10, 8.80, 8.83, FF + 0.25, ROOF - 0.45, "perforatedTerracotta"), box(10.30, 11.55, 8.80, 8.83, FF + 0.25, ROOF - 0.45, "perforatedTerracotta")]
g += [dict(type="louvers", x1=9.15, z1=8.82, x2=10.25, z2=8.82, y0=FF + 0.25, y1=ROOF - 0.45, count=16, dir="horizontal", slat=0.07, depth=0.08, material="darkWood")]
g += [box(9.10, 9.16, 8.78, 8.86, FF + 0.25, ROOF - 0.45, "darkWood"), box(10.24, 10.30, 8.78, 8.86, FF + 0.25, ROOF - 0.45, "darkWood")]
# master block upper front: a concrete band frame around the balcony
g += [dict(type="boxFrame", axis="x", a1=12.15, a2=16.25, c=8.82, y0=SLAB - 0.1, y1=ROOF, depth=0.2, thickness=0.3, outward=1, material="exposedConcrete")]
# laterite feature wall: the right side rises above the roof
g += [box(15.85, 16.25, 1.30, 7.60, ROOF, ROOF + 1.6, "laterite")]
# GF: long concrete canopy band at FF floor level, 1.5 m over the sit-out; creeper curtain over its right half
g += [box(2.70, 12.40, 8.46, 10.30, SLAB - 0.45, SLAB, "exposedConcrete")]
g += [box(12.35, 16.30, 7.38, 9.00, SLAB - 0.45, SLAB, "exposedConcrete")]
g += [dict(type="creeper", axis="x", a1=9.6, a2=12.35, c=10.33, y=SLAB - 0.05, minLen=0.6, maxLen=1.4, density=26)]
g += [dict(type="creeper", axis="x", a1=12.35, a2=16.3, c=9.03, y=SLAB - 0.05, minLen=0.6, maxLen=1.4, density=26)]
# GF details: slim round columns with copper bases, a vertical teak louvre screen beside the main door, light grey steps
g += [dict(type="column", x=x, z=10.0, y=0, h=SLAB - 0.45, r=0.08, material="paint", baseMaterial="copper", collide=True) for x in (7.9, 11.0)]
g += [dict(type="louvers", x1=11.78, z1=8.56, x2=12.18, z2=8.56, y0=GF, y1=SLAB - 0.5, count=7, dir="vertical", slat=0.05, depth=0.1, material="teak")]
g += [box(7.64, 11.24, 10.20, 10.50, 0.30, 0.312, "lightStone"), box(7.64, 11.24, 10.50, 10.80, 0.15, 0.162, "lightStone"),
      box(6.53, 12.35, 9.96, 10.20, GF, GF + 0.012, "lightStone")]
# far left: dark granite pier with an exposed-concrete parapet return over the work area
g += [box(-0.35, 0.25, 7.55, 8.45, 0, 4.9, "darkGranite", collide=True)]
g += [box(-0.35, 2.95, 7.92, 8.30, SLAB, 4.9, "exposedConcrete")]
# forecourt: grass-joint concrete pavers
g += [box(-0.5, 17.5, 10.8, 18.0, 0, 0.02, "paverGrass")]

concrete_gable = dict(
    id="concrete-gable",
    name="Contemporary Gable",
    subtitle="Concrete & Laterite",
    description="Steep timber-soffit gable, board-formed concrete box frame, laterite and a creeper curtain.",
    swatch=["#ecebe6", "#b8b2a9", "#a5512f", "#4b4c4f"],
    materials=dict(wallMain="paint", wallAccent1="exposedConcrete", wallAccent2="laterite", plinth="lightStone",
                   fascia="exposedConcrete", soffit="timberSoffit", windowFrame="teak", doorMain="teak",
                   railing="blackMetal", compoundWall="paint", paving="paverGrass"),
    wallZones=[
        dict(face="front", floor=1, from_=7.25, to=12.11, role="wallAccent1"),
        dict(face="front", floor=1, from_=12.11, to=16.2, role="wallAccent1"),
        dict(face="right", from_=1.2, to=7.6, role="wallAccent2"),
        dict(face="front", floor=0, from_=12.3, to=16.2, role="wallAccent1"),
        dict(face="back", floor=1, from_=7.2, to=9.3, role="wallAccent2"),
    ],
    roofs=[
        # left wing: tall asymmetric gable, ridge along z, deep 1.2 m front overhang, louvred gable end
        dict(type="gable", rect=dict(x1=2.86, z1=-1.44, x2=7.25, z2=9.84), baseY=ROOF, ridgeAxis="z", pitchDeg=45, ridgeOffset=0.12,
             overhang=0.35, overhangFront=1.2, thickness=0.3, material="roofDark", soffitMaterial="timberSoffit",
             gableInfill="louvers", infillMaterial="paint", louverMaterial="darkWood"),
        # centre + right: flat roof with three thin concrete fascia layers stepping out, timber soffit
        dict(type="flat", rect=dict(x1=7.45, z1=-0.01, x2=16.13, z2=8.82), baseY=ROOF, overhang=0.35, overhangFront=0.6,
             material="exposedConcrete", fasciaLayers=3, fasciaMaterial="exposedConcrete", soffitMaterial="timberSoffit"),
    ],
    elements=g,
    landscape=dict(plants=[
        plant("palm", -2.0, 10.5, s=1.25), plant("palm", -1.2, -2.2, s=1.1), plant("palm", 4.5, -3.0, s=1.2), plant("palm", 12.0, -3.2, s=1.0),
        plant("rainTree", 19.3, 2.2, s=1.15), plant("tree", 8.2, 11.6, s=0.55),
        *bed("heliconia", 0.2, 2.6, 8.7, 3, seed=2), *bed("alocasia", 3.0, 6.4, 9.2, 4, s=0.9, seed=3), *bed("fern", 3.2, 6.3, 10.1, 5, s=0.8, seed=4),
        *bed("alocasia", 12.6, 15.8, 9.5, 4, s=0.9, seed=5), *bed("fern", 12.6, 15.8, 10.2, 5, s=0.8, seed=6),
        *bed("heliconia", 16.6, 17.2, 4.0, 3, s=1.0, seed=7), plant("tropical", 7.0, 10.6, s=1.0), plant("tropical", 11.9, 10.6, s=1.0),
        dict(type="hedge", x=6.4, z=17.4, w=3.4, d=0.6), dict(type="hedge", x=15.4, z=17.4, w=9.0, d=0.6),
    ]),
    lighting=dict(
        sun=[-24, 34, 22], sunColor="#f2f5ff", sunIntensity=2.5,
        hemi=["#e3eaf2", "#6a7560", 0.8], ambient=0.2, exposure=0.95,
        sky=dict(turbidity=8, rayleigh=2.2, mieCoefficient=0.01, mieDirectionalG=0.7),
        background="#c9d4df", fog="#d3dbe3",
        clouds=dict(count=6, opacity=0.6, color="#ffffff", height=34),
        facadeLights=[dict(x=9.4, y=3.0, z=9.4, intensity=3.0, distance=5.0), dict(x=6.6, y=6.2, z=10.6, intensity=1.5, distance=3.0)],
    ),
    introCamera=dict(pos=[5.2, 2.6, 23.5], target=[9.2, 4.6, 6.2]),
)

# ============================================================================================
# STYLE 3 - Kerala Tile Gable: Charcoal & Terracotta
# ============================================================================================
k = []
# left wing: small upper balcony corner with a white railing and thin copper posts under the glass-gable roof
k += [box(2.86, 4.30, 9.84, 10.60, SLAB, FF, "charcoalPaint")]
k += [dict(type="railing", x1=2.92, z1=10.55, x2=4.26, z2=10.55, y=FF, h=1.0, material="paint", balusters=True)]
k += [dict(type="column", x=x, z=10.52, y=FF, h=ROOF - FF + 0.2, r=0.025, material="copper") for x in (2.95, 3.6, 4.25)]
# centre: projecting planter at FF level with plants + trailing creepers, six copper fins up to a slim pergola beam
k += [box(7.30, 12.05, 8.46, 9.35, SLAB - 0.15, FF + 0.35, "charcoalPaint")]
k += [dict(type="creeper", axis="x", a1=7.35, a2=12.0, c=9.38, y=SLAB - 0.1, minLen=0.35, maxLen=0.95, density=18)]
k += [dict(type="column", x=round(7.7 + i * 0.8, 2), z=9.2, y=FF + 0.35, h=ROOF - FF - 0.35, r=0.03, material="copper") for i in range(6)]
k += [box(7.30, 12.05, 9.12, 9.28, ROOF - 0.12, ROOF, "copper")]
# master front: full-width wood-framed glass look with sheer curtains; white balustrade on the balcony
# (split around the balcony's sliding door, x 13.37-14.86, which stays as it is)
k += [box(12.40, 13.30, 7.40, 7.42, FF + 0.05, ROOF - 0.2, "sheer"), box(14.93, 16.08, 7.40, 7.42, FF + 0.05, ROOF - 0.2, "sheer")]
k += [box(x - 0.035, x + 0.035, 7.41, 7.49, FF, ROOF - 0.15, "darkWood") for x in (12.42, 13.33, 14.90, 15.5, 16.06)]
k += [box(12.40, 16.08, 7.42, 7.48, FF + 2.35, FF + 2.43, "darkWood"), box(12.40, 16.08, 7.42, 7.48, ROOF - 0.22, ROOF - 0.15, "darkWood")]
k += [dict(type="railing", x1=12.3, z1=8.78, x2=16.0, z2=8.78, y=FF, h=1.0, material="paint", balusters=True)]
k += [dict(type="column", x=16.32, z=9.55, y=FF, h=ROOF - FF - 0.35, r=0.03, material="blackMetal")]  # steel strut under the tile roof's front eave
# GF: white breeze-block screen in front of the dining window, timber grid on the bedroom window
k += [box(3.05, 6.40, 8.84, 8.92, GF, SLAB - 0.15, "breezeBlock", collide=True)]
k += [dict(type="louvers", x1=13.12, z1=7.43, x2=15.12, z2=7.43, y0=GF + 0.9, y1=GF + 2.1, count=4, dir="horizontal", slat=0.04, depth=0.05, material="darkWood")]
# white feature panel: the left-wing FF front (zone) + a white panel framing the entrance
k += [box(9.95, 12.30, 8.47, 8.52, GF, SLAB - 0.2, "paint")]
# compound wall: a vertical white breeze-block strip and a low breeze-block parapet
k += [box(11.05, 11.35, 17.88, 18.12, 0, 1.95, "breezeBlock", collide=True), box(11.35, 20.4, 17.9, 18.1, 1.5, 1.85, "breezeBlock")]
# long stepping-stone strips across the grass
k += [box(x - 0.3, x + 0.3, 11.0, 17.6, 0, 0.03, "lightStone") for x in (8.3, 9.44, 10.6)]
k += [box(0.6, 4.6, 10.0 + i * 1.2, 10.7 + i * 1.2, 0, 0.03, "lightStone") for i in range(7)]
kerala_tile = dict(
    id="kerala-tile",
    name="Kerala Tile Gable",
    subtitle="Charcoal & Terracotta",
    description="Twin gables: terracotta Mangalore tiles and a glass gable, charcoal walls, breeze blocks.",
    swatch=["#5b5d61", "#b5502e", "#ecebe6", "#8a5a3a"],
    materials=dict(wallMain="charcoalPaint", wallAccent1="paint", wallAccent2="breezeBlock", plinth="charcoalPaint",
                   fascia="charcoalPaint", soffit="timberSoffit", windowFrame="teak", doorMain="darkWood",
                   railing="paint", compoundWall="charcoalPaint", paving="lightStone"),
    wallZones=[
        dict(face="front", floor=1, from_=2.86, to=7.25, role="wallAccent1"),
        dict(face="left", floor=1, from_=4.5, to=9.9, role="wallAccent1"),
    ],
    roofs=[
        # left wing: steep gable, exposed dark rafters + purlins, glass gable ends
        dict(type="gable", rect=dict(x1=2.86, z1=-1.44, x2=7.25, z2=9.84), baseY=ROOF, ridgeAxis="z", pitchDeg=38,
             overhang=0.6, overhangFront=0.9, thickness=0.16, material="roofDark", soffitMaterial="darkWood",
             rafters=True, rafterMaterial="darkWood", gableInfill="glass", infillMaterial="blackMetal", bargeMaterial="darkWood"),
        # master block: Kerala terracotta tile roof, 0.9 m overhang, dark barge boards. The ridge runs parallel to the
        # front (x) so the tile slope faces the street as in the reference image (the brief said z; z hides the tiles)
        dict(type="gable", rect=dict(x1=12.11, z1=1.38, x2=16.13, z2=8.82), baseY=ROOF, ridgeAxis="x", pitchDeg=25,
             overhang=0.9, thickness=0.18, material="clayTile", soffitMaterial="timberSoffit", gableInfill="plaster",
             infillMaterial="charcoalPaint", bargeMaterial="darkWood", rafters=True, rafterMaterial="darkWood"),
        # centre: flat roof with a thin charcoal fascia
        dict(type="flat", rect=dict(x1=7.25, z1=-0.01, x2=12.11, z2=8.46), baseY=ROOF, overhang=0.25, overhangFront=0.4,
             thickness=0.18, material="charcoalPaint", soffitMaterial="timberSoffit"),
    ],
    elements=k,
    landscape=dict(
        plants=[
            plant("palm", -2.4, 9.8, s=1.3), plant("palm", 19.4, 6.0, s=1.25), plant("palm", 6.0, -3.0, s=1.25), plant("palm", 14.0, -3.0, s=1.1),
            plant("palm", 20.0, 15.5, s=1.0),
            *bed("heliconia", 0.2, 2.7, 8.7, 4, s=0.8, seed=11), *bed("heliconia", 3.0, 6.4, 9.6, 5, s=0.75, seed=12),
            *bed("alocasia", 12.6, 15.9, 8.0, 4, s=1.0, seed=13), *bed("alocasia", 16.6, 17.4, 3.0, 3, s=1.0, seed=14),
            *[dict(type="tropical", x=round(7.6 + i * 0.95, 2), z=8.9, y=FF + 0.35, scale=0.55) for i in range(5)],
            plant("alocasia", 7.1, 10.6, s=0.9), plant("alocasia", 11.8, 10.6, s=0.9),
        ],
        road=dict(x1=-30, z1=18.4, x2=50, z2=26, reflect=True),
    ),
    lighting=dict(
        sun=[-14, 40, 22], sunColor="#fff8ec", sunIntensity=3.4,
        hemi=["#cfe3ff", "#567040", 0.6], ambient=0.14, exposure=1.05,
        sky=dict(turbidity=2.5, rayleigh=0.9, mieCoefficient=0.004, mieDirectionalG=0.8),
        background="#9cc4ea", fog="#bcd6ee",
        clouds=dict(count=9, opacity=1, color="#ffffff", height=30),
        facadeLights=[dict(x=10.9, y=3.0, z=9.2, intensity=2.5, distance=4.0)],
    ),
    introCamera=dict(pos=[10.6, 1.9, 26.5], target=[9.0, 4.6, 6.0]),
)

def fix(st):
    # "from" is a Python keyword: wall zones are written with from_ above
    st["wallZones"] = [{("from" if k == "from_" else k): v for k, v in z.items()} for z in st["wallZones"]]
    return st

os.makedirs(OUT, exist_ok=True)
for st in (concrete_gable, kerala_tile):
    json.dump(fix(st), open(os.path.join(OUT, st["id"] + ".json"), "w"), indent=1)
    print(st["id"], len(st["elements"]), "elements,", len(st["roofs"]), "roofs,", len(st["landscape"]["plants"]), "plants")
