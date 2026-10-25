"""Builds src/data/house.json from the architect's plans:
  GF: "GF PLAN FINAL", 21/10/2026 (sheet 1 of 2)     FF: "FF PLAN OPTION 6", 07/10/2026 (sheet 2 of 2)
Thripthi Design Space, project Mr. Ashik @ Mannur.

Every number below was read from the PDFs' vector line work (both sheets are 28.54 pt per metre):
walls are 0.24 m thick, so each room rectangle is the wall-centreline rectangle = clear size + 0.24.
Origin = top-left outer corner of the GF (outer face of the Work Area's left wall), x right, z down.
The FF sheet is aligned on the staircase: FF sheet coordinates + (1.67, 0.20) m. With that shift the
FF cutout's right and front edges land exactly on the GF living room's right and front walls.
"""
import json

F0, F1 = 0, 1
GF, FF = 0.45, 3.60          # finished floor levels (GF on a 0.45 plinth)
H = 3.15                     # floor-to-floor
CEIL0 = GF + H - 0.15        # 3.45 underside of the FF slab
T = 0.24                     # wall thickness on the plan


def room(id, name, floor, x1, z1, x2, z2, **kw):
    r = dict(id=id, name=name, floor=floor, x1=x1, z1=z1, x2=x2, z2=z2); r.update(kw); return r
def op(floor, type, x1, z1, x2, z2, **kw):
    o = dict(floor=floor, type=type, x1=x1, z1=z1, x2=x2, z2=z2); o.update(kw); return o
def wall(floor, x1, z1, x2, z2, **kw):
    w = dict(floor=floor, x1=x1, z1=z1, x2=x2, z2=z2); w.update(kw); return w
def box(name, x, z, w, d, y, h, material, **kw):
    b = dict(name=name, x=x, z=z, w=w, d=d, y=y, h=h, material=material); b.update(kw); return b
def fur(type, floor, x, z, rot=0, **kw):
    f = dict(type=type, floor=floor, x=x, z=z, rot=rot); f.update(kw); return f

# ---------- wall centrelines (m) ----------
# x: 0.11 W/A+kitchen left | 2.39 W/A right, toilet1 left | 2.99 kitchen/dining, FF passage+bed3 left
#    3.89 c-toilet/guest, toilet1/bed1 | 6.65 dining/living | 7.13 guest/stair, bed1/stair, bed3 right
#    9.16 stair/courtyard | 12.23 living/bedroom, cutout/master | 14.90 toilet/dressing | 16.01 right
# z: 0.12 back (guest, stair) | 0.60 W/A + toilets back | 1.50 toilet/dressing back | 3.24 passage top
#    4.68 passage bottom | 7.26 bedroom front | 7.92 kitchen front | 8.34 dining/living front

