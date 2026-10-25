// All distances are in meters. Coordinate system (matches the drawing):
//   x = left → right on the plan sheet, z = top → bottom on the plan sheet, y = up.
export type MaterialName =
  | 'paint' | 'paintWarm' | 'paintGrey' | 'stone' | 'wood' | 'darkWood' | 'doorWood'
  | 'marble' | 'tile' | 'bathTile' | 'grass' | 'paving' | 'concrete' | 'granite'
  | 'metal' | 'blackMetal' | 'glass' | 'mirror' | 'screen' | 'fabric' | 'fabricDark'
  | 'mattress' | 'white' | 'red' | 'solar' | 'leaf' | 'water' | 'lamp' | 'none'
  | 'sage' | 'rattan' | 'crystal' | 'walnut' | 'cushion'
  | 'teak' | 'stoneTile' | 'jali' | 'paverGrass';

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
  type: 'palm' | 'tree' | 'shrub' | 'hedge' | 'potted' | 'tropical' | 'vine'; // vine: hangs w long (along x), d deep
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
