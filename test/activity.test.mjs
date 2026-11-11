import test from 'node:test';
import assert from 'node:assert/strict';
import {promises as fs} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createApp} from '../server.mjs';
import {migrateActivities,updateActivity,progressFromOutput} from '../lib/activity.mjs';

test('one project keeps its activity identity through download, preparation, failure and retry',()=>{
  const state={projects:[],events:[]}; const project={id:'project',name:'Demo'};
  const first=updateActivity(state,project,{status:'cloning',label:'Baixando',percent:25},{reset:true});
  const id=first.id;
  updateActivity(state,project,{status:'installing',label:'Instalando',percent:null},{reset:true});
  updateActivity(state,project,{status:'error',label:'Falhou',percent:null});
  assert.equal(state.events.length,1); assert.equal(state.events[0].id,id); assert.equal(state.events[0].percent,null);
  updateActivity(state,project,{status:'running',label:'Em execução',percent:100},{reset:true});
  assert.equal(state.events.length,1); assert.equal(state.events[0].id,id); assert.equal(state.events[0].percent,100);
});
test('old events collapse by project and preserve unrelated activity',()=>{
  const state={projects:[{id:'a',name:'Demo',status:'ready'}],events:[
    {id:'last',message:'Demo: tarefa concluída.'},{id:'first',message:'Demo: download iniciado.'},{id:'other',message:'Outra atividade.'}
  ]};
  migrateActivities(state); migrateActivities(state);
  assert.equal(state.events.length,2); assert.equal(state.events[0].id,'last');
  assert.equal(state.events[0].projectId,'a'); assert.equal(state.events[0].percent,100);
});
test('progress reads real Git phases, Docker bytes and build stages without estimating an overall percentage',()=>{
  assert.deepEqual(progressFromOutput('Receiving objects:  67% (67/100)\r'),{label:'Recebendo objetos',percent:67});
  assert.deepEqual(progressFromOutput('Resolving deltas:  12% (3/25)'),{label:'Resolvendo arquivos',percent:12});
  assert.equal(progressFromOutput('aabbccddeeff: Downloading [==>] 2.5MB/10MB').percent,25);
  assert.equal(progressFromOutput('aabbccddeeff: Extracting [==>] 1MiB/2MiB').percent,50);
  assert.deepEqual(progressFromOutput('#8 [builder 3/7] RUN npm ci'),{label:'Compilando imagem · etapa 3 de 7',percent:null});
  assert.equal(progressFromOutput('Application log line'),null);
});
test('real process output split across chunks updates its existing activity before completion',async()=>{
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'orbit-progress-'));
  const directory=path.join(root,'projects','fixture'); await fs.mkdir(directory,{recursive:true});
  await fs.writeFile(path.join(directory,'progress.mjs'),"process.stderr.write('Receiving obj');setTimeout(()=>process.stderr.write('ects: 42% (42/100)\\r'),80);setTimeout(()=>process.exit(0),1500);");
  const project={id:'fixture',name:'Demo',fullName:'local/demo',status:'ready',mode:'native',trusted:true,install:'node progress.mjs'};
  await fs.writeFile(path.join(root,'state.json'),JSON.stringify({projects:[project],events:[]}));
  const app=await createApp({dataDirectory:root,port:0,allowNative:true});
  try{
    const response=await fetch(app.url+'/api/projects/fixture/install',{method:'POST',headers:{'Content-Type':'application/json','X-Orbit-Token':app.token},body:'{}'});
    assert.equal(response.status,202); const id=app.state.events[0].id;
    const deadline=Date.now()+5000;
    while(app.state.events[0].percent!==42 && Date.now()<deadline)await new Promise(resolve=>setTimeout(resolve,20));
    assert.equal(app.state.events[0].percent,42); assert.equal(app.state.events[0].label,'Recebendo objetos'); assert.equal(app.state.events[0].id,id);
    while(app.jobs.size && Date.now()<deadline)await new Promise(resolve=>setTimeout(resolve,20));
    assert.equal(app.state.events.length,1); assert.equal(app.state.events[0].id,id); assert.equal(app.state.events[0].percent,100);
    assert.equal(app.state.events[0].label,'Instalação concluída');
  } finally {await app.close();await fs.rm(root,{recursive:true,force:true});}
});

test('canceling dependency preparation releases the project and preserves the files', async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(),'orbit-cancel-'));
  const directory = path.join(root,'projects','fixture');
  await fs.mkdir(directory,{recursive:true});
  const file = path.join(directory,'prepare.mjs');
  await fs.writeFile(file,"console.log('fixture started');setInterval(() => {},1000);");
  const project = {id:'fixture',name:'Demo',fullName:'local/demo',status:'ready',mode:'native',trusted:true,install:'node prepare.mjs'};
  await fs.writeFile(path.join(root,'state.json'),JSON.stringify({projects:[project],events:[]}));
  const app = await createApp({dataDirectory:root,port:0,allowNative:true,backgroundReleaseChecks:false});
  t.after(async () => {
    await app.close();
    await fs.rm(root,{recursive:true,force:true});
  });
  const request = (action, method = 'POST') => fetch(app.url + '/api/projects/fixture/' + action,{
    method,
    headers:{'Content-Type':'application/json','X-Orbit-Token':app.token},
    ...(method === 'POST' ? {body:'{}'} : {})
  });
  assert.equal((await request('install')).status,202);
  const deadline = Date.now() + 5000;
  let started = false;
  while (!started && Date.now() < deadline) {
    const {entries} = await (await request('logs','GET')).json();
    started = entries.some(entry => entry.text.includes('fixture started'));
    if (!started) await new Promise(resolve => setTimeout(resolve,20));
  }
  assert.equal(started,true);
  const stopped = await request('stop');
  assert.equal(stopped.status,200);
  assert.equal((await stopped.json()).status,'interrupted');
  assert.equal(app.jobs.size,0);
  assert.equal(app.state.events[0].label,'Instalação cancelada');
  assert.ok(await fs.stat(file));
  assert.equal((await request('install')).status,202);
  assert.equal((await request('stop')).status,200);
});
