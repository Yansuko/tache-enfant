// Expéditeur Brevo: ne jette jamais, renvoie {ok,status,detail} et journalise le corps des erreurs.
export function makeBrevoSender({ apiKey, from, name = 'DailyKids', fetchImpl = fetch }) {
  if (!from) throw new Error('EMAIL_FROM requis (expéditeur validé dans Brevo)');
  return async ({ to, subject, body }) => {
    try {
      const res = await fetchImpl('https://api.brevo.com/v3/smtp/email', {
        method: 'POST',
        headers: { 'api-key': apiKey, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sender: { name, email: from },
          to: [{ email: to }],
          subject,
          htmlContent: `<p>${String(body).replace(/\n/g, '<br>')}</p>`
        })
      });
      const detail = await res.text().catch(() => '');
      if (!res.ok) console.error(`[EMAIL] Brevo ${res.status} to=${to}: ${detail}`);
      else console.log(`[EMAIL] Sent to ${to}: ${subject}`);
      return { ok: res.ok, status: res.status, detail };
    } catch (e) {
      console.error(`[EMAIL] Brevo network error to=${to}: ${e.message}`);
      return { ok: false, status: 0, detail: e.message };
    }
  };
}

// Une clé SMTP (xsmtpsib-) est refusée par l'API REST (401 « Key not found »).
export function apiKeyWarning(apiKey) {
  return String(apiKey).startsWith('xsmtpsib-')
    ? 'BREVO_API_KEY est une clé SMTP (xsmtpsib-…): l\'API REST de Brevo la refuse (401). Créez une clé API (xkeysib-…) dans Brevo > SMTP & API > Clés API.'
    : null;
}
