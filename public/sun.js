// Lever/coucher du soleil (équations NOAA « General Solar Position », précision ~1 min). Calcul en UTC,
// indépendant du fuseau de l'appareil. Script classique: expose globalThis.Sun.
(function (g) {
  const PARIS = { lat: 48.8566, lon: 2.3522 };
  const RAD = Math.PI / 180, DAY = 86400000;

  // Jour solaire contenant `date` (heure solaire moyenne locale = UTC + lon/15 h), à minuit UTC.
  function solarDay(ms, lon) {
    const d = new Date(ms + lon / 15 * 3600000);
    return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  }

  function times(date, lat = PARIS.lat, lon = PARIS.lon) {
    const day = solarDay(Number(date instanceof Date ? date.getTime() : date), lon);
    const y = new Date(day).getUTCFullYear();
    const doy = (day - Date.UTC(y, 0, 1)) / DAY + 1;
    const len = (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0 ? 366 : 365;
    const gm = 2 * Math.PI / len * (doy - 1);   // midi: (heure-12)/24 = 0
    const eqtime = 229.18 * (0.000075 + 0.001868 * Math.cos(gm) - 0.032077 * Math.sin(gm)
      - 0.014615 * Math.cos(2 * gm) - 0.040849 * Math.sin(2 * gm));
    const decl = 0.006918 - 0.399912 * Math.cos(gm) + 0.070257 * Math.sin(gm) - 0.006758 * Math.cos(2 * gm)
      + 0.000907 * Math.sin(2 * gm) - 0.002697 * Math.cos(3 * gm) + 0.00148 * Math.sin(3 * gm);
    const cosHa = Math.cos(90.833 * RAD) / (Math.cos(lat * RAD) * Math.cos(decl)) - Math.tan(lat * RAD) * Math.tan(decl);
    if (cosHa > 1) return { sunrise: null, sunset: null, polar: 'night' };
    if (cosHa < -1) return { sunrise: null, sunset: null, polar: 'day' };
    const ha = Math.acos(cosHa) / RAD;
    const min = m => Math.round(day + m * 60000);
    return { sunrise: min(720 - 4 * (lon + ha) - eqtime), sunset: min(720 - 4 * (lon - ha) - eqtime) };
  }

  function isNight(nowMs, lat = PARIS.lat, lon = PARIS.lon) {
    const t = times(nowMs, lat, lon);
    if (t.polar) return t.polar === 'night';
    return nowMs < t.sunrise || nowMs >= t.sunset;
  }

  g.Sun = { PARIS, times, isNight };
})(globalThis);
