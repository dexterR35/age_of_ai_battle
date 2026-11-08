// Procedural sprites, drawn once into offscreen canvases and cached.
// Units are drawn at K px per screen px (zoom 1). Buildings at S.
import { shade, hexToRgb } from '../util.js';
import { CIVS, UNITS, BUILDINGS } from '../config.js';

export const HW = 32, HH = 16;   // half tile width/height at zoom 1
export const K = 2;              // unit sprite resolution
export const S = 1.5;            // building sprite resolution
const cache = new Map();
const mk = (w, h) => { const c = document.createElement('canvas'); c.width = Math.ceil(w); c.height = Math.ceil(h); return c; };
const SKIN = ['#e9c39b', '#d6a77a', '#b8825a', '#8d5b3b', '#f1d2b3'];

// ----------------------------------------------------------------------------- people
const LOOK = {
  villager:    { body: '#8a6d4b', legs: '#5a4632', helmet: 'hood', weapon: null, sash: true },
  scout:       { body: '#6f7d4e', legs: '#4b3b2a', helmet: 'cap', weapon: 'sword', mount: 'light' },
  militia:     { body: '#7a6a55', legs: '#4e3d2b', helmet: 'cap', weapon: 'sword', shield: 'round', team: 0.45 },
  swordsman:   { body: '#9aa2a8', legs: '#4e3d2b', helmet: 'helm', weapon: 'sword', shield: 'kite', armor: 'mail', team: 0.6 },
  champion:    { body: '#c7ccd1', legs: '#3d3d44', helmet: 'plume', weapon: 'greatsword', shield: 'kite', armor: 'plate', cape: true, team: 0.75 },
  spearman:    { body: '#7c6648', legs: '#4e3d2b', helmet: 'cap', weapon: 'spear', shield: 'round', team: 0.45 },
  pikeman:     { body: '#8c8f86', legs: '#4e3d2b', helmet: 'helm', weapon: 'pike', shield: 'round', armor: 'mail', team: 0.55 },
  halberdier:  { body: '#b9bec2', legs: '#3d3d44', helmet: 'kettle', weapon: 'halberd', armor: 'plate', team: 0.7 },
  archer:      { body: '#6b7a45', legs: '#4e3d2b', helmet: 'hood', weapon: 'bow', quiver: true, team: 0.45 },
  crossbowman: { body: '#8a7a5a', legs: '#4e3d2b', helmet: 'kettle', weapon: 'crossbow', quiver: true, armor: 'mail', team: 0.55 },
  arbalest:    { body: '#a7aaa3', legs: '#3d3d44', helmet: 'helm', weapon: 'crossbow', quiver: true, armor: 'plate', team: 0.65 },
  horseman:    { body: '#866a48', legs: '#4e3d2b', helmet: 'cap', weapon: 'sword', shield: 'round', mount: 'light', team: 0.5 },
  knight:      { body: '#b7bcc0', legs: '#3d3d44', helmet: 'greathelm', weapon: 'lance', shield: 'kite', armor: 'plate', mount: 'barded', team: 0.75 },
  paladin:     { body: '#dfe2e5', legs: '#3d3d44', helmet: 'plume', weapon: 'lance', shield: 'kite', armor: 'plate', cape: true, mount: 'armored', team: 0.85 },
  horse_archer:{ body: '#8a6f48', legs: '#4e3d2b', helmet: 'fur', weapon: 'bow', quiver: true, mount: 'light', team: 0.5 },
  priest:      { body: '#ece4cf', legs: '#ece4cf', helmet: 'mitre', weapon: 'staff', robe: true, team: 0.6 },
  medic:       { body: '#e8e8de', legs: '#5a5a52', helmet: 'hood', weapon: 'satchel', robe: true, team: 0.3 },
  musketeer:   { body: '#4f5f86', legs: '#3d3d44', helmet: 'kettle', weapon: 'musket', armor: 'mail', team: 0.65 },
  general:     { body: '#d9c28a', legs: '#3d3d44', helmet: 'crown', weapon: 'sword', shield: 'kite', armor: 'plate', cape: true, mount: 'armored', team: 0.9 },
};

function ell(c, x, y, rx, ry, fill) { c.beginPath(); c.ellipse(x, y, Math.max(0.1, rx), Math.max(0.1, ry), 0, 0, Math.PI * 2); c.fillStyle = fill; c.fill(); }
function line(c, x1, y1, x2, y2, w, col, cap = 'round') { c.beginPath(); c.moveTo(x1, y1); c.lineTo(x2, y2); c.lineWidth = w; c.strokeStyle = col; c.lineCap = cap; c.stroke(); }
function poly(c, pts, fill, stroke, lw = 0.6) { c.beginPath(); c.moveTo(pts[0], pts[1]); for (let i = 2; i < pts.length; i += 2) c.lineTo(pts[i], pts[i + 1]); c.closePath(); if (fill) { c.fillStyle = fill; c.fill(); } if (stroke) { c.lineWidth = lw; c.strokeStyle = stroke; c.stroke(); } }

