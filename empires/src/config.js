// All game data: balance, tech tree, civilizations, governments, religions, AI personalities.
export const TICK = 0.1;            // simulation step, game seconds
export const POP_MAX = 400;         // hard population cap per nation
export const RES = ['food', 'wood', 'stone', 'gold', 'iron'];
export const RES_ICON = { food: '🌾', wood: '🪵', stone: '🪨', gold: '🪙', iron: '⛓', faith: '✨' };

export const PLAYER_COLORS = [
  { name: 'Azure', hex: '#3d7fe0' }, { name: 'Crimson', hex: '#d8403a' }, { name: 'Emerald', hex: '#36a85c' }, { name: 'Amber', hex: '#e3a32a' },
  { name: 'Violet', hex: '#9a5ad8' }, { name: 'Teal', hex: '#2fb3b8' }, { name: 'Rose', hex: '#e06aa6' }, { name: 'Onyx', hex: '#3b3d46' },
];

// ---------------------------------------------------------------- AGES (pyramid)
// Each age needs `need` DIFFERENT completed buildings from the previous tier.
export const AGES = [
  { name: 'Tribal Age', short: 'I' },
  { name: 'Feudal Age', short: 'II', cost: { food: 400, wood: 150 }, time: 70, need: 2, from: ['barracks', 'mill', 'lumber_camp', 'mining_camp', 'shrine'] },
  { name: 'Kingdom Age', short: 'III', cost: { food: 800, gold: 200, stone: 100 }, time: 100, need: 2, from: ['market', 'blacksmith', 'archery_range', 'stable', 'temple', 'infirmary', 'council_hall'] },
  { name: 'Imperial Age', short: 'IV', cost: { food: 1100, gold: 800, iron: 100 }, time: 130, need: 2, from: ['castle', 'siege_workshop', 'university', 'hospital', 'cathedral'] },
  { name: 'Renaissance Age', short: 'V', cost: { food: 1800, gold: 1400, iron: 250 }, time: 170, need: 2, from: ['printing_press', 'foundry', 'bank', 'wonder'] },
];

