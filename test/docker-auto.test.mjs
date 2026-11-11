import test from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { ensureDockerReady } from '../lib/docker-engine.mjs';
import { automaticProfile, dockerPlan, containerArguments, createProxy } from '../lib/docker-project.mjs';

test('Docker already running does not request a restart', async () => {
  const calls = [];
  await ensureDockerReady({ log: () => {}, run: async args => { calls.push(args); return { ok: true, output: '29.0.0' }; } });
  assert.equal(calls.length, 1);
});
test('Docker is started and awaited automatically when stopped', async () => {
  const calls = [];
  let infos = 0;
  await ensureDockerReady({ log: () => {}, sleep: async () => {}, diagnose: async () => '', run: async args => {
    calls.push(args);
    return args[0] === 'info' ? { ok: ++infos >= 3, output: '29.0.0' } : { ok: true, output: '' };
  } });
  assert.ok(calls.some(args => args[0] === 'desktop' && args[1] === 'start'));
  assert.equal(infos, 3);
});
test('fatal Docker startup errors preserve their diagnosis and never suggest native execution', async () => {
  await assert.rejects(ensureDockerReady({ log: () => {}, sleep: async () => {}, diagnose: async () => 'Falha vsock no Windows.', run: async args => ({ ok: args[0] === 'desktop', output: '' }) }), /Falha vsock/);
});
test('VoiceStudio selects official image instead of treating it as a Node-only app', async () => {
  const profile = automaticProfile({ fullName: 'debpalash/VoiceStudio' });
  assert.equal(profile.mode, 'docker');
  const plan = await dockerPlan('/not-needed', { id: 'example', fullName: 'debpalash/VoiceStudio' });
  assert.equal(plan.image, 'ghcr.io/debpalash/voicestudio:stable');
  assert.equal(plan.port, 3900);
  const args = containerArguments({ id: 'example', network: true }, plan, { name: 'orbit-example', envFile: '/private/runtime.env' });
  assert.ok(args.includes('127.0.0.1::3900'));
  assert.ok(args.includes('--env-file'));
  assert.ok(args.some(value => value.includes('orbit-data-example')));
  assert.ok(!args.includes('--privileged'));
  assert.ok(!args.some(value => value.includes('docker.sock')));
  assert.equal(args.at(-1), plan.image);
});
test('Dockerfile generation installs declared package manager and binds the web server correctly', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'orbit-docker-'));
  try {
    await fs.writeFile(path.join(dir, 'package.json'), JSON.stringify({ packageManager: 'pnpm@10', scripts: { dev: 'vite' }, devDependencies: { vite: '*' } }));
    const plan = await dockerPlan(dir, { id: 'example', fullName: 'local/example' });
    assert.match(plan.dockerfile, /npm install -g pnpm/);
    assert.match(plan.dockerfile, /pnpm install/);
    assert.match(plan.dockerfile, /--host 0\.0\.0\.0/);
    assert.equal(plan.port, 5173);
    await fs.writeFile(path.join(dir, 'Dockerfile'), 'FROM busybox\nEXPOSE 8080\nCMD ["httpd","-f"]');
    const existing = await dockerPlan(dir, { id: 'example' });
    assert.equal(existing.existing, 'Dockerfile');
    assert.equal(existing.port, 8080);
  } finally { await fs.rm(dir, { recursive: true, force: true }); }
});
test('local VoiceStudio proxy injects authentication without exposing the key to the browser', async () => {
  let captured;
  const upstream = http.createServer((request, response) => {
    captured = request.headers;
    response.setHeader('Content-Type', 'application/json'); response.end('{"ok":true}');
  });
  await new Promise(resolve => upstream.listen(0, '127.0.0.1', resolve));
  const proxy = await createProxy(upstream.address().port, 'private-test-key');
  const origin = 'http://127.0.0.1:' + proxy.address().port;
  try {
    const response = await fetch(origin + '/api/settings');
    assert.equal(response.status, 200);
    assert.equal(captured.authorization, 'Bearer private-test-key');
    assert.doesNotMatch(await response.text(), /private-test-key/);
    assert.equal((await fetch(origin, { headers: { Origin: 'https://evil.test' } })).status, 403);
  } finally {
    proxy.closeAllConnections(); upstream.closeAllConnections();
    await new Promise(resolve => proxy.close(resolve)); await new Promise(resolve => upstream.close(resolve));
  }
});
test('documentation-only repositories are recognized before Docker starts', async () => {
  const { isDocumentationOnly, detectProject } = await import('../lib/runner.mjs');
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'orbit-docs-'));
  try {
    await fs.writeFile(path.join(dir, 'readme.md'), '# Awesome');
    await fs.writeFile(path.join(dir, 'license'), 'CC0');
    await fs.mkdir(path.join(dir, 'media')); await fs.writeFile(path.join(dir, 'media', 'logo.svg'), '<svg/>');
    assert.equal(await isDocumentationOnly(dir), true);
    assert.equal((await detectProject(dir)).language, 'Documentação');
    await assert.rejects(dockerPlan(dir, { id: 'docs', fullName: 'someone/awesome' }), /não há programa para executar/);
    await fs.writeFile(path.join(dir, 'tool.sh'), 'echo hi');
    assert.equal(await isDocumentationOnly(dir), false);
  } finally { await fs.rm(dir, { recursive: true, force: true }); }
});
test('Docker startup waits long enough for a slow Docker Desktop', async () => {
  let now = 0, infos = 0;
  const realNow = Date.now; Date.now = () => now;
  try {
    await ensureDockerReady({ log: () => {}, diagnose: async () => '', sleep: async ms => { now += ms + 5000; }, run: async args => args[0] === 'info' ? { ok: ++infos > 40, output: '29.7.2' } : { ok: true, output: '' } });
    assert.ok(now > 240000, 'aguardou mais de 4 minutos');
  } finally { Date.now = realNow; }
});
test('apps that refuse framing are detected from their headers', async () => {
  const { frameVerdict } = await import('../lib/runner.mjs');
  assert.equal(frameVerdict({}).frameable, true);
  assert.equal(frameVerdict({ 'x-frame-options': 'DENY' }).frameable, false);
  assert.equal(frameVerdict({ 'x-frame-options': 'SAMEORIGIN' }).frameable, false);
  assert.equal(frameVerdict({ 'content-security-policy': "default-src 'self'; frame-ancestors 'none'" }).frameable, false);
  assert.equal(frameVerdict({ 'content-security-policy': "frame-ancestors 'self'" }).frameable, false);
  assert.equal(frameVerdict({ 'content-security-policy': 'frame-ancestors http://127.0.0.1:*' }).frameable, true);
  assert.equal(frameVerdict({ 'content-security-policy': "script-src 'self'" }).frameable, true);
});