function weaponDraw(c, kind, hx, hy, ang, team, o) {
  // hand at (hx,hy); ang = radians, 0 = pointing right
  const dx = Math.cos(ang), dy = Math.sin(ang);
  switch (kind) {
    case 'sword': line(c, hx - dx * 1.5, hy - dy * 1.5, hx + dx * 9, hy + dy * 9, 1.3, '#dfe4ea'); line(c, hx - dy * 1.6, hy + dx * 1.6, hx + dy * 1.6, hy - dx * 1.6, 1.1, '#8b6b2e'); break;
    case 'greatsword': line(c, hx - dx * 2, hy - dy * 2, hx + dx * 12, hy + dy * 12, 1.7, '#eef2f6'); line(c, hx - dy * 2.2, hy + dx * 2.2, hx + dy * 2.2, hy - dx * 2.2, 1.3, '#c9a540'); break;
    case 'spear': line(c, hx - dx * 7, hy - dy * 7, hx + dx * 12, hy + dy * 12, 1, '#7a5a34'); poly(c, [hx + dx * 15, hy + dy * 15, hx + dx * 11 - dy * 1.3, hy + dy * 11 + dx * 1.3, hx + dx * 11 + dy * 1.3, hy + dy * 11 - dx * 1.3], '#d8dde2'); break;
    case 'pike': line(c, hx - dx * 8, hy - dy * 8, hx + dx * 17, hy + dy * 17, 1, '#6e5030'); poly(c, [hx + dx * 20, hy + dy * 20, hx + dx * 16 - dy * 1.2, hy + dy * 16 + dx * 1.2, hx + dx * 16 + dy * 1.2, hy + dy * 16 - dx * 1.2], '#e2e6ea'); break;
    case 'halberd': line(c, hx - dx * 7, hy - dy * 7, hx + dx * 15, hy + dy * 15, 1.1, '#6e5030'); poly(c, [hx + dx * 12 - dy * 0.5, hy + dy * 12 + dx * 0.5, hx + dx * 15 - dy * 3.5, hy + dy * 15 + dx * 3.5, hx + dx * 16.5 - dy * 0.5, hy + dy * 16.5 + dx * 0.5], '#d6dbe0'); poly(c, [hx + dx * 18, hy + dy * 18, hx + dx * 15 + dy * 1, hy + dy * 15 - dx * 1, hx + dx * 15 - dy * 1, hy + dy * 15 + dx * 1], '#e8ecef'); break;
    case 'lance': line(c, hx - dx * 6, hy - dy * 6, hx + dx * 20, hy + dy * 20, 1.4, team); poly(c, [hx + dx * 23, hy + dy * 23, hx + dx * 19 - dy * 1, hy + dy * 19 + dx * 1, hx + dx * 19 + dy * 1, hy + dy * 19 - dx * 1], '#e8ecef'); poly(c, [hx + dx * 2 - dy * 2, hy + dy * 2 + dx * 2, hx + dx * 2 + dy * 2, hy + dy * 2 - dx * 2, hx + dx * 5, hy + dy * 5], '#bfc5ca'); break;
    case 'bow': { c.beginPath(); c.arc(hx, hy, 6, -Math.PI / 2 - 1.1, -Math.PI / 2 + 1.1 + Math.PI, true); c.lineWidth = 1.2; c.strokeStyle = '#6b4a24'; c.stroke(); const pull = o.draw || 0; line(c, hx + Math.cos(-Math.PI / 2 - 1.1 + Math.PI) * 6, hy - 5.4, hx - pull * 3, hy, 0.5, '#e8e0c8'); line(c, hx - pull * 3, hy, hx + Math.cos(-Math.PI / 2 - 1.1 + Math.PI) * 6, hy + 5.4, 0.5, '#e8e0c8'); if (pull > 0.3) line(c, hx - pull * 3, hy, hx + 5, hy, 0.6, '#c9b48a'); break; }
    case 'musket': line(c, hx - dx * 5, hy - dy * 5, hx + dx * 3, hy + dy * 3, 2, '#5a3b22'); line(c, hx + dx * 2, hy + dy * 2, hx + dx * 13, hy + dy * 13, 1.1, '#3a3d42'); if (o.anim === 'attack' && o.act < 0.4) { ell(c, hx + dx * 15, hy + dy * 15, 2.6, 2.6, 'rgba(255,210,120,0.9)'); ell(c, hx + dx * 18, hy + dy * 17, 4, 3, 'rgba(210,210,210,0.6)'); } break;
    case 'crossbow': line(c, hx - 4, hy, hx + 5, hy, 1.6, '#6b4a24'); line(c, hx + 4, hy - 3.5, hx + 4, hy + 3.5, 1, '#9aa0a6'); break;
    case 'axe': line(c, hx - dx * 2, hy - dy * 2, hx + dx * 7, hy + dy * 7, 1.1, '#7a5a34'); poly(c, [hx + dx * 6 - dy * 0.3, hy + dy * 6 + dx * 0.3, hx + dx * 7 - dy * 3, hy + dy * 7 + dx * 3, hx + dx * 8.5 - dy * 2.5, hy + dy * 8.5 + dx * 2.5, hx + dx * 8, hy + dy * 8], '#c3c8cc'); break;
    case 'pick': line(c, hx - dx * 2, hy - dy * 2, hx + dx * 7, hy + dy * 7, 1.1, '#7a5a34'); { const ex = hx + dx * 7, ey = hy + dy * 7; c.beginPath(); c.moveTo(ex - dy * 4, ey + dx * 4); c.quadraticCurveTo(ex + dx * 1.5, ey + dy * 1.5, ex + dy * 4, ey - dx * 4); c.lineWidth = 1.1; c.strokeStyle = '#a9aeb3'; c.stroke(); } break;
    case 'hoe': line(c, hx - dx * 3, hy - dy * 3, hx + dx * 8, hy + dy * 8, 1, '#7a5a34'); line(c, hx + dx * 8, hy + dy * 8, hx + dx * 8 + dy * 2.5, hy + dy * 8 - dx * 2.5, 1.3, '#9aa0a6'); break;
    case 'hammer': line(c, hx - dx * 1, hy - dy * 1, hx + dx * 6, hy + dy * 6, 1.1, '#7a5a34'); line(c, hx + dx * 6 - dy * 1.8, hy + dy * 6 + dx * 1.8, hx + dx * 6 + dy * 1.8, hy + dy * 6 - dx * 1.8, 2, '#8a8f95', 'butt'); break;
    case 'basket': ell(c, hx, hy + 1.5, 2.6, 2, '#a97a3e'); ell(c, hx, hy + 0.4, 2.2, 0.8, '#b8323a'); break;
    case 'staff': line(c, hx, hy + 7, hx, hy - 9, 1, '#8a6a3a'); ell(c, hx, hy - 10, 1.6, 1.6, '#ffe58a'); ell(c, hx, hy - 10, 3, 3, 'rgba(255,230,140,0.25)'); break;
    case 'satchel': ell(c, hx, hy + 2, 2.4, 2, '#6b4a2c'); line(c, hx - 1, hy + 2, hx + 1, hy + 2, 0.7, '#3fae5f'); line(c, hx, hy + 1, hx, hy + 3, 0.7, '#3fae5f'); break;
  }
}
function helmetDraw(c, kind, hy, front, team, hair) {
  const r = 3.2;
  switch (kind) {
    case 'hood': c.beginPath(); c.arc(0, hy, r + 0.5, Math.PI * 0.95, Math.PI * 2.05); c.lineTo(r + 0.5, hy + 2); c.lineTo(-r - 0.5, hy + 2); c.closePath(); c.fillStyle = hair; c.fill(); break;
    case 'cap': c.beginPath(); c.arc(0, hy - 0.4, r + 0.2, Math.PI, 0); c.closePath(); c.fillStyle = shade(team, -0.25); c.fill(); break;
    case 'fur': c.beginPath(); c.arc(0, hy - 0.6, r + 0.8, Math.PI, 0); c.closePath(); c.fillStyle = '#6b5136'; c.fill(); ell(c, 0, hy - 3.6, 1.3, 1.3, team); break;
    case 'helm': case 'kettle': case 'greathelm': case 'plume': case 'crown': {
      c.beginPath(); c.arc(0, hy - 0.3, r + 0.4, Math.PI, 0); c.lineTo(r + 0.4, hy + (kind === 'greathelm' ? 2.6 : 0.8)); c.lineTo(-r - 0.4, hy + (kind === 'greathelm' ? 2.6 : 0.8)); c.closePath();
      c.fillStyle = kind === 'crown' ? '#d9b13b' : '#aeb4ba'; c.fill(); c.lineWidth = 0.4; c.strokeStyle = '#5d6369'; c.stroke();
      if (kind === 'kettle') ell(c, 0, hy + 0.6, r + 2, 0.9, '#9aa0a6');
      if (kind === 'greathelm' && front) line(c, -2, hy + 0.6, 2, hy + 0.6, 0.6, '#222');
      if (kind === 'plume') { c.beginPath(); c.moveTo(0, hy - r); c.quadraticCurveTo(-4, hy - r - 5, -6, hy - r + 1); c.lineWidth = 1.6; c.strokeStyle = team; c.stroke(); }
      if (kind === 'crown') for (let k = -2; k <= 2; k += 2) poly(c, [k - 0.8, hy - r + 0.4, k, hy - r - 2.2, k + 0.8, hy - r + 0.4], '#f0cd4f');
      if (kind === 'helm') line(c, 0, hy - r - 0.3, 0, hy + 1, 0.5, '#6f767c');
      break;
    }
    case 'mitre': poly(c, [-2.6, hy - 1.5, 0, hy - 8, 2.6, hy - 1.5], '#f4efe0', '#c9a540', 0.4); line(c, 0, hy - 7, 0, hy - 2, 0.6, '#c9a540'); break;
  }
}
function drawHuman(c, L, o) {
  const front = o.view === 'front', team = o.team, skin = o.skin;
  const sw = Math.sin(o.walk) * 2.4, bob = Math.abs(Math.sin(o.walk)) * -0.6;
  const robe = L.robe;
  const body = L.team ? mixHex(L.body, team, L.team * 0.55) : L.body;
  const y0 = bob;
  // legs
  if (!o.mounted) {
    if (robe) { poly(c, [-4.2, -11 + y0, 4.2, -11 + y0, 5 + sw * 0.2, 0, -5 + sw * 0.2, 0], shade(body, -0.08)); }
    else {
      line(c, -1.7, -10 + y0, -1.7 + sw, -0.6, 2.4, L.legs); line(c, 1.7, -10 + y0, 1.7 - sw, -0.6, 2.4, shade(L.legs, -0.15));
      ell(c, -1.7 + sw + 0.6, -0.4, 1.6, 0.9, '#2f2419'); ell(c, 1.7 - sw + 0.6, -0.4, 1.6, 0.9, '#2f2419');
    }
  }
  const ty = (o.mounted ? -2 : 0) + y0;
  // things behind the body
  if (!front && L.shield) shieldDraw(c, L.shield, -3.5, -14 + ty, team, false);
  if (L.quiver) { poly(c, [front ? -5 : 2.5, -19 + ty, front ? -3 : 4.5, -19.5 + ty, front ? -2.5 : 5, -11 + ty, front ? -4.5 : 3, -11 + ty], '#6b4a24'); }
  if (L.cape && front) poly(c, [-4.6, -18 + ty, 4.6, -18 + ty, 5.6, -6 + ty + (o.mounted ? -3 : 0), -5.6, -6 + ty + (o.mounted ? -3 : 0)], shade(team, -0.35));
  // arms swing
  const act = o.act || 0;
  let armA; // weapon arm angle
  if (o.anim === 'attack') armA = -2.2 + act * 2.8;
  else if (o.anim === 'work' || o.anim === 'build') armA = -2.4 + (Math.sin(act * Math.PI * 2) * 0.5 + 0.5) * 2.6;
  else if (o.anim === 'heal') armA = -1.2;
  else armA = 0.9 + Math.sin(o.walk) * 0.35;
  const pole = ['spear', 'pike', 'halberd'].includes(o.weapon);
  if (pole && o.anim !== 'attack') armA = -1.35;
  if (o.weapon === 'lance') armA = o.anim === 'attack' ? -0.05 : -0.9;
  if (o.weapon === 'bow' || o.weapon === 'crossbow') armA = 0;
  // weapon behind when facing away
  const hx = (front ? 4.6 : -4.6) + Math.cos(armA) * 4.2 * (front ? 1 : -1) * 0.5, hy = -15 + ty + Math.sin(armA) * 4.2;
  if (!front && o.weapon) weaponDraw(c, o.weapon, hx, hy, front ? armA : Math.PI - armA, team, o);
  // torso
  const tw = L.armor === 'plate' ? 4.8 : 4.4;
  c.beginPath(); c.moveTo(-tw, -18.5 + ty); c.quadraticCurveTo(0, -20.5 + ty, tw, -18.5 + ty); c.lineTo(tw - 0.4, -9.5 + ty); c.lineTo(-tw + 0.4, -9.5 + ty); c.closePath();
  c.fillStyle = body; c.fill();
  if (L.armor === 'mail') { c.fillStyle = 'rgba(40,40,50,0.18)'; for (let yy = -18; yy < -10; yy += 1.4) for (let xx = -tw + 1; xx < tw - 0.5; xx += 1.4) c.fillRect(xx, yy + ty, 0.6, 0.6); }
  if (L.armor === 'plate') { line(c, 0, -18 + ty, 0, -10.5 + ty, 0.5, 'rgba(255,255,255,0.45)'); ell(c, -tw + 0.5, -18.2 + ty, 1.8, 1.2, '#cfd4d8'); ell(c, tw - 0.5, -18.2 + ty, 1.8, 1.2, '#b0b6bb'); }
  // tabard/sash in team colors
  if (L.sash) line(c, -tw + 0.6, -18 + ty, tw - 0.8, -11 + ty, 1.4, team);
  else if (L.team && !robe) { poly(c, [-2.2, -17.5 + ty, 2.2, -17.5 + ty, 2.6, -9.6 + ty, -2.6, -9.6 + ty], team); if (L.team > 0.6) line(c, 0, -16.5 + ty, 0, -11 + ty, 0.6, shade(team, 0.5)); }
  if (robe) { line(c, -0.2, -18 + ty, -0.2, -2 + ty, 1.1, team); }
  line(c, -tw + 0.3, -10.2 + ty, tw - 0.3, -10.2 + ty, 1, '#3a2a1a');
  if (!front && L.cape) poly(c, [-4.6, -18.5 + ty, 4.6, -18.5 + ty, 5.4, -6 + ty, -5.4, -6 + ty], shade(team, -0.25));
  // off arm
  const ox = front ? -4.6 : 4.6;
  if (o.weapon === 'bow') { line(c, ox, -17 + ty, ox + (front ? -3.5 : 3.5), -15 + ty, 1.8, shade(body, -0.1)); }
  else line(c, ox, -17.5 + ty, ox + (front ? -0.8 : 0.8) - Math.sin(o.walk) * 0.8, -11.5 + ty, 1.8, shade(body, -0.1));
  // head
  const hyH = -21.4 + ty;
  ell(c, 0, hyH + 2.4, 1.4, 1, skin);
  ell(c, 0, hyH, 3.1, 3.2, skin);
  if (front) { ell(c, -1.1, hyH - 0.1, 0.45, 0.5, '#2a1e16'); ell(c, 1.1, hyH - 0.1, 0.45, 0.5, '#2a1e16'); if (L.helmet !== 'greathelm') line(c, -0.7, hyH + 1.5, 0.7, hyH + 1.5, 0.4, 'rgba(90,40,30,0.6)'); }
  else { c.beginPath(); c.arc(0, hyH, 3.2, Math.PI * 0.85, Math.PI * 2.15); c.fillStyle = o.hair; c.fill(); }
  if (L.helmet === 'hood' || !L.helmet) { if (front) { c.beginPath(); c.arc(0, hyH - 0.6, 3.3, Math.PI * 1.05, Math.PI * 1.95); c.fillStyle = o.hair; c.fill(); } }
  helmetDraw(c, L.helmet, hyH, front, team, L.helmet === 'hood' ? shade(body, -0.2) : o.hair);
  // weapon in front
  if (front && o.weapon) weaponDraw(c, o.weapon, hx, hy, armA, team, o);
  // weapon arm
  line(c, front ? 4.6 : -4.6, -17.5 + ty, hx, hy, 1.8, shade(body, 0.05));
  ell(c, hx, hy, 0.9, 0.9, skin);
  if (front && L.shield) shieldDraw(c, L.shield, -5.2, -14.2 + ty, team, true);
  // carried load
  if (o.carry === 'wood') { line(c, -5, -21 + ty, 5, -18 + ty, 2.4, '#8a5a2e'); line(c, -5, -21 + ty, 5, -18 + ty, 0.6, '#c6935a'); }
  else if (o.carry === 'food') ell(c, front ? 4.5 : -4.5, -12 + ty, 2.5, 2.2, '#c8a85a');
  else if (o.carry) { const col = { gold: '#f2c94c', stone: '#b9b5ad', iron: '#8a6a5c' }[o.carry]; ell(c, 0, -23.5 + ty, 3.2, 1.8, '#7b5b3a'); ell(c, 0, -24.2 + ty, 2.4, 1.1, col); }
}
function shieldDraw(c, kind, x, y, team, front) {
  if (kind === 'round') { ell(c, x, y, 3.2, 3.6, '#7a5a34'); ell(c, x, y, 2.5, 2.9, team); ell(c, x, y, 0.8, 0.8, '#c9cdd1'); }
  else { poly(c, [x - 3, y - 4, x + 3, y - 4, x + 2.6, y + 1, x, y + 5, x - 2.6, y + 1], team, '#e8e2c8', 0.6); if (front) { line(c, x, y - 3.4, x, y + 3.4, 0.7, shade(team, 0.55)); line(c, x - 2.2, y - 1.5, x + 2.2, y - 1.5, 0.7, shade(team, 0.55)); } }
}
function drawHorse(c, o) {
  const w = o.walk, team = o.team;
  const coat = o.coat;
  const legs = [[-6.2, 0], [-4, Math.PI], [5, Math.PI * 0.5], [7, Math.PI * 1.5]];
  ell(c, 0, 0, 11, 2.6, 'rgba(0,0,0,0.22)');
  for (const [lx, ph] of legs) { const s = Math.sin(w + ph) * (o.moving ? 2.6 : 0.3); line(c, lx, -9, lx + s, -0.8, 1.9, shade(coat, lx < 0 ? -0.25 : -0.1)); ell(c, lx + s, -0.5, 1.1, 0.7, '#2a2218'); }
  // tail
  c.beginPath(); c.moveTo(-9.5, -13); c.quadraticCurveTo(-13.5, -10 + Math.sin(w) * 0.6, -12, -5); c.lineWidth = 1.8; c.strokeStyle = shade(coat, -0.45); c.stroke();
  // body
  ell(c, 0, -12, 10, 4.6, coat);
  ell(c, 1, -13.5, 7, 2, shade(coat, 0.12));
  // neck & head
  poly(c, [5.5, -15.5, 8.6, -21.5, 11.2, -21, 9.8, -13.5], coat);
  poly(c, [9.4, -22.5, 14.6, -19.6, 14, -17.8, 9.6, -19.2], shade(coat, -0.05));
  poly(c, [9.4, -22.6, 10.6, -24.8, 11, -22], shade(coat, -0.2));
  line(c, 6.4, -17.6, 9.2, -22.2, 1.2, shade(coat, -0.45));
  ell(c, 12, -21, 0.4, 0.4, '#111');
  if (o.barding) { // caparison in team colours
    c.beginPath(); c.moveTo(-9.6, -15); c.quadraticCurveTo(0, -18.5, 9.4, -15); c.lineTo(9.6, -8.2); c.lineTo(-9.8, -8.2); c.closePath();
    c.fillStyle = team; c.fill();
    c.fillStyle = shade(team, 0.45); for (let x = -8; x < 9; x += 3) c.fillRect(x, -9.2, 1.2, 1);
    if (o.barding === 'armored') { poly(c, [8.8, -21.5, 14.4, -19.4, 13.8, -18, 9, -19], '#c3c8cc'); poly(c, [5.6, -15.4, 8.4, -21, 10.2, -20, 9.4, -14], '#aeb4ba'); }
  }
  // saddle
  ell(c, -0.5, -16.2, 3.6, 1.3, o.barding ? shade(team, -0.3) : '#5a3b22');
}
function mixHex(a, b, t) { const A = hexToRgb(a), B = hexToRgb(b); return '#' + A.map((v, i) => Math.round(v + (B[i] - v) * t).toString(16).padStart(2, '0')).join(''); }

