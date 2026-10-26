// All distances are in meters. Coordinate system (matches the drawing):
//   x = left → right on the plan sheet, z = top → bottom on the plan sheet, y = up.
export type MaterialName =
  | 'paint' | 'paintWarm' | 'paintGrey' | 'stone' | 'wood' | 'darkWood' | 'doorWood'
  | 'marble' | 'tile' | 'bathTile' | 'grass' | 'paving' | 'concrete' | 'granite'
  | 'metal' | 'blackMetal' | 'glass' | 'mirror' | 'screen' | 'fabric' | 'fabricDark'
  | 'mattress' | 'white' | 'red' | 'solar' | 'leaf' | 'water' | 'lamp' | 'none'
  | 'sage' | 'rattan' | 'crystal' | 'walnut' | 'cushion'
  | 'teak' | 'stoneTile' | 'jali' | 'paverGrass'
  | 'exposedConcrete' | 'laterite' | 'darkGranite' | 'clayTile' | 'breezeBlock' | 'perforatedTerracotta'
  | 'charcoalPaint' | 'timberSoffit' | 'copper' | 'sheer' | 'lightStone' | 'roofDark' | 'road';

export interface FloorDef {
  name: string;
  y: number;       // finished floor level (top of slab), e.g. GF 0.45 (plinth), FF 3.60
  height: number;  // floor-to-floor height, e.g. 3.15
}

export type RoomKind = 'room' | 'outdoor' | 'void';

export interface Room {
  id: string;
  name: string;
  floor: number;
  x1: number; z1: number; x2: number; z2: number; // wall-centerline rectangle
  kind?: RoomKind;            // room (default) | outdoor (sit-out, courtyard, balcony) | void (open-to-below)
  walls?: boolean;            // default: true for room, false otherwise
  roof?: boolean;             // slab on top. default: true on top floor rooms & voids
  floorMaterial?: MaterialName;
  dims?: string;              // interior size as written on the plan, e.g. "3.54x3.78" (used by the validator)
  openSides?: Side[];         // edges that get no wall from this room (another room or a railing closes them)
  menu?: boolean;             // false = hide from the "Go to room" list (extra rectangles of an L-shaped room)
}

export type Side = 'top' | 'bottom' | 'left' | 'right'; // top = z1, bottom = z2, left = x1, right = x2

export type OpeningType = 'door' | 'sliding' | 'window' | 'ventilator' | 'opening';

export interface Opening {
  floor: number;
  type: OpeningType;
  x1: number; z1: number; x2: number; z2: number; // segment lying on a wall line (z1==z2 or x1==x2)
  sill?: number;   // height above floor (windows)
  head?: number;   // top of opening above floor
  main?: boolean;  // main entrance door
  frame?: 'black' | 'teak'; // window/sliding frame finish (default black metal)
}

export interface ExtraWall {
  floor?: number;
  x1: number; z1: number; x2: number; z2: number;
  y?: number;        // absolute bottom; default = floor level
  height?: number;   // default = up to the ceiling
  thickness?: number;
  material?: MaterialName;
}

export interface Flight {
  x1: number; z1: number; x2: number; z2: number;
  dir: '+x' | '-x' | '+z' | '-z'; // walking-up direction
  y0: number; y1: number;          // absolute levels at start / end (equal = landing)
  material?: MaterialName;
}

export interface BoxDef {
  name?: string;
  x: number; z: number; w: number; d: number; // center + size on plan (w along x, d along z)
  y: number; h: number;                        // absolute bottom + height
  material: MaterialName;
  walkable?: boolean;  // becomes a floor you can stand on (steps, paths)
  collide?: boolean;   // default true unless walkable
  colH?: number;       // collision height override (beds, sofas are low but should block)
}

export type FurnitureType =
  | 'bed' | 'sofa' | 'sofaL' | 'armchair' | 'coffeeTable' | 'diningTable' | 'tvUnit'
  | 'wardrobe' | 'kitchenCounter' | 'wc' | 'basin' | 'desk' | 'rug' | 'car'
  | 'shower' | 'chandelier' | 'rattanChair' | 'roundTable' | 'ottoman' | 'studyDesk' | 'bedsideLamp' | 'fridge';

export interface Furniture {
  type: FurnitureType;
  floor: number;
  x: number; z: number;
  rot?: 0 | 90 | 180 | 270; // direction the FRONT faces: 0=+z, 90=+x, 180=-z, 270=-x
  w?: number; d?: number;
  seats?: number;
  sides?: 'both' | 'left' | 'right' | 'none'; // bed: which bedside tables (left = local -x, seen from the foot of the bed)
}

export interface Plant {
  type: 'palm' | 'tree' | 'shrub' | 'hedge' | 'potted' | 'tropical' | 'vine' // vine: hangs w long (along x), d deep
    | 'heliconia' | 'alocasia' | 'fern' | 'rainTree';
  x: number; z: number;
  y?: number;
  scale?: number;
  w?: number; d?: number; // hedge size
}

/** Extra point light (façade sconces, uplights, soffit downlights). Brighter at night. */
export interface LightDef { x: number; y: number; z: number; color?: string; intensity?: number; distance?: number }

