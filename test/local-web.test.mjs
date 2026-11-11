import test from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { createApp } from '../server.mjs';
import { dockerPlan } from '../lib/docker-project.mjs';

const record = (id, options = {}) => ({
  id, name:id, fullName:'qa/'+id, status:'ready', language:'JavaScript', mode:'docker', ...options
});
async function fixture(t, project, files) {
  const dataDirectory = await fs.mkdtemp(path.join(os.tmpdir(),'orbit-local-web-'));
  const directory = path.join(dataDirectory,'projects',project.id);
  await fs.mkdir(directory,{recursive:true});
  for (const [name,value] of Object.entries(files)) await fs.writeFile(path.join(directory,name),value);
  await fs.writeFile(path.join(dataDirectory,'state.json'),JSON.stringify({projects:[project],events:[]}));
  const app = await createApp({dataDirectory,port:0,backgroundReleaseChecks:false});
  t.after(async () => {
    await app.close();
    await fs.rm(dataDirectory,{recursive:true,force:true});
  });
  const post = (action,body={}) => fetch(app.url+'/api/projects/'+project.id+'/'+action,{
    method:'POST',headers:{'X-Orbit-Token':app.token,'Content-Type':'application/json'},body:JSON.stringify(body)
  });
  return {app,directory,post,project:app.state.projects[0]};
}
async function waitFor(check) {
  const deadline = Date.now()+15000;
  while (!check() && Date.now()<deadline) await delay(40);
  assert.ok(check(),'O estado esperado não foi alcançado.');
}

test('a static site starts locally, even with an optional Dockerfile',async t => {
  const f = await fixture(t,record('static'),{
    'index.html':'<h1>Orbit local</h1>',
    '.env':'PRIVATE=value',
    'Dockerfile':'FROM nginx:alpine\nCOPY . /usr/share/nginx/html\n'
  });
  assert.equal((await f.post('start')).status,202);
  await waitFor(() => f.project.status==='running');
  assert.equal(f.project.executionEnvironment,'local');
  assert.equal(f.app.jobs.get('static').containerName,undefined);
  const url = 'http://127.0.0.1:'+f.project.port;
  assert.equal(await (await fetch(url)).text(),'<h1>Orbit local</h1>');
  assert.equal((await fetch(url+'/.env')).status,404);
  assert.equal((await f.post('stop')).status,200);
  assert.equal(f.project.status,'stopped');
});

test('a Node app asks once for local execution and waits for its HTTP server',async t => {
  const probe = net.createServer();
  await new Promise(resolve => probe.listen(0,'127.0.0.1',resolve));
  const containerPort = probe.address().port;
  await new Promise(resolve => probe.close(resolve));
  const f = await fixture(t,record('node',{containerPort}),{
    'package.json':JSON.stringify({name:'orbit-fixture',scripts:{start:'node server.cjs'}}),
    'server.cjs':"const http=require('node:http'); setTimeout(()=>http.createServer((req,res)=>res.end('Local')).listen(Number(process.env.PORT),process.env.HOST),250);"
  });
  const denied = await f.post('start');
  assert.equal(denied.status,409);
  assert.equal((await denied.json()).error,'confirm-native');
  assert.equal(f.app.jobs.size,0);
  assert.equal((await f.post('install',{confirmNative:true})).status,202);
  await waitFor(() => !f.app.jobs.size);
  assert.equal(f.project.status,'ready');
  assert.equal(f.project.nativeConsent,true);
  assert.equal((await f.post('start')).status,202);
  assert.equal(f.project.status,'installing');
  await waitFor(() => f.project.status==='running' || f.project.status==='error');
  assert.equal(f.project.status,'running',f.project.lastError);
  assert.equal(await (await fetch('http://127.0.0.1:'+containerPort)).text(),'Local');
  assert.equal(f.app.jobs.get('node').containerName,undefined);
  assert.equal((await f.post('stop')).status,200);
});

test('a container-only manifest has no local plan and keeps its Dockerfile',async t => {
  const f = await fixture(t,record('container'),{
    'Dockerfile':'FROM nginx:alpine\nEXPOSE 8080\n'
  });
  assert.equal(await dockerPlan(f.directory,f.project,{local:true}),null);
  assert.equal((await dockerPlan(f.directory,f.project)).existing,'Dockerfile');
});

test('a webpack build-dev script runs locally before the generated site exists',async t => {
  const f = await fixture(t,record('webpack'),{
    'package.json':JSON.stringify({name:'webpack-fixture',scripts:{'build-dev':'npm run build && webpack serve','build':'webpack'}}),
    'index.html':'<script src="/dist.js"></script>'
  });
  const plan = await dockerPlan(f.directory,f.project,{local:true});
  assert.equal(plan.runtime,'node');
  assert.equal(plan.port,8080);
  assert.equal(plan.command,'npm run build-dev -- --host 127.0.0.1 --port 8080');
});
