import test from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { availableProjectRelease, createReleaseUpdates, latestPublishedRelease, recoverInstalledRelease, releaseReference, isNewerRelease } from '../lib/release-updates.mjs';

const release = (tag, date, extra = {}) => ({ id: tag, tag_name: tag, published_at: date, draft: false, prerelease: false, assets: [], ...extra });
const old = release('v1.9.0', '2026-10-01T00:00:00Z');
const fresh = release('v1.10.0', '2026-11-01T00:00:00Z');
const reference = item => releaseReference(item, 'owner/app');
function setup(options = {}) {
  let clock = Date.parse('2026-11-09T12:00:00Z'), releases = [old], calls = 0;
  const state = options.state || { projects: [{ id: 'p', name: 'App', fullName: 'owner/app', status: 'ready' }] };
  const service = createReleaseUpdates({ state, now: () => clock, github: async () => { calls++; return releases; }, ...options });
  return { state, service, advance: (ms = 3600000) => { clock += ms; }, set: value => { releases = value; }, calls: () => calls };
}

test('only published releases are selected, with stable versions preferred', () => {
  assert.equal(latestPublishedRelease([fresh, release('v2-beta', '2026-11-08T00:00:00Z', { prerelease: true }), release('v3', '2026-11-09T00:00:00Z', { draft: true })]).tag_name, 'v1.10.0');
  assert.equal(latestPublishedRelease([release('v2-beta', '2026-11-08T00:00:00Z', { prerelease: true })]).prerelease, true);
  assert.equal(latestPublishedRelease([]), null);
  assert.equal(reference(fresh).url, 'https://github.com/owner/app/releases/tag/v1.10.0');
});

test('version comparison handles numeric versions, prereleases, non-version tags and backports', () => {
  assert.equal(isNewerRelease(reference(fresh), reference(old)), true);
  assert.equal(isNewerRelease(reference(release('v1.8.9', '2026-11-08')), reference(fresh)), false);
  assert.equal(isNewerRelease(reference({ ...fresh, id: 'recreated' }), reference(fresh)), false);
  assert.equal(isNewerRelease(reference(release('v2.0.0', '2026-11-08')), reference(release('v2.0.0-beta.2', '2026-11-07'))), true);
  assert.equal(isNewerRelease(reference(release('november', '2026-11-08')), reference(release('october', '2026-10-08'))), true);
});

test('unknown versions establish a baseline; a new release creates one persistent notice', async () => {
  const f = setup();
  await f.service.check();
  assert.equal(f.state.releaseNotifications.length, 0);
  f.advance(); f.set([fresh, old]); await f.service.check();
  assert.equal(f.state.releaseNotifications.length, 1);
  assert.equal(f.state.releaseNotifications[0].tag, 'v1.10.0');
  assert.equal(f.state.releaseNotifications[0].previousTag, 'v1.9.0');
  f.advance(); await f.service.check();
  assert.equal(f.state.releaseNotifications.length, 1);
  const restarted = setup({ state: JSON.parse(JSON.stringify(f.state)) });
  restarted.advance(5 * 3600000); restarted.set([fresh, old]); await restarted.service.check();
  assert.equal(restarted.state.releaseNotifications.length, 1);
});

test('the downloaded release in the native cache detects an update on the first check', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'orbit-releases-'));
  try {
    await fs.mkdir(path.join(directory, 'p', 'v1.9.0'), { recursive: true });
    await fs.writeFile(path.join(directory, 'p', 'v1.9.0', 'app-windows.zip'), 'zip!');
    const f = setup({ nativeDirectory: directory });
    f.set([fresh, { ...old, assets: [{ name: 'app-windows.zip', size: 4 }] }]);
    await f.service.check();
    assert.equal(f.state.releaseNotifications[0].previousTag, 'v1.9.0');
    assert.equal(f.state.releaseNotifications[0].tag, 'v1.10.0');
  } finally { await fs.rm(directory, { recursive: true, force: true }); }
});

