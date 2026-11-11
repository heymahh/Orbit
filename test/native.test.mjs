import test from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { scoreWindowsAsset, scoreAndroidAsset, pickReleaseAsset, pickAnyAsset, rankExecutables, peSubsystem, mcpLaunch, terminalScript } from '../lib/native-project.mjs';
import { createApp } from '../server.mjs';

const release = (tag, names, extra = {}) => ({ tag_name: tag, draft: false, prerelease: false, assets: names.map(name => ({ name, size: 1000, browser_download_url: 'https://example.test/' + name })), ...extra });

test('a Windows release stays available for local execution when its checkout is missing', { skip: process.platform !== 'win32' }, async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'orbit-missing-source-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const project = { id: 'p', name: 'App', fullName: 'owner/app', status: 'interrupted', installedRelease: { tag: 'v2.1.0' } };
  const extracted = path.join(root, 'native', project.id, 'v2.1.0', 'app');
  await fs.mkdir(extracted, { recursive: true });
  await fs.writeFile(path.join(extracted, 'App.exe'), 'fixture');
  await fs.writeFile(path.join(root, 'state.json'), JSON.stringify({ projects: [project], events: [] }));
  const app = await createApp({ dataDirectory: root, port: 0, backgroundReleaseChecks: false });
  try {
    const headers = { 'X-Orbit-Token': app.token, 'Content-Type': 'application/json' };
    const state = await (await fetch(app.url + '/api/state', { headers })).json();
    assert.equal(state.projects[0].kind, 'native');
    assert.equal(state.projects[0].executionEnvironment, 'local');
    assert.equal(state.projects[0].installedRelease.tag, 'v2.1.0');
    const files = await fetch(app.url + '/api/projects/p/files', { headers });
    assert.equal(files.status, 404);
    assert.deepEqual(await files.json(), { error: 'A pasta do código local não foi encontrada.' });
    const start = () => fetch(app.url + '/api/projects/p/start', { headers, method: 'POST', body: '{}' });
    const ready = await start();
    assert.equal(ready.status, 409);
    assert.deepEqual(await ready.json(), { error: 'confirm-native' });
    await fs.rename(path.join(extracted, 'App.exe'), path.join(extracted, 'uninstall.exe'));
    const unavailable = await start();
    assert.equal(unavailable.status, 404);
    assert.deepEqual(await unavailable.json(), { error: 'A pasta do código local não foi encontrada.' });
  } finally { await app.close(); }
});

test('Windows builds are chosen from Releases, preferring stable 64-bit portable files', () => {
  assert.ok(scoreWindowsAsset('app-win-x64.zip', 'x64') > scoreWindowsAsset('app-win32-ia32.zip', 'x64'));
  assert.ok(scoreWindowsAsset('App-portable-win64.zip', 'x64') > scoreWindowsAsset('App-Setup-1.2.exe', 'x64'));
  for (const name of ['tool-linux-x64.tar.gz', 'App-darwin.zip', 'app-arm64-windows.zip', 'checksums.txt', 'Overdrive.exfat', 'update.zip', 'source.zip']) assert.equal(scoreWindowsAsset(name, 'x64'), -1, name);
  const releases = [release('v2.0', ['app-linux.tar.gz']), release('v1.9-beta', ['app-windows.zip'], { prerelease: true }), release('v1.8', ['app-windows.zip', 'app-windows.zip.sha256'])];
  assert.equal(pickReleaseAsset(releases, scoreWindowsAsset).release.tag_name, 'v1.8', 'versão estável com Windows vem antes do beta');
  const onlyBeta = [release('v0.2.0-alpha.2', ['SavageWind-0.2.0-alpha.2-windows.zip'], { prerelease: true })];
  assert.equal(pickReleaseAsset(onlyBeta, scoreWindowsAsset).asset.name, 'SavageWind-0.2.0-alpha.2-windows.zip', 'usa o pré-lançamento quando é o único');
  assert.equal(pickReleaseAsset([release('v1', ['Overdrive.exfat', 'update.zip'])], scoreWindowsAsset), null);
  assert.equal(pickAnyAsset([release('v1', ['notes.txt', 'Overdrive.exfat'])]).asset.name, 'Overdrive.exfat');
  assert.ok(scoreAndroidAsset('app-universal-release.apk') > scoreAndroidAsset('app-debug.apk'));
  assert.equal(scoreAndroidAsset('app.zip'), -1);
});

test('the main executable is picked over uninstallers and helpers', () => {
  const ranked = rankExecutables([
    { path: 'out/unins000.exe', size: 2e6, depth: 0 },
    { path: 'out/bin/crashpad_handler.exe', size: 3e6, depth: 1 },
    { path: 'out/SavageWind.exe', size: 6e7, depth: 1 },
    { path: 'out/vc_redist.x64.exe', size: 2.5e7, depth: 0 }
  ], 'SavageWindRecomp');
  assert.equal(path.basename(ranked[0].path), 'SavageWind.exe');
});

test('the PE header tells window programs from terminal programs', () => {
  const pe = subsystem => {
    const buffer = Buffer.alloc(512);
    buffer.write('MZ', 0, 'latin1'); buffer.writeUInt32LE(0x80, 0x3c);
    buffer.write('PE\0\0', 0x80, 'latin1'); buffer.writeUInt16LE(subsystem, 0x80 + 24 + 68);
    return buffer;
  };
  assert.equal(peSubsystem(pe(2)), 2);
  assert.equal(peSubsystem(pe(3)), 3);
  assert.equal(peSubsystem(Buffer.from('not an exe at all, just text padding padding padding padding')), 0);
});

test('MCP servers start from the official registry entry or the local package', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'orbit-mcp-'));
  try {
    await fs.writeFile(path.join(dir, 'server.json'), JSON.stringify({ title: 'REA', packages: [{ registryType: 'npm', identifier: 'rea-agents', version: '6.7.0', packageArguments: [{ type: 'positional', value: 'mcp' }] }] }));
    assert.deepEqual(await mcpLaunch(dir), { name: 'rea', command: 'npx', args: ['-y', 'rea-agents@6.7.0', 'mcp'], source: 'npm' });
    await fs.rm(path.join(dir, 'server.json'));
    await fs.writeFile(path.join(dir, 'package.json'), JSON.stringify({ name: '@acme/mcp-files', bin: { 'mcp-files': 'dist/index.js' } }));
    const local = await mcpLaunch(dir);
    assert.equal(local.name, 'mcp-files');
    assert.equal(local.command, 'node');
    assert.equal(local.args[0], path.join(dir, 'dist/index.js'));
  } finally { await fs.rm(dir, { recursive: true, force: true }); }
});

test('terminal scripts escape text and prepare PATH and aliases', () => {
  const script = terminalScript({ title: 'Orbit · Tool & Co', cwd: 'C:\\p', pathDirs: ['C:\\bin'], aliases: { tool: 'node "C:\\t.js"' }, lines: ['100% & pronto > ok', ''], run: 'tool --help' });
  assert.match(script, /^@echo off\r\n/);
  assert.match(script, /title Orbit · Tool  Co\r\n/);
  assert.match(script, /set "PATH=C:\\bin;%PATH%"/);
  assert.match(script, /doskey tool=node "C:\\t\.js" \$\*/);
  assert.match(script, /echo 100%% \^& pronto \^> ok/);
  assert.match(script, /tool --help\r\n$/);
});