rooms = [
  # ---------- Ground floor ----------
  room("gf-wa", "Work Area", F0, 0.11, 0.60, 2.39, 4.68, dims="2.04x3.84", floorMaterial="tile"),
  room("gf-ctoilet", "Common Toilet", F0, 2.39, 0.60, 3.89, 3.24, dims="1.26x2.46"),
  room("gf-guest", "Guest Bedroom", F0, 3.89, 0.12, 7.13, 3.24, dims="3.00x2.88", floorMaterial="marble"),
  room("gf-stair", "Staircase", F0, 7.13, 0.12, 9.16, 3.24, floorMaterial="marble"),
  room("gf-court", "Courtyard", F0, 9.16, 0.12, 12.23, 3.24, kind="outdoor", walls=True, openSides=["top", "right"],
       floorMaterial="grass"),
  room("gf-wash", "Passage", F0, 2.39, 3.24, 2.99, 4.68, walls=False, menu=False),
  room("gf-pass", "Passage", F0, 6.65, 3.24, 12.23, 4.68, walls=False),
  room("gf-kitchen", "Kitchen", F0, 0.11, 4.68, 2.99, 7.92, dims="3.00x2.64", floorMaterial="tile"),
  # the plan's 4.86 dining length runs from the passage's back wall, so the passage strip is part of it
  room("gf-dining", "Dining", F0, 2.99, 3.24, 6.65, 8.34, dims="3.42x4.86", openSides=["top"]),
  room("gf-living", "Living", F0, 6.65, 4.68, 12.23, 8.34, dims="5.34x3.42"),
  room("gf-mtoilet", "Toilet", F0, 12.23, 1.50, 14.90, 3.24, dims="2.46x1.50"),
  room("gf-dress", "Dressing Area", F0, 14.90, 1.50, 16.01, 3.24, dims="0.90x1.50", floorMaterial="marble"),
  room("gf-mbed", "Bedroom", F0, 12.23, 3.24, 16.01, 7.26, dims="3.54x3.78", floorMaterial="marble"),
  # clear 5.34 x 1.50 between the corner columns (column line z 9.96-10.20)
  room("gf-sitout", "Sit Out", F0, 6.77, 8.34, 12.11, 9.96, kind="outdoor", dims="5.34x1.50", floorMaterial="granite"),
  # ---------- First floor ----------
  room("ff-terrace", "Open Terrace", F1, 0.11, 0.60, 2.39, 3.24, kind="outdoor", floorMaterial="paving"),
  room("ff-terrace2", "Open Terrace", F1, 0.11, 3.24, 2.99, 7.92, kind="outdoor", floorMaterial="paving", menu=False),
  room("ff-toilet1", "Toilet", F1, 2.39, 0.60, 3.89, 3.24, dims="1.26x2.46"),
  room("ff-bed1", "Bedroom 1", F1, 3.89, -1.32, 7.13, 3.24, dims="3.00x4.32", floorMaterial="marble"),
  room("ff-bed1a", "Bedroom 1", F1, 3.28, -1.32, 3.89, 0.60, floorMaterial="marble", menu=False),  # glazed window bay
  room("ff-stairvoid", "Staircase", F1, 7.13, 0.12, 9.16, 3.24, kind="void", walls=True),
  room("ff-toilet2", "Toilet", F1, 9.16, 1.50, 12.345, 3.24, dims="2.94x1.50"),
  room("ff-walkin", "Walk-in Wardrobe", F1, 12.345, 1.50, 16.01, 3.24, dims="3.42x1.50", floorMaterial="marble"),
  room("ff-mbed", "Master Bedroom", F1, 12.23, 3.24, 16.01, 7.26, dims="3.54x3.78", floorMaterial="marble"),
  room("ff-balcony", "Balcony", F1, 12.23, 7.26, 16.01, 8.70, kind="outdoor", dims="3.54x1.20", floorMaterial="marble"),
  room("ff-pass", "Passage", F1, 2.99, 3.24, 7.13, 4.68, walls=True, openSides=["top", "bottom", "right"]),
  room("ff-pass2", "Passage", F1, 7.13, 3.24, 12.23, 5.28, walls=False, menu=False),
  room("ff-void", "Cutout", F1, 7.13, 5.28, 12.23, 8.34, kind="void", walls=True, openSides=["top"], dims="4.86x2.94"),
  room("ff-toilet3", "Attached Toilet", F1, 2.99, 4.68, 5.71, 6.09, dims="2.52x1.20"),
  room("ff-bed3", "Bedroom 3", F1, 2.99, 6.09, 7.13, 9.72, dims="3.90x3.42", floorMaterial="marble"),
  room("ff-bed3b", "Bedroom 3", F1, 5.71, 4.68, 7.13, 6.09, openSides=["bottom"], floorMaterial="marble", menu=False),
]

