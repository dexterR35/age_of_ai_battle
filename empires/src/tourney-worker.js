// Web Worker: plays tournament battles off the main thread so the page stays smooth.
import { Game } from './game.js';
import { runMatch } from './tourney.js';

self.onmessage = e => {
  const { id, setup } = e.data;
  try {
    const result = runMatch(Game, setup, t => self.postMessage({ id, progress: t }));
    self.postMessage({ id, done: true, result });
  } catch (err) {
    self.postMessage({ id, done: true, error: String(err?.stack || err) });
  }
};
