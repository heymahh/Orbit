import http from 'node:http';
import test from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import { managedRecipe, archiveEntries, serveAnyPS5 } from '../lib/managed-project.mjs';

function zipDirectory(entries) {
  const buffers = entries.map(({ name, bytes = 0, attributes = 0 }) => {
    const filename = Buffer.from(name);
    const item = Buffer.alloc(46 + filename.length);
    item.writeUInt32LE(0x02014b50, 0);
    item.writeUInt32LE(bytes, 24);
    item.writeUInt16LE(filename.length, 28);
    item.writeUInt32LE(attributes, 38);
    filename.copy(item, 46);
    return item;
  });
  const directory = Buffer.concat(buffers);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(directory.length, 12);
  return Buffer.concat([directory, end]);
}

test('managed profile selects official AnyPS5 packages and preserves configured ports', () => {
  assert.equal(managedRecipe({ fullName: 'other/AnyPS5' }), null);
  const profile = managedRecipe({ fullName: 'boykopovar/AnyPS5' }, 'C:\\App With Spaces\\Orbit');
  assert.equal(profile.mode, 'native');
  assert.equal(profile.port, 4385);
  assert.match(profile.install, /install-anyps5$/);
  assert.match(profile.command, /run-anyps5$/);
  assert.match(profile.install, /"C:\\App With Spaces\\Orbit/);
  assert.equal(managedRecipe({ fullName: 'boykopovar/anyps5', port: 4488 }).port, 4488);
});

test('ZIP preflight checks names, symlinks and expanded size before extraction', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'orbit-zip-'));
  const file = path.join(dir, 'test.zip');
  try {
    await fs.writeFile(file, zipDirectory([{ name: 'libraries/lib.dll', bytes: 10 }]));
    assert.deepEqual(await archiveEntries(file), [{ name: 'libraries/lib.dll', expandedBytes: 10 }]);
    for (const name of ['../escape', '/absolute', 'C:/absolute', 'safe/../../escape', 'safe\\..\\escape', 'stream:alternate']) {
      await fs.writeFile(file, zipDirectory([{ name }]));
      await assert.rejects(archiveEntries(file), /não permitido/);
    }
    await fs.writeFile(file, zipDirectory([{ name: 'link', attributes: 0xa0000000 }]));
    await assert.rejects(archiveEntries(file), /não permitido/);
    await fs.writeFile(file, zipDirectory([{ name: 'large', bytes: 0x90000000 }]));
    await assert.rejects(archiveEntries(file), /2 GB/);
    await fs.writeFile(file, Buffer.from('not a zip'));
    await assert.rejects(archiveEntries(file), /ZIP/);
  } finally { await fs.rm(dir, { recursive: true, force: true }); }
});

test('official web converter is served locally with WASM headers and file boundaries', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'orbit-web-'));
  let server;
  try {
    await assert.rejects(serveAnyPS5(dir, 4385), /não está instalado/);
    const runtime = path.join(dir, '.orbit-runtime');
    const web = path.join(runtime, 'web', 'fixture');
    await fs.mkdir(web, { recursive: true });
    await fs.writeFile(path.join(web, 'index.html'), '<html><body>Converter fixture</body></html>');
    await fs.writeFile(path.join(web, 'module.wasm'), Buffer.from([0, 97, 115, 109, 1, 0, 0, 0]));
    await fs.writeFile(path.join(runtime, 'installed.json'), JSON.stringify({ tag: 'fixture', webRoot: 'web/fixture' }));
    const probe = net.createServer();
    await new Promise(resolve => probe.listen(0, '127.0.0.1', resolve));
    const port = probe.address().port;
    await new Promise(resolve => probe.close(resolve));
    server = await serveAnyPS5(dir, port);
    const origin = 'http://127.0.0.1:' + port;
    const response = await fetch(origin);
    assert.equal(response.status, 200);
    assert.match(await response.text(), /Converter fixture/);
    assert.equal(response.headers.get('cross-origin-embedder-policy'), 'require-corp');
    const wasm = await fetch(origin + '/module.wasm');
    assert.equal(wasm.headers.get('content-type'), 'application/wasm');
    assert.equal((await fetch(origin + '/%2e%2e%2finstalled.json')).status, 404);
    assert.equal((await fetch(origin, { method: 'POST' })).status, 405);
    // Docker publica numa porta aleatória: o navegador chega com outra porta no Host.
    const viaDocker = await new Promise((resolve, reject) => http.get({ host: '127.0.0.1', port, path: '/', headers: { host: '127.0.0.1:61836' } }, res => { res.resume(); resolve(res.statusCode); }).on('error', reject));
    assert.equal(viaDocker, 200);
    const rebinding = await new Promise((resolve, reject) => http.get({ host: '127.0.0.1', port, path: '/', headers: { host: 'evil.example:' + port } }, res => { res.resume(); resolve(res.statusCode); }).on('error', reject));
    assert.equal(rebinding, 403);
  } finally {
    if (server) { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
    await fs.rm(dir, { recursive: true, force: true });
  }
});
