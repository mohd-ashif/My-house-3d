# 3D House Walkthrough

A realistic, walkable 3D model of a house, built from its floor plans with
Next.js + React Three Fiber.

## Run it
```bash
npm install
npm run dev        # open http://localhost:3000
```
Add `?q=low` to the URL on slow laptops or phones.

## Controls
WASD / arrows: walk · Shift: run · Click: mouse-look (Esc to release) · C: first/third person
N: day/night · "Go to room…" menu: teleport (or "Outside" back to the gate) · Exit: back to the intro
Phones: left joystick + drag on the right side (a one-time tip explains this).
V or "🏠 Design": switch the exterior design (see below).
1–5: emote (wave, clap, point, sit, dance) · 6–0: react (❤️ 👍 😂 😮 🔥) · phones: the 🙂 button, bottom right.

## Multiplayer (see who else is inside)
Everyone who enters types a name on the intro screen; inside, all visitors see each other walking around live,
with the name over each person's head, a "N here now" list, and coloured dots on the minimap. It needs the small
relay server running next to the site:
```bash
npm run mp         # WebSocket server on port 3001 (PORT=… to change)
npm run dev        # the site, in a second terminal
```
The browser connects to `ws://<same host>:3001` by default. When the site is served over HTTPS, or the relay
runs on another host, set `NEXT_PUBLIC_MP_URL` (e.g. `wss://mp.example.com`) at build time. The relay needs a
host that keeps a process running (a VPS, Render, Railway, Fly.io); Vercel can host the site but not the relay.
If the relay can't be reached the walkthrough still works on its own, and the panel says "Offline · retrying".

**Follow.** Tap a name in the "here now" panel and pick Follow: you walk ~1.5 m behind them (up and down the
stairs too), and jump into the same room when they teleport. Any movement of your own, or the Stop button on the
"Following …" pill, ends it. Logic in `src/lib/follow.ts`.

**Emotes and reactions.** Emotes are procedural poses blended over the walk cycle; wave, clap and point play
once, while sit and dance last until you walk off (or press the same one again). They start only while you stand still.
Reactions float up over your head for 2 s. Everyone in the room sees both; the relay checks the names and allows
one emote and one reaction per player per second, and late joiners see anyone already sitting or dancing.
State and poses in `src/lib/emotes.ts`.

**Group tour (private rooms).** Whoever creates a room is its host (👑 in the "here now" list). The host can pass
the role on (tap a name → Make host); if the host leaves, whoever has been in the room longest takes over. The host
starts the 13-stop tour for everyone with "Start group tour" (on the intro, it creates the room as well; inside,
in the top bar or the ☰ menu). Everyone's character then walks the tour with the host, under the same caption card
("Stop 4 of 13 · guided by Ashif"). Only the host has Next / Pause / Play / Close, and the relay ignores tour
updates from anyone else. A follower who taps "Leave group" (or just walks off) explores alone; "Rejoin group"
teleports them to the current stop. People who arrive mid-tour start at the current stop. The host runs the
tour's clock; followers' tours have none of their own (`useTour` with `clock: false`), so they never drift apart.
If the host drops out, the next host carries on from the same stop. In the public room, or with no relay, the guided
tour is solo, as before. Logic in `src/lib/groupTour.ts`.

**Private rooms.** "Enter the house" joins the shared `public` room. "Create room" makes a 6-character code
(like `ASH42K`) and puts it in the URL as `?room=ASH42K`; anyone opening that link gets the code filled in and
presses "Join room". The code, with a copy/share button, sits in the top bar (desktop) or the ☰ menu (phones).
Up to 60 people per room; a room is forgotten after 5 minutes empty. Message names and shapes for both the
relay and the browser live in `src/lib/protocol.mjs`; deploy the relay and the site together when they change.

## Exterior designs
The same plan can be dressed in five elevations: **Modern Tropical** (`modern-tropical`), **Contemporary Gable**
(`concrete-gable`), **Kerala Tile Gable** (`kerala-tile`), and two takes on the client's teak-gable renders:
**Teak Gable Villa** (`teak-gable`, the front elevation on a rain-wet evening) and **Teak Gable Garden**
(`teak-gable-garden`, the three-quarter view across the lawn with the carport). Pick one on the intro screen, from the Design
panel, or with `?style=<id>`. The choice is remembered and written into the URL, so a shared link opens the
same design. Styles live in `src/data/styles/*.json`: style 1 comes from `build_house_json.py`, styles 2 to 5
from `python scripts/build_styles.py`. None of them move a room, door or window.

## Phones and slow machines
The renderer picks a quality tier from the device (GPU, memory, cores). Override it with `?tier=low|mid|high`.
The app installs as a PWA (`src/app/manifest.ts`, icons from `scripts/make_icons.py`). The guided tour
stops are in `src/data/tour.json`.

## Dollhouse views (screenshots, presentations)
`?view=x,y,z,tx,ty,tz&cut=6.1` fixes the camera at (x,y,z) looking at (tx,ty,tz) and clips everything
above height `cut`, giving a cutaway like the architect's renders. Example, FF master suite:
`http://localhost:3000/?view=14.1,14.5,10.8,14.1,3.6,4.9&cut=6.1`

## Editing the house
Everything comes from `src/data/house.json` (meters; x = left→right on the plan, z = top→bottom).
Rooms are wall-centerline rectangles; openings are segments on a wall line; stairs are flights.
Change a number, save, and the browser reloads. `window.__house.player` in the browser console
shows where you are standing, which helps when placing furniture.

## Making it even more real
- Replace the procedural man with a Mixamo character (GLB + walk/idle animations) via drei `useGLTF`/`useAnimations`.
- Swap canvas textures in `src/lib/materials.ts` for Poly Haven PBR textures.
- For photoreal lighting, export the scene to Blender, bake lighting, and load the baked GLB.

## This house
`src/data/house.json` is generated by `build_house_json.py` from "GF PLAN FINAL" (21/10/2026) and
"FF PLAN OPTION 6" (Thripthi Design Space). Every coordinate was read from the PDFs' vector line work
(28.54 pt per metre on both sheets, walls 0.24 m); the FF sheet sits at +1.67 m, +0.20 m from the GF
sheet, aligned on the staircase. Edit the numbers there and run `python build_house_json.py`.

The front and right façade follow the render "Modern Tropical Villa at Golden Hour": the `facade` list in
`build_house_json.py` holds the cladding (grey stone tiles, teak, stacked stone), the terracotta jali,
box-window and glazing surrounds, teak louvres, the sit-out portal, balcony box, overhanging roofs with
downlights and the right-side grooves; `lights`, `sun`/`sunColor` set the golden-hour lighting. None of it
moves a room. Façade view: `?view=20.0,3.2,23.5,7.6,3.6,6.5`.

## Checking it against the plans
```bash
python scripts/validate_house.py src/data/house.json --out plan_check.png   # sizes, openings, overlaps + overlay on the PDFs
node scripts/walk_sim.mjs                                                    # walks gate -> every room (and tap-to-walk) in every design
python scripts/grid_overlay.py gf 154.76 164.56 0 0 17.1 10.3 out.png 200   # metre grid over a sheet (ff origin: 107.10 158.85)
```

Browser checks (run with the browser-automation runner against a running dev server; see each script's header):
`scripts/mobile_qa.mjs` (phones/tablets, `DEVICE=…`), `scripts/style_switch_qa.mjs` (design switching, FPS) and
`scripts/style_shots.mjs` (screenshots of every design into `screenshots/styles/`).
