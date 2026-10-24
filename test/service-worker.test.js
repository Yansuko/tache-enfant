import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

// Exécute public/sw.js dans un faux contexte de service worker et renvoie ses gestionnaires d'événements.
function loadSw() {
  const handlers = {};
  const shown = [];
  const self = {
    addEventListener: (type, fn) => { (handlers[type] ||= []).push(fn); },
    registration: { showNotification: async (title, options) => { shown.push({ title, options }); } },
    skipWaiting: () => {},
  };
  const clients = { claim: async () => {}, matchAll: async () => [], openWindow: async () => {} };
  vm.runInNewContext(readFileSync(new URL('../public/sw.js', import.meta.url), 'utf8'), { self, clients, console: { log() {}, error() {} }, Date });
  const fire = async (type, event) => { const pending = []; for (const fn of handlers[type] || []) fn({ ...event, waitUntil: p => pending.push(p) }); await Promise.all(pending); };
  return { fire, shown };
}

describe('service worker: chaque push affiche une notification (exigé par iOS)', () => {
  it('push avec contenu JSON', async () => {
    const { fire, shown } = loadSw();
    await fire('push', { data: { json: () => ({ title: 'Titre', body: 'Texte', tag: 'task' }), text: () => '' } });
    expect(shown.map(n => [n.title, n.options.body, n.options.tag])).toEqual([['Titre', 'Texte', 'task']]);
  });

  it('push avec contenu texte brut', async () => {
    const { fire, shown } = loadSw();
    await fire('push', { data: { json: () => { throw new Error('pas du JSON'); }, text: () => 'Bonjour' } });
    expect(shown.map(n => [n.title, n.options.body])).toEqual([['DailyKids', 'Bonjour']]);
  });

  it('push sans aucun contenu: une notification générique est quand même affichée', async () => {
    const { fire, shown } = loadSw();
    await fire('push', { data: null });
    expect(shown.length).toBe(1);
    expect(shown[0].title).toBe('DailyKids');
  });
});
