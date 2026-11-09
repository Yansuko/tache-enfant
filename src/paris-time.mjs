// Décalage de l'heure de Paris: UTC+2 de la fin mars à la fin octobre (heure d'été), UTC+1 sinon.
export function franceOffsetMs(dateMs) {
  const year = new Date(dateMs).getUTCFullYear();
  const march = new Date(Date.UTC(year, 2, 31, 1, 0, 0));
  const lastSunMarch = march - march.getUTCDay() * 86400000;            // dernier dimanche de mars, 01:00 UTC
  const october = new Date(Date.UTC(year, 9, 31, 1, 0, 0));
  const lastSunOct = october - october.getUTCDay() * 86400000;          // dernier dimanche d'octobre, 01:00 UTC
  return (dateMs >= lastSunMarch && dateMs < lastSunOct) ? 7200000 : 3600000;
}
// Jour (AAAA-MM-JJ) à l'heure de Paris: une validation à 00:30 appartient au nouveau jour, pas à la veille (UTC)
export function dateToISO(ms) {
  return new Date(ms + franceOffsetMs(ms)).toISOString().split('T')[0];
}
// Horloge de Paris: jour AAAA-MM-JJ, jour de semaine (0=lundi … 6=dimanche), heure HH:MM
export function parisClock(ms) {
  const d = new Date(ms + franceOffsetMs(ms));
  const iso = d.toISOString();
  return { day: iso.slice(0, 10), dow: (d.getUTCDay() + 6) % 7, hhmm: iso.slice(11, 16) };
}