function drawSiege(c, type, o) {
  const team = o.team, wood = '#7a5530', dark = '#4d3520';
  ell(c, 0, 0, 13, 3, 'rgba(0,0,0,0.22)');
  const wheel = (x, y, r) => { ell(c, x, y, r, r, dark); ell(c, x, y, r - 1, r - 1, wood); const a = o.walk; for (let k = 0; k < 3; k++) line(c, x + Math.cos(a + k) * (r - 1), y + Math.sin(a + k) * (r - 1), x - Math.cos(a + k) * (r - 1), y - Math.sin(a + k) * (r - 1), 0.6, dark); };
  if (type === 'ram') {
    const jab = o.anim === 'attack' ? Math.sin(o.act * Math.PI) * 3 : 0;
    line(c, -13 + jab, -7, 12 + jab, -7, 3.4, '#5b3d22'); ell(c, 13 + jab, -7, 2.2, 2.2, '#8a8f95');
    poly(c, [-11, -4, 10, -4, 7, -15, -8, -15], wood, dark);
    poly(c, [-9, -14, 8, -14, 4, -19, -5, -19], shade(team, -0.2), dark);
    for (let x = -8; x < 8; x += 3) line(c, x, -14, x + 1.6, -5, 0.5, dark);
    wheel(-7, -2.5, 3); wheel(7, -2.5, 3);
  } else if (type === 'mangonel') {
    poly(c, [-10, -4, 10, -4, 9, -8, -9, -8], wood, dark);
    line(c, -6, -8, -2, -16, 1.6, wood); line(c, 6, -8, 2, -16, 1.6, wood);
    const arm = o.anim === 'attack' ? -0.3 - Math.sin(o.act * Math.PI) * 1.4 : -0.3;
    const ax = Math.cos(Math.PI + arm) * 12, ay = Math.sin(Math.PI + arm) * 12;
    line(c, 2, -12, 2 + ax, -12 + ay, 1.6, '#5b3d22'); ell(c, 2 + ax, -12 + ay, 2, 1.4, '#4a3624');
    line(c, -9, -6, 9, -6, 0.8, team);
    wheel(-7, -2.5, 2.8); wheel(7, -2.5, 2.8);
  } else if (type === 'trebuchet') {
    poly(c, [-13, -3, 13, -3, 12, -7, -12, -7], wood, dark);
    line(c, -7, -7, 0, -30, 2, wood); line(c, 7, -7, 0, -30, 2, wood);
    const t = o.anim === 'attack' ? Math.sin(o.act * Math.PI) : 0;
    const a = -0.6 + t * 2.2;
    const L1 = 22, L2 = 7;
    const ex = Math.cos(Math.PI + a) * L1, ey = Math.sin(Math.PI + a) * L1;
    line(c, 0, -29, ex, -29 + ey, 1.8, '#5b3d22');
    line(c, 0, -29, -ex / L1 * L2, -29 - ey / L1 * L2, 1.8, '#5b3d22');
    poly(c, [-ex / L1 * L2 - 3, -29 - ey / L1 * L2, -ex / L1 * L2 + 3, -29 - ey / L1 * L2, -ex / L1 * L2 + 2.5, -24 - ey / L1 * L2, -ex / L1 * L2 - 2.5, -24 - ey / L1 * L2], '#6f7377', dark);
    line(c, ex, -29 + ey, ex - 2, -24 + ey, 0.5, '#d8cfa8');
    poly(c, [-2, -31, 2, -31, 2, -36, -2, -36], team);
    wheel(-9, -2, 2.5); wheel(9, -2, 2.5);
  } else if (type === 'siege_tower') {
    const ramp = o.anim === 'attack';
    poly(c, [-9, -3, 9, -3, 7, -46, -7, -46], wood, dark);
    for (let y = -40; y < -4; y += 9) line(c, -8, y, 8, y + 3, 0.6, dark);
    poly(c, [-8, -46, 8, -46, 6, -52, -6, -52], shade(team, -0.15), dark);
    poly(c, [-3, -30, 3, -30, 3, -22, -3, -22], '#2a1e14');
    if (ramp) poly(c, [7, -38, 7, -34, 22, -24, 22, -27], '#8a6438', dark); else line(c, 7, -40, 7, -24, 1.4, '#8a6438');
    wheel(-6, -2.5, 3); wheel(6, -2.5, 3);
  } else if (type === 'cannon') {
    const kick = o.anim === 'attack' ? Math.max(0, 1 - o.act * 2) * 3 : 0;
    poly(c, [-9, -3, 4, -3, 2, -8, -7, -8], wood, dark);
    line(c, -6 - kick, -9, 14 - kick, -12, 4.2, '#3c3f44'); ell(c, 14 - kick, -12, 2.2, 2.2, '#2a2c30'); ell(c, -6 - kick, -9, 2.4, 2.4, '#4a4d52');
    line(c, -2, -10.5, 8, -12, 0.8, team);
    if (o.anim === 'attack' && o.act < 0.5) { ell(c, 19, -13, 4, 3, 'rgba(255,200,110,0.9)'); ell(c, 24, -15, 7, 5, 'rgba(200,200,200,0.55)'); }
    wheel(-4, -3, 3.4);
  } else if (type === 'trade_cart') {
    // ox pulling a covered wagon
    poly(c, [-12, -5, 4, -5, 4, -11, -12, -11], wood, dark);
    c.beginPath(); c.moveTo(-12, -11); c.quadraticCurveTo(-4, -20, 4, -11); c.closePath(); c.fillStyle = '#efe3c4'; c.fill(); c.strokeStyle = dark; c.lineWidth = 0.5; c.stroke();
    line(c, -10, -12, 2, -12, 1.2, team);
    wheel(-9, -3, 3); wheel(1, -3, 3);
    ell(c, 10, -9, 5, 3.4, '#8a6a4a'); ell(c, 15, -10, 2.2, 1.8, '#7a5a3a');
    for (const [lx, ph] of [[7, 0], [9, 3], [12, 1.5], [13.5, 4.5]]) line(c, lx, -7, lx + Math.sin(o.walk + ph) * 1.4, -1, 1.3, '#5e4630');
    line(c, 4, -8, 7, -8, 0.8, dark);
  }
}

// ships: side view, bow to the right; the renderer mirrors them for the other heading
function drawShip(c, type, o) {
  const team = o.team, wood = '#7a5532', dark = '#3f2b18', deck = '#a07a4a';
  const big = type === 'dromon', small = type === 'fishing_boat', cog = type === 'trade_cog';
  const L = small ? 11 : big ? 20 : 16, Hh = small ? 4 : big ? 7 : 5.5;
  const bob = Math.sin((o.walk || 0) * 0.5 + (o.act || 0)) * 0.6;
  c.translate(0, bob); c.scale(small ? 1.35 : 1.75, small ? 1.35 : 1.75); // ships are big next to people
  // wake and reflection on the water
  ell(c, 0, 1, L + 4, 3.2, 'rgba(255,255,255,0.13)');
  ell(c, 0, 0.5, L + 1, 2.4, 'rgba(10,30,50,0.28)');
  // hull
  c.beginPath(); c.moveTo(-L, -Hh); c.lineTo(L + 3, -Hh - 1.5); c.quadraticCurveTo(L, 0, L - 4, 0.5); c.lineTo(-L + 3, 0.5); c.quadraticCurveTo(-L - 1, -1, -L, -Hh); c.closePath();
  c.fillStyle = wood; c.fill(); c.strokeStyle = dark; c.lineWidth = 0.6; c.stroke();
  line(c, -L + 1, -Hh * 0.55, L + 1, -Hh * 0.6 - 0.5, 1, shade(team, -0.15));
  poly(c, [-L, -Hh, L + 3, -Hh - 1.5, L + 1, -Hh - 2.6, -L + 1, -Hh - 1.4], deck, dark, 0.4);
  if (cog) { for (const x of [-9, -5, 5, 9]) poly(c, [x - 2, -Hh - 2, x + 2, -Hh - 2, x + 2, -Hh - 5.5, x - 2, -Hh - 5.5], '#a8844e', dark, 0.4); ell(c, -1, -Hh - 4, 2, 1.6, '#7a4a2a'); }
  if (!small && !cog) for (let k = -L + 4; k < L - 2; k += 4) { const sw = Math.sin((o.walk || 0) * 2 + k) * 2; line(c, k, -Hh * 0.45, k - 2 + sw, 1.8, 0.7, '#5b3d22'); } // oars
  if (type === 'fire_ship') { for (const x of [-6, 0, 6]) { ell(c, x, -Hh - 3.2, 2, 1.4, '#3a3028'); ell(c, x, -Hh - 4.8, 1.4, 2.2, `rgba(255,${140 + (x + 6) * 6},40,0.9)`); } }
  if (big) { poly(c, [-5, -Hh - 2, 5, -Hh - 2, 4, -Hh - 6, -4, -Hh - 6], '#6b4a2a', dark); const arm = o.anim === 'attack' ? -0.4 - Math.sin(o.act * Math.PI) * 1.2 : -0.4; line(c, 0, -Hh - 6, Math.cos(Math.PI + arm) * 9, -Hh - 6 + Math.sin(Math.PI + arm) * 9, 1.4, '#5b3d22'); }
  // masts and sails
  const masts = big ? [-9, 9] : small ? [1] : cog ? [1] : [-2];
  for (const mx of masts) {
    const top = small ? -Hh - 15 : big ? -Hh - 30 : -Hh - 25;
    line(c, mx, -Hh - 1.5, mx, top, 1.1, dark);
    const sw = small ? 5 : 8, sh = small ? 9 : 15;
    c.beginPath(); c.moveTo(mx - sw, top + 2); c.quadraticCurveTo(mx + 2, top + 1, mx + sw, top + 2); c.lineTo(mx + sw * 0.9, top + sh); c.quadraticCurveTo(mx + 1.5, top + sh + 2.5, mx - sw * 0.9, top + sh); c.closePath();
    c.fillStyle = type === 'fire_ship' ? '#5a2a22' : small ? '#e8dcc0' : '#efe5cc'; c.fill(); c.strokeStyle = 'rgba(0,0,0,0.35)'; c.lineWidth = 0.5; c.stroke();
    if (!small) { poly(c, [mx - sw * 0.9, top + sh * 0.45, mx + sw * 0.9, top + sh * 0.45, mx + sw * 0.9, top + sh * 0.7, mx - sw * 0.9, top + sh * 0.7], team); }
    poly(c, [mx, top, mx + 6, top + 1.5, mx, top + 3], team);
  }
  if (small) { c.beginPath(); c.moveTo(-L + 2, -Hh); c.quadraticCurveTo(-L - 4, -1, -L - 6, 1); c.strokeStyle = 'rgba(230,225,210,0.7)'; c.lineWidth = 0.5; c.stroke(); ell(c, -4, -Hh - 3, 1.6, 2.2, '#6b4a2a'); ell(c, -4, -Hh - 5.8, 1.2, 1.2, '#e9c39b'); }
}

export function luxSprite(good, v) {
  const key = 'lux' + good + (v % 3); let s = cache.get(key); if (s) return s;
  const W = 64, H = 46, cv = mk(W * K, H * K), c = cv.getContext('2d');
  c.scale(K, K); c.translate(W / 2, H - 12);
  const rnd = i => ((Math.sin(v * 21.7 + i * 4.3 + good.length) * 8121.3) % 1 + 1) % 1;
  ell(c, 0, 3, 18, 6, 'rgba(0,0,0,0.2)');
  if (good === 'salt') { for (let k = 0; k < 6; k++) { const x = (rnd(k) - 0.5) * 24, y = (rnd(k + 9) - 0.5) * 8, r = 3 + rnd(k + 3) * 4; poly(c, [x - r, y, x, y - r * 1.6, x + r, y], k % 2 ? '#f4f3ee' : '#e2e0d8', '#b8b4a8', 0.4); } }
  else {
    const leaf = good === 'wine' ? '#4d7a2e' : good === 'silk' ? '#5f8f3a' : '#3f6e2a', fruit = { wine: '#6a2a7a', silk: '#f6f3ea', spice: '#d2491e' }[good];
    for (let k = 0; k < 6; k++) { const x = (rnd(k) - 0.5) * 24, y = (rnd(k + 5) - 0.5) * 7 - 4; if (good === 'wine') line(c, x, y + 4, x, y - 6, 0.8, '#6b4a2a'); ell(c, x, y - (good === 'wine' ? 6 : 0), 5.5, 4.5, shade(leaf, -0.1 + rnd(k + 2) * 0.2)); }
    for (let k = 0; k < 16; k++) ell(c, (rnd(k + 30) - 0.5) * 24, (rnd(k + 60) - 0.5) * 9 - 6, 1.2, 1.2, fruit);
  }
  s = { cv, ax: W / 2 * K, ay: (H - 12) * K }; cache.set(key, s); return s;
}

export function fishSprite(v) {
  const key = 'fish' + (v % 4); let s = cache.get(key); if (s) return s;
  const W = 60, H = 30, cv = mk(W * K, H * K), c = cv.getContext('2d');
  c.scale(K, K); c.translate(W / 2, H - 12);
  const rnd = i => ((Math.sin(v * 17.3 + i * 5.1) * 7331.7) % 1 + 1) % 1;
  for (let k = 0; k < 3; k++) { c.beginPath(); c.ellipse((rnd(k) - 0.5) * 14, (rnd(k + 3) - 0.5) * 5, 6 + k * 3, 2.4 + k * 1.2, 0, 0, Math.PI * 2); c.strokeStyle = `rgba(220,240,255,${0.35 - k * 0.08})`; c.lineWidth = 0.8; c.stroke(); }
  for (let k = 0; k < 4; k++) { const x = (rnd(k + 7) - 0.5) * 18, y = (rnd(k + 11) - 0.5) * 6; ell(c, x, y, 2.4, 0.9, 'rgba(40,70,90,0.55)'); poly(c, [x - 2.2, y, x - 3.6, y - 1, x - 3.6, y + 1], 'rgba(40,70,90,0.55)'); }
  ell(c, 3, -2, 1.2, 0.6, 'rgba(255,255,255,0.7)');
  s = { cv, ax: W / 2 * K, ay: (H - 12) * K }; cache.set(key, s); return s;
}

// what is left of a building: broken walls, charred beams and stones
export function ruinSprite(size, v) {
  const key = 'ruin' + size + (v % 3); let s = cache.get(key); if (s) return s;
  const sz = size, W = sz * HW * 2 + 24, H = sz * HH * 2 + 40;
  const cv = mk(W * S, H * S), c = cv.getContext('2d');
  c.scale(S, S); c.translate(sz * HW + 12, 34);
  const iso = new Iso(c), rnd = i => ((Math.sin(v * 13.7 + i * 3.3 + sz) * 9157.3) % 1 + 1) % 1;
  iso.ground(0.05, 0.05, sz - 0.05, sz - 0.05, 'rgba(40,32,26,0.75)');
  for (let k = 0; k < sz * 4; k++) { const x = 0.2 + rnd(k) * (sz - 0.6), y = 0.2 + rnd(k + 40) * (sz - 0.6), h = 2 + rnd(k + 80) * (sz * 4); iso.box(x, y, x + 0.18 + rnd(k + 9) * 0.3, y + 0.18 + rnd(k + 19) * 0.3, 0, h, k % 3 ? '#8e877c' : '#6b6157'); }
  for (let k = 0; k < sz * 2; k++) { const [a, b] = iso.P(0.2 + rnd(k + 60) * (sz - 0.4), 0.2 + rnd(k + 70) * (sz - 0.4), 1); line(c, a - 6, b, a + 6, b - 3 + rnd(k) * 6, 1.8, '#2a1e16'); }
  if (sz >= 3) { iso.box(0.2, sz - 0.5, sz * 0.55, sz - 0.25, 0, 9 + rnd(5) * 6, '#9a9286'); iso.box(sz - 0.5, 0.3, sz - 0.25, sz * 0.5, 0, 6 + rnd(6) * 8, '#8a8378'); }
  s = { cv, ax: (sz * HW + 12) * S, ay: 34 * S }; cache.set(key, s); return s;
}

