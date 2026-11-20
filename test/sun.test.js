import { describe, it, expect, beforeAll } from 'vitest';

let Sun;
beforeAll(async () => {
  await import('../public/sun.js');
  Sun = globalThis.Sun;
});

const { lat, lon } = { lat: 48.8566, lon: 2.3522 };
const utc = (y, m, d, h = 0, mi = 0) => Date.UTC(y, m - 1, d, h, mi);
const near = (actual, expected) => expect(Math.abs(actual - expected)).toBeLessThanOrEqual(3 * 60000);

describe('Sun.times (NOAA, UTC)', () => {
  it('Paris est la position par défaut', () => {
    expect(Sun.PARIS).toEqual({ lat, lon });
  });

  it('Paris 21/06/2026: lever ≈ 03:47 UTC, coucher ≈ 19:58 UTC', () => {
    const t = Sun.times(utc(2026, 6, 21, 12), lat, lon);
    near(t.sunrise, utc(2026, 6, 21, 3, 47));
    near(t.sunset, utc(2026, 6, 21, 19, 58));
  });

  it('Paris 21/12/2026: lever ≈ 07:43 UTC, coucher ≈ 15:57 UTC', () => {
    const t = Sun.times(utc(2026, 12, 21, 12), lat, lon);
    near(t.sunrise, utc(2026, 12, 21, 7, 43));
    near(t.sunset, utc(2026, 12, 21, 15, 57));
  });

  it('accepte un objet Date et ne dépend pas de l’heure dans la journée', () => {
    const a = Sun.times(new Date(utc(2026, 6, 21, 0, 30)), lat, lon);
    const b = Sun.times(utc(2026, 6, 21, 23, 30), lat, lon);
    expect(a).toEqual(b);
  });

  it('nuit polaire (Tromsø en décembre): pas d’exception, pas de lever', () => {
    const t = Sun.times(utc(2026, 12, 21, 12), 69.65, 18.96);
    expect(t).toEqual({ sunrise: null, sunset: null, polar: 'night' });
  });

  it('jour polaire (Tromsø en juin): pas d’exception, pas de coucher', () => {
    const t = Sun.times(utc(2026, 6, 21, 12), 69.65, 18.96);
    expect(t).toEqual({ sunrise: null, sunset: null, polar: 'day' });
  });
});

describe('Sun.isNight', () => {
  it('Paris en juin: nuit avant le lever et après le coucher, jour entre', () => {
    expect(Sun.isNight(utc(2026, 6, 21, 3, 30), lat, lon)).toBe(true);
    expect(Sun.isNight(utc(2026, 6, 21, 12), lat, lon)).toBe(false);
    expect(Sun.isNight(utc(2026, 6, 21, 19, 50), lat, lon)).toBe(false);
    expect(Sun.isNight(utc(2026, 6, 21, 20, 10), lat, lon)).toBe(true);
  });

  it('Paris en décembre: 17:00 UTC est la nuit', () => {
    expect(Sun.isNight(utc(2026, 12, 21, 17), lat, lon)).toBe(true);
  });

  it('position par défaut = Paris quand lat/lon absents', () => {
    expect(Sun.isNight(utc(2026, 12, 21, 17))).toBe(true);
    expect(Sun.isNight(utc(2026, 12, 21, 12))).toBe(false);
  });

  it('cas polaires', () => {
    expect(Sun.isNight(utc(2026, 12, 21, 12), 69.65, 18.96)).toBe(true);
    expect(Sun.isNight(utc(2026, 6, 21, 0), 69.65, 18.96)).toBe(false);
  });

  it('fuseau lointain: Tokyo à 07:00 locale (22:00 UTC la veille) est le jour', () => {
    expect(Sun.isNight(utc(2026, 6, 20, 22), 35.68, 139.69)).toBe(false);
    expect(Sun.isNight(utc(2026, 6, 20, 14), 35.68, 139.69)).toBe(true); // 23:00 locale
  });
});
