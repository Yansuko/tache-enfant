import { parisClock } from './paris-time.mjs';

import '../public/rollover.js';   // globalThis.Rollover (même règle que le navigateur)

// Quêtes à faire aujourd'hui (Paris). Le rollover n'est fait que par le navigateur: on l'applique ici sans sauvegarder.
// Il raisonne dans le fuseau du processus: on lui passe les validations à midi « heure locale » de leur jour de Paris.
const parisNoon = ms => { const [y, m, d] = parisClock(ms).day.split('-').map(Number); return new Date(y, m - 1, d, 12).getTime(); };
export const pendingTasks = (child, now = Date.now()) => globalThis.Rollover.rolloverTasks(
  (child?.tasks || []).map(t => (t && Number.isFinite(Number(t.completedAt)) && t.completedAt ? { ...t, completedAt: parisNoon(Number(t.completedAt)) } : t)),
  parisClock(now).day, now).filter(t => t && !t.done);

export function reminderPayload(childName, tasks) {
  const body = tasks.length === 1 ? tasks[0].name : `${tasks.length} quêtes à faire : ${tasks.map(t => t.name).join(', ')}`;
  return { title: 'Rappel de quête', body, icon: '🔔', badge: '/icon-96.svg', tag: 'reminder', data: { url: '/' } };
}

// Rappels planifiés: { id, childId, questName?, days: [0=lundi … 6=dimanche], time: 'HH:MM', enabled, lastSent?: 'AAAA-MM-JJ' }
export function dueReminders(fam, now = Date.now()) {
  const { day, dow, hhmm } = parisClock(now);
  return (fam?.reminders || []).filter(r => r?.enabled && r.days?.includes(dow) && hhmm >= r.time && r.lastSent !== day);
}

const MAX_REMINDERS = 50;
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
const str = v => typeof v === 'string' && v.trim() !== '' && v.length <= 200;
// Liste envoyée par un parent -> liste propre, ou null si invalide. `lastSent` reste celui du serveur (par id).
export function cleanReminders(list, current = []) {
  if (!Array.isArray(list) || list.length > MAX_REMINDERS) return null;
  const prev = new Map((current || []).map(r => [r?.id, r]));
  const out = [];
  for (const r of list) {
    if (!r || !str(r.id) || !str(r.childId) || out.some(o => o.id === r.id)) return null;
    if (r.questName !== undefined && r.questName !== null && r.questName !== '' && !str(r.questName)) return null;
    if (!Array.isArray(r.days) || !r.days.every(d => Number.isInteger(d) && d >= 0 && d <= 6) || !TIME.test(r.time)) return null;
    const c = { id: r.id, childId: r.childId, days: [...new Set(r.days)].sort(), time: r.time, enabled: r.enabled !== false };
    if (str(r.questName)) c.questName = r.questName;
    if (prev.get(r.id)?.lastSent) c.lastSent = prev.get(r.id).lastSent;
    out.push(c);
  }
  return out;
}
