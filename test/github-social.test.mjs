import test from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createApp } from '../server.mjs';

test('GitHub stars and follows use the authenticated account and can be reversed', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'orbit-social-'));
  const originalToken = process.env.GITHUB_TOKEN;
  const realFetch = globalThis.fetch;
  const active = new Set();
  globalThis.fetch = async (target, options = {}) => {
    const url = new URL(target);
    assert.equal(url.origin, 'https://api.github.com');
    assert.equal(options.headers.Authorization, 'Bearer test-credential');
    if (url.pathname === '/users/alice') return Response.json({ type: 'User' });
    if (url.pathname === '/users/acme') return Response.json({ type: 'Organization' });
    if (options.method === 'PUT') {
      assert.equal(options.headers['Content-Length'], '0');
      active.add(url.pathname);
    } else if (options.method === 'DELETE') active.delete(url.pathname);
    const exists = active.has(url.pathname) || options.method === 'DELETE';
    return new Response(null, { status: exists ? 204 : 404 });
  };
  let app;
  try {
    delete process.env.GITHUB_TOKEN;
    app = await createApp({ dataDirectory: root, port: 0, backgroundReleaseChecks: false });
    const endpoint = '/api/github/social?repo=';
    const request = (repo, input) => realFetch(app.url + endpoint + encodeURIComponent(repo), {
      headers: { 'X-Orbit-Token': app.token, 'Content-Type': 'application/json' },
      ...(input ? { method: 'POST', body: JSON.stringify(input) } : {})
    });
    const read = async repo => (await request(repo)).json();
    assert.deepEqual(await read('alice/app'), { star: null, follow: null });
    assert.equal((await request('alice/app', { action: 'star', active: true })).status, 403);
    process.env.GITHUB_TOKEN = 'test-credential';
    assert.equal((await realFetch(app.url + endpoint + 'alice/app', { method: 'POST' })).status, 403);
    assert.equal((await request('alice/app', { action: 'other', active: true })).status, 400);
    assert.deepEqual(await read('alice/app'), { star: false, follow: false });
    assert.deepEqual(await read('acme/app'), { star: false, follow: null });
    for (const action of ['star', 'follow']) {
      assert.deepEqual(await (await request('alice/app', { action, active: true })).json(), { active: true });
    }
    assert.deepEqual([...active], ['/user/starred/alice/app', '/user/following/alice']);
    assert.deepEqual(await read('alice/app'), { star: true, follow: true });
    for (const action of ['star', 'follow']) {
      assert.deepEqual(await (await request('alice/app', { action, active: false })).json(), { active: false });
    }
    assert.equal(active.size, 0);
  } finally {
    globalThis.fetch = realFetch;
    if (originalToken === undefined) delete process.env.GITHUB_TOKEN;
    else process.env.GITHUB_TOKEN = originalToken;
    await app?.close();
    await fs.rm(root, { recursive: true, force: true });
  }
});