openings = [
  # ===== GF =====
  op(F0, "door", 1.37, 0.60, 2.27, 0.60),                         # W/A back door (steps outside)
  op(F0, "ventilator", 2.51, 0.60, 3.12, 0.60),                   # common toilet
  op(F0, "window", 5.51, 0.12, 6.51, 0.12),                       # guest bedroom, back wall
  op(F0, "door", 1.37, 4.68, 2.27, 4.68),                         # W/A <-> kitchen
  op(F0, "window", 0.11, 4.88, 0.11, 5.72),                       # kitchen, left wall
  op(F0, "window", 0.80, 7.92, 2.30, 7.92),                       # kitchen, front wall
  op(F0, "door", 2.99, 4.80, 2.99, 5.70),                         # kitchen <-> dining
  op(F0, "opening", 2.99, 3.24, 2.99, 4.56),                      # wash counter open to dining
  op(F0, "door", 2.97, 3.24, 3.77, 3.24),                         # common toilet
  op(F0, "door", 6.11, 3.24, 7.01, 3.24),                         # guest bedroom
  op(F0, "opening", 7.25, 3.24, 9.05, 3.24),                      # staircase off the passage
  op(F0, "sliding", 10.20, 3.24, 11.21, 3.24, head=2.4),          # SLD/W passage <-> courtyard
  op(F0, "opening", 6.65, 3.24, 6.65, 4.56),                      # dining open to the passage
  op(F0, "opening", 6.77, 4.68, 9.74, 4.68),                      # half wall with partition (built below)
  op(F0, "opening", 9.74, 4.68, 11.69, 4.68),                     # passage -> living
  op(F0, "window", 3.83, 8.34, 5.83, 8.34),                       # dining, front
  op(F0, "window", 8.04, 8.34, 9.54, 8.34, sill=0.6, head=2.4),   # living, front
  op(F0, "door", 10.49, 8.34, 11.69, 8.34, main=True, head=2.4),  # main door from the sit-out
  op(F0, "door", 12.23, 3.36, 12.23, 4.26),                       # bedroom, from the end of the passage
  op(F0, "door", 14.90, 2.32, 14.90, 3.12),                       # toilet, from the dressing area
  op(F0, "opening", 14.99, 3.24, 15.89, 3.24, head=2.4),          # dressing area open to the bedroom
  op(F0, "ventilator", 14.21, 1.50, 14.81, 1.50),                 # toilet
  op(F0, "window", 16.01, 3.72, 16.01, 4.32),                     # bedroom, right wall
  op(F0, "window", 16.01, 6.54, 16.01, 7.14),
  op(F0, "window", 13.12, 7.26, 15.12, 7.26),                     # bedroom, front
  # ===== FF =====
  op(F1, "window", 3.28, -1.20, 3.28, 0.48, sill=0.3, head=2.4),  # glazed bay on bedroom 1's left
  op(F1, "opening", 3.89, -1.20, 3.89, 0.48, head=2.4),
  op(F1, "window", 7.13, -1.00, 7.13, -0.01),                     # bedroom 1, right wall
  op(F1, "window", 4.60, -1.32, 6.30, -1.32, sill=1.65, head=2.25),  # high window over the bed (render 1; not on the plan)
  op(F1, "door", 3.89, 2.38, 3.89, 3.18),                         # toilet 1, from bedroom 1
  op(F1, "door", 4.00, 3.24, 4.90, 3.24),                         # bedroom 1
  op(F1, "window", 2.39, 1.70, 2.39, 2.29, sill=1.2),             # toilet 1
  op(F1, "window", 7.39, 0.12, 8.89, 0.12, sill=1.2, head=2.4),   # staircase
  op(F1, "opening", 7.25, 3.24, 9.05, 3.24),                      # stair arrives on the passage
  op(F1, "ventilator", 11.52, 1.50, 12.12, 1.50),                 # toilet 2
  op(F1, "door", 12.345, 2.31, 12.345, 3.12),                     # toilet 2, from the walk-in
  op(F1, "opening", 13.06, 3.24, 14.09, 3.24, head=2.4),          # walk-in open to the master bedroom
  op(F1, "door", 12.23, 3.36, 12.23, 4.26),                       # master bedroom
  op(F1, "window", 16.01, 3.36, 16.01, 3.95),
  op(F1, "window", 16.01, 6.53, 16.01, 7.13),
  op(F1, "sliding", 13.37, 7.26, 14.86, 7.26, head=2.4),          # SLD/W to the balcony
  op(F1, "window", 8.52, 8.34, 10.51, 8.34, sill=0.6, head=2.4),  # cutout front glazing
  op(F1, "door", 2.99, 3.36, 2.99, 4.26),                         # passage -> open terrace
  op(F1, "door", 6.10, 4.68, 7.01, 4.68),                         # bedroom 3
  op(F1, "door", 5.71, 5.20, 5.71, 6.00),                         # attached toilet
  op(F1, "opening", 6.10, 6.09, 7.01, 6.09),                      # bedroom 3 entry lobby
  op(F1, "window", 2.99, 5.13, 2.99, 5.73, sill=1.2),             # attached toilet
  op(F1, "window", 2.99, 6.75, 2.99, 7.75),                       # bedroom 3, left wall
  op(F1, "window", 4.40, 9.72, 6.40, 9.72, sill=0.45),            # bedroom 3 bay window, front
]

