import test from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { superviseNative, nativeRepairPlan } from '../lib/native-supervisor.mjs';
import { executeNativeSource, nativeDefaultArguments } from '../lib/native-project.mjs';
import { createApp } from '../server.mjs';

async function fixture(files, run) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'orbit-supervision-'));
  try {
    for (const [file, content] of Object.entries(files)) {
      await fs.mkdir(path.dirname(path.join(dir, file)), { recursive: true });
      await fs.writeFile(path.join(dir, file), typeof content === 'string' ? content : JSON.stringify(content));
    }
    await run(dir);
  } finally { await fs.rm(dir, { recursive: true, force: true }); }
}

test('a real failed process is repaired, retried and recorded instead of opening an idle terminal', async () => {
  await fixture({ 'app.mjs': 'import fs from "node:fs"; if(!fs.existsSync("ready")){console.error("ModuleNotFoundError: No module named \'cv2\'");process.exit(7)}console.log("ACTUAL_EXECUTION_OK");' }, async dir => {
    let repairs = 0, output = '';
    const events = [];
    const reportFile = path.join(dir, 'execution.json');
    const report = await superviseNative({ command: process.execPath, args: ['app.mjs'], cwd: dir }, {
      reportFile, output: chunk => { output += chunk; }, notify: event => events.push(event),
      repair: async plan => { assert.equal(plan.package, 'opencv-python-headless'); repairs++; await fs.writeFile(path.join(dir, 'ready'), 'yes'); }
    });
    assert.equal(repairs, 1);
    assert.deepEqual(report.attempts.map(item => item.exitCode), [7, 0]);
    assert.equal(JSON.parse(await fs.readFile(reportFile, 'utf8')).status, 'complete');
    assert.match(output, /ACTUAL_EXECUTION_OK/);
    assert.equal(events.filter(item => item.type === 'orbit-running').length, 2);
    assert.ok(events.some(item => item.type === 'orbit-recovery'));
    assert.ok(events.filter(item => item.type === 'orbit-opened').every(item => item.surface === 'process'));
  });
});

test('the same failure stops after one unsuccessful repair and preserves the nonzero exit', async () => {
  await fixture({ 'app.mjs': 'console.error("ModuleNotFoundError: No module named \'orbit_missing_package\'");process.exit(9);' }, async dir => {
    let repairs = 0;
    const reportFile = path.join(dir, 'execution.json');
    await assert.rejects(superviseNative({ command: process.execPath, args: ['app.mjs'], cwd: dir }, { reportFile, output: () => {}, notify: () => {}, repair: async () => { repairs++; } }), /código 9/);
    const report = JSON.parse(await fs.readFile(reportFile, 'utf8'));
    assert.equal(repairs, 1);
    assert.equal(report.status, 'error');
    assert.equal(report.attempts.length, 2);
  });
});

test('disabled networking prevents repair downloads', async () => {
  await fixture({ 'app.mjs': 'console.error("ModuleNotFoundError: No module named \'orbit_missing_package\'");process.exit(1);' }, async dir => {
    let repairs = 0;
    await assert.rejects(superviseNative({ command: process.execPath, args: ['app.mjs'], cwd: dir }, { network: false, output: () => {}, notify: () => {}, repair: async () => { repairs++; } }), /execução falhou/);
    assert.equal(repairs, 0);
  });
});

test('different failures also stop at the total recovery limit', async () => {
  await fixture({ 'app.mjs': 'import fs from "node:fs";const n=fs.existsSync("count")?Number(fs.readFileSync("count")):0;console.error("ModuleNotFoundError: No module named \'orbit_package_"+n+"\'");process.exit(1);', 'count': '0' }, async dir => {
    let repairs = 0;
    const reportFile = path.join(dir, 'execution.json');
    await assert.rejects(superviseNative({ command: process.execPath, args: ['app.mjs'], cwd: dir }, { reportFile, maxRepairs: 2, output: () => {}, notify: () => {}, repair: async () => { repairs++; await fs.writeFile(path.join(dir, 'count'), String(repairs)); } }), /execução falhou/);
    assert.equal(repairs, 2);
    assert.equal(JSON.parse(await fs.readFile(reportFile, 'utf8')).attempts.length, 3);
  });
});

