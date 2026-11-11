import test from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { dependencyPlan, prepareProject, projectEnvironment } from '../lib/prepare.mjs';

test('dependency planner respects Node package managers and declared versions', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'orbit-plan-'));
  try {
    await fs.writeFile(path.join(dir, 'package.json'), JSON.stringify({ packageManager: 'pnpm@10.5.2', engines: { node: '>=22' } }));
    const plan = await dependencyPlan(dir);
    assert.equal(plan.kind, 'node');
    assert.equal(plan.tools[0].version, '22');
    assert.equal(plan.tools[1].id, 'pnpm');
    assert.equal(plan.tools[1].version, '10.5.2');
    assert.deepEqual(plan.steps, ['pnpm install']);
    await fs.writeFile(path.join(dir, '.nvmrc'), '24.1.0');
    assert.equal((await dependencyPlan(dir)).tools[0].minimum, false);
  } finally { await fs.rm(dir, { recursive: true, force: true }); }
});

test('Python, CMake and Java dependency plans include needed tools', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'orbit-plans-'));
  try {
    await fs.writeFile(path.join(dir, 'requirements.txt'), 'colorama');
    await fs.writeFile(path.join(dir, '.python-version'), '3.12');
    let plan = await dependencyPlan(dir);
    assert.equal(plan.tools[0].version, '3.12');
    assert.deepEqual(plan.steps, ['python -m pip install -r requirements.txt']);
    await fs.unlink(path.join(dir, 'requirements.txt'));
    await fs.writeFile(path.join(dir, 'CMakeLists.txt'), 'cmake_minimum_required(VERSION 3.20)\nproject(demo CXX)');
    plan = await dependencyPlan(dir);
    assert.ok(plan.cxx);
    assert.deepEqual(plan.tools.map(tool => tool.id), ['cmake', 'ninja']);
    await fs.unlink(path.join(dir, 'CMakeLists.txt'));
    await fs.writeFile(path.join(dir, 'pom.xml'), '<project/>');
    assert.deepEqual((await dependencyPlan(dir)).tools.map(tool => tool.id), ['java', 'maven']);
  } finally { await fs.rm(dir, { recursive: true, force: true }); }
});

test('preparation records the failed stage instead of claiming readiness', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'orbit-fail-'));
  try {
    await assert.rejects(prepareProject(dir), /Preparação interrompida na etapa packages/);
    const report = JSON.parse(await fs.readFile(path.join(dir, '.orbit-environment.json'), 'utf8'));
    assert.equal(report.status, 'error');
    assert.equal(report.stage, 'packages');
  } finally { await fs.rm(dir, { recursive: true, force: true }); }
});

test('custom install commands run with logs and persist reusable environment', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'orbit-install-'));
  try {
    await fs.writeFile(path.join(dir, 'install.mjs'), "import fs from 'node:fs'; fs.writeFileSync('prepared.txt','ok');");
    const report = await prepareProject(dir, 'node install.mjs');
    assert.equal(report.status, 'ready');
    assert.equal(await fs.readFile(path.join(dir, 'prepared.txt'), 'utf8'), 'ok');
    const env = await projectEnvironment(dir, { PATH: 'fallback', ORBIT_TEST: 'preserved' });
    assert.equal(env.ORBIT_TEST, 'preserved');
    assert.ok(env.PATH.includes('node') || env.PATH.length > 20);
  } finally { await fs.rm(dir, { recursive: true, force: true }); }
});

test('environment warnings name missing keys without fabricating values', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'orbit-env-'));
  try {
    await fs.writeFile(path.join(dir, '.env.example'), 'API_KEY=\nOTHER=changeme\nPUBLIC_VALUE=real-value\n');
    const plan = await dependencyPlan(dir);
    assert.match(plan.warnings[0], /API_KEY/);
    assert.match(plan.warnings[0], /OTHER/);
    assert.doesNotMatch(plan.warnings[0], /real-value/);
  } finally { await fs.rm(dir, { recursive: true, force: true }); }
});