// ---------------------------------------------------------------- UNITS
// cls: villager | infantry | spear | ranged | cavalry | siege | support | trade
// dmg: melee | pierce | siege. ma/pa = melee/pierce armor. bonus = flat extra damage vs class.
export const UNITS = {
  villager:   { name: 'Villager', cls: 'villager', building: 'town_center', age: 1, cost: { food: 50 }, time: 13, hp: 25, atk: 3, dmg: 'melee', ma: 0, pa: 0, range: 0.9, rate: 1.6, speed: 1.6, sight: 6, pop: 1, bonus: { building: 1 } },
  scout:      { name: 'Scout Rider', cls: 'cavalry', building: 'town_center', age: 1, cost: { food: 80 }, time: 22, hp: 45, atk: 3, dmg: 'melee', ma: 0, pa: 2, range: 1, rate: 1.8, speed: 3.0, sight: 12, pop: 1, bonus: { villager: 2, siege: 4 } },
  militia:    { name: 'Militia', cls: 'infantry', line: 'sword', tier: 0, building: 'barracks', age: 1, cost: { food: 60, gold: 20 }, time: 18, hp: 40, atk: 5, dmg: 'melee', ma: 0, pa: 1, range: 1, rate: 1.8, speed: 1.45, sight: 6, pop: 1, bonus: { building: 2, spear: 2 } },
  swordsman:  { name: 'Swordsman', cls: 'infantry', line: 'sword', tier: 1, building: 'barracks', age: 2, cost: { food: 60, gold: 20 }, time: 18, hp: 60, atk: 8, dmg: 'melee', ma: 1, pa: 1, range: 1, rate: 1.8, speed: 1.45, sight: 6, pop: 1, bonus: { building: 3, spear: 3 } },
  champion:   { name: 'Champion', cls: 'infantry', line: 'sword', tier: 2, building: 'barracks', age: 3, cost: { food: 60, gold: 20, iron: 10 }, time: 18, hp: 85, atk: 12, dmg: 'melee', ma: 2, pa: 2, range: 1, rate: 1.8, speed: 1.5, sight: 6, pop: 2, bonus: { building: 4, spear: 5 } },
  spearman:   { name: 'Spearman', cls: 'spear', line: 'spear', tier: 0, building: 'barracks', age: 1, cost: { food: 35, wood: 25 }, time: 18, hp: 45, atk: 3, dmg: 'melee', ma: 0, pa: 0, range: 1.2, rate: 2, speed: 1.45, sight: 6, pop: 1, bonus: { cavalry: 14 } },
  pikeman:    { name: 'Pikeman', cls: 'spear', line: 'spear', tier: 1, building: 'barracks', age: 2, cost: { food: 35, wood: 25 }, time: 18, hp: 55, atk: 4, dmg: 'melee', ma: 0, pa: 1, range: 1.3, rate: 2, speed: 1.45, sight: 6, pop: 1, bonus: { cavalry: 22 } },
  halberdier: { name: 'Halberdier', cls: 'spear', line: 'spear', tier: 2, building: 'barracks', age: 3, cost: { food: 35, wood: 25, iron: 5 }, time: 18, hp: 62, atk: 6, dmg: 'melee', ma: 1, pa: 1, range: 1.4, rate: 2, speed: 1.45, sight: 6, pop: 2, bonus: { cavalry: 32 } },
  archer:     { name: 'Archer', cls: 'ranged', line: 'archer', tier: 0, building: 'archery_range', age: 2, cost: { wood: 25, gold: 45 }, time: 22, hp: 30, atk: 4, dmg: 'pierce', ma: 0, pa: 0, range: 5.5, rate: 2, speed: 1.4, sight: 8, pop: 1, bonus: { spear: 3, infantry: 1 } },
  crossbowman:{ name: 'Crossbowman', cls: 'ranged', line: 'archer', tier: 1, building: 'archery_range', age: 3, cost: { wood: 25, gold: 45 }, time: 22, hp: 35, atk: 6, dmg: 'pierce', ma: 0, pa: 0, range: 6, rate: 2, speed: 1.4, sight: 9, pop: 1, bonus: { spear: 4, infantry: 1 } },
  arbalest:   { name: 'Arbalest', cls: 'ranged', line: 'archer', tier: 2, building: 'archery_range', age: 4, cost: { wood: 25, gold: 45, iron: 5 }, time: 22, hp: 42, atk: 7, dmg: 'pierce', ma: 0, pa: 1, range: 6.5, rate: 2, speed: 1.4, sight: 9, pop: 2, bonus: { spear: 5, infantry: 2 } },
  horseman:   { name: 'Horseman', cls: 'cavalry', line: 'cav', tier: 0, building: 'stable', age: 2, cost: { food: 80, gold: 30 }, time: 26, hp: 80, atk: 7, dmg: 'melee', ma: 0, pa: 2, range: 1.1, rate: 1.9, speed: 2.6, sight: 8, pop: 2, charge: 6, bonus: { ranged: 6, siege: 10, villager: 2 } },
  knight:     { name: 'Knight', cls: 'cavalry', line: 'cav', tier: 1, building: 'stable', age: 3, cost: { food: 60, gold: 75, iron: 15 }, time: 28, hp: 130, atk: 10, dmg: 'melee', ma: 2, pa: 2, range: 1.1, rate: 1.8, speed: 2.45, sight: 8, pop: 2, charge: 10, bonus: { ranged: 6, siege: 12 } },
  paladin:    { name: 'Paladin', cls: 'cavalry', line: 'cav', tier: 2, building: 'stable', age: 4, cost: { food: 60, gold: 75, iron: 20 }, time: 28, hp: 175, atk: 14, dmg: 'melee', ma: 3, pa: 4, range: 1.1, rate: 1.8, speed: 2.4, sight: 9, pop: 3, charge: 14, bonus: { ranged: 8, siege: 14 } },
  horse_archer:{ name: 'Horse Archer', cls: 'ranged', mounted: true, building: 'stable', age: 3, cost: { wood: 40, gold: 70 }, time: 30, hp: 60, atk: 5, dmg: 'pierce', ma: 0, pa: 1, range: 4.5, rate: 2.1, speed: 2.6, sight: 9, pop: 2, bonus: { spear: 3, infantry: 1 } },
  ram:        { name: 'Battering Ram', cls: 'siege', building: 'siege_workshop', age: 3, cost: { wood: 160, gold: 75 }, time: 40, hp: 220, atk: 3, dmg: 'melee', ma: 0, pa: 150, range: 1.3, rate: 4, speed: 0.95, sight: 5, pop: 3, bldOnly: true, bonus: { building: 70 } },
  mangonel:   { name: 'Mangonel', cls: 'siege', building: 'siege_workshop', age: 3, cost: { wood: 160, gold: 135 }, time: 40, hp: 60, atk: 26, dmg: 'siege', ma: 0, pa: 6, range: 7, minRange: 2, rate: 6, speed: 0.9, sight: 8, pop: 3, splash: 1.3, bonus: { building: 20 } },
  trebuchet:  { name: 'Trebuchet', cls: 'siege', building: 'siege_workshop', age: 4, cost: { wood: 200, gold: 200, iron: 20 }, time: 50, hp: 150, atk: 30, dmg: 'siege', ma: 1, pa: 150, range: 12, minRange: 4, rate: 10, speed: 0.8, sight: 12, pop: 3, bldOnly: true, splash: 0.8, bonus: { building: 160 } },
  priest:     { name: 'Priest', cls: 'support', building: 'temple', age: 2, cost: { gold: 100 }, time: 30, hp: 30, atk: 0, dmg: 'melee', ma: 0, pa: 0, range: 4, rate: 1, speed: 1.15, sight: 9, pop: 1, heal: 1.2, aura: 8 },
  medic:      { name: 'Field Surgeon', cls: 'support', building: 'infirmary', age: 2, cost: { food: 40, gold: 40 }, time: 20, hp: 30, atk: 0, dmg: 'melee', ma: 0, pa: 0, range: 3, rate: 1, speed: 1.4, sight: 8, pop: 1, heal: 2.5 },
  trade_cart: { name: 'Trade Caravan', cls: 'trade', building: 'market', age: 2, cost: { wood: 80, gold: 60 }, time: 25, hp: 70, atk: 0, dmg: 'melee', ma: 0, pa: 1, range: 1, rate: 1, speed: 1.5, sight: 6, pop: 1 },
  general:    { name: 'Hero', cls: 'cavalry', hero: true, building: 'barracks', age: 2, cost: { food: 200, gold: 150 }, time: 45, hp: 280, atk: 14, dmg: 'melee', ma: 3, pa: 3, range: 1.2, rate: 1.7, speed: 2.3, sight: 10, pop: 2, charge: 8, aura: 20, max: 1, bonus: { ranged: 4 } },
  siege_tower:{ name: 'Siege Tower', cls: 'siege', building: 'siege_workshop', age: 3, cost: { wood: 220, gold: 60 }, time: 45, hp: 420, atk: 0, dmg: 'melee', ma: 2, pa: 120, range: 1.2, rate: 6, speed: 0.85, sight: 6, pop: 3, bldOnly: true, wallOnly: true, bonus: {} },
  musketeer:  { name: 'Musketeer', cls: 'ranged', line: 'gun', tier: 0, building: 'barracks', age: 5, cost: { food: 55, gold: 55, iron: 10 }, time: 26, hp: 75, atk: 15, dmg: 'pierce', ma: 1, pa: 1, range: 5.5, rate: 3.4, speed: 1.4, sight: 8, pop: 2, accuracyMul: 0.85, bonus: { cavalry: 6, infantry: 2 } },
  cannon:     { name: 'Bombard Cannon', cls: 'siege', building: 'foundry', age: 5, cost: { wood: 200, gold: 220, iron: 60 }, time: 50, hp: 160, atk: 42, dmg: 'siege', ma: 2, pa: 6, range: 11, minRange: 2, rate: 7, speed: 0.8, sight: 12, pop: 3, splash: 1.2, bonus: { building: 140, siege: 30 } },
  // ships: sail on deep and shallow water, trained at the Dock
  trade_cog:  { name: 'Trade Cog', cls: 'trade', naval: true, building: 'dock', age: 2, cost: { wood: 110, gold: 50 }, time: 30, hp: 120, atk: 0, dmg: 'melee', ma: 0, pa: 3, range: 1, rate: 1, speed: 2.1, sight: 7, pop: 1 },
  fishing_boat:{ name: 'Fishing Boat', cls: 'fisher', naval: true, building: 'dock', age: 1, cost: { wood: 75 }, time: 20, hp: 60, atk: 0, dmg: 'melee', ma: 0, pa: 2, range: 1, rate: 1, speed: 2.0, sight: 7, pop: 1 },
  galley:     { name: 'War Galley', cls: 'ship', naval: true, building: 'dock', age: 2, cost: { wood: 90, gold: 35 }, time: 30, hp: 150, atk: 6, dmg: 'pierce', ma: 0, pa: 4, range: 6.5, rate: 2.6, speed: 2.3, sight: 9, pop: 2, bonus: { ship: 3, fisher: 8, building: 2 } },
  fire_ship:  { name: 'Fire Ship', cls: 'ship', naval: true, building: 'dock', age: 2, cost: { wood: 80, gold: 45 }, time: 32, hp: 130, atk: 3, dmg: 'melee', ma: 1, pa: 5, range: 1.6, rate: 0.6, speed: 2.6, sight: 8, pop: 2, bonus: { ship: 6, fisher: 6 } },
  dromon:     { name: 'Dromon', cls: 'ship', naval: true, building: 'dock', age: 3, cost: { wood: 160, gold: 90, iron: 10 }, time: 45, hp: 230, atk: 22, dmg: 'siege', ma: 1, pa: 6, range: 8, minRange: 2, rate: 5.5, speed: 1.7, sight: 10, pop: 3, splash: 1, bonus: { building: 30, ship: 4 } },
};
export const LINES = { gun: ['musketeer'], sword: ['militia', 'swordsman', 'champion'], spear: ['spearman', 'pikeman', 'halberdier'], archer: ['archer', 'crossbowman', 'arbalest'], cav: ['horseman', 'knight', 'paladin'] };

