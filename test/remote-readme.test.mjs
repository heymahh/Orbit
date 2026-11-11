import test from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createApp } from '../server.mjs';

// README de repositórios que ainda não foram baixados: o GitHub é simulado, nada sai para a rede.
test('reads README and images of repositories that were not downloaded', async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'orbit-remote-'));
  const realFetch = globalThis.fetch;
  const calls = [];
  const png = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13]);
  globalThis.fetch = async (input, init) => {
    const target = String(input instanceof Request ? input.url : input);
    if (target.startsWith('http://127.0.0.1')) return realFetch(input, init);
    calls.push(target);
    if (target === 'https://raw.githubusercontent.com/acme/app/HEAD/README.md') return new Response('# Acme\n\n![logo](docs/logo.png)');
    if (target === 'https://raw.githubusercontent.com/acme/app/HEAD/docs/logo.png') return new Response(png);
    if (target === 'https://raw.githubusercontent.com/acme/app/HEAD/notes.txt') return new Response('texto');
    if (target === 'https://api.github.com/repos/acme/docs/readme') return Response.json({ name: 'readme.rst', path: 'docs/readme.rst', size: 6, encoding: 'base64', content: Buffer.from('Docs!!').toString('base64') });
    return new Response('Not Found', { status: 404 });
  };
  const app = await createApp({ dataDirectory: root, port: 0 });
  const request = endpoint => realFetch(app.url + endpoint, { headers: { 'X-Orbit-Token': app.token } });
  try {
    await t.test('README.md comes from the raw file, without spending the API limit, and is cached', async () => {
      const answer = await request('/api/remote/readme?repo=acme/app');
      assert.equal(answer.status, 200);
      assert.deepEqual(await answer.json(), { name: 'README.md', content: '# Acme\n\n![logo](docs/logo.png)' });
      await request('/api/remote/readme?repo=ACME/app');
      assert.equal(calls.filter(call => call.endsWith('acme/app/HEAD/README.md')).length, 1);
      assert.equal(calls.some(call => call.startsWith('https://api.github.com')), false);
    });
    await t.test('other README names and folders come from the GitHub API', async () => {
      const data = await (await request('/api/remote/readme?repo=acme/docs')).json();
      assert.deepEqual(data, { name: 'docs/readme.rst', content: 'Docs!!' });
    });
    await t.test('missing README gives a clear message', async () => {
      const answer = await request('/api/remote/readme?repo=acme/empty');
      assert.equal(answer.status, 404);
      assert.match((await answer.json()).error, /não tem um README/);
    });
    await t.test('images are identified by content and paths cannot escape the repository', async () => {
      const image = await (await request('/api/remote/image?repo=acme/app&path=docs/logo.png')).json();
      assert.equal(image.kind, 'raster'); assert.match(image.src, /^data:image\/png;base64,/);
      assert.equal((await request('/api/remote/image?repo=acme/app&path=notes.txt')).status, 415);
      for (const bad of ['../secret.png', '/etc/passwd', 'docs//logo.png', 'docs\\logo.png', '']) assert.equal((await request('/api/remote/image?repo=acme/app&path=' + encodeURIComponent(bad))).status, 400, bad);
      for (const bad of ['https://evil.test/a/b', 'a/b/c', '-a/b', '']) assert.equal((await request('/api/remote/readme?repo=' + encodeURIComponent(bad))).status, 400, bad);
      assert.equal((await realFetch(app.url + '/api/remote/readme?repo=acme/app')).status, 403);
    });
  } finally {
    globalThis.fetch = realFetch;
    await app.close();
    await fs.rm(root, { recursive: true, force: true });
  }
});
