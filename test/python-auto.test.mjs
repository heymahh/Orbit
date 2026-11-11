import test from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dockerPlan, rustDependencyRepair } from '../lib/docker-project.mjs';
import { classifyProject } from '../lib/classify.mjs';

const project = { id: 'auto', fullName: 'local/auto', network: true };

test('a Rust compiler mismatch is repaired before a multiline native extension build', () => {
  const source = 'FROM python:3.12 AS builder\nRUN rustup default 1.88\nRUN uv pip install . && \\\n    maturin build --release && \\\n    echo done\nFROM python:3.12\nCMD ["jarvis"]\n';
  const repaired = rustDependencyRepair(source, 'uuid requires rustc 1.89.0\nother requires rustc 1.90.0');
  assert.equal(repaired.version, '1.90.0');
  assert.match(repaired.dockerfile, /RUN rustup toolchain install 1\.90\.0 --profile minimal && rustup default 1\.90\.0\nRUN uv pip install/);
  assert.match(repaired.dockerfile, /maturin build --release/);
  assert.ok(repaired.dockerfile.endsWith('FROM python:3.12\nCMD ["jarvis"]\n'));
  assert.equal(rustDependencyRepair(source, 'network error'), null);
  assert.equal(rustDependencyRepair('FROM rust:1.88\nRUN cargo build', 'requires rustc 1.89.0'), null);
});
async function fixture(files, run) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'orbit-python-'));
  try {
    for (const [name, content] of Object.entries(files)) {
      await fs.mkdir(path.dirname(path.join(dir, name)), { recursive: true });
      await fs.writeFile(path.join(dir, name), content);
    }
    await run(dir);
  } finally { await fs.rm(dir, { recursive: true, force: true }); }
}

test('official Dockerfile in deploy/docker prepares the whole app from the repository root', async () => {
  await fixture({ 'pyproject.toml': '[project]\nname="demo"\ndependencies=["fastapi"]', 'deploy/docker/Dockerfile': 'FROM python:3.12\nEXPOSE 8000\nCMD ["jarvis", "serve"]' }, async dir => {
    assert.equal((await classifyProject(dir)).kind, 'web');
    const plan = await dockerPlan(dir, project);
    assert.equal(plan.existing, 'deploy/docker/Dockerfile');
    assert.equal(plan.context, '');
    assert.equal(plan.port, 8000);
  });
});

test('Python src layout and application factories produce an executable module', async () => {
  await fixture({ 'pyproject.toml': '[project]\nname="demo"\ndependencies=["fastapi"]', 'src/demo/server/app.py': 'from fastapi import FastAPI\ndef create_app():\n    return FastAPI()' }, async dir => {
    const plan = await dockerPlan(dir, project);
    assert.match(plan.dockerfile, /uvicorn demo\.server\.app:create_app --factory --host 0\.0\.0\.0/);
    assert.match(plan.dockerfile, /ENV PYTHONPATH="\/workspace\/src"/);
    assert.match(plan.dockerfile, /python \/opt\/orbit\/python-runner\.py/);
    assert.match((await dockerPlan(dir, { ...project, network: false })).dockerfile, /ORBIT_AUTO_DEPENDENCIES="0"/);
  });
});

test('a benchmark with web dependencies does not hide the real nested server', async () => {
  await fixture({ 'taskbench/requirements.txt': 'flask\ngradio', 'taskbench/evaluate.py': 'print(1)', 'hugginggpt/server/requirements.txt': 'gradio', 'hugginggpt/server/run_gradio_demo.py': 'import gradio as gr\ngr.Interface(fn=print, inputs="text", outputs="text").launch()' }, async dir => {
    assert.equal((await classifyProject(dir)).appDir, 'hugginggpt/server');
    assert.match((await dockerPlan(dir, project)).dockerfile, /run_gradio_demo\.py/);
  });
});

// Exercise the real runner without internet: a fake pip creates the missing module.
test('missing Python packages install and retry once; local files and installed submodules stop', async () => {
  const candidates = [['python', []], ['py', ['-3']], ['python3', []]];
  const interpreter = candidates.find(([bin, args]) => spawnSync(bin, [...args, '-c', 'import sys; print(sys.version_info.major)'], { windowsHide: true, encoding: 'utf8', timeout: 10000 }).stdout?.trim() === '3');
  assert.ok(interpreter, 'Python is required to verify automatic package installation');
  const [bin, args] = interpreter;
  const runner = fileURLToPath(new URL('../lib/python-runner.py', import.meta.url));
  await fixture({
    'pip.py': 'from pathlib import Path\nimport sys\nassert sys.argv[-1] == "orbit_test_dependency"\nPath("installs.txt").open("a").write("installed\\n")\nPath("orbit_test_dependency.py").write_text("VALUE=42")',
    'app.py': 'import orbit_test_dependency\nprint(orbit_test_dependency.VALUE)',
  }, async dir => {
    const command = '"' + spawnSync(bin, [...args, '-c', 'import sys; print(sys.executable)'], { encoding: 'utf8', windowsHide: true }).stdout.trim() + '" app.py';
    const run = (extraEnv = {}) => spawnSync(bin, [...args, runner, command], { cwd: dir, encoding: 'utf8', windowsHide: true, timeout: 30000, env: { ...process.env, PYTHONPATH: dir, ORBIT_AUTO_DEPENDENCIES: '1', ...extraEnv } });
    const success = run();
    assert.equal(success.status, 0, success.stdout + success.stderr);
    assert.match(success.stdout, /42/);
    assert.equal((await fs.readFile(path.join(dir, 'installs.txt'), 'utf8')).replaceAll('\r\n', '\n'), 'installed\n');
    await fs.writeFile(path.join(dir, 'app.py'), 'raise ModuleNotFoundError("No module named \'orbit_test_dependency.child\'")');
    assert.notEqual(run().status, 0);
    assert.equal((await fs.readFile(path.join(dir, 'installs.txt'), 'utf8')).replaceAll('\r\n', '\n'), 'installed\n');
    await fs.writeFile(path.join(dir, 'app.py'), 'raise ModuleNotFoundError("No module named \'missing_project_file\'")');
    await fs.mkdir(path.join(dir, 'missing_project_file'));
    assert.notEqual(run().status, 0);
    assert.equal((await fs.readFile(path.join(dir, 'installs.txt'), 'utf8')).replaceAll('\r\n', '\n'), 'installed\n');
    await fs.writeFile(path.join(dir, 'app.py'), 'raise ModuleNotFoundError("No module named \'orbit_other_dependency\'")');
    assert.notEqual(run({ ORBIT_AUTO_DEPENDENCIES: '0' }).status, 0);
    assert.equal((await fs.readFile(path.join(dir, 'installs.txt'), 'utf8')).replaceAll('\r\n', '\n'), 'installed\n');
    await fs.writeFile(path.join(dir, 'pip.py'), 'from pathlib import Path\nPath("installs.txt").open("a").write("retried\\n")');
    assert.notEqual(run().status, 0);
    assert.equal((await fs.readFile(path.join(dir, 'installs.txt'), 'utf8')).replaceAll('\r\n', '\n'), 'installed\nretried\n');
  });
});