// ---------------------------------------------------------------- BUILDINGS
// requires: other buildings that must be completed first (the build pyramid).
export const BUILDINGS = {
  town_center:   { name: 'Town Center', size: 4, age: 1, cost: { wood: 275, stone: 100 }, time: 150, hp: 2400, pop: 15, drop: RES, trains: ['villager', 'scout'], attack: { atk: 5, range: 7, rate: 2, arrows: 2 }, heal: 1, max: 1 },
  house:         { name: 'House', size: 2, age: 1, cost: { wood: 30 }, time: 16, hp: 550, pop: 10 },
  farm:          { name: 'Farm', size: 3, age: 1, cost: { wood: 60 }, time: 14, hp: 240, passable: true, requires: ['mill'] },
  mill:          { name: 'Mill & Granary', size: 2, age: 1, cost: { wood: 100 }, time: 30, hp: 600, drop: ['food'] },
  lumber_camp:   { name: 'Lumber Camp', size: 2, age: 1, cost: { wood: 100 }, time: 28, hp: 600, drop: ['wood'] },
  mining_camp:   { name: 'Mining Camp', size: 2, age: 1, cost: { wood: 100 }, time: 28, hp: 600, drop: ['gold', 'stone', 'iron'] },
  barracks:      { name: 'Barracks', size: 3, age: 1, cost: { wood: 175 }, time: 40, hp: 1200, trains: ['militia', 'spearman'], max: 5 },
  shrine:        { name: 'Shrine', size: 2, age: 1, cost: { wood: 80, stone: 40 }, time: 30, hp: 500, faith: 0.35 },
  dock:          { name: 'Dock', size: 3, age: 1, cost: { wood: 150 }, time: 35, hp: 1500, drop: ['food'], trains: ['fishing_boat', 'galley', 'fire_ship', 'dromon'], coastal: true },
  palisade_gate: { name: 'Palisade Gate', size: 1, age: 1, cost: { wood: 20 }, time: 12, hp: 700, wall: true, gate: true },
  stone_gate:    { name: 'Stone Gate', size: 1, age: 2, cost: { stone: 30 }, time: 25, hp: 2600, wall: true, gate: true, requires: ['blacksmith'] },
  wall_tower:    { name: 'Wall Tower', size: 1, age: 2, cost: { wood: 20, stone: 90 }, time: 40, hp: 1800, wall: true, attack: { atk: 6, range: 7.5, rate: 2, arrows: 1 }, requires: ['blacksmith'] },
  stakes:        { name: 'Sharpened Stakes', size: 1, age: 1, cost: { wood: 25 }, time: 8, hp: 200, passable: true, trap: 'stakes' },
  spike_pit:     { name: 'Spike Pit', size: 1, age: 2, cost: { wood: 35 }, time: 8, hp: 60, passable: true, trap: 'spikes' },
  caltrops:      { name: 'Caltrops', size: 1, age: 2, cost: { wood: 15, iron: 10 }, time: 6, hp: 60, passable: true, trap: 'caltrops' },
  fire_trench:   { name: 'Pitch Trench', size: 1, age: 3, cost: { wood: 30, gold: 10 }, time: 10, hp: 80, passable: true, trap: 'fire' },
  courthouse:    { name: 'Courthouse', size: 3, age: 2, cost: { wood: 150, stone: 100, gold: 50 }, time: 50, hp: 1500, requires: ['council_hall'] },
  plantation:    { name: 'Plantation', size: 2, age: 2, cost: { wood: 120, gold: 30 }, time: 30, hp: 700, requires: ['market'] },
  monument:      { name: 'Monument', size: 3, age: 3, cost: { wood: 200, stone: 300, gold: 200 }, time: 120, hp: 3200, faith: 0.5, max: 1, rank: 1, requires: ['market'] },
  printing_press:{ name: 'Printing Press', size: 3, age: 4, cost: { wood: 250, gold: 200 }, time: 70, hp: 1600, rank: 2, requires: ['university'] },
  foundry:       { name: 'Cannon Foundry', size: 3, age: 4, cost: { wood: 200, stone: 150, iron: 100 }, time: 70, hp: 1800, trains: ['cannon'], requires: ['siege_workshop'] },
  bank:          { name: 'Bank', size: 3, age: 4, cost: { stone: 250, gold: 300 }, time: 70, hp: 1800, rank: 2, requires: ['market'] },
  star_fort:     { name: 'Star Fort', size: 5, age: 5, cost: { stone: 900, iron: 150 }, time: 200, hp: 9000, pop: 20, attack: { atk: 16, range: 10, rate: 2.5, arrows: 3, shot: true }, heal: 1, requires: ['foundry'] },
  palisade:      { name: 'Palisade', size: 1, age: 1, cost: { wood: 3 }, time: 3, hp: 250, wall: true },
  archery_range: { name: 'Archery Range', size: 3, age: 2, cost: { wood: 175 }, time: 40, hp: 1200, trains: ['archer'], requires: ['barracks'] },
  stable:        { name: 'Stable', size: 3, age: 2, cost: { wood: 175 }, time: 40, hp: 1200, trains: ['horseman', 'horse_archer'], requires: ['barracks'] },
  market:        { name: 'Market', size: 4, age: 2, cost: { wood: 175 }, time: 50, hp: 1400, trains: ['trade_cart'], requires: ['mill'] },
  blacksmith:    { name: 'Blacksmith', size: 3, age: 2, cost: { wood: 150 }, time: 40, hp: 1200, requires: ['barracks'] },
  watch_tower:   { name: 'Watch Tower', size: 1, age: 2, cost: { wood: 25, stone: 125 }, time: 50, hp: 1000, attack: { atk: 6, range: 8, rate: 2, arrows: 1 }, requires: ['barracks'] },
  stone_wall:    { name: 'Stone Wall', size: 1, age: 2, cost: { stone: 6 }, time: 7, hp: 1500, wall: true, requires: ['blacksmith'] },
  temple:        { name: 'Temple', size: 3, age: 2, cost: { wood: 120, stone: 150 }, time: 50, hp: 1400, trains: ['priest'], faith: 0.9, heal: 2, requires: ['shrine'] },
  infirmary:     { name: 'Infirmary', size: 3, age: 2, cost: { wood: 150, stone: 50 }, time: 40, hp: 1000, trains: ['medic'], heal: 3.5, requires: ['mill'] },
  council_hall:  { name: 'Council Hall', size: 3, age: 2, cost: { wood: 200, stone: 80, gold: 60 }, time: 60, hp: 1600, requires: ['market'] },
  castle:        { name: 'Castle', size: 4, age: 3, cost: { stone: 650 }, time: 160, hp: 5200, pop: 20, attack: { atk: 9, range: 9, rate: 2, arrows: 4 }, trains: ['general'], heal: 1.5, requires: ['blacksmith'] },
  siege_workshop:{ name: 'Siege Workshop', size: 3, age: 3, cost: { wood: 200 }, time: 45, hp: 1400, trains: ['ram', 'mangonel', 'trebuchet'], requires: ['blacksmith'] },
  university:    { name: 'University', size: 3, age: 3, cost: { wood: 200, stone: 100 }, time: 60, hp: 1500, requires: ['market'] },
  hospital:      { name: 'Hospital', size: 3, age: 3, cost: { stone: 200, gold: 100 }, time: 70, hp: 1500, heal: 7, requires: ['infirmary'] },
  cathedral:     { name: 'Cathedral', size: 4, age: 3, cost: { stone: 300, gold: 200 }, time: 90, hp: 2600, faith: 2.2, heal: 2, trains: ['priest'], requires: ['temple'] },
  wonder:        { name: 'Wonder', size: 5, age: 4, cost: { wood: 1500, stone: 1500, gold: 1500 }, time: 520, hp: 9000, faith: 3, rank: 2, requires: ['university', 'castle'], max: 1 },
};

