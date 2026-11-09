import { parisClock } from './paris-time.mjs';

export const pendingTasks = (child) => (child?.tasks || []).filter(t => !t.done);

export function reminderPayload(childName, tasks) {
  const body = tasks.length === 1 ? tasks[0].name : `${tasks.length} quêtes à faire : ${tasks.map(t => t.name).join(', ')}`;
  return { title: 'Rappel de quête', body, icon: '🔔', badge: '/icon-96.svg', tag: 'reminder', data: { url: '/' } };
}

// Rappels planifiés: { id, childId, questName?, days: [0=lundi … 6=dimanche], time: 'HH:MM', enabled, lastSent?: 'AAAA-MM-JJ' }
export function dueReminders(fam, now = Date.now()) {
  const { day, dow, hhmm } = parisClock(now);
  return (fam?.reminders || []).filter(r => r?.enabled && r.days?.includes(dow) && hhmm >= r.time && r.lastSent !== day);
}

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
const str = v => typeof v === 'string' && v.trim() !== '' && v.length <= 200;
// Liste envoyée par un parent -> liste propre, ou null si invalide. `lastSent` reste celui du serveur (par id).
export function cleanReminders(list, current = []) {
  if (!Array.isArray(list)) return null;
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
