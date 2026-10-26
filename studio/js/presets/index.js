// The list of presets the studio knows. To add one: write presets/<id>.js with the same shape
// (id, name, defaults, controls, setup, draw, optional prepare/buildBG) and add it here.
import { S } from '../state.js';
import radar from './radar.js';
import veil from './veil.js';
import bloom from './bloom.js';
import metro from './metro.js';

export const PRESETS = { radar, veil, bloom, metro };
export const PRESET_IDS = Object.keys(PRESETS);

// every preset's settings live in S[<id>], starting from its defaults
for (const p of Object.values(PRESETS)) S[p.id] = JSON.parse(JSON.stringify(p.defaults));

export const current = () => PRESETS[S.preset] || radar;
