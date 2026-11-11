import test from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { classifyProject } from '../lib/classify.mjs';
import { dockerPlan, containerArguments, listeningPorts, nodeMajor, explicitPort } from '../lib/docker-project.mjs';
import { explainFailure, lastMeaningfulLine } from '../lib/diagnose.mjs';

async function fixture(files, run) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'orbit-kind-'));
  try {
    for (const [name, content] of Object.entries(files)) { await fs.mkdir(path.dirname(path.join(dir, name)), { recursive: true }); await fs.writeFile(path.join(dir, name), typeof content === 'string' ? content : JSON.stringify(content)); }
    await run(dir);
  } finally { await fs.rm(dir, { recursive: true, force: true }); }
}
const project = { id: 'p', fullName: 'local/p', network: true };

test('projects that are not web apps are recognized before Docker starts', async () => {
  await fixture({ 'package.json': { name: 'rea-agents', scripts: { start: 'node scripts/rea.mjs mcp' } }, 'server.json': { $schema: 'https://static.modelcontextprotocol.io/schemas/2025-12-11/server.schema.json' } }, async dir => {
    assert.equal((await classifyProject(dir)).kind, 'mcp');
    await assert.rejects(dockerPlan(dir, project), /servidor MCP|agente de IA/);
  });
  await fixture({ 'package.json': { name: 'tool', bin: { tool: 'cli.js' }, dependencies: { commander: '1' } }, 'cli.js': '' }, async dir => assert.equal((await classifyProject(dir)).kind, 'cli'));
  await fixture({ 'package.json': { name: 'lib', main: 'index.js' }, 'index.js': '' }, async dir => assert.equal((await classifyProject(dir)).kind, 'library'));
  await fixture({ 'Makefile': 'all:\n\tcc main.c', 'main.c': 'int main(){}', 'README.md': '# Game' }, async dir => assert.equal((await classifyProject(dir)).kind, 'native'));
  await fixture({ 'package.json': { name: 'overdrive', scripts: { dev: 'cd ps5 && CC=clang python3 tools/cli.py preview' } } }, async dir => assert.equal((await classifyProject(dir)).kind, 'native'));
  await fixture({ 'package.json': { name: 'desk', scripts: { start: 'electron .' }, devDependencies: { electron: '30' } } }, async dir => assert.equal((await classifyProject(dir)).kind, 'native'));
  await fixture({ 'README.md': '# TV', 'launcher/settings.gradle': "include ':app'", 'launcher/app/build.gradle': "plugins { id 'com.android.application' }", 'tools/requirements.txt': 'requests' }, async dir => assert.equal((await classifyProject(dir)).kind, 'android'));
  await fixture({ 'main.py': 'import pygame\npygame.init()', 'requirements.txt': 'pygame' }, async dir => assert.equal((await classifyProject(dir)).kind, 'native'));
  await fixture({ 'server.py': 'from mcp.server.fastmcp import FastMCP', 'requirements.txt': 'mcp' }, async dir => assert.equal((await classifyProject(dir)).kind, 'mcp'));
});

test('apps in subfolders (monorepos) run from the right folder', async () => {
  await fixture({ 'README.md': '# Mono', 'docs/index.md': '# docs', 'frontend/package.json': { scripts: { dev: 'vite' }, devDependencies: { vite: '6' } }, 'server/requirements.txt': 'requests' }, async dir => {
    const info = await classifyProject(dir);
    assert.deepEqual([info.kind, info.appDir], ['web', 'frontend']);
    const plan = await dockerPlan(dir, project);
    assert.match(plan.dockerfile, /WORKDIR \/workspace\/frontend/);
    assert.match(plan.dockerfile, /--host 0\.0\.0\.0 --port 5173/);
  });
});

