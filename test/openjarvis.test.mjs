import test from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { createHash } from 'node:crypto';
import { dockerPlan, containerArguments, prepareRuntimeAuth, createProxy, httpReady } from '../lib/docker-project.mjs';

test('OpenJarvis gets a persistent local API key and an authenticated container connection', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'orbit-openjarvis-'));
  try {
    await fs.writeFile(path.join(directory, 'Dockerfile'), 'FROM python:3.12\nEXPOSE 8000\nCMD ["jarvis", "serve"]');
    const project = { id: 'oj', fullName: 'open-jarvis/OpenJarvis', network: true };
    const plan = await dockerPlan(directory, project);
    assert.equal(plan.authEnv, 'OPENJARVIS_API_KEY');
    assert.equal(plan.readyPath, '/health');
    const first = await prepareRuntimeAuth(directory, plan);
    const second = await prepareRuntimeAuth(directory, plan);
    assert.match(first.key, /^oj_sk_[A-Za-z0-9_-]{43}$/);
    assert.equal(second.key, first.key);
    assert.equal(await fs.readFile(first.envFile, 'utf8'), 'OPENJARVIS_API_KEY=' + first.key + '\n');
    const args = containerArguments(project, plan, { name: 'orbit-oj', envFile: first.envFile });
    assert.ok(args.includes('--env-file'));
    assert.ok(!args.join(' ').includes(first.key), 'the key is absent from command arguments');
    assert.ok(args.includes('type=volume,source=orbit-data-oj,target=/home/openjarvis'));
    assert.deepEqual(await prepareRuntimeAuth(directory, {}), {});
  } finally { await fs.rm(directory, { recursive: true, force: true }); }
});

test('readiness waits for a successful health response', async () => {
  let ready = false;
  const server = http.createServer((request, response) => {
    assert.equal(request.url, '/health');
    response.writeHead(ready ? 200 : 503); response.end();
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  try {
    assert.equal(await httpReady(server.address().port, '/health'), false);
    ready = true;
    assert.equal(await httpReady(server.address().port, '/health'), true);
  } finally { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
});

test('the local proxy authenticates WebSocket upgrades without sending the API key to the browser', async () => {
  let captured;
  const sockets = new Set();
  const upstream = http.createServer();
  upstream.on('upgrade', (request, socket) => {
    sockets.add(socket);
    captured = request.headers;
    const accept = createHash('sha1').update(request.headers['sec-websocket-key'] + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11').digest('base64');
    socket.write('HTTP/1.1 101 Switching Protocols\r\nConnection: Upgrade\r\nUpgrade: websocket\r\nSec-WebSocket-Accept: ' + accept + '\r\n\r\n');
  });
  await new Promise(resolve => upstream.listen(0, '127.0.0.1', resolve));
  const proxy = await createProxy(upstream.address().port, 'private-websocket-key');
  const origin = 'http://127.0.0.1:' + proxy.address().port;
  try {
    const headers = await new Promise((resolve, reject) => {
      const request = http.request(origin + '/v1/agents/events', { headers: { Origin: origin, Connection: 'Upgrade', Upgrade: 'websocket', 'Sec-WebSocket-Version': '13', 'Sec-WebSocket-Key': 'dGhlIHNhbXBsZSBub25jZQ==' } });
      request.on('upgrade', (response, socket) => { resolve(response.headers); socket.destroy(); });
      request.on('error', reject);
      request.setTimeout(3000, () => request.destroy(new Error('WebSocket timed out')));
      request.end();
    });
    assert.equal(captured.authorization, 'Bearer private-websocket-key');
    assert.doesNotMatch(JSON.stringify(headers), /private-websocket-key/);
  } finally {
    for (const socket of sockets) socket.destroy();
    proxy.closeAllConnections(); upstream.closeAllConnections();
    await new Promise(resolve => proxy.close(resolve)); await new Promise(resolve => upstream.close(resolve));
  }
});