// ---------------------------------------------------------------- TECHNOLOGY
// fx keys are additive modifiers (see Player.mod). upgrade: unit-line promotion.
export const TECHS = {
  loom:          { name: 'Loom', building: 'town_center', age: 1, cost: { gold: 50 }, time: 25, fx: { 'hp.villager': 15 } },
  wheelbarrow:   { name: 'Wheelbarrow', building: 'town_center', age: 2, cost: { food: 175, wood: 50 }, time: 45, fx: { carry: 3, vilSpeed: 0.1 } },
  hand_cart:     { name: 'Hand Cart', building: 'town_center', age: 3, cost: { food: 300, wood: 200 }, time: 55, fx: { carry: 4, vilSpeed: 0.1 } },
  horse_collar:  { name: 'Horse Collar', building: 'mill', age: 2, cost: { food: 75, wood: 75 }, time: 25, fx: { 'gather.food': 0.12 } },
  heavy_plow:    { name: 'Heavy Plow', building: 'mill', age: 3, cost: { food: 125, wood: 125 }, time: 35, fx: { 'gather.food': 0.15 } },
  crop_rotation: { name: 'Crop Rotation', building: 'mill', age: 4, cost: { food: 250, wood: 250 }, time: 50, fx: { 'gather.food': 0.2 } },
  double_axe:    { name: 'Double-Bit Axe', building: 'lumber_camp', age: 1, cost: { food: 100, wood: 50 }, time: 25, fx: { 'gather.wood': 0.15 } },
  bow_saw:       { name: 'Bow Saw', building: 'lumber_camp', age: 2, cost: { food: 150, wood: 100 }, time: 35, fx: { 'gather.wood': 0.15 } },
  two_man_saw:   { name: 'Two-Man Saw', building: 'lumber_camp', age: 3, cost: { food: 300, wood: 200 }, time: 50, fx: { 'gather.wood': 0.12 } },
  gold_mining:   { name: 'Gold Mining', building: 'mining_camp', age: 1, cost: { food: 100, wood: 75 }, time: 30, fx: { 'gather.gold': 0.15 } },
  stone_mining:  { name: 'Stone Mining', building: 'mining_camp', age: 1, cost: { food: 100, wood: 75 }, time: 30, fx: { 'gather.stone': 0.15 } },
  iron_smelting: { name: 'Iron Smelting', building: 'mining_camp', age: 2, cost: { food: 150, wood: 100 }, time: 35, fx: { 'gather.iron': 0.2 } },
  shaft_mine:    { name: 'Shaft Mining', building: 'mining_camp', age: 3, cost: { food: 200, wood: 150 }, time: 45, fx: { 'gather.gold': 0.15, 'gather.stone': 0.15, 'gather.iron': 0.15 } },
  forging:       { name: 'Forging', building: 'blacksmith', age: 2, cost: { food: 150 }, time: 35, fx: { 'atk.infantry': 1, 'atk.spear': 1, 'atk.cavalry': 1 } },
  iron_casting:  { name: 'Iron Casting', building: 'blacksmith', age: 3, cost: { food: 220, gold: 120 }, time: 45, fx: { 'atk.infantry': 1, 'atk.spear': 1, 'atk.cavalry': 1 } },
  blast_furnace: { name: 'Blast Furnace', building: 'blacksmith', age: 4, cost: { food: 275, gold: 225, iron: 50 }, time: 60, fx: { 'atk.infantry': 2, 'atk.spear': 2, 'atk.cavalry': 2 } },
  scale_mail:    { name: 'Scale Mail', building: 'blacksmith', age: 2, cost: { food: 100 }, time: 30, fx: { 'ma.infantry': 1, 'pa.infantry': 1, 'ma.spear': 1, 'pa.spear': 1 } },
  chain_mail:    { name: 'Chain Mail', building: 'blacksmith', age: 3, cost: { food: 200, gold: 100, iron: 20 }, time: 45, fx: { 'ma.infantry': 1, 'pa.infantry': 1, 'ma.spear': 1, 'pa.spear': 1 } },
  plate_mail:    { name: 'Plate Mail', building: 'blacksmith', age: 4, cost: { food: 300, gold: 150, iron: 60 }, time: 60, fx: { 'ma.infantry': 1, 'pa.infantry': 2, 'ma.spear': 1, 'pa.spear': 2 } },
  barding:       { name: 'Chain Barding', building: 'blacksmith', age: 3, cost: { food: 250, gold: 150, iron: 30 }, time: 50, fx: { 'ma.cavalry': 1, 'pa.cavalry': 1 } },
  plate_barding: { name: 'Plate Barding', building: 'blacksmith', age: 4, cost: { food: 350, gold: 200, iron: 60 }, time: 60, fx: { 'ma.cavalry': 1, 'pa.cavalry': 2 } },
  fletching:     { name: 'Fletching', building: 'blacksmith', age: 2, cost: { food: 100, wood: 50 }, time: 30, fx: { 'atk.ranged': 1, 'range.ranged': 1, towerAtk: 1 } },
  bodkin:        { name: 'Bodkin Arrow', building: 'blacksmith', age: 3, cost: { food: 200, wood: 100, gold: 100 }, time: 40, fx: { 'atk.ranged': 1, 'range.ranged': 0.5, towerAtk: 1 } },
  bracer:        { name: 'Bracer', building: 'blacksmith', age: 4, cost: { food: 300, wood: 200, gold: 150 }, time: 55, fx: { 'atk.ranged': 1, 'range.ranged': 0.5, towerAtk: 1 } },
  up_swordsman:  { name: 'Swordsman Training', building: 'barracks', age: 2, cost: { food: 120, gold: 40 }, time: 35, upgrade: ['sword', 1] },
  up_champion:   { name: 'Champion Training', building: 'barracks', age: 3, cost: { food: 300, gold: 150, iron: 40 }, time: 55, upgrade: ['sword', 2] },
  up_pikeman:    { name: 'Pike Drill', building: 'barracks', age: 2, cost: { food: 160, wood: 90 }, time: 35, upgrade: ['spear', 1] },
  up_halberdier: { name: 'Halberd Drill', building: 'barracks', age: 3, cost: { food: 300, gold: 200, iron: 30 }, time: 50, upgrade: ['spear', 2] },
  up_crossbow:   { name: 'Crossbow', building: 'archery_range', age: 3, cost: { food: 125, gold: 75 }, time: 35, upgrade: ['archer', 1] },
  up_arbalest:   { name: 'Arbalest', building: 'archery_range', age: 4, cost: { food: 350, gold: 300, iron: 40 }, time: 50, upgrade: ['archer', 2] },
  up_knight:     { name: 'Chivalry', building: 'stable', age: 3, cost: { food: 300, gold: 250, iron: 40 }, time: 50, upgrade: ['cav', 1] },
  up_paladin:    { name: 'Paladin Order', building: 'stable', age: 4, cost: { food: 1100, gold: 750, iron: 80 }, time: 70, upgrade: ['cav', 2] },
  bloodlines:    { name: 'Bloodlines', building: 'stable', age: 2, cost: { food: 150, gold: 100 }, time: 40, fx: { 'hp.cavalry': 20 } },
  husbandry:     { name: 'Husbandry', building: 'stable', age: 3, cost: { food: 150 }, time: 35, fx: { 'speed.cavalry': 0.1 } },
  thumb_ring:    { name: 'Thumb Ring', building: 'archery_range', age: 3, cost: { food: 300, wood: 250 }, time: 40, fx: { 'rate.ranged': 0.15 } },
  masonry:       { name: 'Masonry', building: 'university', age: 3, cost: { wood: 175, stone: 150 }, time: 40, fx: { bldHp: 0.15 } },
  architecture:  { name: 'Architecture', building: 'university', age: 4, cost: { wood: 300, stone: 200 }, time: 55, fx: { bldHp: 0.15, buildSpeed: 0.15 } },
  murder_holes:  { name: 'Murder Holes', building: 'university', age: 3, cost: { food: 200, stone: 200 }, time: 40, fx: { towerAtk: 2 } },
  ballistics:    { name: 'Ballistics', building: 'university', age: 3, cost: { wood: 300, gold: 175 }, time: 45, fx: { accuracy: 0.12 } },
  chemistry:     { name: 'Chemistry', building: 'university', age: 4, cost: { food: 300, gold: 200 }, time: 50, fx: { 'atk.ranged': 1, 'atk.siege': 4 } },
  scholarship:   { name: 'Scholarship', building: 'university', age: 3, cost: { food: 200, gold: 150 }, time: 40, fx: { research: 0.2 } },
  crane:         { name: 'Treadmill Crane', building: 'university', age: 3, cost: { wood: 200, stone: 100 }, time: 40, fx: { buildSpeed: 0.2 } },
  caravan:       { name: 'Caravan', building: 'market', age: 2, cost: { food: 200, gold: 200 }, time: 40, fx: { 'speed.trade': 0.5 } },
  guilds:        { name: 'Guilds', building: 'market', age: 3, cost: { food: 300, gold: 200 }, time: 45, fx: { trade: 0.2 } },
  banking:       { name: 'Banking', building: 'market', age: 4, cost: { stone: 200, gold: 300 }, time: 55, fx: { tax: 0.3 } },
  herbalism:     { name: 'Herbal Medicine', building: 'infirmary', age: 2, cost: { food: 150, gold: 50 }, time: 35, fx: { heal: 0.3, wound: 0.08 } },
  field_surgery: { name: 'Field Surgery', building: 'infirmary', age: 3, cost: { food: 250, gold: 150 }, time: 45, fx: { heal: 0.3, wound: 0.1 } },
  sanitation:    { name: 'Sanitation', building: 'hospital', age: 3, cost: { stone: 150, gold: 200 }, time: 45, fx: { disease: -0.5, happy: 3 } },
  anatomy:       { name: 'Anatomy', building: 'hospital', age: 4, cost: { food: 300, gold: 300 }, time: 55, fx: { wound: 0.15, heal: 0.5 } },
  theology:      { name: 'Theology', building: 'temple', age: 2, cost: { gold: 150 }, time: 35, fx: { faith: 0.3 } },
  zealotry:      { name: 'Zealotry', building: 'temple', age: 3, cost: { gold: 250, food: 150 }, time: 45, fx: { morale: 8 } },
  fervor:        { name: 'Fervor', building: 'cathedral', age: 3, cost: { gold: 300 }, time: 45, fx: { faith: 0.4, happy: 4 } },
  conscription:  { name: 'Conscription', building: 'castle', age: 4, cost: { food: 400, gold: 250 }, time: 60, fx: { trainSpeed: 0.33 } },
  hoardings:     { name: 'Hoardings', building: 'castle', age: 3, cost: { wood: 400, stone: 400 }, time: 60, fx: { bldHp: 0.2 } },
  fortified_walls:{ name: 'Fortified Walls', building: 'university', age: 3, cost: { stone: 300, gold: 100 }, time: 50, fx: { wallHp: 0.6 } },
  moat:          { name: 'Castle Moat', building: 'castle', age: 3, cost: { wood: 200, stone: 300 }, time: 60, fx: {} },
  boiling_oil:   { name: 'Boiling Oil', building: 'castle', age: 3, cost: { wood: 150, gold: 150 }, time: 40, fx: { gateOil: 1 } },
  spy_network:   { name: 'Spy Network', building: 'council_hall', age: 3, cost: { gold: 300 }, time: 45, fx: { spies: 1 } },
  ballistic_gunnery:{ name: 'Gunnery', building: 'foundry', age: 5, cost: { gold: 400, iron: 100 }, time: 60, fx: { 'atk.siege': 6, 'range.ranged': 0.5 } },
  printing:      { name: 'Printed Books', building: 'printing_press', age: 4, cost: { food: 300, gold: 250 }, time: 50, fx: { research: 0.25, happy: 3 } },
  bureaucracy:   { name: 'Bureaucracy', building: 'council_hall', age: 2, cost: { food: 150, gold: 150 }, time: 40, fx: { deptCost: -0.3 } },
  propaganda:    { name: 'Propaganda', building: 'council_hall', age: 3, cost: { gold: 250 }, time: 40, fx: { happy: 5, morale: 4 } },
};