test('Node plans pick dev servers, add the build step only when needed and tolerate install conflicts', async () => {
  await fixture({ 'package.json': { packageManager: 'pnpm@9.1.0', scripts: { dev: 'vite --port 5188' }, devDependencies: { vite: '6' } }, 'pnpm-lock.yaml': '' }, async dir => {
    const plan = await dockerPlan(dir, project);
    assert.equal(plan.port, 5188);
    assert.match(plan.dockerfile, /npm install -g pnpm@9/);
    assert.match(plan.dockerfile, /pnpm run dev --host 0\.0\.0\.0"/, 'pnpm recebe os argumentos sem "--"');
  });
  await fixture({ 'package.json': { scripts: { build: 'next build', start: 'next start' }, dependencies: { next: '15', react: '19' } }, 'package-lock.json': '{}' }, async dir => {
    const plan = await dockerPlan(dir, project);
    assert.match(plan.dockerfile, /RUN npm run build/);
    assert.match(plan.dockerfile, /npm ci --no-audit --no-fund \|\| npm install --no-audit --no-fund \|\| npm install --no-audit --no-fund --legacy-peer-deps/);
    assert.match(plan.dockerfile, /npm run start -- --hostname 0\.0\.0\.0 --port 3000/);
  });
  await fixture({ 'package.json': { scripts: { dev: 'concurrently "vite" "node api.js"' }, devDependencies: { vite: '6', concurrently: '9' } } }, async dir => {
    const plan = await dockerPlan(dir, project);
    assert.match(plan.dockerfile, /CMD \["sh","-lc","npm run dev"\]/, 'scripts compostos não recebem flags extras');
    assert.match(plan.dockerfile, /ENV HOST="0\.0\.0\.0"/);
  });
  await fixture({ 'package.json': { engines: { node: '>=24' }, scripts: { start: 'node server.js' } } }, async dir => {
    const plan = await dockerPlan(dir, project);
    assert.match(plan.dockerfile, /^FROM node:24-bookworm/);
    assert.doesNotMatch(plan.dockerfile, /npm run build/);
  });
  assert.equal(nodeMajor('^22.23.4 || ^24.22.1 || >=26.12.1'), 22);
  assert.equal(nodeMajor('>=24'), 24);
  assert.equal(nodeMajor('^20'), 20);
  assert.equal(explicitPort('vite --port 5188'), 5188);
});

test('commands suggested by the old detection never replace the automatic plan', async () => {
  await fixture({ 'package.json': { scripts: { dev: 'vite' }, devDependencies: { vite: '6' } } }, async dir => {
    const plan = await dockerPlan(dir, { ...project, install: 'npm ci', command: 'npm run dev', containerPort: 63325 });
    assert.match(plan.dockerfile, /npm run dev -- --host 0\.0\.0\.0 --port 63325/);
    const custom = await dockerPlan(dir, { ...project, command: 'npm run dev -- --host 0.0.0.0 --port 4000', containerPort: 4000, userConfigured: true });
    assert.match(custom.dockerfile, /CMD \["sh","-lc","npm run dev -- --host 0\.0\.0\.0 --port 4000"\]/);
  });
});

test('Python plans start the right framework on 0.0.0.0', async () => {
  await fixture({ 'requirements.txt': 'streamlit', 'app.py': 'import streamlit as st\nst.write(1)' }, async dir => {
    const plan = await dockerPlan(dir, project);
    assert.equal(plan.port, 8501);
    assert.match(plan.dockerfile, /streamlit run app\.py --server\.address 0\.0\.0\.0 --server\.port 8501/);
  });
  await fixture({ 'requirements.txt': 'fastapi', 'main.py': 'from fastapi import FastAPI\napi = FastAPI()' }, async dir => {
    assert.match((await dockerPlan(dir, project)).dockerfile, /uvicorn main:api --host 0\.0\.0\.0 --port 8000/);
  });
  await fixture({ 'requirements.txt': 'flask', 'server.py': 'from flask import Flask\napp = Flask(__name__)' }, async dir => {
    assert.match((await dockerPlan(dir, project)).dockerfile, /flask --app server:app run --host 0\.0\.0\.0 --port 5000/);
  });
  await fixture({ 'requirements.txt': 'gradio', 'app.py': 'import gradio as gr\ngr.Interface(fn=print,inputs="text",outputs="text").launch()' }, async dir => {
    const plan = await dockerPlan(dir, project);
    assert.equal(plan.port, 7860);
    assert.match(plan.dockerfile, /GRADIO_SERVER_NAME="0\.0\.0\.0"/);
  });
  await fixture({ 'pyproject.toml': '[project]\nname="x"\nrequires-python=">=3.13"\ndependencies=["django"]', 'manage.py': '' }, async dir => {
    const plan = await dockerPlan(dir, project);
    assert.match(plan.dockerfile, /^FROM python:3\.13-bookworm/);
    assert.match(plan.dockerfile, /runserver 0\.0\.0\.0:8000/);
  });
});

test('static sites are served without extra tooling', async () => {
  await fixture({ 'index.html': '<h1>Oi</h1>', 'style.css': 'h1{}' }, async dir => {
    const plan = await dockerPlan(dir, project);
    assert.match(plan.dockerfile, /http\.server 8000 --bind 0\.0\.0\.0/);
  });
});

test('container arguments keep generated images unprivileged and pass the real port', () => {
  const generated = containerArguments(project, { port: 5173, generated: true, runtime: 'node', image: 'img' }, { name: 'orbit-p' });
  assert.ok(generated.includes('--cap-drop=ALL'));
  assert.ok(generated.includes('PORT=5173'));
  assert.ok(generated.includes('HOSTNAME=0.0.0.0'));
  assert.ok(!generated.includes('--rm'), 'o container fica até o Orbit ler o motivo da saída');
  const thirdParty = containerArguments(project, { port: 80, image: 'nginx' }, { name: 'orbit-p' });
  assert.ok(!thirdParty.includes('--cap-drop=ALL'));
  assert.ok(thirdParty.includes('127.0.0.1::80'));
});

test('listening ports distinguish apps reachable from outside and localhost-only', () => {
  const sample = [
    '  sl  local_address rem_address   st tx_queue rx_queue tr tm->when retrnsmt   uid  timeout inode',
    '   0: 0100007F:1435 00000000:0000 0A 00000000:00000000 00:00000000 00000000     0        0 1 1',
    '   1: 00000000:1F90 00000000:0000 0A 00000000:00000000 00:00000000 00000000     0        0 2 1',
    '   2: 0100007F:1F91 0100007F:9C40 01 00000000:00000000 00:00000000 00000000     0        0 3 1',
    '   0: 00000000000000000000000001000000:0BB8 00000000000000000000000000000000:0000 0A 00000000:00000000 00:00000000 00000000 0 0 4 1'
  ].join('\n');
  const ports = listeningPorts(sample);
  assert.deepEqual([...ports.keys()].sort(), [3000, 5173, 8080]);
  assert.equal(ports.get(5173).wildcard, false);
  assert.equal(ports.get(8080).wildcard, true);
  assert.equal(ports.get(3000).loopback, true);
  assert.equal(ports.has(8081), false, 'conexões estabelecidas não contam');
});

test('failures are explained by their real cause', () => {
  assert.match(explainFailure("REA's compiled runtime is missing. Run `npm ci && npm run build:cached`"), /compilado/);
  assert.match(explainFailure("Traceback\nModuleNotFoundError: No module named 'cv2'"), /opencv-python-headless/);
  assert.match(explainFailure('warning: CUDA not available\nnpm error code ERESOLVE'), /conflito/);
  assert.match(explainFailure('FATAL ERROR: Reached heap limit Allocation failed - JavaScript heap out of memory'), /memória/);
  assert.match(explainFailure('Error: listen EADDRINUSE: address already in use :::3000'), /porta/);
  assert.equal(explainFailure('tudo certo'), '');
  assert.equal(lastMeaningfulLine('#9 DONE 0.2s\nView build details: docker-desktop://x\nErro real aqui\n'), 'Erro real aqui');
});
