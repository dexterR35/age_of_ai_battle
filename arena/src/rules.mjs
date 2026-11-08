// Adapted from ../ageofai/data/rules.yaml and engine/formulas.py.
// Match rates are per simulation second; the original multi-day balance is compressed.
export const VERSION = '2.0.0';
export const RESOURCES = ['food', 'wood', 'stone', 'ore', 'gold', 'metal', 'coins'];
export const COLORS = ['#438ff4', '#ed5c53', '#4aba78', '#e7b24d', '#af79e0', '#52bfd0', '#df7fab', '#c5cf69'];
export const MAPS={desert:{name:'Golden Sands',description:'Open dunes, sheltered starting oases and rich mineral deposits.',terrain:'desert'},frontier:{name:'Great Frontier',description:'Vast open battlefields, sheltered starting estates and rich expansion sites.',terrain:'temperate'},riverlands:{name:'Riverlands',description:'A winding river, three bridges, and fertile woodlands.',terrain:'temperate'},highlands:{name:'Highlands',description:'Rolling hills, rich mineral deposits and open valleys.',terrain:'highland'},crossroads:{name:'Crossroads',description:'A sprawling woodland frontier with open clearings.',terrain:'woodland'}};
export const AGES = ['Settlement', 'Feudal', 'Castle', 'Imperial'];
export const ageOf = level => Math.min(3, Math.floor((level - 1) / 3));
export const BUILDINGS = {
  treasury:{name:'Treasury',cost:{wood:180,stone:180,gold:100},time:75,hp:550,level:5,max:1},
  engineering:{name:'Engineering bureau',cost:{wood:240,stone:140,metal:40},time:80,hp:500,level:5,max:1},
  embassy:{name:'Embassy',cost:{wood:180,stone:120,gold:120},time:70,hp:450,level:5,max:1},
  hospital:{name:'Hospital',cost:{wood:220,stone:160,gold:80},time:85,hp:500,level:6,max:2},
  outpost: {name:'Frontier outpost',cost:{wood:220,stone:130,coins:60},time:70,hp:700,level:3,max:8},
  lumbercamp:{name:'Lumber camp',cost:{wood:80,stone:20},time:35,hp:350,level:1,max:4},
  quarry:{name:'Stone quarry',cost:{wood:130,stone:40},time:50,hp:420,level:2,max:4},
  ironmine:{name:'Iron mine',cost:{wood:160,stone:90},time:60,hp:450,level:3,max:4},
  goldmine:{name:'Gold mine',cost:{wood:170,stone:100,coins:40},time:65,hp:450,level:3,max:4},
  refinery:{name:'Ore refinery',cost:{wood:220,stone:150,ore:100,coins:90},time:90,hp:600,level:4,max:3},
  town: {name:'Town center',cost:{},time:0,hp:1800,level:1,max:1},
  house: {name:'House',cost:{wood:65},time:25,hp:220,level:1,max:24},
  farm: {name:'Farm',cost:{wood:80},time:30,hp:160,level:1,max:25},
  depot: {name:'Supply depot',cost:{wood:90,stone:35},time:35,hp:300,level:1,max:4},
  granary: {name:'Granary',cost:{wood:120,stone:40},time:35,hp:300,level:1,max:3},
  barracks: {name:'Barracks',cost:{wood:160,stone:50},time:45,hp:550,level:2,max:4},
  range: {name:'Archery range',cost:{wood:170,stone:60},time:50,hp:450,level:3,max:3},
  tower: {name:'Watchtower',cost:{wood:70,stone:130},time:50,hp:650,level:3,max:6},
  forge: {name:'Forge',cost:{wood:140,stone:90,ore:60},time:55,hp:450,level:3,max:1},
  market: {name:'Market',cost:{wood:160,stone:60,gold:40},time:45,hp:400,level:3,max:1},
  stable: {name:'Stable',cost:{wood:190,stone:90},time:55,hp:550,level:4,max:3},
  library: {name:'Library',cost:{wood:180,stone:100,gold:60},time:60,hp:400,level:4,max:1},
  government: {name:'Council hall',cost:{wood:200,stone:140,gold:80},time:65,hp:650,level:4,max:1},
  wall: {name:'Fortifications',cost:{stone:180,wood:40},time:50,hp:1100,level:4,max:4},
  mint: {name:'Gold refinery & mint',cost:{wood:130,stone:160,ore:70},time:75,hp:450,level:5,max:1},
  temple: {name:'Temple',cost:{wood:140,stone:180,gold:100},time:60,hp:550,level:5,max:1},
  academy: {name:'Academy',cost:{wood:220,stone:160,gold:120},time:75,hp:550,level:6,max:1,requires:'library'},
  workshop: {name:'Siege workshop',cost:{wood:240,stone:120,ore:100},time:65,hp:600,level:6,max:2},
  keep: {name:'Keep',cost:{stone:500,wood:200,gold:150},time:100,hp:1400,level:7,max:2},
  wonder: {name:'Wonder',cost:{wood:1000,stone:1400,gold:800,ore:300},time:240,hp:2200,level:10,max:1,requires:'academy'}
};
export const BUILDING_REQUIREMENTS={treasury:{government:1,market:2},engineering:{government:1,forge:2},embassy:{government:1,library:1},hospital:{temple:1,library:2},
  lumbercamp:{depot:1},house:{lumbercamp:1},farm:{lumbercamp:1},quarry:{depot:1,lumbercamp:1},barracks:{house:1,lumbercamp:1},
  ironmine:{quarry:1,depot:1},goldmine:{quarry:1},forge:{ironmine:1,quarry:1},refinery:{forge:1,ironmine:2},
  range:{barracks:2},tower:{barracks:1,quarry:1},granary:{farm:1},stable:{barracks:2,farm:1},market:{depot:2,lumbercamp:1},
  library:{market:1,house:2},government:{library:1},wall:{quarry:2,barracks:2},mint:{goldmine:2,market:1},temple:{library:2,quarry:2},
  academy:{library:3,government:1},workshop:{forge:2,refinery:2},keep:{barracks:3,wall:2},wonder:{academy:3,government:3,temple:2},outpost:{depot:1,barracks:1}
};
for(const [type,requires]of Object.entries(BUILDING_REQUIREMENTS))BUILDINGS[type].requires=requires;
export const TOWN_REQUIREMENTS={2:{house:1,lumbercamp:1},3:{barracks:1,quarry:1},4:{forge:1,ironmine:1},5:{library:1,market:1},6:{refinery:1,government:1},7:{academy:1,stable:1},8:{workshop:1,wall:2},9:{keep:2,library:3},10:{academy:3,government:3,temple:2}};
export const constructionSeconds=(type,level=1)=>Math.round(BUILDINGS[type].time*1.6**(level-1));
export const UNITS = {
  worker:{name:'Villager',building:'town',cost:{food:55},time:16,hp:30,attack:1,armor:0,range:1,speed:1.8,level:1,sight:7},
  scout:{name:'Scout',building:'town',cost:{food:65,coins:15},time:20,hp:45,attack:2,armor:0,range:1,speed:3,level:1,sight:13},
  militia:{name:'Militia',building:'barracks',cost:{food:40,wood:20,coins:10},time:18,hp:40,attack:4,armor:0,range:1.5,speed:1.65,level:2,sight:7},
  spearman:{name:'Spearman',building:'barracks',cost:{food:35,wood:25,coins:15},time:20,hp:45,attack:3,armor:0,range:1.8,speed:1.6,level:2,sight:7,bonus:{knight:3,scout:2}},
  archer:{name:'Archer',building:'range',cost:{food:30,wood:45,coins:10},time:22,hp:30,attack:5,armor:0,range:5,speed:1.5,level:3,sight:9,bonus:{spearman:1.5}},
  swordsman:{name:'Swordsman',building:'barracks',cost:{food:60,ore:10,metal:10,gold:15,coins:20},time:27,hp:60,attack:8,armor:2,range:1.5,speed:1.55,level:5,sight:7,bonus:{militia:1.5}},
  knight:{name:'Knight',building:'stable',cost:{food:80,ore:20,metal:20,gold:40,coins:40},time:35,hp:120,attack:10,armor:2,range:1.6,speed:2.7,level:5,sight:9,bonus:{archer:1.5}},
  ram:{name:'Battering ram',building:'workshop',cost:{wood:150,ore:40,metal:15,coins:50},time:48,hp:200,attack:40,armor:5,range:2,speed:1,level:6,sight:7,buildingsOnly:true}
};
export const TECH = {
  tools:{name:'Tools',building:'forge',max:5,cost:{wood:120,ore:70,coins:45},time:45},
  weapons:{name:'Weapons',building:'forge',requires:{refinery:1},max:5,cost:{ore:60,metal:35,gold:55,coins:60},time:50},
  armor:{name:'Armor',building:'forge',requires:{refinery:1},max:5,cost:{ore:60,metal:35,stone:50,coins:60},time:50},
  agriculture:{name:'Agriculture',building:'library',max:3,cost:{wood:180,gold:70},time:60},
  logistics:{name:'Logistics',building:'library',max:3,cost:{wood:140,ore:90,gold:60},time:55},
  tactics:{name:'Battle doctrine',building:'academy',max:3,cost:{gold:150,coins:100},time:70}
};
export const GOVERNMENTS = {monarchy:{name:'Monarchy',build:1.15,gather:1,tax:1.1,military:1},republic:{name:'Republic',build:1,gather:1.12,tax:1.2,military:1},military:{name:'War council',build:1,gather:1,tax:1,military:1.15}};
export const FORMATIONS = ['line','wedge','defensive'];
export const LIMITS = {population:300,workers:100,soldiers:200,queue:5,buildingLevel:5};
export const scaled = (cost,n=1,factor=1.45) => Object.fromEntries(Object.entries(cost).map(([k,v])=>[k,Math.round(v*factor**(n-1))]));
export const townCost = level => scaled({wood:180,stone:130,coins:65,...(level>=3?{ore:50}:{}),...(level>=6?{gold:80}:{})},level,1.30);
export const collectionRate = (carry,rate,mult,distance,speed) => carry/(carry/(rate*mult)+2*distance/speed);
export const damage = (attack,bonus,weapons,armor,upgrade,luck=1) => Math.max(1,attack*bonus+weapons-armor-upgrade)*luck;
export const PUBLIC_RULES = {version:VERSION,resources:RESOURCES,buildings:BUILDINGS,units:UNITS,technology:TECH,governments:GOVERNMENTS,limits:LIMITS,ages:AGES,formations:FORMATIONS,maps:MAPS};

export const DEPARTMENTS={
 research:{name:'Research team',building:'library',effect:'2 on-site scholars = base research speed'},
 agriculture:{name:'Agriculture',building:'granary',effect:'+8% food gathering per staff'},
 industry:{name:'Industry',building:'refinery',effect:'+8% raw-material gathering per staff'},
 treasury:{name:'Treasury',building:'treasury',effect:'+8% tax income per staff'},
 engineering:{name:'Public works',building:'engineering',effect:'+10% construction speed per staff'},
 health:{name:'Health',building:'hospital',effect:'+0.15 HP/s healing near town per staff'},
 diplomacy:{name:'Foreign affairs',building:'embassy',effect:'+30s to accepted truces per staff'}
};
