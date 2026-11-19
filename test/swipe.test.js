import { describe, it, expect, beforeAll } from 'vitest';

let S;
beforeAll(async () => {
  await import('../public/swipe.js');
  S = globalThis.Swipe;
});

const start = { x0: 200, y0: 300, t0: 1000 };
const end = (dx, dy = 0, ms = 200) => ({ x1: 200 + dx, y1: 300 + dy, t1: 1000 + ms });
const mid = { count: 3, index: 1 };

describe('Swipe.decide', () => {
  it('vers la gauche: enfant suivant', () => expect(S.decide(start, end(-80), mid)).toBe('next'));
  it('vers la droite: enfant précédent', () => expect(S.decide(start, end(80), mid)).toBe('prev'));
  it('moins de 60 px: rien', () => {
    expect(S.decide(start, end(-59), mid)).toBe(null);
    expect(S.decide(start, end(-60), mid)).toBe('next');
  });
  it('diagonale (dy proche de dx): rien', () => {
    expect(S.decide(start, end(-80, 70), mid)).toBe(null);
    expect(S.decide(start, end(80, -60), mid)).toBe(null);
  });
  it('plus de 600 ms: rien', () => {
    expect(S.decide(start, end(-80, 0, 601), mid)).toBe(null);
    expect(S.decide(start, end(-80, 0, 600), mid)).toBe('next');
  });
  it('extrémités: pas de boucle', () => {
    expect(S.decide(start, end(80), { count: 3, index: 0 })).toBe(null);
    expect(S.decide(start, end(-80), { count: 3, index: 2 })).toBe(null);
    expect(S.decide(start, end(-80), { count: 3, index: 0 })).toBe('next');
    expect(S.decide(start, end(80), { count: 3, index: 2 })).toBe('prev');
  });
  it('un seul enfant: rien', () => {
    expect(S.decide(start, end(-80), { count: 1, index: 0 })).toBe(null);
    expect(S.decide(start, end(80), { count: 1, index: 0 })).toBe(null);
  });
  it('zéro enfant: rien', () => expect(S.decide(start, end(-80), { count: 0, index: 0 })).toBe(null));
  it('seuils personnalisables', () => expect(S.decide(start, end(-40), mid, { minDx: 30 })).toBe('next'));
});