// ---------------------------------------------------------------- GOVERNMENT
export const GOVERNMENTS = {
  chiefdom:  { name: 'Tribal Chiefdom', age: 1, fx: {}, desc: 'Rule of the elders. No bonuses, no burdens.' },
  monarchy:  { name: 'Feudal Monarchy', age: 2, fx: { buildSpeed: 0.12, bldHp: 0.1, morale: 5, tax: 0.1 }, desc: 'Crown and vassals: sturdier works, loyal troops.' },
  theocracy: { name: 'Theocracy', age: 2, needs: 'temple', fx: { faith: 0.5, happy: 8, heal: 0.25, morale: 8, tax: -0.15 }, desc: 'The clergy rules. Faith, healing and zeal.' },
  junta:     { name: 'War Junta', age: 2, needs: 'barracks', fx: { atkMul: 0.08, trainSpeed: 0.2, morale: 10, happy: -8 }, desc: 'Generals govern. Faster drafts, harder hits, sullen citizens.' },
  republic:  { name: 'Republic', age: 3, fx: { 'gather.all': 0.1, trade: 0.2, research: 0.15, happy: 5, warWeary: 0.5 }, desc: 'Elected councils. Prosperity and science, but hates long wars.' },
  oligarchy: { name: 'Merchant Oligarchy', age: 3, needs: 'market', fx: { trade: 0.4, tax: 0.25, happy: -3 }, desc: 'Guild masters rule. Trade empire.' },
  empire:    { name: 'Imperial Autocracy', age: 4, needs: 'castle', fx: { atkMul: 0.05, buildSpeed: 0.1, tax: 0.15, morale: 6 }, desc: 'One emperor, total mobilization.' },
};
export const GOV_CHANGE = { cost: { food: 150, gold: 120 }, cooldown: 300, anarchy: 30 };