export function unitSprite(type, color, anim, frame, view, carry) {
  const key = type + color + anim + frame + view + (carry || '');
  let s = cache.get(key); if (s) return s;
  const U = UNITS[type];
  const L = LOOK[type];
  const siege = U.cls === 'siege' || type === 'trade_cart', ship = !!U.naval;
  const mounted = L?.mount;
  const W = ship ? 118 : siege ? (type === 'trebuchet' || type === 'siege_tower' ? 70 : 60) : mounted ? 58 : 40, H = ship ? 104 : siege ? (type === 'trebuchet' || type === 'siege_tower' ? 84 : 50) : mounted ? 72 : 52;
  const cv = mk(W * K, H * K), c = cv.getContext('2d');
  c.scale(K, K); c.translate(W / 2, H - 4);
  const walk = anim === 'walk' ? frame / 8 * Math.PI * 2 : 0;
  const act = anim === 'attack' ? frame / 3 : anim === 'work' || anim === 'build' || anim === 'heal' ? frame / 6 : 0;
  const skin = SKIN[(type.length + color.length) % SKIN.length];
  const hair = ['#3a2a1c', '#6b4a2a', '#1e1a16', '#a8743a'][type.length % 4];
  if (ship) {
    if (anim === 'dead') { c.translate(0, 4); c.rotate(0.35); drawShip(c, type, { team: color, walk: 0, anim: 'idle', act: 0 }); c.globalCompositeOperation = 'source-atop'; c.fillStyle = 'rgba(15,20,25,0.6)'; c.fillRect(-W, -H, W * 2, H * 2); }
    else drawShip(c, type, { team: color, walk: anim === 'walk' ? frame : frame * 0.3, anim, act });
    s = { cv, ax: W / 2 * K, ay: (H - 4) * K }; cache.set(key, s); return s;
  }
  if (anim === 'dead') {
    c.save(); c.translate(0, -2); c.rotate(-Math.PI / 2 * 0.92); c.scale(0.95, 0.95);
    if (siege) { c.restore(); drawSiege(c, type, { team: color, walk: 0, anim: 'idle', act: 0 }); c.globalCompositeOperation = 'source-atop'; c.fillStyle = 'rgba(30,20,10,0.55)'; c.fillRect(-W, -H, W * 2, H * 2); }
    else { drawHuman(c, L, { view: 'front', walk: 0, team: color, skin, hair, weapon: null, anim: 'idle' }); c.restore(); }
    if (mounted && !siege) { c.save(); c.translate(-4, 0); c.rotate(0.12); drawHorse(c, { walk: 0, team: color, coat: '#6e4a2c', barding: mounted === 'light' ? null : mounted }); c.restore(); }
    s = { cv, ax: W / 2 * K, ay: (H - 4) * K }; cache.set(key, s); return s;
  }
  if (siege) drawSiege(c, type, { team: color, walk: walk + frame, anim, act });
  else {
    let weapon = L.weapon;
    if (type === 'villager') weapon = anim === 'build' ? 'hammer' : anim === 'work' ? ({ wood: 'axe', gold: 'pick', stone: 'pick', iron: 'pick', food: 'hoe', berries: 'basket' }[carry || 'food']) : null;
    const o = { view, walk, act, anim, team: color, skin, hair, weapon, mounted: !!mounted, draw: anim === 'attack' ? Math.max(0, 1 - act * 1.5) : 0, carry: type === 'villager' && anim === 'walk' ? carry : null };
    if (mounted) {
      const coat = ['#6e4a2c', '#8a6a48', '#3b2a1e', '#c9b9a0', '#5b4632'][(type.length * 3 + color.charCodeAt(2)) % 5];
      drawHorse(c, { walk, team: color, coat, moving: anim === 'walk', barding: mounted === 'light' ? null : mounted });
      c.save(); c.translate(-0.5, -6);
      // rider legs over the horse flank
      line(c, -0.5, -10, 1.5, -4, 2.2, L.legs);
      drawHuman(c, L, { ...o, view: 'front', mounted: true, walk: walk * 0.3 });
      c.restore();
    } else drawHuman(c, L, o);
  }
  s = { cv, ax: W / 2 * K, ay: (H - 4) * K };
  cache.set(key, s);
  return s;
}

// ----------------------------------------------------------------------------- trees & resources
export function treeSprite(kind, v) {
  const key = 'tree' + kind + v; let s = cache.get(key); if (s) return s;
  const W = 52, H = 84, cv = mk(W * K, H * K), c = cv.getContext('2d');
  c.scale(K, K); c.translate(W / 2, H - 8);
  const rnd = (i) => ((Math.sin(v * 91.7 + i * 12.9) * 43758.5) % 1 + 1) % 1;
  ell(c, 2, 0, 11, 4, 'rgba(0,0,0,0.22)');
  const hScale = 0.85 + rnd(1) * 0.35;
  if (kind === 2) { // pine
    line(c, 0, 0, 0, -14 * hScale, 2.6, '#5a3b22');
    const base = ['#2f5a34', '#2b5230', '#36633a'][v % 3];
    for (let k = 0; k < 4; k++) {
      const y = -10 * hScale - k * 9 * hScale, w = 13 - k * 2.8;
      poly(c, [-w, y, 0, y - 15 * hScale, w, y], shade(base, -0.12 + k * 0.05));
      poly(c, [0, y, 0, y - 15 * hScale, w, y], shade(base, -0.3 + k * 0.04));
    }
  } else if (kind === 4) { // palm
    c.beginPath(); c.moveTo(0, 0); c.quadraticCurveTo(4, -16, 2, -32 * hScale); c.lineWidth = 2.6; c.strokeStyle = '#8a6a42'; c.stroke();
    for (let k = 0; k < 7; k++) { const a = k / 7 * Math.PI * 2; c.beginPath(); c.moveTo(2, -32 * hScale); c.quadraticCurveTo(2 + Math.cos(a) * 9, -38 * hScale + Math.sin(a) * 3, 2 + Math.cos(a) * 14, -30 * hScale + Math.abs(Math.sin(a)) * 4); c.lineWidth = 2.2; c.strokeStyle = shade('#4f8a3a', (k % 3) * -0.1); c.stroke(); }
  } else if (kind === 5) { // dead tree
    line(c, 0, 0, 0, -22, 2.4, '#5d4a3a'); line(c, 0, -14, -7, -22, 1.4, '#5d4a3a'); line(c, 0, -18, 6, -26, 1.2, '#5d4a3a');
  } else { // oak / birch: clustered canopy
    const birch = kind === 3;
    line(c, 0, 0, 0, -16 * hScale, birch ? 2.2 : 3.2, birch ? '#e6e2d6' : '#5a3b22');
    if (birch) for (let y = -2; y > -15; y -= 3) line(c, -0.8, y, 0.8, y - 0.4, 0.6, '#3a3a3a');
    const base = birch ? ['#7fa64a', '#8bb055', '#93b85c'][v % 3] : ['#3f7a35', '#467f38', '#3a6e30', '#4d8a3c'][v % 4];
    const blobs = 7;
    for (let k = 0; k < blobs; k++) {
      const a = rnd(k + 3) * Math.PI * 2, r = 4 + rnd(k + 9) * 5;
      const bx = Math.cos(a) * r, by = -24 * hScale + Math.sin(a) * r * 0.7, br = 6 + rnd(k + 20) * 3.5;
      ell(c, bx, by, br, br * 0.92, shade(base, -0.22));
    }
    for (let k = 0; k < blobs; k++) {
      const a = rnd(k + 3) * Math.PI * 2, r = 4 + rnd(k + 9) * 5;
      const bx = Math.cos(a) * r - 1, by = -25 * hScale + Math.sin(a) * r * 0.7 - 1.2, br = 5 + rnd(k + 20) * 3;
      ell(c, bx, by, br, br * 0.9, shade(base, 0.02 + rnd(k) * 0.1));
    }
    for (let k = 0; k < 5; k++) ell(c, -3 + rnd(k + 40) * 4, -29 * hScale + rnd(k + 50) * 6, 2.2, 1.8, shade(base, 0.22));
  }
  s = { cv, ax: W / 2 * K, ay: (H - 8) * K }; cache.set(key, s); return s;
}
export function nodeSprite(res, v, frac) {
  const stage = frac > 0.66 ? 2 : frac > 0.33 ? 1 : 0;
  const key = 'node' + res + v + stage; let s = cache.get(key); if (s) return s;
  const W = 60, H = 44, cv = mk(W * K, H * K), c = cv.getContext('2d');
  c.scale(K, K); c.translate(W / 2, H - 12);
  const n = 3 + stage * 2;
  const rnd = (i) => ((Math.sin(v * 37.3 + i * 7.77 + res.length) * 9137.1) % 1 + 1) % 1;
  if (res === 'food') {
    ell(c, 0, 2, 13, 5, 'rgba(0,0,0,0.2)');
    for (let k = 0; k < 4 + stage; k++) { const x = (rnd(k) - 0.5) * 16, y = (rnd(k + 5) - 0.5) * 6 - 4; ell(c, x, y, 7, 5.5, shade('#3e7a33', -0.15 + rnd(k + 2) * 0.2)); }
    for (let k = 0; k < 12 + stage * 6; k++) ell(c, (rnd(k + 30) - 0.5) * 18, (rnd(k + 60) - 0.5) * 9 - 5, 1.1, 1.1, ['#c0283a', '#8a2bb0', '#d84a5a'][k % 3]);
  } else {
    const base = { gold: '#8f7f62', stone: '#9b978f', iron: '#6f5a52' }[res];
    ell(c, 0, 3, 16, 6, 'rgba(0,0,0,0.25)');
    for (let k = 0; k < n; k++) {
      const x = (rnd(k) - 0.5) * 20, y = (rnd(k + 9) - 0.5) * 8, r = 4 + rnd(k + 3) * 4;
      poly(c, [x - r, y, x - r * 0.6, y - r * 1.1, x + r * 0.3, y - r * 1.3, x + r, y - r * 0.4, x + r * 0.8, y + 1], shade(base, -0.05 + rnd(k + 4) * 0.12), shade(base, -0.45), 0.5);
      poly(c, [x + r * 0.3, y - r * 1.3, x + r, y - r * 0.4, x + r * 0.8, y + 1, x + r * 0.1, y - r * 0.3], shade(base, -0.28));
      if (res === 'gold') for (let j = 0; j < 4; j++) ell(c, x + (rnd(k * 7 + j) - 0.6) * r, y - rnd(k * 3 + j) * r, 1.2, 0.9, '#ffd84a');
      if (res === 'iron') for (let j = 0; j < 3; j++) ell(c, x + (rnd(k * 5 + j) - 0.6) * r, y - rnd(k * 9 + j) * r, 1, 0.7, '#c9a090');
    }
  }
  s = { cv, ax: W / 2 * K, ay: (H - 12) * K }; cache.set(key, s); return s;
}

