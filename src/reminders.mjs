export const pendingTasks = (child) => (child?.tasks || []).filter(t => !t.done);

export function reminderPayload(childName, tasks) {
  const body = tasks.length === 1 ? tasks[0].name : `${tasks.length} quêtes à faire : ${tasks.map(t => t.name).join(', ')}`;
  return { title: 'Rappel de quête', body, icon: '🔔', badge: '/icon-96.svg', tag: 'reminder', data: { url: '/' } };
}