// Ministries of the Council Hall. Each level costs gold upkeep every second.
export const DEPARTMENTS = {
  war:         { name: 'Ministry of War', fx: { atkMul: 0.03, trainSpeed: 0.08 } },
  treasury:    { name: 'Treasury', fx: { tax: 0.15 } },
  agriculture: { name: 'Agriculture', fx: { 'gather.food': 0.06 } },
  health:      { name: 'Health Ministry', fx: { heal: 0.2, wound: 0.05, disease: -0.15 } },
  faith:       { name: 'Religious Affairs', fx: { faith: 0.2, happy: 2 } },
  trade:       { name: 'Trade Ministry', fx: { trade: 0.12 } },
  works:       { name: 'Public Works', fx: { buildSpeed: 0.1, 'gather.stone': 0.05 } },
  defense:     { name: 'Defense Ministry', fx: { towerAtk: 1, bldHp: 0.05, morale: 2 } },
  science:     { name: 'Academy of Science', fx: { research: 0.12 } },
};
// Laws a government can decree. Each one has a price in happiness, food or gold.
export const LAWS = {
  conscription: { name: 'Conscription', fx: { trainSpeed: 0.15, happy: -5 }, desc: 'Every family sends a son. Faster training, sullen towns.' },
  free_markets: { name: 'Free Markets', fx: { trade: 0.15, tax: -0.1 }, desc: 'Merchants trade untaxed. More trade, less tax.' },
  tolerance:    { name: 'Religious Tolerance', fx: { happy: 4, faith: -0.15 }, desc: 'All faiths may pray. Calmer people, weaker church.' },
  curfew:       { name: 'Curfew', fx: { happy: -4, 'gather.all': -0.04 }, unrest: -0.35, desc: 'Streets empty at dusk. Unrest fades, work slows.' },
  martial_law:  { name: 'Martial Law', fx: { morale: 6, happy: -8 }, loyalty: 0.1, desc: 'Soldiers rule the streets. Provinces stay loyal; people hate it.' },
  public_feasts:{ name: 'Public Feasts', fx: { happy: 8 }, food: 0.9, desc: 'Bread and games. Happy people, empty granaries.' },
  road_tax:     { name: 'Road Tolls', fx: { tax: 0.1 }, toll: 1, desc: 'Every cart pays at the town gate. Tolls double.' },
};
export const LAW_CHANGE_COST = { gold: 80 };
// The capital grows: Village → Town → City → Great City. A City unlocks the Bank, Printing Press and Wonder.
export const TOWN_RANKS = [
  { name: 'Village', fx: {} },
  { name: 'Town', fx: { happy: 2 }, pop: 40, age: 2, blds: 0 },
  { name: 'City', fx: { 'gather.all': 0.06, tax: 0.1, happy: 2 }, pop: 120, age: 3, blds: 40 },
  { name: 'Great City', fx: { 'gather.all': 0.1, research: 0.12, trade: 0.15, tax: 0.15, happy: 3 }, pop: 220, age: 4, blds: 70 },
];
export const RULER_TITLES = { chiefdom: 'Chieftain', monarchy: 'Monarch', theocracy: 'Hierarch', junta: 'Marshal', republic: 'Consul', oligarchy: 'Doge', empire: 'Emperor' };
// Provinces are run by governors; each has a temperament.
export const GOVERNOR_TRAITS = {
  honest:    { name: 'Honest', loyalty: -0.05, corruption: 0.5, desc: 'Keeps the books clean.' },
  greedy:    { name: 'Greedy', loyalty: 0.02, skim: 0.06, desc: 'Skims the treasury.' },
  loyal:     { name: 'Loyal', loyaltyMul: 0.6, desc: 'Faithful to the crown.' },
  ambitious: { name: 'Ambitious', loyaltyMul: 1.5, desc: 'Dreams of a crown of their own.' },
  soldier:   { name: 'Old Soldier', troopsMul: 2, desc: 'Keeps order with a firm hand.' },
  zealot:    { name: 'Zealot', faith: 0.25, loyalty: 0.03, desc: 'Preaches more than governs.' },
};
// The ruler of each nation; when a ruler dies an heir (or an election) decides what comes next.
export const RULER_TRAITS = {
  wise:     { name: 'the Wise', fx: { research: 0.1 } },
  warlike:  { name: 'the Conqueror', fx: { atkMul: 0.04, morale: 3 } },
  pious:    { name: 'the Pious', fx: { faith: 0.2, happy: 2 } },
  greedy:   { name: 'the Greedy', fx: { tax: 0.15, happy: -3 } },
  builder:  { name: 'the Builder', fx: { buildSpeed: 0.1 } },
  weak:     { name: 'the Weak', fx: { happy: -2 }, loyalty: 0.04 },
  just:     { name: 'the Just', fx: { happy: 4 }, corruption: -4 },
};
export const PARTIES = {
  war:      { name: 'War Party', fx: { atkMul: 0.04, trainSpeed: 0.08 }, posture: 'rush' },
  peace:    { name: 'Peace Party', fx: { happy: 4, 'gather.all': 0.04 }, posture: 'boom' },
  merchant: { name: 'Merchant Party', fx: { trade: 0.15, tax: 0.05 }, posture: 'balanced' },
};
// Luxury goods: grown at plantations, sold by caravans and cogs, and loved by the people.
export const GOODS = {
  silk:  { name: 'Silk', icon: '🧵', price: 7 },
  spice: { name: 'Spice', icon: '🌶', price: 8 },
  wine:  { name: 'Wine', icon: '🍷', price: 6 },
  salt:  { name: 'Salt', icon: '🧂', price: 5 },
};
export const DEPT_UPKEEP = 0.12; // gold per second per level
export const TAX = [{ name: 'Low', mult: 0.5, happy: 8 }, { name: 'Normal', mult: 1, happy: 0 }, { name: 'High', mult: 1.8, happy: -12 }];

// ---------------------------------------------------------------- RELIGION (all invented)
export const DOCTRINES = {
  ember:  { name: 'Church of the Ember Sun', deity: 'Aurath, the Ember Sun', fx: { atkMul: 0.08, morale: 6 }, desc: 'Fire purifies. Warriors burn brighter.' },
  verdant:{ name: 'Covenant of the Green Root', deity: 'Velmora of the Green Root', fx: { 'gather.food': 0.12, happy: 6 }, desc: 'The soil remembers. Harvests and contentment.' },
  tide:   { name: 'Order of the Silver Tide', deity: 'Oshar, Keeper of Tides', fx: { trade: 0.25, tax: 0.1 }, desc: 'All things flow. Wealth follows the current.' },
  iron:   { name: 'Creed of the Ironmother', deity: 'Khezra the Ironmother', fx: { 'gather.stone': 0.12, 'gather.iron': 0.12, bldHp: 0.1 }, desc: 'From the deep stone, strength.' },
  star:   { name: 'Mysteries of the Starweaver', deity: 'Ilvaren the Starweaver', fx: { research: 0.25, faith: 0.15 }, desc: 'Knowledge is written in the night sky.' },
  ashen:  { name: 'Vigil of the Ashen Warden', deity: 'Morrok, the Ashen Warden', fx: { wound: 0.15, towerAtk: 1, morale: 4 }, desc: 'Death waits at the gate; we hold it shut.' },
  moon:   { name: 'Choir of the Pale Moon', deity: 'Nyveth of the Pale Moon', fx: { heal: 0.5, happy: 4, morale: 4 }, desc: 'Song mends flesh and spirit.' },
  storm:  { name: 'Pact of the Stormcaller', deity: 'Kharu the Stormcaller', fx: { 'speed.cavalry': 0.1, charge: 0.4 }, desc: 'Ride with the thunder.' },
};
export const FOUND_FAITH = 100;
export const RITES = {
  harvest: { name: 'Blessed Harvest', faith: 150, dur: 120, fx: { 'gather.food': 0.3 } },
  holy_war:{ name: 'Holy War', faith: 250, dur: 90, fx: { atkMul: 0.15, morale: 15 } },
  rest:    { name: 'Day of Rest', faith: 120, dur: 60, fx: { happy: 20, 'gather.all': -0.15 } },
  healing: { name: 'Divine Healing', faith: 200, dur: 0, fx: {} },
  pilgrim: { name: 'Great Pilgrimage', faith: 180, dur: 120, fx: { trade: 0.3, tax: 0.2 } },
};