export interface HouseConfig {
  name: string;
  wallThickness: number;
  slabThickness: number;
  floors: FloorDef[];
  rooms: Room[];
  openings: Opening[];
  walls?: ExtraWall[];
  stairs?: Flight[];
  boxes?: BoxDef[];
  furniture?: Furniture[];
  plants?: Plant[];
  plot?: { x1: number; z1: number; x2: number; z2: number; wallHeight?: number; material?: MaterialName; gates?: { x1: number; x2: number }[] };
  lights?: LightDef[];
  sunColor?: string;
  spawn: { x: number; z: number; yaw?: number };
  sun?: [number, number, number];
}

// ======================= exterior design styles (src/data/styles/*.json) =======================
// A style dresses the plan without touching it: outer-skin materials, roofs, façade elements,
// landscaping and lighting. Rooms, openings, stairs and furniture always come from house.json.

/** Exterior material roles a style assigns. */
export type Role = 'wallMain' | 'wallAccent1' | 'wallAccent2' | 'plinth' | 'fascia' | 'soffit'
  | 'windowFrame' | 'doorMain' | 'railing' | 'compoundWall' | 'paving';

export type Face = 'front' | 'back' | 'left' | 'right'; // outward normal +z / -z / -x / +x

/** Paint part of the exterior walls with another role. from/to run along the wall (x for front/back, z for left/right). */
export interface WallZone { face: Face; floor?: number; from: number; to: number; y0?: number; y1?: number; role: Role }

export interface RoofDef {
  type: 'flat' | 'gable' | 'skillion';
  rect: { x1: number; z1: number; x2: number; z2: number }; // footprint the roof covers (before overhang)
  baseY: number;              // eave level (top of the wall it sits on)
  ridgeAxis?: 'x' | 'z';      // gable: ridge direction; skillion: the slope runs across it
  pitchDeg?: number;
  ridgeOffset?: number;       // gable: -0.5..0.5 shifts the ridge for an asymmetric gable
  overhang?: number;          // all sides
  overhangFront?: number;     // +z side (the street)
  thickness?: number;
  material: MaterialName;
  soffitMaterial?: MaterialName;
  gableInfill?: 'plaster' | 'glass' | 'louvers' | 'open';
  infillMaterial?: MaterialName;
  louverMaterial?: MaterialName;
  rafters?: boolean;          // exposed timber rafters + edge purlins under the roof plane
  rafterMaterial?: MaterialName;
  bargeMaterial?: MaterialName; // boards along the sloping edges
  fasciaLayers?: number;      // flat: thin slabs stepping outwards
  fasciaMaterial?: MaterialName;
  lowSide?: '+x' | '-x' | '+z' | '-z'; // skillion: the low edge
}

export type ElementDef =
  | ({ type: 'box' } & Omit<BoxDef, 'name' | 'walkable'>)
  /** slats spread along a line from (x1,z1) to (x2,z2); vertical (fins) or horizontal (bands) */
  | { type: 'louvers'; x1: number; z1: number; x2: number; z2: number; y0: number; y1: number; count: number;
      dir: 'vertical' | 'horizontal'; slat?: number; depth?: number; material: MaterialName; collide?: boolean }
  /** a rectangular frame standing proud of a wall: axis = the wall it faces (x: front/back) */
  | { type: 'boxFrame'; axis: 'x' | 'z'; a1: number; a2: number; c: number; y0: number; y1: number; depth: number; thickness: number;
      outward: 1 | -1; material: MaterialName; back?: MaterialName }
  | { type: 'column'; x: number; z: number; y: number; h: number; r: number; material: MaterialName; baseMaterial?: MaterialName; collide?: boolean }
  /** hanging creeper curtain along x (or z) at height y */
  | { type: 'creeper'; axis?: 'x' | 'z'; a1: number; a2: number; c: number; y: number; minLen: number; maxLen: number; density?: number }
  | { type: 'railing'; x1: number; z1: number; x2: number; z2: number; y: number; h: number; material: MaterialName; posts?: number; balusters?: boolean };

export interface StyleLighting {
  sun: [number, number, number];      // direction towards the sun
  sunColor: string;
  sunIntensity: number;
  hemi: [string, string, number];     // sky colour, ground colour, intensity
  ambient: number;
  exposure: number;
  sky: { turbidity: number; rayleigh: number; mieCoefficient: number; mieDirectionalG: number };
  background: string;
  fog: string;
  clouds?: { count: number; opacity: number; color?: string; height?: number };
  facadeLights?: LightDef[];
}

export interface StyleDef {
  id: string;
  name: string;
  subtitle: string;
  description: string;
  swatch: string[];                    // colours for the card before its thumbnail exists
  materials: Partial<Record<Role, MaterialName>>;
  wallZones: WallZone[];
  roofs: RoofDef[];
  elements: ElementDef[];
  landscape: { plants: Plant[]; road?: { x1: number; z1: number; x2: number; z2: number; reflect?: boolean } };
  lighting: StyleLighting;
  introCamera: { pos: [number, number, number]; target: [number, number, number] };
}