walls = [
  # courtyard garden walls (back + right) and the 90 cm show wall
  wall(F0, 9.16, 0.12, 12.23, 0.12, y=0, height=2.6, material="stone", thickness=T),
  wall(F0, 12.23, 0.12, 12.23, 1.50, y=0, height=2.6, material="stone", thickness=T),
  wall(F0, 16.13, 7.26, 17.04, 7.26, y=0, height=3.2, material="stone", thickness=T),
  # living: half wall with interior partition (slats in `boxes`)
  wall(F0, 6.77, 4.68, 9.74, 4.68, y=GF, height=1.0, thickness=T),
  # dog-leg stair: central wall between the flights, up to FF railing height
  wall(F0, 8.15, 1.08, 8.15, 3.33, y=0, height=FF + 0.95, thickness=0.12),
  # FF railings
  wall(F1, 8.21, 3.32, 9.05, 3.32, y=FF, height=1.0, material="glass"),      # over flight 1
  wall(F1, 7.25, 5.28, 12.11, 5.28, y=FF, height=1.0, material="glass"),     # cutout edge
  # balcony: 0.24 upstand (plan line 8.58-8.82) with a glass railing on top, front and right side
  wall(F1, 12.23, 8.70, 16.13, 8.70, y=CEIL0, height=0.45, thickness=T),
  wall(F1, 16.01, 7.38, 16.01, 8.58, y=CEIL0, height=0.45, thickness=T),
  wall(F1, 12.35, 8.70, 16.01, 8.70, y=FF + 0.3, height=0.75, material="glass"),
  wall(F1, 16.01, 7.38, 16.01, 8.58, y=FF + 0.3, height=0.75, material="glass"),
  wall(F1, 12.23, 8.34, 12.23, 8.70, y=CEIL0, height=1.15, thickness=T),
  # open terrace parapets
  wall(F1, 0.11, 0.60, 0.11, 7.92, y=CEIL0, height=1.15, thickness=T),
  wall(F1, 0.11, 0.60, 2.39, 0.60, y=CEIL0, height=1.15, thickness=T),
  wall(F1, 0.11, 7.92, 2.99, 7.92, y=CEIL0, height=1.15, thickness=T),
]

stairs = [
  # flight 1: right half, up away from the passage
  dict(x1=8.21, z1=1.08, x2=9.04, z2=3.33, dir="-z", y0=GF, y1=2.025),
  # landing across the back
  dict(x1=7.25, z1=0.24, x2=9.04, z2=1.08, dir="+z", y0=2.025, y1=2.025),
  # flight 2: left half, back towards the passage, arrives on the FF passage
  dict(x1=7.25, z1=1.08, x2=8.09, z2=3.33, dir="+z", y0=2.025, y1=FF),
]