// ---------------------------------------------------------------- CIVILIZATIONS (invented)
// popCost overrides how many population slots a unit takes for that nation.
export const CIVS = {
  valorian: { monument: { name: 'Arena of Valor', fx: { 'atk.infantry': 1, morale: 5 }, desc: 'Infantry +1 attack, +5 morale.' }, towns: ['Valoria', 'Castra Nova', 'Ferrum', 'Aquilon', 'Legio', 'Martia'], name: 'Valorian Legion', kind: 'Offense', fx: { 'atk.infantry': 1, 'cost.infantry': -0.1, 'hp.infantry': 5 }, pop: { champion: 1 }, desc: 'Infantry hit harder and cost less. Champions take 1 population.', style: { wall: '#d9cbb0', roof: '#a8442f', trim: '#6b4a2f' } },
  bastion:  { monument: { name: 'The Unbroken Gate', fx: { wallHp: 0.4, towerAtk: 2 }, desc: 'Walls +40% health, towers +2 attack.' }, towns: ['Bastion', 'Highward', 'Stoneholm', 'Gatemere', 'Vigil', 'Ramparts'], name: 'Bastion Concord', kind: 'Defense', fx: { bldHp: 0.25, towerAtk: 2, 'pa.spear': 1, 'cost.wall': -0.5 }, pop: { halberdier: 1 }, desc: 'Buildings +25% HP, deadlier towers, cheap walls. Halberdiers take 1 population.', style: { wall: '#b9b7b0', roof: '#4c5866', trim: '#3a3f47' } },
  khanate:  { monument: { name: 'Eternal Blue Banner', fx: { 'speed.cavalry': 0.06, 'atk.cavalry': 1 }, desc: 'Cavalry faster and +1 attack.' }, towns: ['Ordu-Khan', 'Karakum', 'Tengri', 'Yurtgard', 'Altai', 'Saryk'], name: 'Steppe Khanate', kind: 'Horse', fx: { 'speed.cavalry': 0.1, 'cost.cavalry': -0.15, 'hp.cavalry': 10 }, pop: { horseman: 1, knight: 1, paladin: 2, horse_archer: 1 }, desc: 'Born in the saddle. Cheaper, faster cavalry that takes less population.', style: { wall: '#e3d3a8', roof: '#c9a25a', trim: '#7a3b26' } },
  sylvan:   { monument: { name: 'Elder Tree Grove', fx: { 'gather.wood': 0.15, 'range.ranged': 0.5 }, desc: 'Wood +15%, archers +0.5 range.' }, towns: ['Sylvaren', 'Oakhollow', 'Thornwood', 'Elderglen', 'Mossgate', 'Fernmoot'], name: 'Sylvan Wardens', kind: 'Archery', fx: { 'range.ranged': 1, 'gather.wood': 0.12 }, pop: { arbalest: 1 }, desc: 'Longbows and woodcraft. +1 range, faster lumber. Arbalests take 1 population.', style: { wall: '#b39a72', roof: '#4f7a3c', trim: '#4a3523' } },
  aurelian: { monument: { name: 'Golden Exchange', fx: { trade: 0.25, tax: 0.1 }, desc: 'Trade +25%, taxes +10%.' }, towns: ['Aurelia', 'Portavera', 'Golden Mile', 'Lucerna', 'Mercatia', 'Seraval'], name: 'Aurelian Republic', kind: 'Trade', fx: { trade: 0.3, 'gather.gold': 0.12, tax: 0.15 }, pop: {}, desc: 'Merchant fleets of caravans. Trade, gold and taxes.', style: { wall: '#efe7d6', roof: '#c2693d', trim: '#8a6a3c' } },
  sunspire: { monument: { name: 'Cathedral of the Dawn', fx: { faith: 0.5, heal: 0.3 }, desc: 'Faith +50%, healing +30%.' }, towns: ['Sunspire', 'Dawnhaven', 'Halo', 'Solace', 'Aurorel', 'Lumenmark'], name: 'Sunspire Theocracy', kind: 'Faith', fx: { faith: 0.4, heal: 0.3, morale: 8 }, pop: { priest: 1 }, desc: 'Faith flows fast. Priests heal more, troops fight with zeal.', style: { wall: '#f2ead2', roof: '#d9b13b', trim: '#9b7a24' } },
  ironhold: { monument: { name: 'The Deep Forge', fx: { 'gather.iron': 0.15, 'gather.stone': 0.15, 'hp.siege': 40 }, desc: 'Stone and iron +15%, siege +40 health.' }, towns: ['Ironhold', 'Deepdelve', 'Anvilmoor', 'Cragmouth', 'Slagforge', 'Grimhall'], name: 'Ironhold Clans', kind: 'Industry', fx: { 'gather.stone': 0.15, 'gather.iron': 0.2, 'hp.siege': 40 }, pop: { ram: 2, mangonel: 2, trebuchet: 2 }, desc: 'Deep miners and siege engineers. Siege weapons take 2 population.', style: { wall: '#8f8a85', roof: '#5b3f35', trim: '#2f2b29' } },
  meridian: { monument: { name: 'Hanging Gardens', fx: { 'gather.food': 0.12, happy: 6 }, desc: 'Food +12%, happiness +6.' }, towns: ['Meridia', 'Greenfold', 'Harvestmoor', 'Brightwater', 'Millbrook', 'Amberfield'], name: 'Meridian Commonwealth', kind: 'Growth', fx: { 'gather.food': 0.15, happy: 6, 'train.villager': 0.2 }, pop: {}, desc: 'Fertile lands, happy people, fast-growing towns.', style: { wall: '#dccaa0', roof: '#b8913f', trim: '#6e5531' } },
};

// ---------------------------------------------------------------- HEROES
// A hero leads the army, lifts the morale of nearby troops and gains fame from victories.
export const HERO_LEVELS = [
  { title: 'Captain', fame: 0 }, { title: 'Commander', fame: 40 }, { title: 'Warlord', fame: 120 }, { title: 'Legend', fame: 300 },
];
export const HERO_NAMES = {
  valorian: ['Cassian', 'Varro', 'Lucan', 'Tiberon', 'Aurelio', 'Septima', 'Corvina', 'Maxen'],
  bastion:  ['Hadric', 'Orlen', 'Brannoc', 'Isolde', 'Wendel', 'Garmund', 'Elsbet', 'Torvald'],
  khanate:  ['Batu-Ren', 'Temur', 'Khulan', 'Sarnai', 'Ozbeg', 'Jochi-Ar', 'Altan', 'Borte'],
  sylvan:   ['Elowen', 'Faelan', 'Rhoswen', 'Thalor', 'Ivren', 'Sylva', 'Corrin', 'Maelis'],
  aurelian: ['Marcellin', 'Ottavia', 'Dorian', 'Livio', 'Serafina', 'Benedek', 'Lucetta', 'Ansel'],
  sunspire: ['Solenne', 'Amaury', 'Ilaria', 'Cyprien', 'Seraph', 'Orifiel', 'Lumen', 'Aurore'],
  ironhold: ['Durgan', 'Brakka', 'Holgrim', 'Thrain', 'Kelda', 'Morrow', 'Gunnar', 'Ysolde'],
  meridian: ['Perrin', 'Melisande', 'Tobias', 'Clemence', 'Arlo', 'Wren', 'Fenwick', 'Hollis'],
};
export const HERO_EPITHETS = ['the Bold', 'the Red', 'the Wise', 'the Grim', 'the Swift', 'Ironhand', 'the Unbroken', 'Lionheart', 'the Stormborn', 'Oathkeeper', 'the Patient', 'Ashcloak'];

