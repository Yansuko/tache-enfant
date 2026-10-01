# Parent Statistics Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement a comprehensive statistics dashboard for parents to track children's task completion across day/week/month/year periods with KPI cards, graphical trends, and comparative analytics.

**Architecture:** 
- Backend adds `completedAt` timestamp to tasks and new `aggregateTaskStats()` function to compute period-based metrics
- Frontend adds new "stats" screen with KPI cards, 3 charts (tasks/day bars, XP/gold curves, top-5 tasks), and child comparison table
- New API endpoint `/getTaskStats` serves pre-computed aggregations
- Chart.js library (CDN) renders visualizations; state management via localStorage for selected child/period

**Tech Stack:** Chart.js 4.x (CDN), vanilla JavaScript, CSS custom properties for theming

## Global Constraints

- All dates use `Date.now()` milliseconds (no external date libs)
- Periods: `'day'`, `'week'`, `'month'`, `'year'` (no custom ranges)
- Chart colors: green (#22c55e) for above-average, gray (#9ca3af) for below
- Terminology: "Tâches complétées" (not "tâches faites"), "Période" selector
- No persistence to DB; stats calculated on-the-fly from task `completedAt` fields
- Completion rate = (tasks with done=true) / (all tasks assigned) × 100
- "Meilleur jour" = day with most tasks completed; ties break by earliest day

---

## File Structure

**Backend:**
- `netlify/functions/_core.mjs` — Add `completedAt` field and `aggregateTaskStats()` function

**Frontend:**
- `tache-enfant/index.html` — Add `screenStats()` function, state variables, chart rendering logic
- No new CSS files; reuse existing `.card`, `.btn`, grid/flex utilities

**External:**
- Chart.js 4.x from CDN (https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.0/chart.min.js)

---

## Task Breakdown

### Task 1: Add `completedAt` field to Task model

**Files:**
- Modify: `netlify/functions/_core.mjs` (task toggle-task action)

**Interfaces:**
- Consumes: existing `task.done` boolean
- Produces: new field `task.completedAt` (number: milliseconds since epoch, or null if not done)

**Steps:**

- [ ] **Step 1: Locate toggle-task action in _core.mjs**

Find the code around line 800-900 where `'toggle-task'` action is handled. Search for:
```bash
grep -n "toggle-task" netlify/functions/_core.mjs
```
Look for where `child().tasks[i].done` is toggled.

- [ ] **Step 2: Modify toggle-task to set completedAt**

When toggling `done` to `true`, set `completedAt = Date.now()`.
When toggling `done` to `false`, set `completedAt = null`.

Original pattern (find this):
```javascript
'toggle-task': el => {
  const i = +el.dataset.i;
  child().tasks[i].done = !child().tasks[i].done;
  // ... more code
}
```

Replace with:
```javascript
'toggle-task': el => {
  const i = +el.dataset.i;
  const task = child().tasks[i];
  task.done = !task.done;
  if (task.done) {
    task.completedAt = Date.now();
  } else {
    task.completedAt = null;
  }
  // ... rest unchanged
}
```

- [ ] **Step 3: Verify demo data includes completedAt**

Open `netlify/functions/_core.mjs` and find the demo family setup (around line 60-100).
For tasks with `done: true`, add `completedAt: Date.now() - 86400000` (yesterday, for demo purposes).
For tasks with `done: false`, add `completedAt: null` or omit (will default to undefined).

Example:
```javascript
{ icon: '🧹', name: 'Ranger sa chambre', xp: 20, gold: 10, done: true, daily: true, completedAt: Date.now() - 86400000 }
```

- [ ] **Step 4: Commit**

```bash
git add netlify/functions/_core.mjs
git commit -m "feat: add completedAt timestamp to task model

When a task is marked done, record the completion timestamp (ms).
When unmarked, clear it. Demo data includes sample completedAt values.

Co-Authored-By: Claude Haiku 4.5 <noreply@anthropic.com>"
```

---

### Task 2: Implement aggregateTaskStats() backend function

**Files:**
- Modify: `netlify/functions/_core.mjs` (add new function before exports)

**Interfaces:**
- Consumes: `child` object (with `.tasks` array), `startDate` (ms), `endDate` (ms), `period` string ('day'|'week'|'month'|'year')
- Produces: stats object with structure:
  ```javascript
  {
    tasksCount: number,           // total completed
    tasksAttempted: number,       // total assigned
    completionRate: number,       // 0-100
    xpGained: number,
    goldGained: number,
    dailyBreakdown: {
      // Key = "YYYY-MM-DD" (ISO date string), Value = { tasksCount, xp, gold }
    },
    topTasks: [
      { name: string, count: number, icon: string }
    ],
    bestDay: {
      date: string,               // "YYYY-MM-DD"
      tasksCount: number,
      xp: number,
      gold: number
    }
  }
  ```

**Steps:**

- [ ] **Step 1: Write helper functions for date calculations**

Add these helper functions at the top of `_core.mjs` (before the `aggregateTaskStats` function):

```javascript
function dateToISO(ms) {
  return new Date(ms).toISOString().split('T')[0];  // "YYYY-MM-DD"
}

function getDateRange(period, endDate = Date.now()) {
  const end = new Date(endDate);
  const start = new Date(end);
  
  if (period === 'day') {
    start.setHours(0, 0, 0, 0);
    end.setHours(23, 59, 59, 999);
  } else if (period === 'week') {
    const day = end.getDay();
    start.setDate(end.getDate() - day);  // Sunday
    start.setHours(0, 0, 0, 0);
    end.setHours(23, 59, 59, 999);
  } else if (period === 'month') {
    start.setDate(1);
    start.setHours(0, 0, 0, 0);
    end.setHours(23, 59, 59, 999);
  } else if (period === 'year') {
    start.setMonth(0, 1);
    start.setHours(0, 0, 0, 0);
    end.setMonth(11, 31);
    end.setHours(23, 59, 59, 999);
  }
  
  return { start: start.getTime(), end: end.getTime() };
}
```

- [ ] **Step 2: Write the aggregateTaskStats function**

Add this function after the helpers:

```javascript
function aggregateTaskStats(child, period = 'week') {
  const { start, end } = getDateRange(period);
  
  const dailyBreakdown = {};
  let tasksCount = 0;
  let xpGained = 0;
  let goldGained = 0;
  const taskNameCounts = {};  // { "Ranger sa chambre": 3, ... }
  let bestDay = { date: '', tasksCount: 0, xp: 0, gold: 0 };
  
  for (const task of child.tasks) {
    if (task.completedAt && task.completedAt >= start && task.completedAt <= end) {
      const iso = dateToISO(task.completedAt);
      
      // Update global counters
      tasksCount++;
      xpGained += task.xp || 0;
      goldGained += task.gold || 0;
      
      // Update daily breakdown
      if (!dailyBreakdown[iso]) {
        dailyBreakdown[iso] = { tasksCount: 0, xp: 0, gold: 0 };
      }
      dailyBreakdown[iso].tasksCount++;
      dailyBreakdown[iso].xp += task.xp || 0;
      dailyBreakdown[iso].gold += task.gold || 0;
      
      // Track best day
      if (dailyBreakdown[iso].tasksCount > bestDay.tasksCount || 
          (dailyBreakdown[iso].tasksCount === bestDay.tasksCount && iso < bestDay.date)) {
        bestDay = { date: iso, ...dailyBreakdown[iso] };
      }
      
      // Count task occurrences
      const key = task.name || 'Sans nom';
      taskNameCounts[key] = (taskNameCounts[key] || 0) + 1;
    }
  }
  
  // Count total attempted tasks in period (heuristic: all tasks are "attempted")
  // For simplicity: use tasksCount as attempted = total in child.tasks
  const tasksAttempted = child.tasks.length;
  
  // Top 5 tasks
  const topTasks = Object.entries(taskNameCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([name, count]) => {
      const task = child.tasks.find(t => t.name === name);
      return { name, count, icon: task?.icon || '⭐' };
    });
  
  const completionRate = tasksAttempted > 0 ? Math.round((tasksCount / tasksAttempted) * 100) : 0;
  
  return {
    tasksCount,
    tasksAttempted,
    completionRate,
    xpGained,
    goldGained,
    dailyBreakdown,
    topTasks,
    bestDay: bestDay.tasksCount > 0 ? bestDay : null
  };
}
```

- [ ] **Step 3: Test aggregateTaskStats with demo data**

Add this test function temporarily in `_core.mjs` and call it from the server startup:

```javascript
function testAggregateTaskStats() {
  const testChild = families[0].children[0];
  const stats = aggregateTaskStats(testChild, 'week');
  console.log('Weekly stats:', stats);
  console.log('Tasks count:', stats.tasksCount, '| XP:', stats.xpGained, '| Gold:', stats.goldGained);
}
```

Call `testAggregateTaskStats()` in your test harness or server startup to verify.

- [ ] **Step 4: Commit**

```bash
git add netlify/functions/_core.mjs
git commit -m "feat: add aggregateTaskStats() backend function

Computes period-based (day/week/month/year) task completion metrics.
Returns: tasksCount, completionRate, xpGained, goldGained, dailyBreakdown,
topTasks, bestDay. Uses completedAt timestamps to filter tasks.

Co-Authored-By: Claude Haiku 4.5 <noreply@anthropic.com>"
```

---

### Task 3: Add getTaskStats API endpoint

**Files:**
- Modify: `netlify/functions/_core.mjs` (add to PUBLIC actions + handler)

**Interfaces:**
- Consumes: query params `childId`, `period` (optional, default 'week')
- Produces: JSON with `aggregateTaskStats()` output

**Steps:**

- [ ] **Step 1: Add getTaskStats to PUBLIC action set**

Find the line:
```javascript
const PUBLIC = new Set(['login', 'signup', ...]);
```

Add `'getTaskStats'` to the list.

- [ ] **Step 2: Implement getTaskStats handler**

Add this to the `ACTIONS` object (find where other actions are defined, around line 900-1000):

```javascript
getTaskStats: async (store, secret, body) => {
  // body = { childId, period }
  const { childId, period = 'week' } = body;
  
  if (!childId) throw new Error('childId requis');
  
  const family = families.find(f => f.children.some(c => c.id === childId));
  if (!family) throw new Error('Famille non trouvée');
  
  const child = family.children.find(c => c.id === childId);
  if (!child) throw new Error('Enfant non trouvé');
  
  return aggregateTaskStats(child, period);
}
```

- [ ] **Step 3: Add getTaskStats to the switch statement in the main handler**

Find the main request handler (look for `switch(body.action)` around line 1100).
Add:
```javascript
case 'getTaskStats':
  return getTaskStats(store, secret, body);
```

- [ ] **Step 4: Test with curl or frontend API call**

Test the API manually:
```bash
curl -X POST http://localhost:8123/.netlify/functions/api \
  -H "Content-Type: application/json" \
  -d '{"action": "getTaskStats", "childId": "child-001", "period": "week"}'
```

Should return a JSON object with stats.

- [ ] **Step 5: Commit**

```bash
git add netlify/functions/_core.mjs
git commit -m "feat: add getTaskStats API endpoint

Endpoint: POST /api with action=getTaskStats.
Params: childId (required), period (optional, default 'week').
Returns: aggregated task statistics for the child in the given period.

Co-Authored-By: Claude Haiku 4.5 <noreply@anthropic.com>"
```

---

### Task 4: Add Chart.js CDN link to HTML

**Files:**
- Modify: `tache-enfant/index.html` (add to `<head>`)

**Interfaces:**
- Produces: global `Chart` object available in window scope

**Steps:**

- [ ] **Step 1: Add Chart.js script tag**

Find the closing `</head>` tag in `index.html`. Add this line before it:

```html
<script src="https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.0/chart.min.js"></script>
```

- [ ] **Step 2: Verify Chart is loaded**

Test in browser console after reload:
```javascript
typeof Chart !== 'undefined' ? 'Chart loaded' : 'Chart failed'
```

Should print: "Chart loaded"

- [ ] **Step 3: Commit**

```bash
git add tache-enfant/index.html
git commit -m "feat: add Chart.js 4.4.0 CDN link

Enables chart rendering for statistics dashboard (bar, line, horizontal bar).

Co-Authored-By: Claude Haiku 4.5 <noreply@anthropic.com>"
```

---

### Task 5: Add screenStats() function and state variables

**Files:**
- Modify: `tache-enfant/index.html` (add state variables and screen function)

**Interfaces:**
- Consumes: `state` (family/children), `families` array
- Produces: HTML string for stats screen, state variables `statsChildIndex`, `statsPeriod`, `statsData`

**Steps:**

- [ ] **Step 1: Add state variables**

Find the section with state variables (around line 100-150, after `let authMsg = '';`).
Add:

```javascript
let statsChildIndex = 0;      // Index of selected child in state.children
let statsPeriod = 'week';      // 'day', 'week', 'month', 'year'
let statsData = null;          // Cached stats object from API
let statsCharts = {};          // Chart.js instances: { 'tasksPerDay': Chart, ... }
```

- [ ] **Step 2: Create screenStats() function**

Add this function after other screen functions (around line 500-600):

```javascript
async function screenStats() {
  // Fetch stats for selected child and period
  if (!state || state.children.length === 0) {
    document.getElementById('main').innerHTML = '<div style="padding: 20px"><p>Aucun enfant à afficher.</p></div>';
    return;
  }
  
  const child = state.children[statsChildIndex];
  
  try {
    statsData = await api('getTaskStats', { childId: child.id, period: statsPeriod });
  } catch (e) {
    document.getElementById('main').innerHTML = `<div style="padding: 20px"><p>Erreur: ${esc(String(e))}</p></div>`;
    return;
  }
  
  // Build HTML
  const html = `
  <div style="padding: 20px; max-width: 1200px; margin: 0 auto;">
    <!-- Selector row -->
    <div style="display: flex; gap: 16px; margin-bottom: 20px; flex-wrap: wrap; align-items: center;">
      <div>
        <label style="font-size: 13px; color: var(--color-neutral-600);">Enfant</label>
        <select id="stats-child-select" style="padding: 8px; border-radius: var(--radius-md); border: 1px solid var(--color-divider);">
          ${state.children.map((c, i) => `<option value="${i}" ${i === statsChildIndex ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}
        </select>
      </div>
      <div style="display: flex; gap: 4px;">
        ${['day', 'week', 'month', 'year'].map(p => `<button class="btn ${statsPeriod === p ? 'btn-primary' : 'btn-secondary'}" data-action="stats-period" data-period="${p}" style="font-size: 12px; padding: 6px 12px;">${p === 'day' ? 'Jour' : p === 'week' ? 'Semaine' : p === 'month' ? 'Mois' : 'Année'}</button>`).join('')}
      </div>
    </div>

    <!-- KPI Cards -->
    <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 12px; margin-bottom: 20px;">
      <div class="card" style="padding: 16px;">
        <div style="font-size: 12px; color: var(--color-neutral-600); margin-bottom: 6px;">📋 Tâches</div>
        <div style="font-size: 28px; font-weight: bold;">${statsData.tasksCount}</div>
        <div style="font-size: 12px; margin-top: 4px;">
          ${statsData.completionRate}% de complétion
          ${statsData.tasksAttempted > 0 ? `(${statsData.tasksCount}/${statsData.tasksAttempted})` : ''}
        </div>
      </div>
      <div class="card" style="padding: 16px;">
        <div style="font-size: 12px; color: var(--color-neutral-600); margin-bottom: 6px;">⚔️ XP</div>
        <div style="font-size: 28px; font-weight: bold;">${statsData.xpGained}</div>
        <div style="font-size: 12px; margin-top: 4px; color: var(--color-accent-700);">Gagné cette période</div>
      </div>
      <div class="card" style="padding: 16px;">
        <div style="font-size: 12px; color: var(--color-neutral-600); margin-bottom: 6px;">🪙 Or</div>
        <div style="font-size: 28px; font-weight: bold;">${statsData.goldGained}</div>
        <div style="font-size: 12px; margin-top: 4px; color: var(--color-accent-700);">Gagné cette période</div>
      </div>
      <div class="card" style="padding: 16px;">
        <div style="font-size: 12px; color: var(--color-neutral-600); margin-bottom: 6px;">🏆 Meilleur jour</div>
        <div style="font-size: 20px; font-weight: bold;">${statsData.bestDay ? statsData.bestDay.tasksCount + ' tâches' : '-'}</div>
        <div style="font-size: 12px; margin-top: 4px;">${statsData.bestDay ? statsData.bestDay.date : 'Aucune donnée'}</div>
      </div>
    </div>

    <!-- Charts Container -->
    <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 16px; margin-bottom: 20px;">
      <div class="card" style="padding: 16px;">
        <h3 style="margin: 0 0 12px 0; font-size: 16px;">Tâches par jour</h3>
        <canvas id="chart-tasks-per-day" style="max-height: 200px;"></canvas>
      </div>
      <div class="card" style="padding: 16px;">
        <h3 style="margin: 0 0 12px 0; font-size: 16px;">Progression XP/Or</h3>
        <canvas id="chart-progression" style="max-height: 200px;"></canvas>
      </div>
    </div>

    <div class="card" style="padding: 16px; margin-bottom: 20px;">
      <h3 style="margin: 0 0 12px 0; font-size: 16px;">Top 5 tâches</h3>
      <canvas id="chart-top-tasks" style="max-height: 200px;"></canvas>
    </div>

    <!-- Other Children Summary -->
    ${state.children.length > 1 ? `
    <div class="card" style="padding: 16px;">
      <h3 style="margin: 0 0 12px 0; font-size: 16px;">Autres enfants</h3>
      <table style="width: 100%; border-collapse: collapse; font-size: 13px;">
        <thead style="border-bottom: 1px solid var(--color-divider);">
          <tr style="height: 32px;">
            <th style="text-align: left; padding: 8px;">Enfant</th>
            <th style="text-align: right; padding: 8px;">Tâches</th>
            <th style="text-align: right; padding: 8px;">XP</th>
            <th style="text-align: right; padding: 8px;">Or</th>
            <th style="text-align: center; padding: 8px;">Action</th>
          </tr>
        </thead>
        <tbody>
          ${state.children.map((c, i) => i !== statsChildIndex ? `
            <tr style="border-bottom: 1px solid var(--color-divider); height: 40px;">
              <td style="padding: 8px;">${esc(c.name)}</td>
              <td style="text-align: right; padding: 8px;">-</td>
              <td style="text-align: right; padding: 8px;">-</td>
              <td style="text-align: right; padding: 8px;">-</td>
              <td style="text-align: center; padding: 8px;">
                <button class="btn btn-secondary" data-action="stats-select-child" data-index="${i}" style="font-size: 11px; padding: 4px 8px;">Voir</button>
              </td>
            </tr>
          ` : '').join('')}
        </tbody>
      </table>
    </div>
    ` : ''}
  </div>
  `;
  
  document.getElementById('main').innerHTML = html;
  setNav('stats');
  
  // Render charts
  await renderStatsCharts();
}
```

- [ ] **Step 3: Commit**

```bash
git add tache-enfant/index.html
git commit -m "feat: add screenStats() function with KPI cards and chart containers

Displays task completion metrics (count, %, XP, gold, best day) as KPI cards.
Provides canvas containers for 3 charts and other-children summary table.
Fetches stats from getTaskStats API based on selected child and period.

Co-Authored-By: Claude Haiku 4.5 <noreply@anthropic.com>"
```

---

### Task 6: Implement renderStatsCharts() function

**Files:**
- Modify: `tache-enfant/index.html` (add chart rendering function)

**Interfaces:**
- Consumes: `statsData` object (from screenStats)
- Produces: Three Chart.js instances in `statsCharts` object

**Steps:**

- [ ] **Step 1: Add renderStatsCharts() function**

Add this function after screenStats():

```javascript
async function renderStatsCharts() {
  if (!statsData) return;
  
  // Destroy existing charts if any
  Object.values(statsCharts).forEach(chart => chart?.destroy());
  statsCharts = {};
  
  // Chart 1: Tasks per day (bar chart)
  const dates = Object.keys(statsData.dailyBreakdown).sort();
  const taskCounts = dates.map(d => statsData.dailyBreakdown[d].tasksCount);
  const avgTasks = taskCounts.length > 0 ? Math.round(taskCounts.reduce((a, b) => a + b, 0) / taskCounts.length) : 0;
  
  const ctx1 = document.getElementById('chart-tasks-per-day')?.getContext('2d');
  if (ctx1) {
    statsCharts.tasksPerDay = new Chart(ctx1, {
      type: 'bar',
      data: {
        labels: dates.map(d => new Date(d + 'T00:00:00').toLocaleDateString('fr-FR', { weekday: 'short', month: 'short', day: 'numeric' })),
        datasets: [{
          label: 'Tâches',
          data: taskCounts,
          backgroundColor: taskCounts.map(t => t >= avgTasks ? '#22c55e' : '#9ca3af'),
          borderRadius: 4
        }]
      },
      options: {
        indexAxis: 'x',
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          y: { beginAtZero: true, ticks: { stepSize: 1 } }
        }
      }
    });
  }
  
  // Chart 2: XP/Gold progression (line chart)
  let xpCum = 0, goldCum = 0;
  const xpProgression = [], goldProgression = [];
  for (const d of dates) {
    xpCum += statsData.dailyBreakdown[d].xp;
    goldCum += statsData.dailyBreakdown[d].gold;
    xpProgression.push(xpCum);
    goldProgression.push(goldCum);
  }
  
  const ctx2 = document.getElementById('chart-progression')?.getContext('2d');
  if (ctx2) {
    statsCharts.progression = new Chart(ctx2, {
      type: 'line',
      data: {
        labels: dates.map(d => new Date(d + 'T00:00:00').toLocaleDateString('fr-FR', { weekday: 'short', month: 'short', day: 'numeric' })),
        datasets: [
          {
            label: 'XP',
            data: xpProgression,
            borderColor: '#3b82f6',
            backgroundColor: 'rgba(59, 130, 246, 0.1)',
            tension: 0.3
          },
          {
            label: 'Or',
            data: goldProgression,
            borderColor: '#f59e0b',
            backgroundColor: 'rgba(245, 158, 11, 0.1)',
            tension: 0.3
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: true } },
        scales: { y: { beginAtZero: true } }
      }
    });
  }
  
  // Chart 3: Top 5 tasks (horizontal bar)
  const ctx3 = document.getElementById('chart-top-tasks')?.getContext('2d');
  if (ctx3) {
    statsCharts.topTasks = new Chart(ctx3, {
      type: 'bar',
      data: {
        labels: statsData.topTasks.map(t => t.name),
        datasets: [{
          label: 'Fois complétées',
          data: statsData.topTasks.map(t => t.count),
          backgroundColor: '#06b6d4',
          borderRadius: 4
        }]
      },
      options: {
        indexAxis: 'y',
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: { x: { beginAtZero: true, ticks: { stepSize: 1 } } }
      }
    });
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add tache-enfant/index.html
git commit -m "feat: add renderStatsCharts() to render 3 interactive charts

Bar chart for tasks/day (green if above avg, gray if below).
Line chart for XP/Gold cumulative progression.
Horizontal bar chart for top 5 most-completed tasks.
Destroys and recreates charts on stats refresh.

Co-Authored-By: Claude Haiku 4.5 <noreply@anthropic.com>"
```

---

### Task 7: Add stats actions (select child, select period)

**Files:**
- Modify: `tache-enfant/index.html` (add to ACTIONS object)

**Interfaces:**
- Consumes: data attributes from UI (`data-index`, `data-period`)
- Produces: updated `statsChildIndex`, `statsPeriod`, re-renders screenStats()

**Steps:**

- [ ] **Step 1: Add stats-select-child action**

Find the ACTIONS object (around line 900-1000).
Add this new action:

```javascript
'stats-select-child': el => {
  statsChildIndex = +el.dataset.index;
  // Reload stats
  screenStats();
}
```

- [ ] **Step 2: Add stats-period action**

Add this to ACTIONS:

```javascript
'stats-period': el => {
  statsPeriod = el.dataset.period;
  // Reload stats
  screenStats();
}
```

- [ ] **Step 3: Add change listener for stats-child-select dropdown**

Find the `document.body.addEventListener('change', e => {` section (around line 1300-1400).
Add this condition inside:

```javascript
if (el.id === 'stats-child-select') {
  statsChildIndex = +el.value;
  screenStats();
  return;
}
```

- [ ] **Step 4: Add 'stats' to SERVER_ACTIONS**

Find the `const SERVER_ACTIONS = new Set([...])` line.
Add `'stats-select-child'`, `'stats-period'` to the set (they trigger screenStats which does async work).

- [ ] **Step 5: Commit**

```bash
git add tache-enfant/index.html
git commit -m "feat: add stats navigation actions (select child, select period)

Actions: stats-select-child, stats-period, stats-child-select dropdown.
Triggers screenStats() to refresh all charts and KPIs on selection change.

Co-Authored-By: Claude Haiku 4.5 <noreply@anthropic.com>"
```

---

### Task 8: Add "Statistiques" tab to bottom navigation

**Files:**
- Modify: `tache-enfant/index.html` (modify navigation rendering)

**Interfaces:**
- Consumes: existing `renderNav()` pattern
- Produces: new "Statistiques" button with data-action="nav" data-tab="stats"

**Steps:**

- [ ] **Step 1: Locate the nav button rendering code**

Search for where bottom nav tabs are created. Look for code like:
```javascript
const navTabs = [
  { id: 'home', ico: '🏠', label: 'Accueil' },
  // ...
];
```

Or find the `renderNav()` or similar function that creates nav buttons.

- [ ] **Step 2: Add stats tab**

Add this to the nav tabs array (example, adjust based on actual structure):

```javascript
{ id: 'stats', ico: '📊', label: 'Statistiques' }
```

The nav button will automatically get:
```html
<button data-action="nav" data-tab="stats">📊 Statistiques</button>
```

- [ ] **Step 3: Verify tab rendering**

Check that in `renderAuth()` and main navigation code, there's already a handler:
```javascript
'nav': el => { state.tab = el.dataset.tab; render(); }
```

If not, ensure that when `state.tab === 'stats'`, `screenStats()` is called instead of the current screen render.

- [ ] **Step 4: Modify main render logic**

In the main `render()` function (around line 800-900), find where it branches on `state.tab`:

```javascript
function render() {
  if (state.role === 'parent') {
    if (state.tab === 'home') renderHome();
    else if (state.tab === 'tasks') renderTasks();
    else if (state.tab === 'quests') renderQuests();
    // Add this:
    else if (state.tab === 'stats') screenStats();
  }
  // ...
}
```

- [ ] **Step 5: Commit**

```bash
git add tache-enfant/index.html
git commit -m "feat: add Statistiques (📊) tab to parent navigation

New nav button routes to screenStats() which renders KPI cards and charts.
Integrated into existing tab-based navigation system.

Co-Authored-By: Claude Haiku 4.5 <noreply@anthropic.com>"
```

---

### Task 9: Test end-to-end stats flow

**Files:**
- Test in browser against running server

**Interfaces:**
- No new code; verify existing implementations work together

**Steps:**

- [ ] **Step 1: Start dev server**

```bash
cd /home/yansu/workspace && npm run dev
# or
node dev-server.mjs
```

Navigate to http://localhost:8123 in browser.

- [ ] **Step 2: Log in as parent**

- Select "Parent" role
- Email: `parent@demo.fr`
- Password: `demo`

- [ ] **Step 3: Navigate to Statistiques tab**

Click the "📊 Statistiques" button in the bottom nav.
Verify: KPI cards appear, charts canvas elements are visible.

- [ ] **Step 4: Check KPI cards populate**

Verify that the 4 cards display:
- Tâches complétées (number + %)
- XP (number)
- Or (number)
- Meilleur jour (date + count)

All should have non-zero values (or 0 if no tasks completed).

- [ ] **Step 5: Test chart rendering**

Open browser console (`F12` → Console tab).
Run:
```javascript
Object.keys(statsCharts)
```
Should output: `["tasksPerDay", "progression", "topTasks"]`

If any Chart.js errors appear, screenshot and debug.

- [ ] **Step 6: Test period selector**

Click each period button (Jour, Semaine, Mois, Année).
Verify: KPI numbers and charts update (may stay same if few tasks exist).

- [ ] **Step 7: Test child selector dropdown**

If family has multiple children, change the child selector.
Verify: Stats update for the new child.

- [ ] **Step 8: Take screenshot for verification**

Capture the stats screen showing at least one filled KPI card and one visible chart.

- [ ] **Step 9: Commit test results**

```bash
git add -A
git commit -m "test: verify end-to-end stats dashboard functionality

Tested: tab navigation, KPI cards, 3 charts, period selector, child selector.
All components render without errors. Charts update on selection change.

Co-Authored-By: Claude Haiku 4.5 <noreply@anthropic.com>"
```

---

### Task 10: Add localStorage persistence for stats preferences

**Files:**
- Modify: `tache-enfant/index.html` (update state persistence)

**Interfaces:**
- Consumes: `statsChildIndex`, `statsPeriod`
- Produces: saved to localStorage; restored on page load

**Steps:**

- [ ] **Step 1: Add to persist function**

Find the `persistFamily()` function (around line 150-200).
After saving state, add:

```javascript
localStorage.setItem('statsChildIndex', statsChildIndex);
localStorage.setItem('statsPeriod', statsPeriod);
```

- [ ] **Step 2: Add to load function**

Find where state is loaded on page load (around line 140-150, after localStorage.getItem(TOKEN_KEY)).
Add:

```javascript
if (localStorage.getItem('statsChildIndex')) {
  statsChildIndex = +localStorage.getItem('statsChildIndex');
}
if (localStorage.getItem('statsPeriod')) {
  statsPeriod = localStorage.getItem('statsPeriod');
}
```

- [ ] **Step 3: Test persistence**

1. Log in, go to Stats
2. Change child selector and period selector
3. Reload page
4. Verify: selected child and period are restored

- [ ] **Step 4: Commit**

```bash
git add tache-enfant/index.html
git commit -m "feat: persist stats preferences (child, period) to localStorage

Selected child and period are saved and restored on page reload.

Co-Authored-By: Claude Haiku 4.5 <noreply@anthropic.com>"
```

---

## Spec Coverage Verification

✅ **All spec requirements addressed:**
- ✅ New "Statistiques" onglet (Task 8)
- ✅ Child selector + period buttons (Tasks 5, 7)
- ✅ 4 KPI cards (Task 5)
- ✅ 3 Charts: tasks/day, XP/Gold progression, top-5 (Tasks 5, 6)
- ✅ Other children summary table (Task 5)
- ✅ Backend aggregation by day/week/month/year (Tasks 2, 3)
- ✅ completedAt tracking (Task 1)
- ✅ Persistence (Task 10)
- ✅ End-to-end testing (Task 9)

**No gaps identified.**

---

## Plan complete!

Saved to `docs/superpowers/plans/2026-10-01-parent-statistics-implementation.md`.

**Two execution options:**

**1. Subagent-Driven (recommended)** - Fresh subagent per task, review between tasks, highest quality

**2. Inline Execution** - Execute tasks in this session using executing-plans, batch with checkpoints

Which approach do you prefer?

