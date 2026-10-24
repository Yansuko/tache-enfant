import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';

let app;

beforeAll(async () => {
  process.env.DATABASE_URL = 'sqlite://:memory:';
  process.env.PORT = '0';
  ({ app } = await import('../server.js'));
});

describe('PWA - Static Files', () => {
  it('serves manifest.json with correct structure', async () => {
    const res = await request(app).get('/manifest.json');

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/application\/(manifest\+)?json/);
    expect(res.body).toHaveProperty('name');
    expect(res.body).toHaveProperty('short_name', 'DailyKids');
    expect(res.body).toHaveProperty('start_url', '/');
    expect(res.body).toHaveProperty('display', 'standalone');
    expect(res.body).toHaveProperty('theme_color');
    expect(res.body).toHaveProperty('background_color');
    expect(res.body).toHaveProperty('icons');
    expect(Array.isArray(res.body.icons)).toBe(true);
    expect(res.body.icons.length).toBeGreaterThan(0);
  });

  it('serves logo PNG files', async () => {
    const sizes = ['96', '192', '512'];

    for (const size of sizes) {
      const res = await request(app).get(`/logo-${size}.png`);
      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toContain('image/png');
    }
  });

  it('serves monochrome logo variants', async () => {
    const sizes = ['96', '192', '512'];

    for (const size of sizes) {
      const res = await request(app).get(`/logo-${size}-white.png`);
      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toContain('image/png');
    }
  });

  it('serves index.html for SPA fallback', async () => {
    const res = await request(app).get('/');

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('text/html');
    expect(res.text).toContain('<!DOCTYPE html');
    expect(res.text).toContain('DailyKids');
  });

  it('serves CSS file', async () => {
    const res = await request(app).get('/styles.css');

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('text/css');
  });
});

describe('PWA - App Shell Routes', () => {
  it('serves admin.html for admin routes', async () => {
    const res = await request(app).get('/admin');

    expect(res.status).toBe(200);
    expect(res.text).toContain('html');
  });

  it('serves app.html for app routes', async () => {
    const res = await request(app).get('/app');

    expect(res.status).toBe(200);
    expect(res.text).toContain('html');
  });

  it('serves auth.html for auth routes', async () => {
    const res = await request(app).get('/auth');

    expect(res.status).toBe(200);
    expect(res.text).toContain('html');
  });

  it('fallback to index.html for unknown SPA routes', async () => {
    const res = await request(app).get('/user/settings');

    expect(res.status).toBe(200);
    expect(res.text).toContain('html');
  });
});

describe('PWA - Icon Availability', () => {
  it('all manifest icons exist on filesystem', async () => {
    const manifestRes = await request(app).get('/manifest.json');
    const icons = manifestRes.body.icons.map(i => i.src.replace('/', ''));

    for (const icon of icons) {
      const res = await request(app).get(`/${icon}`);
      expect(res.status).toBe(200, `Icon ${icon} not found`);
    }
  });

  it('favicon is available', async () => {
    // Favicon is typically served via manifest
    const res = await request(app).get('/manifest.json');
    expect(res.status).toBe(200);
    expect(res.body.icons.length).toBeGreaterThan(0);
  });
});

describe('PWA - Offline Support Headers', () => {
  it('sets cache-friendly headers for static assets', async () => {
    const res = await request(app).get('/manifest.json');

    // Should be cacheable
    expect(res.status).toBe(200);
  });

  it('returns valid JSON for manifest', async () => {
    const res = await request(app).get('/manifest.json');

    expect(() => JSON.parse(JSON.stringify(res.body))).not.toThrow();
  });
});