boxes = [
  # sit-out plinth edge, front steps, path, driveway
  box("sitout-edge", 9.44, 10.08, 5.82, 0.24, 0, GF, "granite", walkable=True),
  box("sitout-side-l", 6.71, 9.15, 0.12, 1.62, 0, GF, "granite", walkable=True),
  box("sitout-side-r", 12.17, 9.15, 0.12, 1.62, 0, GF, "granite", walkable=True),
  box("step-2", 9.44, 10.35, 3.6, 0.30, 0, 0.30, "granite", walkable=True),
  box("step-1", 9.44, 10.65, 3.6, 0.30, 0, 0.15, "granite", walkable=True),
  box("path", 9.44, 14.40, 1.60, 7.20, 0, 0.02, "paving", walkable=True),
  box("driveway", 2.60, 13.30, 4.00, 9.40, 0, 0.02, "paving", walkable=True),
  # back steps from the work area (plan: treads at z -0.27 / -0.02 / 0.23 / 0.48)
  box("back-step-2", 1.82, 0.355, 0.9, 0.25, 0, 0.30, "granite", walkable=True),
  box("back-step-1", 1.82, 0.105, 0.9, 0.25, 0, 0.15, "granite", walkable=True),
  # courtyard: stepping slabs + the step at the SLD/W (positions from the plan)
  box("court-slab-1", 10.51, 0.82, 0.88, 0.36, GF, 0.03, "paving", walkable=True),
  box("court-slab-2", 10.51, 1.45, 0.88, 0.36, GF, 0.03, "paving", walkable=True),
  box("court-slab-3", 10.51, 2.08, 0.88, 0.36, GF, 0.03, "paving", walkable=True),
  box("court-step", 10.58, 2.85, 1.10, 0.50, GF, 0.06, "paving", walkable=True),
  box("court-bed-l", 9.47, 2.0, 0.35, 2.2, GF, 0.12, "concrete", collide=False),
  box("court-bed-r", 11.73, 2.05, 0.35, 2.1, GF, 0.12, "concrete", collide=False),
  # sit-out columns: the stone-clad feature column on the left runs up to the roof
  box("stone-column", 6.65, 10.08, 0.45, 0.45, 0, 7.0, "stone"),
  box("sitout-col-r", 12.23, 10.08, 0.30, 0.30, 0, CEIL0, "paint"),
  box("sitout-roof", 9.80, 9.33, 5.10, 1.74, CEIL0, 0.15, "paint"),
  box("sitout-fascia", 9.80, 10.20, 5.10, 0.10, CEIL0 - 0.15, 0.40, "walnut", collide=False),
  box("lamp-l", 8.40, 8.52, 0.15, 0.06, 2.6, 0.3, "lamp", collide=False),
  box("lamp-r", 12.05, 8.52, 0.15, 0.06, 2.6, 0.3, "lamp", collide=False),
  # wash counter in the passage beside the work area
  box("wash-counter", 2.71, 3.96, 0.40, 1.20, GF, 0.82, "white"),
  box("wash-top", 2.71, 3.96, 0.42, 1.22, GF + 0.82, 0.04, "granite", collide=False),
  box("wash-mirror", 2.53, 3.96, 0.02, 0.9, GF + 1.15, 0.75, "mirror", collide=False),
  # living partition slats above the half wall
  *[box(f"slat-{i}", 6.90 + i * 0.16, 4.68, 0.05, 0.08, GF + 1.0, CEIL0 - GF - 1.0, "walnut", collide=False) for i in range(18)],
  # bedroom 3 bay window frame projecting from the front wall
  box("bay-sill", 5.40, 10.02, 2.36, 0.36, FF + 0.37, 0.08, "paint"),
  box("bay-head", 5.40, 10.02, 2.36, 0.36, FF + 2.1, 0.15, "paint", collide=False),
  box("bay-side-l", 4.31, 10.02, 0.18, 0.36, FF + 0.37, 1.88, "paint"),
  box("bay-side-r", 6.49, 10.02, 0.18, 0.36, FF + 0.37, 1.88, "paint"),
  # roof: pergola over the open part of the courtyard, solar panels, water tank
  *[box(f"pergola-{i}", 9.35 + i * 0.37, 0.81, 0.10, 1.38, FF + H - 0.15, 0.22, "walnut", collide=False) for i in range(8)],
  box("solar-1", 14.10, 4.30, 3.2, 1.7, 6.95, 0.06, "solar"),
  box("solar-2", 14.10, 6.20, 3.2, 1.7, 6.95, 0.06, "solar"),
  box("solar-stand-1", 14.10, 4.30, 3.0, 1.4, 6.75, 0.2, "blackMetal"),
  box("solar-stand-2", 14.10, 6.20, 3.0, 1.4, 6.75, 0.2, "blackMetal"),
  box("water-tank", 5.50, 0.00, 1.1, 1.1, 6.75, 1.1, "white"),
]

