import test from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createApp } from '../server.mjs';

test('release notifications use authenticated routes, persist read state and serve the client', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'orbit-update-api-'));
  const project = { id: 'p', name: 'App', fullName: 'owner/app', status: 'ready', releaseTracking: { initialized: true, baseline: { id: '1', tag: 'v1.0.0', publishedAt: '2026-10-01T00:00:00Z' } } };
  await fs.writeFile(path.join(dir, 'state.json'), JSON.stringify({ projects: [project], events: [] }));
  const app = await createApp({ dataDirectory: dir, port: 0, backgroundReleaseChecks: false, releaseGithub: async () => [{ id: 2, tag_name: 'v2.0.0', published_at: '2026-11-01T00:00:00Z', draft: false, prerelease: false }] });
  const headers = { 'X-Orbit-Token': app.token, 'Content-Type': 'application/json' };
  const post = (url, value = {}) => fetch(app.url + url, { method: 'POST', headers, body: JSON.stringify(value) });
  try {
    assert.equal((await fetch(app.url + '/api/notifications')).status, 403);
    assert.equal((await fetch(app.url + '/api/updates/check', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })).status, 403);
    const checked = await (await post('/api/updates/check')).json();
    assert.equal(checked.items.length, 1);
    const id = checked.items[0].id;
    const claims = await Promise.all([post('/api/notifications/claim', { ids: [id] }), post('/api/notifications/claim', { ids: [id] })]);
    const payloads = await Promise.all(claims.map(response => response.json()));
    assert.equal(payloads.reduce((sum, result) => sum + result.items.length, 0), 1);
    assert.equal((await post('/api/notifications/read', { ids: { unsafe: true } })).status, 400);
    const read = await (await post('/api/notifications/read', { ids: 'all' })).json();
    assert.ok(read.items[0].readAt);
    assert.ok(read.items[0].announcedAt);
    assert.equal((await fetch(app.url + '/release-notifications.js')).status, 200);
    const session = await (await fetch(app.url + '/api/session')).json();
    assert.equal(session.capabilities.releaseNotifications, true);
    assert.equal((await fetch(app.url + '/api/notifications', { headers: { ...headers, Origin: 'https://evil.example' } })).status, 403);
  } finally { await app.close(); }
  const saved = JSON.parse(await fs.readFile(path.join(dir, 'state.json'), 'utf8'));
  assert.ok(saved.releaseNotifications[0].readAt);
  assert.ok(saved.releaseNotifications[0].announcedAt);
  await fs.rm(dir, { recursive: true, force: true });
});