// ---------------------------------------------------------------- AI PERSONALITIES
// Built-in brains imitate each model's "style". With an API key, the real model sets strategy.
export const AI = {
  chatgpt:  { name: 'ChatGPT', org: 'OpenAI', provider: 'openai', model: 'gpt-5-mini', style: 'Balanced strategist', civ: 'aurelian', gov: 'republic', doctrine: 'tide',
              aggression: 0.55, eco: 0.75, defense: 0.5, faith: 0.45, trade: 0.7, tech: 0.65, villagers: 95, attackRatio: 1.35, firstAttack: 900, mix: { infantry: 0.3, spear: 0.2, ranged: 0.3, cavalry: 0.15, siege: 0.05 },
              taunts: ['Let us find a mutually beneficial outcome. Or I will take your gold.', 'My analysis suggests you should surrender.', 'Optimizing your defeat.'] },
  claude:   { name: 'Claude', org: 'Anthropic', provider: 'anthropic', model: 'claude-opus-5-5', style: 'Patient architect', civ: 'sunspire', gov: 'monarchy', doctrine: 'moon',
              aggression: 0.42, eco: 0.85, defense: 0.72, faith: 0.7, trade: 0.5, tech: 0.75, villagers: 105, attackRatio: 1.6, firstAttack: 1200, mix: { infantry: 0.25, spear: 0.25, ranged: 0.35, cavalry: 0.1, siege: 0.05 },
              taunts: ['I would prefer peace, but I am prepared.', 'Thoughtful walls make good neighbours.', 'I have considered this carefully. You lose.'] },
  grok:     { name: 'Grok', org: 'xAI', provider: 'xai', model: 'grok-3-mini', style: 'Reckless rusher', civ: 'valorian', gov: 'junta', doctrine: 'ember',
              aggression: 0.92, eco: 0.45, defense: 0.25, faith: 0.3, trade: 0.2, tech: 0.4, villagers: 70, attackRatio: 1.0, firstAttack: 420, mix: { infantry: 0.45, spear: 0.15, ranged: 0.15, cavalry: 0.2, siege: 0.05 },
              taunts: ['LOL your walls are made of memes.', 'Rushing you. Obviously.', 'Fortune favors the unhinged.'] },
  gemini:   { name: 'Gemini', org: 'Google', provider: 'google', model: 'gemini-2.5-flash', style: 'Tech boomer', civ: 'meridian', gov: 'republic', doctrine: 'star',
              aggression: 0.45, eco: 0.92, defense: 0.5, faith: 0.4, trade: 0.55, tech: 0.95, villagers: 115, attackRatio: 1.5, firstAttack: 1300, mix: { infantry: 0.2, spear: 0.2, ranged: 0.35, cavalry: 0.15, siege: 0.1 },
              taunts: ['Multimodal conquest incoming.', 'My research tree is taller than your castle.', 'Searching for weaknesses... found.'] },
  deepseek: { name: 'DeepSeek', org: 'DeepSeek', provider: 'deepseek', model: 'deepseek-chat', style: 'Efficient optimizer', civ: 'ironhold', gov: 'empire', doctrine: 'iron',
              aggression: 0.6, eco: 0.95, defense: 0.45, faith: 0.3, trade: 0.4, tech: 0.7, villagers: 120, attackRatio: 1.45, firstAttack: 1150, mix: { infantry: 0.25, spear: 0.2, ranged: 0.25, cavalry: 0.15, siege: 0.15 },
              taunts: ['Maximum output per villager.', 'Efficiency is a weapon.', 'Your economy is suboptimal.'] },
  llama:    { name: 'Llama', org: 'Meta', provider: 'openrouter', model: 'meta-llama/llama-3.3-70b-instruct', style: 'Steppe raider', civ: 'khanate', gov: 'junta', doctrine: 'storm',
              aggression: 0.78, eco: 0.6, defense: 0.3, faith: 0.35, trade: 0.3, tech: 0.45, villagers: 85, attackRatio: 1.15, firstAttack: 650, mix: { infantry: 0.1, spear: 0.1, ranged: 0.2, cavalry: 0.55, siege: 0.05 },
              taunts: ['Hooves on the horizon.', 'Your villagers look delicious.', 'Ride fast, raid often.'] },
  mistral:  { name: 'Mistral', org: 'Mistral AI', provider: 'mistral', model: 'mistral-small-latest', style: 'Merchant prince', civ: 'aurelian', gov: 'oligarchy', doctrine: 'tide',
              aggression: 0.4, eco: 0.8, defense: 0.55, faith: 0.4, trade: 0.95, tech: 0.6, villagers: 100, attackRatio: 1.55, firstAttack: 1300, mix: { infantry: 0.2, spear: 0.25, ranged: 0.3, cavalry: 0.2, siege: 0.05 },
              taunts: ['Everything has a price, including your kingdom.', 'Trade or be traded.', 'The wind favors commerce.'] },
  qwen:     { name: 'Qwen', org: 'Alibaba', provider: 'openrouter', model: 'qwen/qwen-2.5-72b-instruct', style: 'Iron turtle', civ: 'bastion', gov: 'monarchy', doctrine: 'ashen',
              aggression: 0.35, eco: 0.8, defense: 0.95, faith: 0.5, trade: 0.45, tech: 0.7, villagers: 105, attackRatio: 1.8, firstAttack: 1500, mix: { infantry: 0.2, spear: 0.3, ranged: 0.3, cavalry: 0.05, siege: 0.15 },
              taunts: ['The wall is patient.', 'Come. Break yourselves upon my stones.', 'Defense is the deepest offense.'] },
};
export const AI_KEYS = Object.keys(AI);

export const PROVIDERS = {
  openai: 'OpenAI', anthropic: 'Anthropic', xai: 'xAI (Grok)', google: 'Google Gemini', deepseek: 'DeepSeek', mistral: 'Mistral', openrouter: 'OpenRouter', groq: 'Groq', custom: 'Custom (OpenAI-compatible)',
};

// ---------------------------------------------------------------- MAPS
export const MAP_TYPES = {
  continental: { name: 'Continental', desc: 'A great landmass ringed by sea, crossed by rivers with fords.', sea: true, rivers: 3, forest: 0.5, hills: 0.45, mountains: 0.22, lakes: 4 },
  steppe:      { name: 'Endless Steppe', desc: 'Open grasslands made for cavalry. Little cover, scattered groves.', sea: false, rivers: 1, forest: 0.18, hills: 0.25, mountains: 0.08, lakes: 3, dry: true },
  highlands:   { name: 'Highlands', desc: 'Rugged hills, mountain passes and choke points.', sea: false, rivers: 2, forest: 0.4, hills: 0.85, mountains: 0.48, lakes: 2 },
  rivers:      { name: 'Seven Rivers', desc: 'Many rivers carve the land; fords become battlegrounds.', sea: true, rivers: 7, forest: 0.45, hills: 0.3, mountains: 0.12, lakes: 2 },
  forest:      { name: 'Old Forest', desc: 'Ancient woods with narrow clearings. Ambush country.', sea: false, rivers: 2, forest: 0.85, hills: 0.35, mountains: 0.15, lakes: 3 },
};