// ----------------------------------------------------------------------------- buildings
class Iso {
  constructor(c) { this.c = c; }
  P(x, y, z = 0) { return [(x - y) * HW, (x + y) * HH - z]; }
  poly(pts3, fill, stroke = 'rgba(0,0,0,0.35)', lw = 0.6) { const c = this.c; c.beginPath(); pts3.forEach((p, i) => { const [sx, sy] = this.P(p[0], p[1], p[2]); i ? c.lineTo(sx, sy) : c.moveTo(sx, sy); }); c.closePath(); if (fill) { c.fillStyle = fill; c.fill(); } if (stroke) { c.lineWidth = lw; c.strokeStyle = stroke; c.stroke(); } }
  box(x0, y0, x1, y1, z0, z1, col, top = null) {
    this.poly([[x0, y1, z0], [x1, y1, z0], [x1, y1, z1], [x0, y1, z1]], shade(col, -0.12));
    this.poly([[x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [x1, y0, z1]], shade(col, -0.32));
    this.poly([[x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]], top || shade(col, 0.12));
    const kind = this.materialOf(col);
    if (kind && z1 - z0 >= 6) { this.texture(kind, (t, z) => [x0 + (x1 - x0) * t, y1, z], x1 - x0, z0, z1); this.texture(kind, (t, z) => [x1, y0 + (y1 - y0) * t, z], y1 - y0, z0, z1, true); }
  }
  // what a wall is made of: cut stone, timber, half-timbered plaster or dressed ashlar (by colour and age)
  materialOf(col) {
    const m = this.mat; if (!m) return null;
    if (m.stone.includes(col)) return 'stone';
    if (m.wood.includes(col)) return 'wood';
    if (col === m.wall) return m.age <= 1 ? 'wood' : m.age === 2 ? 'timber' : 'ashlar';
    return null;
  }
  texture(kind, at, len, z0, z1, side = false) {
    const c = this.c, h = z1 - z0, L = (a, b, w, col) => { const [ax, ay] = this.P(...a), [bx, by] = this.P(...b); c.beginPath(); c.moveTo(ax, ay); c.lineTo(bx, by); c.lineWidth = w; c.strokeStyle = col; c.stroke(); };
    if (kind === 'stone' || kind === 'ashlar') {
      const dz = kind === 'stone' ? 4.2 : 6, dx = kind === 'stone' ? 0.2 : 0.3, joint = side ? 'rgba(0,0,0,0.22)' : 'rgba(0,0,0,0.16)';
      let row = 0;
      for (let z = z0 + dz; z < z1 - 0.5; z += dz, row++) L(at(0, z), at(1, z), 0.45, joint);
      row = 0;
      for (let z = z0; z < z1 - 0.5; z += dz, row++) for (let t = (row % 2 ? dx / 2 : dx) / len; t < 1 - 0.02; t += dx / len) L(at(t, z), at(t, Math.min(z1, z + dz)), 0.4, joint);
    } else if (kind === 'wood') {
      for (let t = 0.14 / len; t < 1 - 0.03; t += 0.14 / len) L(at(t, z0), at(t, z1), 0.45, 'rgba(40,24,10,0.3)');
      L(at(0, z0 + h * 0.5), at(1, z0 + h * 0.5), 0.5, 'rgba(40,24,10,0.25)');
    } else if (kind === 'timber') {
      const beam = this.mat.trim, n = Math.max(1, Math.round(len / 0.5));
      L(at(0, z0 + 0.6), at(1, z0 + 0.6), 1.3, beam); L(at(0, z1 - 0.6), at(1, z1 - 0.6), 1.3, beam); L(at(0, z0 + h * 0.52), at(1, z0 + h * 0.52), 1, beam);
      for (let k = 0; k <= n; k++) { const t = k / n; L(at(t, z0), at(t, z1), 1.2, beam); if (k < n && k % 2 === 0) L(at(t, z0 + h * 0.52), at((k + 1) / n, z1 - 0.6), 0.9, beam); }
    }
  }
  // rows of roof tiles or thatch between an eave line and a ridge line
  roofRows(e0, e1, r0, r1, h) {
    const m = this.mat; if (!m) return;
    const c = this.c, n = Math.max(2, Math.round(h / 3)), thatch = m.age <= 1;
    for (let k = 1; k < n; k++) {
      const t = k / n, a = e0.map((v, i) => v + (r0[i] - v) * t), b = e1.map((v, i) => v + (r1[i] - v) * t);
      const [ax, ay] = this.P(...a), [bx, by] = this.P(...b);
      c.beginPath(); c.moveTo(ax, ay); c.lineTo(bx, by); c.lineWidth = thatch ? 0.9 : 0.55; c.strokeStyle = thatch ? 'rgba(90,70,30,0.35)' : 'rgba(0,0,0,0.2)'; c.stroke();
      if (thatch) for (let s = 0; s < 6; s++) { const f = (s + 0.5) / 6, x = ax + (bx - ax) * f, y = ay + (by - ay) * f; c.beginPath(); c.moveTo(x, y); c.lineTo(x + 0.8, y + 2.4); c.lineWidth = 0.5; c.strokeStyle = 'rgba(120,95,40,0.4)'; c.stroke(); }
    }
  }
  ground(x0, y0, x1, y1, col) { this.poly([[x0, y0, 0], [x1, y0, 0], [x1, y1, 0], [x0, y1, 0]], col, 'rgba(0,0,0,0.18)'); }
  gable(x0, y0, x1, y1, z, h, col, alongX = true) {
    if (alongX) { const ym = (y0 + y1) / 2; this.poly([[x0, y1, z], [x1, y1, z], [x1, ym, z + h], [x0, ym, z + h]], shade(col, 0)); this.poly([[x1, y0, z], [x1, y1, z], [x1, ym, z + h]], shade(col, -0.35)); this.poly([[x0, y0, z], [x1, y0, z], [x1, ym, z + h], [x0, ym, z + h]], shade(col, 0.15)); this.roofRows([x0, y1, z], [x1, y1, z], [x0, ym, z + h], [x1, ym, z + h], h); this.roofRows([x0, y0, z], [x1, y0, z], [x0, ym, z + h], [x1, ym, z + h], h); }
    else { const xm = (x0 + x1) / 2; this.poly([[x0, y1, z], [x1, y1, z], [xm, y1, z + h]], shade(col, -0.15)); this.poly([[x1, y0, z], [x1, y1, z], [xm, y1, z + h], [xm, y0, z + h]], shade(col, -0.28)); this.poly([[x0, y0, z], [x0, y1, z], [xm, y1, z + h], [xm, y0, z + h]], shade(col, 0.1)); this.roofRows([x1, y0, z], [x1, y1, z], [xm, y0, z + h], [xm, y1, z + h], h); this.roofRows([x0, y0, z], [x0, y1, z], [xm, y0, z + h], [xm, y1, z + h], h); }
  }
  hip(x0, y0, x1, y1, z, h, col, inset = 0.3) {
    const a = [[x0 + inset, y0 + inset, z + h], [x1 - inset, y0 + inset, z + h], [x1 - inset, y1 - inset, z + h], [x0 + inset, y1 - inset, z + h]];
    this.poly([[x0, y1, z], [x1, y1, z], a[2], a[3]], shade(col, -0.05));
    this.poly([[x1, y0, z], [x1, y1, z], a[2], a[1]], shade(col, -0.3));
    this.poly([[x0, y0, z], [x1, y0, z], a[1], a[0]], shade(col, 0.18));
    this.poly(a, shade(col, 0.1));
    this.roofRows([x0, y1, z], [x1, y1, z], a[3], a[2], h); this.roofRows([x1, y1, z], [x1, y0, z], a[2], a[1], h); this.roofRows([x0, y0, z], [x1, y0, z], a[0], a[1], h);
  }
  pyramid(cx, cy, r, z, h, col) { const t = [cx, cy, z + h]; this.poly([[cx - r, cy + r, z], [cx + r, cy + r, z], t], shade(col, -0.08)); this.poly([[cx + r, cy - r, z], [cx + r, cy + r, z], t], shade(col, -0.32)); }
  cyl(cx, cy, r, z0, z1, col) {
    const c = this.c, [x, y0] = this.P(cx, cy, z0), [, y1] = this.P(cx, cy, z1), rx = r * HW * 1.41, ry = r * HH * 1.41;
    const g = c.createLinearGradient(x - rx, 0, x + rx, 0); g.addColorStop(0, shade(col, 0.1)); g.addColorStop(0.55, shade(col, -0.12)); g.addColorStop(1, shade(col, -0.42));
    c.beginPath(); c.ellipse(x, y0, rx, ry, 0, 0, Math.PI); c.lineTo(x - rx, y1); c.ellipse(x, y1, rx, ry, 0, Math.PI, 0, true); c.closePath(); c.fillStyle = g; c.fill(); c.strokeStyle = 'rgba(0,0,0,0.35)'; c.lineWidth = 0.6; c.stroke();
    c.beginPath(); c.ellipse(x, y1, rx, ry, 0, 0, Math.PI * 2); c.fillStyle = shade(col, 0.15); c.fill(); c.stroke();
  }
  cone(cx, cy, r, z, h, col) {
    const c = this.c, [x, y] = this.P(cx, cy, z), rx = r * HW * 1.41, ry = r * HH * 1.41;
    const g = c.createLinearGradient(x - rx, 0, x + rx, 0); g.addColorStop(0, shade(col, 0.15)); g.addColorStop(1, shade(col, -0.4));
    c.beginPath(); c.moveTo(x - rx, y); c.ellipse(x, y, rx, ry, 0, Math.PI, 0, true); c.lineTo(x, y - h); c.closePath(); c.fillStyle = g; c.fill(); c.strokeStyle = 'rgba(0,0,0,0.35)'; c.lineWidth = 0.6; c.stroke();
  }
  dome(cx, cy, r, z, col) { const c = this.c, [x, y] = this.P(cx, cy, z), rx = r * HW * 1.41; const g = c.createRadialGradient(x - rx * 0.4, y - rx * 0.6, 1, x, y, rx * 1.3); g.addColorStop(0, shade(col, 0.4)); g.addColorStop(1, shade(col, -0.35)); c.beginPath(); c.ellipse(x, y, rx, rx * 0.5, 0, 0, Math.PI); c.ellipse(x, y, rx, rx * 0.95, 0, 0, Math.PI, true); c.fillStyle = g; c.fill(); c.strokeStyle = 'rgba(0,0,0,0.3)'; c.lineWidth = 0.6; c.stroke(); }
  winY(x, y, z, w, h, col = '#2a2018') { this.poly([[x, y, z], [x + w, y, z], [x + w, y, z + h], [x, y, z + h]], col, 'rgba(255,240,200,0.25)'); }
  winX(x, y, z, w, h, col = '#2a2018') { this.poly([[x, y, z], [x, y + w, z], [x, y + w, z + h], [x, y, z + h]], col, 'rgba(255,240,200,0.2)'); }
  flag(x, y, z, h, col) { const c = this.c, [px, py] = this.P(x, y, z); line(c, px, py, px, py - h, 0.9, '#3a2a1a'); c.beginPath(); c.moveTo(px, py - h); c.quadraticCurveTo(px + 6, py - h + 1, px + 11, py - h + 3); c.lineTo(px + 10, py - h + 8); c.quadraticCurveTo(px + 5, py - h + 6, px, py - h + 6); c.closePath(); c.fillStyle = col; c.fill(); c.strokeStyle = shade(col, -0.4); c.lineWidth = 0.4; c.stroke(); }
  crenY(x0, x1, y, z, col) { for (let x = x0; x < x1 - 0.05; x += 0.5) this.box(x, y - 0.15, x + 0.25, y, z, z + 5, col); }
  crenX(y0, y1, x, z, col) { for (let y = y0; y < y1 - 0.05; y += 0.5) this.box(x - 0.15, y, x, y + 0.25, z, z + 5, col); }
}
const TALL = { star_fort: 90, monument: 150, wall_tower: 70, stone_gate: 50, palisade_gate: 42, courthouse: 95, printing_press: 95, foundry: 120, bank: 110, plantation: 50, dock: 75, town_center: 120, castle: 175, cathedral: 190, wonder: 220, watch_tower: 120, university: 120, council_hall: 110, temple: 110, mill: 95, market: 80, bazaar: 90, stone_wall: 40, palisade: 40, hospital: 90 };

export function buildingSprite(type, color, civKey, stage = 4, age = 2, variant = '') {
  const key = 'b' + type + color + civKey + stage + '|' + age + variant; let s = cache.get(key); if (s) return s;
  const size = type === 'bazaar' ? 5 : type === 'sacred' ? 3 : null;
  const sz = size || ({ star_fort: 5, monument: 3, wall_tower: 1, stone_gate: 1, palisade_gate: 1, courthouse: 3, printing_press: 3, foundry: 3, bank: 3, plantation: 2, dock: 3, town_center: 4, house: 2, farm: 3, mill: 2, lumber_camp: 2, mining_camp: 2, barracks: 3, shrine: 2, palisade: 1, archery_range: 3, stable: 3, market: 4, blacksmith: 3, watch_tower: 1, stone_wall: 1, temple: 3, infirmary: 3, council_hall: 3, castle: 4, siege_workshop: 3, university: 3, hospital: 3, cathedral: 4, wonder: 5 })[type];
  const tall = TALL[type] || 80;
  const W = sz * HW * 2 + 24, H = sz * HH * 2 + tall + 16;
  const cv = mk(W * S, H * S), c = cv.getContext('2d');
  c.scale(S, S); c.translate(sz * HW + 12, tall + 6);
  const iso = new Iso(c);
  const base = CIVS[civKey]?.style || { wall: '#d6c9ad', roof: '#9a5a3a', trim: '#5a4430' };
  // towns change with the ages: timber and thatch, then plaster and tile, then stone, then gilded grandeur
  const st = age <= 1 ? { wall: '#b59a70', roof: '#c4a55c', trim: '#5a4026' } : age === 2 ? base : { wall: mixHex(base.wall, '#bcb6aa', 0.35), roof: mixHex(base.roof, '#3a3028', 0.12), trim: base.trim };
  const prog = stage / 4;
  iso.mat = { age, wall: st.wall, trim: st.trim, roof: st.roof, stone: ['#a8a39a', '#7e7a73', '#aea9a0', '#9a958c', '#a19c93', '#d8d2c4', '#6d675f', '#5e5852', '#b9b4aa'], wood: ['#8a6238', '#7a5a34', '#8f6b44', '#6e5236', '#7a5330', '#8a6a42', '#7a5530'] };
  if (type === 'bazaar' || type === 'sacred') iso.mat = null;
  if (stage < 4) drawConstruction(iso, type, sz, st, color, prog);
  else {
    drawBuilding(iso, type, sz, st, color, variant);
    if (age >= 4 && sz >= 3 && !['farm', 'plantation', 'dock', 'star_fort', 'monument', 'wonder'].includes(type)) { iso.flag(0.15, sz - 0.15, 0, 26 + sz * 4, color); iso.flag(sz - 0.15, 0.15, 0, 26 + sz * 4, color); if (age >= 5) { const [gx, gy] = iso.P(sz / 2, sz / 2, (TALL[type] || 80) * 0.55); ell(c, gx, gy, 4, 2, 'rgba(255,215,110,0.55)'); } }
  }
  s = { cv, ax: (sz * HW + 12) * S, ay: (tall + 6) * S, size: sz };
  cache.set(key, s); return s;
}
function drawConstruction(iso, type, sz, st, team, prog) {
  if (type !== 'farm' && sz >= 2) return drawSite(iso, type, sz, st, team, prog);
  return drawConstructionSimple(iso, type, sz, st, team, prog);
}
// Building sites in four stages: staked-out foundation, timber frame, rising walls, roof rafters,
// with stacks of the materials the building costs (logs, cut stone, sacks of gold).
function drawSite(iso, type, sz, st, team, prog) {
  const c = iso.c, cost = BUILDINGS[type]?.cost || {}, tall = (TALL[type] || 60) * 0.42, stoneB = (cost.stone || 0) >= (cost.wood || 0);
  const wallCol = stoneB ? '#a8a39a' : st.wall, wood = '#8a6238', frame = '#6b4a2a', m = 0.35, x1 = sz - m, y1 = sz - m;
  iso.ground(0.05, 0.05, sz - 0.05, sz - 0.05, '#9c8460');
  for (let k = 0; k < sz * 4; k++) { const x = 0.2 + (k * 0.37) % (sz - 0.4), y = 0.2 + (k * 0.61) % (sz - 0.4); iso.poly([[x, y, 0], [x + 0.18, y, 0], [x + 0.18, y + 0.12, 0], [x, y + 0.12, 0]], '#86704c', null); }
  // foundation course
  iso.box(m, m, x1, y1, 0, 3, '#9a958c');
  const posts = [];
  for (let t = 0; t <= 1.001; t += 1 / Math.max(2, sz)) posts.push([m + (x1 - m) * t, y1], [x1, m + (y1 - m) * t]);
  posts.push([m, m], [m, y1], [x1, m]);
  if (prog < 0.25) {
    // surveyor's stakes and strings
    for (const [x, y] of [[m, m], [x1, m], [x1, y1], [m, y1]]) { const [px, py] = iso.P(x, y, 3); line(c, px, py, px, py - 9, 1, '#5b3d22'); }
    for (const [a, b] of [[[m, y1], [x1, y1]], [[x1, m], [x1, y1]]]) { const [ax, ay] = iso.P(...a, 10), [bx, by] = iso.P(...b, 10); line(c, ax, ay, bx, by, 0.4, '#e8e0c8'); }
  } else {
    const wallH = prog >= 0.75 ? tall * 0.85 : prog >= 0.5 ? tall * 0.5 : 0;
    if (wallH > 0) iso.box(m + 0.05, m + 0.05, x1 - 0.05, y1 - 0.05, 3, 3 + wallH, wallCol);
    // timber frame: posts and beams above the walls
    const fh = tall * 0.92;
    for (const [x, y] of posts) { const [px, py] = iso.P(x, y, 3); line(c, px, py, px, py - fh, 1.4, frame); }
    for (const [a, b] of [[[m, y1], [x1, y1]], [[x1, m], [x1, y1]], [[m, m], [x1, m]], [[m, m], [m, y1]]]) { const [ax, ay] = iso.P(...a, 3 + fh), [bx, by] = iso.P(...b, 3 + fh); line(c, ax, ay, bx, by, 1.4, frame); }
    if (prog >= 0.75) { // roof rafters
      const ym = sz / 2, rh = tall * 0.45;
      for (let t = 0; t <= 1.001; t += 0.25) { const x = m + (x1 - m) * t; const [ax, ay] = iso.P(x, y1, 3 + fh), [bx, by] = iso.P(x, ym, 3 + fh + rh), [cx2, cy2] = iso.P(x, m, 3 + fh); line(c, ax, ay, bx, by, 1, frame); line(c, bx, by, cx2, cy2, 1, frame); }
      const [r0x, r0y] = iso.P(m, ym, 3 + fh + rh), [r1x, r1y] = iso.P(x1, ym, 3 + fh + rh); line(c, r0x, r0y, r1x, r1y, 1.3, frame);
    }
    // scaffold planks along the front
    for (let z = 10; z < fh; z += 12) iso.poly([[m - 0.12, y1 + 0.12, z], [x1 + 0.12, y1 + 0.12, z], [x1 + 0.12, y1 + 0.12, z + 0.9], [m - 0.12, y1 + 0.12, z + 0.9]], '#9a7444', null);
  }
  // material stacks at the corner of the site
  for (let k = 0; k < 3; k++) { const [px, py] = iso.P(0.18 + k * 0.12, sz - 0.2, 1.5 + k * 1.6); line(c, px - 7, py, px + 7, py + 3.5, 2.2, '#8a5a2e'); ell(c, px + 7, py + 3.5, 1.2, 1.2, '#c6935a'); }
  if (cost.stone) for (let k = 0; k < 4; k++) { const x = sz - 0.75 + (k % 2) * 0.28, y = 0.15 + ((k / 2) | 0) * 0.28; iso.box(x, y, x + 0.24, y + 0.24, 0, 3.5 + (k > 1 ? 3.5 : 0), '#b3ad9f'); }
  if (cost.gold || cost.iron) { const [gx, gy] = iso.P(sz - 0.3, sz - 0.4, 0); ell(c, gx, gy - 2.5, 3, 2.6, '#a8844e'); ell(c, gx + 4, gy - 1.5, 2.6, 2.2, '#9a7648'); }
  if (sz >= 4 && prog >= 0.25) { const [bx, by] = iso.P(sz - 0.3, 0.3, 0), top = by - tall - 22; line(c, bx, by, bx, top, 1.6, wood); line(c, bx, top, bx - 26, top + 6, 1.4, wood); line(c, bx - 26, top + 6, bx - 26, top + 24, 0.5, '#e8e0c8'); poly(c, [bx - 29, top + 24, bx - 23, top + 24, bx - 23, top + 29, bx - 29, top + 29], '#b3ad9f'); }
  iso.flag(0.2, 0.2, 0, 16, team);
}
function drawConstructionSimple(iso, type, sz, st, team, prog) {
  const c = iso.c;
  iso.ground(0.1, 0.1, sz - 0.1, sz - 0.1, '#9c8460');
  for (let k = 0; k < sz * 3; k++) { const x = 0.2 + (k * 0.37) % (sz - 0.4), y = 0.2 + (k * 0.61) % (sz - 0.4); iso.poly([[x, y, 0], [x + 0.18, y, 0], [x + 0.18, y + 0.12, 0], [x, y + 0.12, 0]], '#7b6545', null); }
  if (type === 'farm') { for (let r = 0; r < 5; r++) iso.poly([[0.3, 0.3 + r * 0.55, 0], [sz - 0.3, 0.3 + r * 0.55, 0], [sz - 0.3, 0.45 + r * 0.55, 0], [0.3, 0.45 + r * 0.55, 0]], '#6b5232', null); return; }
  const h = Math.max(3, (TALL[type] || 60) * 0.45 * prog);
  if (prog > 0.25) iso.box(0.4, 0.4, sz - 0.4, sz - 0.4, 0, h * 0.8, st.wall);
  // scaffolding
  const pole = (x, y) => { const [px, py] = iso.P(x, y, 0); line(c, px, py, px, py - h - 6, 0.9, '#8a6438'); };
  for (const [x, y] of [[0.25, sz - 0.25], [sz - 0.25, sz - 0.25], [sz - 0.25, 0.25], [sz / 2, sz - 0.25], [sz - 0.25, sz / 2]]) pole(x, y);
  for (let z = 6; z < h + 4; z += 8) { iso.poly([[0.25, sz - 0.25, z], [sz - 0.25, sz - 0.25, z], [sz - 0.25, sz - 0.25, z + 0.8], [0.25, sz - 0.25, z + 0.8]], '#9a7444', null); iso.poly([[sz - 0.25, 0.25, z], [sz - 0.25, sz - 0.25, z], [sz - 0.25, sz - 0.25, z + 0.8], [sz - 0.25, 0.25, z + 0.8]], '#8a6438', null); }
  // material piles
  iso.box(sz - 0.9, 0.1, sz - 0.2, 0.5, 0, 3, '#b29a72');
  for (let k = 0; k < 3; k++) { const [px, py] = iso.P(0.3 + k * 0.15, 0.2, 2 + k * 1.6); line(c, px - 6, py, px + 6, py + 3, 1.6, '#8a5a2e'); }
  iso.flag(0.2, 0.2, 0, 16, team);
}
function drawBuilding(iso, type, sz, st, team, variant = '') {
  const c = iso.c, W = st.wall, R = st.roof, T = st.trim;
  const stone = '#a8a39a', darkStone = '#7e7a73', wood = '#8a6238';
  const base = (col = '#8f8269') => iso.ground(0, 0, sz, sz, col);
  switch (type) {
    case 'town_center': {
      base('#9b8d6e');
      iso.box(0.2, 0.2, 3.8, 3.8, 0, 10, stone);
      iso.box(0.5, 0.5, 3.5, 3.5, 10, 42, W);
      for (let x = 0.8; x < 3.3; x += 0.75) { iso.winY(x, 3.5, 24, 0.3, 9); iso.winX(3.5, x, 24, 0.3, 9); }
      iso.winY(1.6, 3.5, 10, 0.8, 14, '#3b2a1a');
      iso.hip(0.3, 0.3, 3.7, 3.7, 42, 26, R, 0.9);
      iso.box(1.6, 1.6, 2.4, 2.4, 50, 82, W);
      iso.winY(1.85, 2.4, 66, 0.3, 8); iso.winX(2.4, 1.85, 66, 0.3, 8);
      iso.pyramid(2, 2, 0.6, 82, 26, R);
      iso.flag(2, 2, 106, 14, team);
      iso.flag(0.4, 3.6, 10, 30, team); iso.flag(3.6, 0.4, 10, 30, team);
      break;
    }
    case 'house': {
      base('#9a8c6c');
      iso.box(0.25, 0.25, 1.75, 1.75, 0, 18, W);
      iso.winY(0.5, 1.75, 6, 0.3, 6); iso.winY(1.1, 1.75, 0, 0.35, 10, '#4a3420'); iso.winX(1.75, 0.6, 7, 0.35, 6);
      iso.gable(0.15, 0.15, 1.85, 1.85, 18, 16, R, (sz + type.length) % 2 === 0);
      iso.box(1.2, 0.5, 1.45, 0.75, 22, 36, darkStone);
      // team ribbon over the door
      iso.poly([[1.0, 1.76, 12], [1.6, 1.76, 12], [1.6, 1.76, 13.5], [1.0, 1.76, 13.5]], team, null);
      // window boxes, a barrel and a woodpile; a little garden fence in later ages
      iso.poly([[0.45, 1.77, 5], [0.85, 1.77, 5], [0.85, 1.77, 6.2], [0.45, 1.77, 6.2]], '#5b3d22', null);
      for (let k = 0; k < 3; k++) { const [fx, fy] = iso.P(0.52 + k * 0.13, 1.78, 6.6); ell(c, fx, fy, 1.1, 1.1, ['#d84a5a', '#f2d25a', '#d84a5a'][k]); }
      iso.cyl(1.88, 1.1, 0.09, 0, 6, '#7a5330');
      for (let k = 0; k < 3; k++) { const [lx, ly] = iso.P(1.86, 0.35 + k * 0.1, 1 + k * 1.4); line(c, lx - 3, ly, lx + 3, ly + 1.5, 1.6, '#8a5a2e'); }
      if (iso.mat?.age >= 3) for (let x = 0.15; x < 1.9; x += 0.25) { const [px, py] = iso.P(x, 1.95, 0); line(c, px, py, px, py - 4, 0.7, '#7a5a34'); }
      break;
    }
    case 'farm': {
      iso.ground(0, 0, 3, 3, '#7b5b37');
      for (let r = 0; r < 6; r++) { const y = 0.2 + r * 0.45; iso.poly([[0.2, y, 0], [2.8, y, 0], [2.8, y + 0.25, 0], [0.2, y + 0.25, 0]], '#5c4428', null); for (let x = 0.3; x < 2.8; x += 0.28) iso.poly([[x, y + 0.02, 0], [x + 0.12, y + 0.02, 0], [x + 0.06, y + 0.12, 4.5]], r % 2 ? '#9ab84a' : '#c7b450', null); }
      for (let k = 0; k <= 6; k++) { const [px, py] = iso.P(k * 0.5, 3, 0); line(c, px, py, px, py - 4, 0.8, '#6b4a2a'); }
      iso.poly([[0, 3, 3], [3, 3, 3], [3, 3, 3.6], [0, 3, 3.6]], '#7a5530', null);
      break;
    }
    case 'mill': {
      base();
      iso.cyl(1, 1, 0.65, 0, 44, W);
      iso.cone(1, 1, 0.72, 44, 22, R);
      const [hx, hy] = iso.P(1.55, 1.55, 36);
      for (let k = 0; k < 4; k++) { const a = k * Math.PI / 2 + 0.4; c.save(); c.translate(hx, hy); c.rotate(a); poly(c, [0, -1, 26, -3, 26, 4, 0, 1], '#efe8d6', '#6b4a2a', 0.6); line(c, 0, 0, 26, 0, 1, '#6b4a2a'); c.restore(); }
      ell(c, hx, hy, 2, 2, '#4a3420');
      for (let k = 0; k < 3; k++) { const [sx, sy] = iso.P(0.2 + k * 0.3, 1.9, 0); ell(c, sx, sy - 3, 3, 3.4, '#d8c08a'); }
      break;
    }
    case 'palisade_gate': case 'stone_gate': {
      const sg = type === 'stone_gate', col = sg ? stone : wood, h = sg ? 30 : 26, open = variant === 'open';
      iso.box(0.02, 0.05, 0.3, 0.95, 0, h, col); iso.box(0.7, 0.05, 0.98, 0.95, 0, h, col);
      if (sg) { iso.box(0.02, 0.05, 0.98, 0.95, h - 8, h, stone); iso.crenY(0.02, 0.98, 0.95, h, stone); }
      else { iso.box(0.02, 0.4, 0.98, 0.6, h - 6, h - 3, '#5b3d22'); }
      if (open) iso.poly([[0.3, 0.95, 0], [0.7, 0.95, 0], [0.7, 0.95, h - 8], [0.3, 0.95, h - 8]], '#1a140e', null);
      else { iso.poly([[0.3, 0.95, 0], [0.7, 0.95, 0], [0.7, 0.95, h - 8], [0.3, 0.95, h - 8]], '#7a5330', '#3a2818'); for (const z of [5, 12]) iso.poly([[0.3, 0.95, z], [0.7, 0.95, z], [0.7, 0.95, z + 1.2], [0.3, 0.95, z + 1.2]], '#3a3d42', null); }
      iso.flag(0.5, 0.5, h, 10, team);
      break;
    }
    case 'wall_tower': {
      iso.cyl(0.5, 0.5, 0.48, 0, 44, stone);
      for (let k = 0; k < 6; k++) { const a = k / 6 * Math.PI * 2; iso.box(0.5 + Math.cos(a) * 0.38 - 0.08, 0.5 + Math.sin(a) * 0.38 - 0.08, 0.5 + Math.cos(a) * 0.38 + 0.08, 0.5 + Math.sin(a) * 0.38 + 0.08, 44, 50, stone); }
      iso.winX(0.95, 0.42, 26, 0.16, 7); iso.winY(0.42, 0.95, 26, 0.16, 7);
      iso.cone(0.5, 0.5, 0.42, 50, 16, R); iso.flag(0.5, 0.5, 66, 9, team);
      break;
    }
    case 'courthouse': {
      base('#a29572');
      iso.box(0.25, 0.25, 2.75, 2.75, 0, 3, '#d8d2c4');
      iso.box(0.4, 0.4, 2.6, 2.4, 3, 28, W);
      for (let x = 0.5; x < 2.6; x += 0.42) iso.box(x, 2.45, x + 0.14, 2.6, 3, 28, '#ece6d8');
      iso.gable(0.3, 0.3, 2.7, 2.7, 28, 14, R, true);
      iso.winY(1.2, 2.4, 3, 0.6, 14, '#3b2a1a');
      { const [sx, sy] = iso.P(1.5, 2.7, 46); line(c, sx - 6, sy, sx + 6, sy, 1, '#c9a540'); line(c, sx, sy, sx, sy - 6, 1, '#c9a540'); ell(c, sx - 6, sy + 2, 2.4, 1, '#c9a540'); ell(c, sx + 6, sy + 2, 2.4, 1, '#c9a540'); }
      iso.flag(0.3, 0.3, 28, 18, team);
      break;
    }
    case 'plantation': {
      const rowCol = { wine: '#6a3a7a', spice: '#c4542a', silk: '#e8e4d4', salt: '#eeeeea' }[variant] || '#5c8a3a';
      iso.ground(0, 0, sz, sz, '#8a7650');
      for (let r = 0; r < 4; r++) { iso.poly([[0.15, 0.2 + r * 0.42, 0], [1.3, 0.2 + r * 0.42, 0], [1.3, 0.38 + r * 0.42, 0], [0.15, 0.38 + r * 0.42, 0]], '#4f7a32', null); for (let k = 0; k < 4; k++) { const [px, py] = iso.P(0.3 + k * 0.28, 0.29 + r * 0.42, 2); ell(c, px, py, 2.2, 1.6, rowCol); } }
      iso.box(1.4, 0.3, 1.9, 1.7, 0, 14, wood); iso.gable(1.35, 0.25, 1.95, 1.75, 14, 7, R, false);
      iso.flag(1.9, 1.8, 0, 20, team);
      break;
    }
    case 'monument': {
      base('#b9b2a2');
      iso.box(0.4, 0.4, 2.6, 2.6, 0, 6, '#d6d0c2'); iso.box(0.8, 0.8, 2.2, 2.2, 6, 14, '#cfc8b8');
      iso.box(1.25, 1.25, 1.75, 1.75, 14, 96, mixHex(st.wall, '#e8e2d2', 0.5));
      iso.pyramid(1.5, 1.5, 0.25, 96, 18, '#e3c26a');
      for (const [x, y] of [[0.55, 2.45], [2.45, 0.55], [2.45, 2.45]]) { iso.cyl(x, y, 0.12, 6, 16, '#7e7a73'); const [fx, fy] = iso.P(x, y, 18); ell(c, fx, fy, 4, 4, 'rgba(255,180,70,0.35)'); ell(c, fx, fy - 1, 1.8, 3, '#ffbf4a'); }
      iso.flag(0.5, 0.5, 6, 30, team);
      break;
    }
    case 'printing_press': {
      base('#93876a');
      iso.box(0.3, 0.3, 2.7, 2.7, 0, 34, W);
      for (let x = 0.6; x < 2.5; x += 0.6) { iso.winY(x, 2.7, 14, 0.36, 12); iso.winX(2.7, x, 14, 0.36, 12); }
      iso.hip(0.2, 0.2, 2.8, 2.8, 34, 18, R, 0.6);
      iso.box(2.1, 0.5, 2.4, 0.8, 40, 62, darkStone);
      for (let k = 0; k < 3; k++) { const [px, py] = iso.P(0.6 + k * 0.5, 2.85, 2); poly(c, [px - 3, py, px + 3, py, px + 3, py - 5, px - 3, py - 5], '#efe7d0', '#8a7a5a', 0.4); }
      iso.flag(0.3, 0.3, 34, 16, team);
      break;
    }
    case 'foundry': {
      base('#7c7468');
      iso.box(0.3, 0.3, 2.7, 2.7, 0, 30, '#6d675f');
      iso.gable(0.2, 0.2, 2.8, 2.8, 30, 12, '#4a4440', true);
      iso.cyl(2.2, 0.8, 0.28, 30, 84, '#5e5852');
      { const [fx, fy] = iso.P(2.2, 0.8, 86); ell(c, fx, fy, 5, 3, 'rgba(255,150,60,0.45)'); }
      iso.winY(1.0, 2.7, 0, 0.9, 16, '#2a1a10'); { const [gx, gy] = iso.P(1.45, 2.7, 6); ell(c, gx, gy, 6, 4, 'rgba(255,140,50,0.55)'); }
      { const [cx2, cy2] = iso.P(0.6, 2.95, 4); line(c, cx2 - 8, cy2, cx2 + 8, cy2 - 4, 4, '#3c3f44'); }
      iso.flag(0.3, 0.3, 30, 16, team);
      break;
    }
    case 'bank': {
      base('#a3987c');
      iso.box(0.25, 0.25, 2.75, 2.75, 0, 4, '#e2dccc');
      iso.box(0.45, 0.45, 2.55, 2.55, 4, 34, '#e9e3d4');
      for (let x = 0.55; x < 2.5; x += 0.38) { iso.box(x, 2.5, x + 0.12, 2.62, 4, 34, '#f4efe2'); iso.box(2.5, x, 2.62, x + 0.12, 4, 34, '#f4efe2'); }
      iso.box(0.35, 0.35, 2.65, 2.65, 34, 40, '#d8d0bc');
      iso.dome(1.5, 1.5, 0.85, 40, '#d9b13b');
      iso.flag(1.5, 1.5, 70, 14, team);
      break;
    }
    case 'star_fort': {
      iso.ground(0, 0, sz, sz, '#8b8170');
      const wallC = '#9a958c';
      iso.box(0.6, 0.6, 4.4, 4.4, 0, 16, wallC, shade(wallC, 0.15));
      for (const [x, y] of [[0, 0], [3.6, 0], [0, 3.6], [3.6, 3.6]]) { iso.box(x, y, x + 1.4, y + 1.4, 0, 18, '#a19c93', '#a8a398'); const [px, py] = iso.P(x + 0.7, y + 0.7, 18); line(c, px - 5, py, px + 7, py - 3, 2.6, '#33363b'); }
      iso.box(1.7, 1.7, 3.3, 3.3, 16, 46, st.wall);
      iso.hip(1.6, 1.6, 3.4, 3.4, 46, 16, R, 0.4);
      iso.flag(2.5, 2.5, 62, 18, team); iso.flag(0.4, 0.4, 18, 16, team); iso.flag(4.6, 4.6, 18, 16, team);
      break;
    }
    case 'dock': {
      // a timber pier with a boathouse and a crane
      iso.ground(0, 0, sz, sz, '#6e5638');
      for (let k = 0; k < 10; k++) iso.poly([[0.1 + k * 0.29, 0.1, 0.5], [0.33 + k * 0.29, 0.1, 0.5], [0.33 + k * 0.29, sz - 0.1, 0.5], [0.1 + k * 0.29, sz - 0.1, 0.5]], k % 2 ? '#9a7748' : '#8c6a3e', 'rgba(0,0,0,0.2)', 0.4);
      for (const [x, y] of [[0.1, sz - 0.1], [sz - 0.1, sz - 0.1], [sz - 0.1, 0.1], [sz / 2, sz - 0.1]]) { const [px, py] = iso.P(x, y, 0); line(c, px, py + 6, px, py - 3, 2, '#4d3520'); }
      iso.box(0.3, 0.3, 1.7, 1.8, 0.5, 20, wood);
      iso.gable(0.2, 0.2, 1.8, 1.9, 20, 11, R, false);
      iso.winY(0.6, 1.8, 0.5, 0.7, 12, '#1e1812');
      { const [a, b] = iso.P(2.4, 2.2, 0.5), [d, e] = iso.P(2.4, 2.2, 34); line(c, a, b, d, e, 1.6, wood); const [f, h] = iso.P(2.9, 2.9, 30); line(c, d, e, f, h, 1.4, wood); line(c, f, h, f, h + 12, 0.6, '#d8cfa8'); ell(c, f, h + 13, 2, 1.4, '#6b4a2a'); }
      iso.box(2.1, 0.4, 2.7, 0.9, 0.5, 5, '#8a6a42'); ell(c, ...iso.P(2.5, 1.4, 1), 3.2, 1.6, '#7a6a5a');
      iso.flag(0.2, 1.9, 20, 18, team);
      break;
    }
    case 'lumber_camp': {
      base('#8c7a5a');
      for (const [x, y] of [[0.2, 0.2], [1.8, 0.2], [0.2, 1.8], [1.8, 1.8]]) { const [px, py] = iso.P(x, y, 0); line(c, px, py, px, py - 20, 1.4, wood); }
      iso.gable(0.1, 0.1, 1.9, 1.9, 20, 10, '#7a5a34', true);
      for (let k = 0; k < 4; k++) { const [a, b] = iso.P(0.4, 0.5 + k * 0.32, 3 + (k % 2) * 3); const [d, e] = iso.P(1.6, 0.5 + k * 0.32, 3 + (k % 2) * 3); line(c, a, b, d, e, 3.6, '#7a4a24'); ell(c, d, e, 1.8, 1.8, '#c6935a'); }
      iso.flag(1.9, 1.9, 0, 26, team);
      break;
    }
    case 'mining_camp': {
      base('#857a66');
      iso.box(0.2, 0.2, 1.4, 1.8, 0, 14, wood);
      iso.gable(0.1, 0.1, 1.5, 1.9, 14, 9, '#6e5236', false);
      iso.winY(0.5, 1.8, 0, 0.5, 10, '#1e1812');
      const [mx, my] = iso.P(1.7, 1.2, 0); poly(c, [mx - 7, my - 2, mx + 7, my - 2, mx + 5, my - 8, mx - 5, my - 8], '#5a4632'); ell(c, mx, my - 8, 5, 2, '#b0aaa0'); ell(c, mx - 2, my - 9, 1.5, 1, '#ffd84a');
      ell(c, mx - 4, my, 1.6, 1.6, '#2a2218'); ell(c, mx + 4, my, 1.6, 1.6, '#2a2218');
      iso.flag(1.9, 0.2, 0, 24, team);
      break;
    }
    case 'barracks': {
      base('#8e8064');
      iso.box(0.2, 0.3, 2.8, 2.0, 0, 24, W);
      iso.gable(0.1, 0.2, 2.9, 2.1, 24, 16, R, true);
      iso.winY(1.2, 2.0, 0, 0.6, 14, '#3a2818');
      for (let x = 0.4; x < 2.6; x += 0.55) iso.winY(x, 2.0, 12, 0.22, 5);
      // training yard
      for (const x of [0.6, 1.4, 2.2]) { const [px, py] = iso.P(x, 2.6, 0); line(c, px, py, px, py - 12, 1.4, wood); line(c, px - 4, py - 9, px + 4, py - 9, 1.4, wood); ell(c, px, py - 13, 2, 2, '#c9b48a'); }
      iso.poly([[2.85, 0.3, 26], [2.85, 1.2, 26], [2.85, 1.2, 12], [2.85, 0.3, 12]], team);
      iso.flag(0.2, 0.3, 24, 22, team);
      break;
    }
    case 'shrine': {
      base('#9b9070');
      iso.box(0.3, 0.3, 1.7, 1.7, 0, 5, stone);
      for (const [x, y] of [[0.45, 0.45], [1.55, 0.45], [0.45, 1.55], [1.55, 1.55]]) iso.box(x - 0.1, y - 0.1, x + 0.1, y + 0.1, 5, 26, '#e0d8c4');
      iso.pyramid(1, 1, 0.85, 26, 14, R);
      const [fx, fy] = iso.P(1, 1, 10); ell(c, fx, fy, 6, 6, 'rgba(255,200,90,0.25)'); ell(c, fx, fy, 2.6, 3.5, '#ffcf5a'); ell(c, fx, fy + 0.5, 1.3, 2, '#fff2b0');
      break;
    }
    case 'palisade': {
      for (let k = 0; k < 4; k++) { const x = 0.15 + k * 0.23; const [px, py] = iso.P(x, 0.5 + k * 0.02, 0); poly(c, [px - 2.4, py, px + 2.4, py, px + 2.4, py - 22, px, py - 26, px - 2.4, py - 22], shade(wood, (k % 2) * -0.15), '#3a2818', 0.5); }
      break;
    }
    case 'stone_wall': {
      iso.box(0.05, 0.05, 0.95, 0.95, 0, 22, stone);
      iso.crenY(0.05, 0.95, 0.95, 22, stone); iso.crenX(0.05, 0.95, 0.95, 22, stone);
      iso.poly([[0.05, 0.95, 4], [0.95, 0.95, 4], [0.95, 0.95, 5], [0.05, 0.95, 5]], darkStone, null);
      break;
    }
    case 'archery_range': {
      base('#8f8466');
      iso.box(0.2, 0.2, 1.6, 1.2, 0, 16, W);
      iso.gable(0.1, 0.1, 1.7, 1.3, 16, 10, R, true);
      for (const [x, y] of [[2.4, 0.6], [2.4, 1.6], [2.4, 2.5]]) { const [px, py] = iso.P(x, y, 0); line(c, px, py, px + 2, py - 10, 1, wood); ell(c, px, py - 12, 5, 5, '#efe3c4'); ell(c, px, py - 12, 3.6, 3.6, '#c0283a'); ell(c, px, py - 12, 2, 2, '#efe3c4'); ell(c, px, py - 12, 0.9, 0.9, '#c0283a'); }
      for (let k = 0; k < 5; k++) { const [px, py] = iso.P(0.4 + k * 0.25, 1.9, 0); line(c, px, py, px + 1, py - 9, 0.6, '#6b4a2a'); }
      iso.flag(0.2, 1.2, 16, 18, team);
      break;
    }
    case 'stable': {
      base('#8a7a58');
      iso.box(0.2, 0.2, 2.8, 2.2, 0, 22, '#8f6b44');
      iso.gable(0.1, 0.1, 2.9, 2.3, 22, 15, R, true);
      for (const x of [0.5, 1.3, 2.1]) { iso.winY(x, 2.2, 0, 0.55, 13, '#2a1e14'); iso.poly([[x, 2.2, 13], [x + 0.55, 2.2, 0], [x + 0.55, 2.2, 1.4], [x, 2.2, 14.4]], '#c9a26a', null); }
      for (let k = 0; k < 3; k++) { const [px, py] = iso.P(2.5 + k * 0.1, 2.6, 0); ell(c, px, py - 3, 4, 3, '#d8c070'); }
      iso.flag(2.8, 0.2, 22, 18, team);
      break;
    }
    case 'market': {
      base('#a08f6a');
      const aw = ['#d8403a', '#e3a32a', '#3d7fe0', '#36a85c'];
      let k = 0;
      for (const [x, y] of [[0.3, 0.3], [2.3, 0.3], [0.3, 2.3], [2.3, 2.3]]) {
        iso.box(x, y, x + 1.4, y + 1.4, 0, 8, '#8a6238');
        iso.gable(x - 0.05, y - 0.05, x + 1.45, y + 1.45, 14, 6, k % 2 ? team : aw[k], k % 2 === 0);
        for (const [px, py] of [[x, y + 1.4], [x + 1.4, y + 1.4], [x + 1.4, y]]) { const [a, b] = iso.P(px, py, 0); line(c, a, b, a, b - 14, 0.9, '#5a3b22'); }
        for (let j = 0; j < 3; j++) { const [a, b] = iso.P(x + 0.3 + j * 0.4, y + 1.45, 8); ell(c, a, b - 1.5, 2, 1.5, ['#e3a32a', '#9ab84a', '#c0283a'][j]); }
        k++;
      }
      iso.cyl(2, 2, 0.35, 0, 7, stone); { const [a, b] = iso.P(2, 2, 7); ell(c, a, b, 7, 3.5, '#3d6f9a'); }
      break;
    }
    case 'blacksmith': {
      base('#7f7562');
      iso.box(0.2, 0.2, 2.8, 2.6, 0, 20, darkStone);
      iso.gable(0.1, 0.1, 2.9, 2.7, 20, 12, '#5b4b40', true);
      iso.box(2.1, 0.4, 2.6, 0.9, 20, 46, '#6a6560');
      const [a, b] = iso.P(2.35, 0.65, 46); ell(c, a, b - 4, 5, 3, 'rgba(90,90,90,0.4)'); ell(c, a + 3, b - 10, 6, 4, 'rgba(110,110,110,0.3)');
      iso.winY(1, 2.6, 0, 0.8, 12, '#ff8a2a'); iso.winY(1.05, 2.6, 0, 0.7, 10, '#ffb84a');
      { const [ax, ay] = iso.P(2, 2.9, 0); poly(c, [ax - 5, ay - 4, ax + 5, ay - 4, ax + 3, ay - 7, ax - 3, ay - 7], '#3a3a3e'); line(c, ax - 2, ay, ax - 2, ay - 4, 2, '#3a3a3e'); }
      iso.flag(0.2, 2.6, 20, 18, team);
      break;
    }
    case 'watch_tower': {
      iso.ground(0, 0, 1, 1, '#8f8269');
      iso.box(0.15, 0.15, 0.85, 0.85, 0, 66, stone);
      iso.winY(0.4, 0.85, 30, 0.18, 9); iso.winX(0.85, 0.4, 46, 0.18, 9);
      iso.box(0.02, 0.02, 0.98, 0.98, 66, 78, wood);
      iso.pyramid(0.5, 0.5, 0.6, 78, 26, R);
      iso.flag(0.5, 0.5, 104, 12, team);
      break;
    }
    case 'temple': {
      base('#a59a80');
      iso.box(0.1, 0.1, 2.9, 2.9, 0, 6, '#e3dccb');
      iso.box(0.5, 0.5, 2.5, 2.5, 6, 44, '#ece6d6');
      for (let x = 0.3; x < 2.8; x += 0.42) { iso.box(x, 2.6, x + 0.16, 2.76, 6, 42, '#f6f1e4'); iso.box(2.6, x, 2.76, x + 0.16, 6, 42, '#dcd5c3'); }
      iso.hip(0.2, 0.2, 2.8, 2.8, 44, 12, '#d9b13b', 0.6);
      iso.dome(1.5, 1.5, 0.75, 56, '#e6c357');
      iso.flag(1.5, 1.5, 82, 14, team);
      break;
    }
    case 'infirmary': {
      base('#9a9278');
      iso.box(0.2, 0.2, 2.2, 2.8, 0, 20, '#ece9e0');
      iso.gable(0.1, 0.1, 2.3, 2.9, 20, 12, '#7a8a6a', false);
      for (let y = 0.5; y < 2.6; y += 0.6) iso.winX(2.2, y, 8, 0.3, 7);
      iso.poly([[1.0, 2.81, 10], [1.4, 2.81, 10], [1.4, 2.81, 16], [1.0, 2.81, 16]], '#3fae5f', null);
      // tent
      iso.pyramid(2.6, 0.7, 0.4, 0, 14, '#efe3c4');
      iso.flag(0.2, 2.8, 20, 16, team);
      break;
    }
    case 'council_hall': {
      base('#a09474');
      iso.box(0.1, 0.1, 2.9, 2.9, 0, 6, stone);
      iso.box(0.4, 0.4, 2.6, 2.6, 6, 36, W);
      for (let x = 0.3; x < 2.8; x += 0.5) iso.box(x, 2.65, x + 0.18, 2.83, 6, 36, '#efe9da');
      iso.gable(0.25, 0.25, 2.75, 2.95, 36, 12, R, false);
      iso.cyl(1.5, 1.4, 0.55, 40, 52, W);
      iso.dome(1.5, 1.4, 0.58, 52, '#6c8fa0');
      iso.flag(1.5, 1.4, 78, 14, team); iso.flag(0.2, 2.9, 6, 26, team); iso.flag(2.9, 0.2, 6, 26, team);
      break;
    }
    case 'castle': {
      base('#8a8068');
      const H = 38;
      iso.box(0.3, 0.3, 3.7, 0.7, 0, H, stone); iso.box(0.3, 0.3, 0.7, 3.7, 0, H, stone);
      iso.box(1.2, 1.2, 2.8, 2.8, 0, 78, '#aea9a0');
      iso.crenY(1.2, 2.8, 2.8, 78, stone); iso.crenX(1.2, 2.8, 2.8, 78, stone);
      for (let x = 1.4; x < 2.7; x += 0.45) { iso.winY(x, 2.8, 50, 0.15, 8); iso.winX(2.8, x, 58, 0.15, 8); }
      iso.box(0.3, 3.3, 3.7, 3.7, 0, H, stone); iso.box(3.3, 0.3, 3.7, 3.7, 0, H, stone);
      iso.crenY(0.3, 3.7, 3.7, H, stone); iso.crenX(0.3, 3.7, 3.7, H, stone);
      iso.winY(1.6, 3.7, 0, 0.8, 18, '#2a2018');
      iso.poly([[1.6, 3.71, 18], [2.4, 3.71, 18], [2.4, 3.71, 20], [1.6, 3.71, 20]], team, null);
      for (const [x, y] of [[0.5, 0.5], [3.5, 0.5], [0.5, 3.5], [3.5, 3.5]]) { iso.cyl(x, y, 0.45, 0, 58, stone); iso.cone(x, y, 0.52, 58, 24, R); }
      iso.flag(2, 2, 82, 30, team); iso.flag(3.5, 3.5, 82, 14, team); iso.flag(0.5, 3.5, 82, 14, team); iso.flag(3.5, 0.5, 82, 14, team);
      break;
    }
    case 'siege_workshop': {
      base('#857659');
      iso.box(0.2, 0.2, 2.2, 2.8, 0, 22, wood);
      iso.gable(0.1, 0.1, 2.3, 2.9, 22, 14, '#6e5236', false);
      iso.winY(0.6, 2.8, 0, 1, 16, '#2a1e14');
      const [a, b] = iso.P(2.6, 1.5, 0); line(c, a, b, a + 4, b - 34, 1.8, wood); line(c, a + 4, b - 34, a - 12, b - 28, 1.4, wood); line(c, a - 12, b - 28, a - 12, b - 18, 0.6, '#ccc');
      iso.flag(0.2, 2.8, 22, 18, team);
      break;
    }
    case 'university': {
      base('#9c9074');
      iso.box(0.2, 0.2, 2.8, 2.8, 0, 30, W);
      for (let x = 0.5; x < 2.6; x += 0.5) { iso.winY(x, 2.8, 14, 0.22, 9); iso.winX(2.8, x, 14, 0.22, 9); }
      iso.hip(0.1, 0.1, 2.9, 2.9, 30, 12, R, 0.5);
      iso.box(1.2, 1.2, 1.8, 1.8, 36, 70, W); iso.winY(1.4, 1.8, 54, 0.2, 8);
      iso.dome(1.5, 1.5, 0.42, 70, '#5c7f8f');
      iso.flag(1.5, 1.5, 92, 12, team);
      break;
    }
    case 'hospital': {
      base('#9a9278');
      iso.box(0.2, 0.2, 2.8, 2.8, 0, 32, '#efece4');
      for (let x = 0.4; x < 2.6; x += 0.45) { iso.winY(x, 2.8, 8, 0.22, 7); iso.winY(x, 2.8, 20, 0.22, 7); iso.winX(2.8, x, 14, 0.22, 7); }
      iso.hip(0.1, 0.1, 2.9, 2.9, 32, 14, '#6e8a6e', 0.6);
      iso.poly([[1.3, 2.81, 22], [1.7, 2.81, 22], [1.7, 2.81, 31], [1.3, 2.81, 31]], '#3fae5f', null);
      iso.poly([[1.2, 2.81, 25], [1.8, 2.81, 25], [1.8, 2.81, 28], [1.2, 2.81, 28]], '#3fae5f', null);
      iso.flag(2.8, 0.2, 32, 16, team);
      break;
    }
    case 'cathedral': {
      base('#a59a80');
      iso.box(0.4, 0.8, 3.6, 3.2, 0, 52, '#e7e0cf');
      for (let x = 0.7; x < 3.4; x += 0.55) iso.winY(x, 3.2, 22, 0.22, 18, '#3d5fa0');
      iso.gable(0.3, 0.7, 3.7, 3.3, 52, 24, '#5a6c80', true);
      for (const y of [0.9, 3.1]) { iso.box(3.0, y - 0.35, 3.7, y + 0.35, 0, 92, '#e7e0cf'); iso.pyramid(3.35, y, 0.4, 92, 44, '#5a6c80'); }
      { const [rx, ry] = iso.P(3.6, 2, 62); ell(c, rx, ry, 6, 6, '#3d5fa0'); ell(c, rx, ry, 3.5, 3.5, '#e3a32a'); }
      iso.flag(3.35, 0.9, 136, 14, team); iso.flag(3.35, 3.1, 136, 14, team);
      break;
    }
    case 'wonder': {
      base('#b8aa86');
      iso.box(0.1, 0.1, 4.9, 4.9, 0, 22, '#e6d8b0');
      iso.box(0.7, 0.7, 4.3, 4.3, 22, 46, '#eadfbc');
      iso.box(1.3, 1.3, 3.7, 3.7, 46, 72, '#efe5c6');
      iso.box(1.9, 1.9, 3.1, 3.1, 72, 98, '#f3ebd2');
      for (let k = 0; k < 4; k++) iso.poly([[0.1 + k * 0.6, 4.9 - k * 0.6, k * 24 + 20], [4.9 - k * 0.6, 4.9 - k * 0.6, k * 24 + 20], [4.9 - k * 0.6, 4.9 - k * 0.6, k * 24 + 22], [0.1 + k * 0.6, 4.9 - k * 0.6, k * 24 + 22]], team, null);
      iso.pyramid(2.5, 2.5, 0.6, 98, 40, '#e6bf3a');
      { const [a, b] = iso.P(2.5, 2.5, 140); ell(c, a, b, 10, 10, 'rgba(255,220,120,0.25)'); ell(c, a, b, 3, 3, '#fff1b0'); }
      for (const [x, y] of [[0.3, 4.7], [4.7, 0.3], [4.7, 4.7]]) { iso.box(x - 0.15, y - 0.15, x + 0.15, y + 0.15, 0, 60, '#efe5c6'); iso.pyramid(x, y, 0.2, 60, 12, '#e6bf3a'); }
      iso.flag(0.3, 4.7, 72, 16, team); iso.flag(4.7, 0.3, 72, 16, team);
      break;
    }
    case 'bazaar': {
      iso.ground(0, 0, 5, 5, '#b49a6c');
      const cols = ['#d8403a', '#3d7fe0', '#e3a32a', '#36a85c', '#9a5ad8', '#2fb3b8', '#e06aa6', '#c9a540'];
      let k = 0;
      for (let y = 0.3; y < 4.6; y += 1.5) for (let x = 0.3; x < 4.6; x += 1.5) {
        if (Math.abs(x - 1.8) < 0.1 && Math.abs(y - 1.8) < 0.1) continue;
        iso.box(x, y, x + 1.1, y + 1.1, 0, 6, '#8a6238');
        iso.pyramid(x + 0.55, y + 0.55, 0.7, 10, 14, cols[k++ % cols.length]);
        for (const [px, py] of [[x, y + 1.1], [x + 1.1, y + 1.1], [x + 1.1, y]]) { const [a, b] = iso.P(px, py, 0); line(c, a, b, a, b - 10, 0.8, '#5a3b22'); }
      }
      iso.cyl(2.35, 2.35, 0.6, 0, 9, '#c9c2b2'); { const [a, b] = iso.P(2.35, 2.35, 9); ell(c, a, b, 13, 6.5, '#3d7fb0'); line(c, a, b, a, b - 22, 2, '#c9c2b2'); ell(c, a, b - 22, 5, 3, 'rgba(160,210,255,0.7)'); }
      for (const [x, y] of [[0.1, 4.9], [4.9, 0.1], [4.9, 4.9], [0.1, 0.1]]) iso.flag(x, y, 0, 34, '#e3c25a');
      break;
    }
    case 'sacred': {
      // stone circle with a glowing monolith (drawn tinted by owner separately)
      iso.ground(0.3, 0.3, 2.7, 2.7, '#8f9a78');
      for (let k = 0; k < 8; k++) { const a = k / 8 * Math.PI * 2; const x = 1.5 + Math.cos(a) * 1.15, y = 1.5 + Math.sin(a) * 1.15; iso.box(x - 0.1, y - 0.1, x + 0.1, y + 0.1, 0, 12 + (k % 3) * 3, '#a8a5a0'); }
      iso.box(1.3, 1.3, 1.7, 1.7, 0, 44, '#7e8a96');
      iso.pyramid(1.5, 1.5, 0.2, 44, 10, '#9aa8b6');
      for (let k = 0; k < 5; k++) { const [a, b] = iso.P(1.7, 1.5, 8 + k * 7); line(c, a - 1, b, a + 1, b - 3, 0.7, '#c6f0ff'); }
      { const [a, b] = iso.P(1.5, 1.5, 40); ell(c, a, b, 9, 12, team === '#888888' ? 'rgba(200,240,255,0.18)' : hexA(team, 0.3)); }
      break;
    }
  }
}
function hexA(hex, a) { const [r, g, b] = hexToRgb(hex); return `rgba(${r},${g},${b},${a})`; }
export function clearSpriteCache() { cache.clear(); }