furniture = [
  # ===== GF =====
  fur("kitchenCounter", F0, 0.53, 1.60, 90, w=1.75),               # W/A: hob along the left wall
  fur("kitchenCounter", F0, 0.53, 3.30, 90, w=1.2),                # W/A: sink
  fur("wc", F0, 3.14, 1.00, 0),
  fur("basin", F0, 2.74, 2.80, 90),
  fur("shower", F0, 3.14, 2.05, 90, w=0.9, d=1.1),
  fur("bed", F0, 4.80, 1.33, 0, w=1.5, d=2.0, sides="right"),     # guest: headboard on the back wall
  fur("wardrobe", F0, 6.71, 1.10, 270, w=1.72, d=0.55),
  fur("kitchenCounter", F0, 0.53, 6.55, 90, w=2.3),                # kitchen L: left wall
  fur("kitchenCounter", F0, 1.80, 7.50, 180, w=1.8),               # kitchen L: front wall
  fur("fridge", F0, 2.52, 5.95, 270),
  fur("diningTable", F0, 4.82, 6.45, 90, w=2.2, d=0.95, seats=6),
  fur("sofa", F0, 8.20, 5.25, 0, w=2.6),                           # L-sofa: along the half wall
  fur("sofa", F0, 7.25, 6.55, 90, w=2.2),                          # ... and the dining wall
  fur("coffeeTable", F0, 9.10, 6.35, 90),
  fur("rug", F0, 8.90, 6.35, 90, w=2.8, d=2.4),
  fur("armchair", F0, 8.70, 7.70, 180),
  fur("tvUnit", F0, 11.88, 6.31, 270, w=2.0),
  fur("bed", F0, 14.80, 5.27, 270),                                # bedroom: headboard on the right wall
  fur("wardrobe", F0, 12.65, 6.28, 90, w=1.7),
  fur("rug", F0, 14.30, 5.27, 90, w=2.6, d=1.8),
  fur("wardrobe", F0, 15.44, 1.92, 0, w=0.85, d=0.55),              # dressing area: unit at the back (plan)
  fur("shower", F0, 12.75, 2.37, 90, w=1.5, d=0.8),
  fur("wc", F0, 13.95, 1.92, 0),
  fur("basin", F0, 14.50, 1.85, 0),
  fur("rattanChair", F0, 7.35, 9.25, 90),                          # sit-out
  fur("rattanChair", F0, 8.75, 9.25, 270),
  fur("roundTable", F0, 8.05, 9.25, 0),
  fur("car", F0, 2.60, 13.60, 180),
  # ===== FF =====
  # Bedroom 1 (render 1): headboard on the back wall under the high window, desk on the right, wardrobe at the front
  fur("bed", F1, 5.43, -0.07, 0),
  fur("rug", F1, 5.43, 0.35, 0, w=2.6, d=2.2),
  fur("studyDesk", F1, 6.76, 1.56, 270, w=1.4, d=0.45),
  fur("wardrobe", F1, 6.15, 2.87, 180, w=1.73, d=0.5),
  # Toilet 1 (render 1): shower at the back, WC on the left wall, basin by the door
  fur("shower", F1, 3.14, 1.08, 0, w=1.26, d=0.72),
  fur("wc", F1, 2.75, 1.85, 90),
  fur("basin", F1, 2.73, 2.80, 90),
  # Toilet 2 (render 2): glass shower left, WC, basin right
  fur("shower", F1, 9.73, 2.37, 90, w=1.5, d=0.9),
  fur("wc", F1, 10.80, 1.92, 0),
  fur("basin", F1, 11.65, 1.85, 0),
  # Walk-in (render 2): full-length wardrobe on the back wall, shoe rack, ottoman
  fur("wardrobe", F1, 13.90, 1.92, 0, w=2.86, d=0.6),
  fur("wardrobe", F1, 15.64, 2.40, 270, w=1.4, d=0.45),
  fur("ottoman", F1, 14.95, 2.85, 0),
  # Master (render 2): headboard on the right wall, wardrobe/rack on the left wall, rug
  fur("bed", F1, 14.80, 5.20, 270),
  fur("rug", F1, 14.30, 5.20, 90, w=2.8, d=2.0),
  fur("wardrobe", F1, 12.60, 6.28, 90, w=1.7, d=0.45),
  # Balcony (render 2): two rattan chairs, round table
  fur("rattanChair", F1, 13.25, 8.15, 90),
  fur("rattanChair", F1, 14.95, 8.15, 270),
  fur("roundTable", F1, 14.10, 8.25, 0),
  # Cutout (render 2): crystal chandelier hanging through the double height
  fur("chandelier", F1, 9.68, 6.81, 0, w=2.3, d=2.95),
  # Attached toilet (render 3): shower left, WC centre, basin right
  fur("shower", F1, 3.51, 5.38, 90, w=1.17, d=0.8),
  fur("wc", F1, 4.45, 5.05, 0),
  fur("basin", F1, 5.25, 5.03, 0),
  # Bedroom 3 (render 3): headboard on the toilet wall, wardrobe on the right wall, desk bottom-left
  fur("bed", F1, 4.75, 7.35, 0),
  fur("rug", F1, 4.75, 7.75, 0, w=2.6, d=2.3),
  fur("wardrobe", F1, 6.73, 8.75, 270, w=1.7, d=0.55),
  fur("studyDesk", F1, 3.73, 9.33, 180, w=1.2, d=0.5),
]