test('repair classification uses the required .NET family and avoids missing local Python files', async () => {
  await fixture({ 'local_module.py': '' }, async dir => {
    const plan = await nativeRepairPlan("Architecture: x64\nFramework: 'Microsoft.NETCore.App', version '8.0.0' (x64)", dir);
    assert.equal(plan.package, 'Microsoft.DotNet.Runtime.8');
    assert.equal(plan.arch, 'x64');
    assert.equal((await nativeRepairPlan("Framework: 'Microsoft.WindowsDesktop.App', version '8.0.0'", dir)).package, 'Microsoft.DotNet.DesktopRuntime.8');
    assert.equal(await nativeRepairPlan("ModuleNotFoundError: No module named 'local_module'", dir), null);
    assert.equal(await nativeRepairPlan("ModuleNotFoundError: No module named 'google.auth'", dir), null);
    assert.deepEqual(nativeDefaultArguments({ fullName: 'OpenDriverUpdater/OpenDriverUpdater' }), ['scan']);
    assert.deepEqual(nativeDefaultArguments({ fullName: 'owner/tool' }), []);
  });
});

test('a downloaded Node library actually imports, builds a missing entry, and retries', async () => {
  await fixture({
    'package.json': { name: 'orbit-fixture-library', private: true, type: 'module', main: 'dist/index.js', scripts: { build: 'node build.mjs' } },
    'build.mjs': 'import fs from "node:fs";fs.mkdirSync("dist",{recursive:true});fs.writeFileSync("dist/index.js", "import fs from \'node:fs\';fs.writeFileSync(\'imported.txt\',\'real import\');export const value=42;");'
  }, async dir => {
    const report = await executeNativeSource(dir, { id: 'test-library', name: 'fixture', fullName: 'local/fixture', kind: 'library', network: true }, dir);
    assert.equal(report.status, 'complete');
    assert.equal(await fs.readFile(path.join(dir, 'imported.txt'), 'utf8'), 'real import');
    assert.deepEqual(report.attempts.map(item => item.exitCode), [1, 0]);
    assert.equal(report.attempts[0].repair, 'node-build');
  });
});

test('Stop in Orbit terminates a long-running supervised child process', async () => {
  const module = new URL('../lib/native-supervisor.mjs', import.meta.url).href;
  await fixture({
    'projects/monitored/main.mjs': 'import {superviseNative} from ' + JSON.stringify(module) + ';await superviseNative({command:process.execPath,args:["-e","console.log(\'SUPERVISED_PID=\'+process.pid);setInterval(()=>{},1000)"],cwd:process.cwd()});',
    'state.json': { projects: [{ id: 'monitored', name: 'monitored', fullName: 'local/monitored', kind: 'cli', status: 'ready', mode: 'native', trusted: true, command: 'node main.mjs', install: '', image: '', network: true }], events: [] }
  }, async dir => {
    const app = await createApp({ dataDirectory: dir, port: 0, allowNative: true });
    const request = endpoint => fetch(app.url + endpoint, { method: 'POST', headers: { 'X-Orbit-Token': app.token, 'Content-Type': 'application/json' }, body: '{}' });
    let pid;
    try {
      assert.equal((await request('/api/projects/monitored/start')).status, 202);
      const deadline = Date.now() + 10000;
      while (!pid && Date.now() < deadline) {
        await new Promise(resolve => setTimeout(resolve, 100));
        const response = await fetch(app.url + '/api/projects/monitored/logs', { headers: { 'X-Orbit-Token': app.token } });
        const logs = await response.json();
        pid = Number(logs.entries?.map(item => item.text).join('').match(/SUPERVISED_PID=(\d+)/)?.[1]);
      }
      assert.ok(pid, 'the child really ran before Stop');
      assert.equal((await request('/api/projects/monitored/stop')).status, 200);
      while (app.jobs.has('monitored') && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 100));
      assert.equal(app.jobs.has('monitored'), false);
      assert.equal(app.state.projects[0].status, 'stopped');
      assert.throws(() => process.kill(pid, 0), /ESRCH|not found|No such process/);
    } finally { await app.close(); }
  });
});
