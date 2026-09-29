import type { TerrainDef } from '../../sim/terrain';

// Kestrel Ridge: an alpine valley. The mountain rises to the north with the
// summit overlook on its shoulder (and a sheer drop behind it); the road
// switchbacks down past the ranger station to a junction, then runs south
// over the creek to the valley floor. A lake with a campground sits east, the
// old sawmill west.
//
// -Z is north. Heights are metres; the lake surface is 16.

export const RIDGE = {
  overlook: { x: 20, z: -334 },
  car: { x: 20, y: 0, z: -336 },
  van: { x: 21, z: -318 },
  ranger: { x: -26, z: -146 },
  rangerPickup: { x: -14, z: -128 },
  junction: { x: 5, z: -20 },
  sawmill: { x: -232, z: -22 },
  camp: { x: 186, z: 52 },
  lake: { x: 250, z: 112 },
  tower: { x: 122, z: -122 },
  mine: { x: -160, z: -236 },
  slide: { x: 0, z: 94 },
  ford: { x: -100, z: 131 },
  bridge: { x: 0, z: 131 },
  lot: { x: 0, z: 312 },
};

export const RIDGE_TERRAIN: TerrainDef = {
  size: 900,
  cell: 1.5,
  baseY: 16,
  seed: 5150,
  noise: [
    { amp: 7, scale: 140 },
    { amp: 2.2, scale: 38 },
    { amp: 0.5, scale: 9 },
    { amp: 9, scale: 210, ridged: true },
  ],
  features: [
    // The mountain: a long shoulder across the north.
    { kind: 'ridge', x: -500, z: -340, x2: 500, z2: -340, r: 420, h: 78, sharp: 0.75 },
    { kind: 'hill', x: -40, z: -60, r: 170, h: 9 },
    // Peaks behind the overlook (scenery).
    { kind: 'hill', x: -200, z: -390, r: 110, h: 60, sharp: 1.2 },
    { kind: 'hill', x: 250, z: -380, r: 120, h: 48, sharp: 1.2 },
    // The drop: a gorge right behind the overlook.
    { kind: 'hill', x: 20, z: -455, r: 95, h: -95, sharp: 2 },
    // Knoll with the fire lookout.
    { kind: 'hill', x: 122, z: -122, r: 45, h: 16, sharp: 1.1 },
    // Lake basin.
    { kind: 'hill', x: 250, z: 112, r: 85, h: -13, sharp: 1.4 },
    // Creek channel, west hills → lake.
    { kind: 'ridge', x: -420, z: 138, x2: -100, z2: 131, r: 16, h: -10, sharp: 1.5 },
    { kind: 'ridge', x: -100, z: 131, x2: 110, z2: 126, r: 16, h: -10, sharp: 1.5 },
    { kind: 'ridge', x: 110, z: 126, x2: 220, z2: 112, r: 18, h: -10, sharp: 1.5 },
    // Hills framing the valley floor.
    { kind: 'hill', x: -260, z: 260, r: 150, h: 26 },
    { kind: 'hill', x: 260, z: 300, r: 140, h: 22 },
  ],
  roads: [
    // The overlook pull-out: wide, and gently downhill toward the drop.
    { id: 'overlook', surface: 'gravel', halfWidth: 7, shoulder: 6, smooth: 0, points: [[20, -358, 94.6], [20, -336, 96.1], [20, -314, 97.1]] },
    {
      id: 'summit',
      surface: 'gravel',
      halfWidth: 3.4,
      shoulder: 7,
      smooth: 3,
      points: [
        [20, -352, 95.2], [20, -334, 96.2], [20, -316, 97], [18, -298, 95.4], [-8, -287, 92.2], [-52, -281, 88.4],
        [-82, -268, 85.4], [-74, -251, 82.4], [-28, -240, 78.4], [22, -230, 75.2], [42, -215, 72.4],
        [24, -200, 69.4], [-24, -191, 66.2], [-56, -178, 63.4], [-50, -160, 61.4], [-40, -140, 59.4],
        [-26, -110, 55.6], [-8, -76, 50.6], [3, -46, 46], [5, -20, 42.5],
      ],
    },
    {
      id: 'south',
      surface: 'gravel',
      halfWidth: 3.4,
      shoulder: 7,
      points: [[5, -20, 42.5], [2, 18, 36.8], [-3, 55, 30.6], [0, 88, 25.6], [0, 114, 22.8]],
    },
    {
      id: 'south2',
      surface: 'gravel',
      halfWidth: 3.4,
      shoulder: 7,
      points: [[0, 148, 22.8], [2, 180, 22.3], [6, 222, 21.8], [0, 262, 21], [0, 300, 20.4], [0, 322, 20.4]],
    },
    {
      id: 'mill',
      surface: 'dirt',
      halfWidth: 3,
      shoulder: 6,
      points: [[5, -20, 42.5], [-40, -30, 40.2], [-100, -36, 35.5], [-160, -32, 31.5], [-205, -26, 29.4], [-222, -22, 29.2]],
    },
    {
      id: 'camp',
      surface: 'dirt',
      halfWidth: 3,
      shoulder: 6,
      points: [[5, -20, 42.5], [48, -8, 38.5], [100, 12, 31.5], [150, 34, 24.5], [178, 48, 21.6]],
    },
    {
      id: 'logging',
      surface: 'track',
      halfWidth: 2.6,
      shoulder: 5,
      smooth: 4,
      points: [[-2, 66, 29.2], [-36, 78], [-72, 100], [-96, 118, 17.6], [-100, 131, 15.4], [-98, 144, 17.6], [-82, 170], [-46, 204], [-6, 220, 21.8]],
    },
    {
      id: 'mine',
      surface: 'track',
      halfWidth: 2.4,
      shoulder: 5,
      points: [[-82, -268, 85.4], [-110, -262, 84], [-140, -248, 81.5], [-156, -238, 80.5]],
    },
  ],
  pads: [
    { x: -24, z: -144, radius: 22, blend: 12, y: 59.4 },
    { x: -232, z: -18, radius: 30, blend: 14, y: 29.2 },
    { x: 186, z: 54, radius: 26, blend: 12, y: 21.6 },
    { x: 0, z: 312, radius: 24, blend: 14, y: 20.4 },
    { x: -160, z: -236, radius: 12, blend: 8, y: 80.5 },
    { x: 122, z: -122, radius: 6, blend: 6 },
  ],
  waterLevel: 16,
  edge: { radius: 400, blend: 45, y: 40 },
};