plants = [
  # garden
  dict(type="palm", x=14.6, z=12.2), dict(type="palm", x=-1.9, z=9.6, scale=1.1),
  dict(type="palm", x=19.0, z=1.0, scale=0.9), dict(type="tree", x=18.6, z=13.6),
  dict(type="tree", x=-1.8, z=-2.4, scale=0.9),
  dict(type="hedge", x=6.4, z=17.4, w=3.4, d=0.6), dict(type="hedge", x=15.4, z=17.4, w=9.0, d=0.6),
  dict(type="shrub", x=6.0, z=10.9), dict(type="shrub", x=12.9, z=10.9), dict(type="shrub", x=18.2, z=9.0, scale=1.3),
  dict(type="hedge", x=14.2, z=7.85, w=3.5, d=0.5), dict(type="potted", x=7.15, z=10.55),
  dict(type="potted", x=11.75, z=10.55),
  # courtyard landscaping (left + right planting strips, trees at the back)
  dict(type="tree", x=10.40, z=0.42, y=GF, scale=0.45), dict(type="tree", x=11.62, z=0.45, y=GF, scale=0.4),
  dict(type="hedge", x=9.47, z=2.0, y=GF + 0.12, w=0.35, d=2.1), dict(type="hedge", x=11.73, z=2.05, y=GF + 0.12, w=0.35, d=2.0),
  dict(type="shrub", x=9.75, z=0.95, y=GF), dict(type="shrub", x=11.85, z=1.05, y=GF),
  # potted plants under the chandelier (living) and on the balcony
  dict(type="potted", x=7.60, z=7.95, y=GF), dict(type="potted", x=11.90, z=7.95, y=GF),
  dict(type="potted", x=11.90, z=5.05, y=GF), dict(type="potted", x=10.05, z=7.95, y=GF),
  dict(type="potted", x=12.62, z=8.30, y=FF), dict(type="potted", x=15.62, z=8.30, y=FF),
]

cfg = dict(
  name="Ashik's Home, Mannur",
  wallThickness=T, slabThickness=0.15,
  floors=[dict(name="Ground Floor", y=GF, height=H), dict(name="First Floor", y=FF, height=H)],
  rooms=rooms, openings=openings, walls=walls, stairs=stairs, boxes=boxes, furniture=furniture, plants=plants,
  plot=dict(x1=-3.5, z1=-4.0, x2=20.5, z2=18.0, wallHeight=1.5, gates=[dict(x1=8.3, x2=10.6), dict(x1=0.4, x2=4.8)]),
  spawn=dict(x=9.44, z=16.6, yaw=0),
  sun=[-25, 38, 30],
)
json.dump(cfg, open("src/data/house.json", "w"), indent=1)
print(len(rooms), "rooms,", len(openings), "openings,", len(furniture), "furniture")
