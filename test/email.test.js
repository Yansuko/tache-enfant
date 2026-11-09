import { describe, it, expect, vi, beforeEach } from 'vitest';
import { makeBrevoSender } from '../src/email.mjs';
import { setEmailSender } from '../src/core.mjs';
import { api } from './helpers.js';

const msg = { to: 'p@x.com', subject: 'S', body: 'a\nb' };

describe('makeBrevoSender', () => {
  it('throws without from', () => {
    expect(() => makeBrevoSender({ apiKey: 'k' })).toThrow(/from/i);
  });

  it('posts to Brevo and returns ok on 201', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: true, status: 201, text: async () => '{"messageId":"1"}' });
    const r = await makeBrevoSender({ apiKey: 'k', from: 'me@x.com', fetchImpl })(msg);
    expect(r).toMatchObject({ ok: true, status: 201 });
    const [url, opts] = fetchImpl.mock.calls[0];
    expect(url).toBe('https://api.brevo.com/v3/smtp/email');
    expect(opts.method).toBe('POST');
    expect(opts.headers['api-key']).toBe('k');
    const b = JSON.parse(opts.body);
    expect(b.sender).toEqual({ name: 'DailyKids', email: 'me@x.com' });
    expect(b.to).toEqual([{ email: 'p@x.com' }]);
  });

  it('logs and returns the Brevo body on error', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const fetchImpl = async () => ({ ok: false, status: 401, text: async () => '{"message":"Key not found"}' });
    const r = await makeBrevoSender({ apiKey: 'k', from: 'me@x.com', fetchImpl })(msg);
    expect(r.ok).toBe(false);
    expect(r.status).toBe(401);
    expect(r.detail).toContain('Key not found');
    expect(spy).toHaveBeenCalledWith(expect.stringContaining('[EMAIL] Brevo 401 to=p@x.com: {"message":"Key not found"}'));
    spy.mockRestore();
  });

  it('never throws on network failure', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const fetchImpl = async () => { throw new Error('boom'); };
    const r = await makeBrevoSender({ apiKey: 'k', from: 'me@x.com', fetchImpl })(msg);
    expect(r.ok).toBe(false);
    expect(r.detail).toContain('boom');
    spy.mockRestore();
  });
});

describe('testEmail action', () => {
  beforeEach(() => { process.env.ADMIN_KEY = 'adm'; setEmailSender(null); });

  it('403 without valid key', async () => {
    expect((await api('testEmail', { to: 'a@b.com' })).status).toBe(403);
  });
  it('400 without valid to', async () => {
    expect((await api('testEmail', { adminKey: 'adm' })).status).toBe(400);
    expect((await api('testEmail', { adminKey: 'adm', to: 'nope' })).status).toBe(400);
  });
  it('503 without sender', async () => {
    expect((await api('testEmail', { adminKey: 'adm', to: 'a@b.com' })).status).toBe(503);
  });
  it('200 with sender result', async () => {
    setEmailSender(async () => ({ ok: true, status: 201, detail: 'x' }));
    const r = await api('testEmail', { adminKey: 'adm', to: 'a@b.com' });
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ ok: true, status: 201 });
  });
});

describe('apiKeyWarning', () => {
  it('signale une clé SMTP (xsmtpsib-) car l\'API REST exige une clé xkeysib-', async () => {
    const { apiKeyWarning } = await import('../src/email.mjs');
    expect(apiKeyWarning('xsmtpsib-abc')).toMatch(/xkeysib-/);
    expect(apiKeyWarning('xkeysib-abc')).toBeNull();
    expect(apiKeyWarning('autre')).toBeNull();
  });
});