test('a card keeps its compatible update after reading the notice and clears it on installation', async () => {
  const project = {id:'p',name:'App',fullName:'owner/app',kind:'native',status:'ready',installedRelease:reference(old)};
  const f = setup({state:{projects:[project]}});
  const windows = {...fresh,assets:[{name:'app-windows-x64.zip'}]};
  const otherPlatform = release('v2.0.0','2026-11-08',{assets:[{name:'app-linux.zip'}]});
  f.set([otherPlatform,windows,old]);
  await f.service.check();
  assert.equal(availableProjectRelease(project).tag,windows.tag_name);
  await f.service.markRead('all');
  assert.equal(availableProjectRelease(project).tag,windows.tag_name);
  project.installedRelease = reference(windows);
  assert.equal(availableProjectRelease(project),null);
});

test('a legacy extraction identifies an installed version only when it is unambiguous', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(),'orbit-local-release-'));
  try {
    const project = {name:'App',fullName:'owner/app'};
    await fs.mkdir(path.join(root,'v1.9.0','app'),{recursive:true});
    assert.equal(await recoverInstalledRelease(project,root),null);
    await fs.writeFile(path.join(root,'v1.9.0','app','App.exe'),'extracted');
    assert.equal((await recoverInstalledRelease(project,root)).tag,'v1.9.0');
    await fs.mkdir(path.join(root,'v1.10.0','app'),{recursive:true});
    await fs.writeFile(path.join(root,'v1.10.0','app','App.exe'),'extracted');
    assert.equal(await recoverInstalledRelease(project,root),null);
  } finally { await fs.rm(root,{recursive:true,force:true}); }
});

test('the first release is announced when a previously checked repository had none', async () => {
  const f = setup(); f.set([]); await f.service.check();
  f.advance(); f.set([release('v1.0.0', '2026-11-09T12:30:00Z')]); await f.service.check();
  assert.equal(f.state.releaseNotifications.length, 1);
});

test('rate limits preserve the baseline and do not become fake release notices', async () => {
  let fail = false;
  const f = setup({ github: async () => { if (fail) throw Object.assign(new Error('Limite do GitHub'), { upstreamStatus: 429 }); return fail === null ? [fresh] : [old]; } });
  await f.service.check(); f.advance(); fail = true; await f.service.check();
  assert.equal(f.state.releaseNotifications.length, 0);
  assert.equal(f.state.projects[0].releaseTracking.baseline.tag, 'v1.9.0');
  assert.ok(f.state.releaseUpdateCheck.error);
  f.advance(); fail = null; await f.service.check();
  assert.equal(f.state.releaseNotifications.length, 1);
});

test('concurrent tabs claim an announcement once; read status survives a restart', async () => {
  const f = setup(); await f.service.check(); f.advance(); f.set([fresh]); await f.service.check();
  const id = f.state.releaseNotifications[0].id;
  const claimed = await Promise.all([f.service.claim([id]), f.service.claim([id])]);
  assert.equal(claimed.reduce((sum, result) => sum + result.items.length, 0), 1);
  await f.service.markRead([id]);
  const restarted = setup({ state: JSON.parse(JSON.stringify(f.state)) });
  assert.equal((await restarted.service.claim([id])).items.length, 0);
  assert.ok(restarted.state.releaseNotifications[0].readAt);
});

test('manual checks and concurrent requests reuse the cooldown', async () => {
  const f = setup();
  await Promise.all([f.service.check(), f.service.check({ force: true })]);
  assert.equal(f.calls(), 1);
  await f.service.check({ force: true }); assert.equal(f.calls(), 1);
  f.advance(60000); await f.service.check({ force: true }); assert.equal(f.calls(), 2);
});

test('a removed project cannot acquire an orphan notification during a request', async () => {
  let finish;
  const f = setup({ github: () => new Promise(resolve => { finish = resolve; }) });
  const pending = f.service.check(); f.state.projects = []; finish([fresh]); await pending;
  assert.deepEqual(f.state.releaseNotifications, []);
});

test('automatic checks run in the background and stop with the service', async () => {
  let calls = 0;
  const state = { projects: [{ id: 'p', fullName: 'owner/app' }] };
  const service = createReleaseUpdates({ state, github: async () => { calls++; return [old]; }, startupDelayMs: 1, intervalMs: 20, minimumCheckMs: 0 });
  service.start(); await new Promise(resolve => setTimeout(resolve, 55)); await service.close();
  const before = calls; assert.ok(before > 0);
  await new Promise(resolve => setTimeout(resolve, 30)); assert.equal(calls, before);
});
