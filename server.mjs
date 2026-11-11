import http from 'node:http';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes, randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import packageInfo from './package.json' with { type: 'json' };
import { parseRepository, safePath, detectProject, dockerArguments, capture, isDocumentationOnly, DOCUMENTATION_NOTE, frameVerdict } from './lib/runner.mjs';

import { projectEnvironment, normalizedEnv } from './lib/prepare.mjs';
import { automaticProfile, dockerPlan } from './lib/docker-project.mjs';
import { classifyProject, KIND_INFO, RUNNABLE } from './lib/classify.mjs';
import { explainFailure, lastMeaningfulLine } from './lib/diagnose.mjs';
import { dockerCommand } from './lib/docker-engine.mjs';
import { mcpLaunch, hasTool, installedWindowsExecutable, pickReleaseAsset, scoreWindowsInstaller, scorePortableWindowsAsset, scoreAndroidAsset } from './lib/native-project.mjs';
import { createRanking } from './lib/ranking.mjs';
import { createRecommendations } from './lib/explore-recommendations.mjs';
import {projectLocations,allocateProjectStorage,verifyProjectStorage,deleteProjectFiles,moveProjectFiles} from './lib/project-storage.mjs';
import {chooseInstallationFolder,createDesktopShortcut,removeDesktopShortcut,cleanupProjectDocker,openWindowsFolder,windowsScript,windowsInstallations,findWindowsInstallation} from './lib/desktop-integration.mjs';
import { projectImage, imageFromBytes } from './lib/project-image.mjs';
import { migrateActivities, updateActivity, progressFromOutput } from './lib/activity.mjs';
import { availableProjectRelease, createReleaseUpdates, recoverInstalledRelease, releaseReference } from './lib/release-updates.mjs';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const MIMES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml' };
const clean = data => String(data).replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, '').replace(/\0/g, '');
const httpError = (status, message) => Object.assign(new Error(message), { status });
const missingSource = () => httpError(404, 'A pasta do código local não foi encontrada.');

export async function createApp({ dataDirectory = process.env.ORBIT_DATA || path.join(ROOT, '.orbit'), port = Number(process.env.PORT || 4310), allowNative = false, cleanupContainers = false, backgroundReleaseChecks = true, managementServices = {}, recommendationGithub, releaseGithub, desktop = false } = {}) {
  const configuredSupport = process.env.ORBIT_SUPPORT_URL || packageInfo.orbitSupportUrl;
  const supportPage = URL.parse(configuredSupport || '');
  const supportUrl = configuredSupport === '/apoio' ? '/apoio' :
    supportPage?.protocol === 'https:' && !supportPage.username && !supportPage.password ? supportPage.href : null;
  await fs.mkdir(path.join(dataDirectory, 'projects'), { recursive: true });
  dataDirectory = await fs.realpath(dataDirectory);
  const stateFile = path.join(dataDirectory, 'state.json');
  let state = { projects: [], events: [] };
  try { state = JSON.parse(await fs.readFile(stateFile, 'utf8')); } catch (error) { if (error.code !== 'ENOENT') throw new Error(`Não foi possível ler ${stateFile}: ${error.message}`); }
  state.explorePins = Array.isArray(state.explorePins) ? state.explorePins : [];
  state.externalCleanup = Array.isArray(state.externalCleanup) ? state.externalCleanup : [];
  state.explorePreferences = {intent: '', lastSearch: '', ...state.explorePreferences};
  state.projects.forEach(project => { project.status = ['running', 'installing', 'cloning', 'stopping'].includes(project.status) ? 'interrupted' : project.status; });
  if (!allowNative) for (const project of state.projects) Object.assign(project, automaticProfile(project));
  migrateActivities(state);
  // A porta do app dentro do container (containerPort) fica separada da porta aberta no navegador (port), que muda a cada execução.
  for (const project of state.projects) {
    if (project.containerPort === undefined) project.containerPort = project.mode === 'native' ? Number(project.port) || 0 : 0;
    if (project.mode !== 'native') project.port = 0;
  }
  const token = randomBytes(32).toString('hex');
  const jobs = new Map();
  const maintenance = new Set(), pendingImports = new Set();
  let folderSelection;
  const logs = new Map();
  let writeQueue = Promise.resolve();
  let closing = false;
  let activeMutations = 0;
  const isBusy = () => Boolean(jobs.size || maintenance.size || pendingImports.size || activeMutations);
  const save = () => {
    const serialized = JSON.stringify(state, null, 2);
    writeQueue = writeQueue.catch(() => {}).then(async () => { await fs.writeFile(stateFile + '.tmp', serialized); await fs.rename(stateFile + '.tmp', stateFile); });
    return writeQueue;
  };
  const releaseUpdates = createReleaseUpdates({ state, github: releaseGithub || github, save, nativeDirectory: path.join(dataDirectory, 'native') });
  let activitySave;
  const activity = (project,patch,options) => {
    updateActivity(state,project,patch,options);
    if (!activitySave) { activitySave = setTimeout(() => { activitySave = null; save().catch(error => console.error(error.message)); },400); activitySave.unref(); }
  };
  const logWrites = new Map();
  const log = (id, message, stream = 'info') => {
    const entry = { at: new Date().toISOString(), stream, text: clean(message).slice(-32000) };
    const list = logs.get(id) || []; list.push(entry); logs.set(id, list.slice(-500));
    // O terminal também vai para o disco, para o diagnóstico sobreviver a um reinício do Orbit.
    const previous = logWrites.get(id) || Promise.resolve();
    logWrites.set(id, previous.then(() => fs.appendFile(logFile(id), JSON.stringify(entry) + '\n')).catch(() => {}));
  };
  const loadLogs = async id => {
    if (logs.has(id)) return logs.get(id);
    try {
      const lines = (await fs.readFile(logFile(id), 'utf8')).trim().split('\n').slice(-500);
      const list = lines.map(line => { try { return JSON.parse(line); } catch { return null; } }).filter(Boolean);
      logs.set(id, list); return list;
    } catch { return []; }
  };
  const trimLogs = async id => { try { const stat = await fs.stat(logFile(id)); if (stat.size > 3e6) { const lines = (await fs.readFile(logFile(id), 'utf8')).trim().split('\n').slice(-2000); await fs.writeFile(logFile(id), lines.join('\n') + '\n'); } } catch {} };
  const defaultProjectParent = async () => {
    const parent = path.join(dataDirectory,'projects');
    const resolved = await fs.realpath(parent);
    if (path.relative(parent,resolved)) throw httpError(409,'A pasta de projetos do Orbit foi redirecionada.');
    return resolved;
  };
  const directory = project => projectLocations(project,dataDirectory).source;
  const reservedProjectFolders = project => state.projects.filter(item => item.id !== project.id).map(item => item.storage?.root || directory(item));
  const sourceDirectory = project => safePath(directory(project)).catch(error => {
    if (['ENOENT', 'ENOTDIR'].includes(error.code)) throw missingSource();
    throw error;
  });
  const integration = {chooseFolder:chooseInstallationFolder,createShortcut:(project,url)=>createDesktopShortcut(project,url,{dataDirectory}),removeShortcut:project=>removeDesktopShortcut(project,{dataDirectory}),cleanupDocker:project=>cleanupProjectDocker(project,{startEngine:false}),openInstallationFolder:openWindowsFolder,openSystemUninstaller:()=>windowsScript("Start-Process 'ms-settings:appsfeatures'"),windowsInstallations,...managementServices};
  const validateParent = async parent => {
    if(typeof parent!=='string'||!path.isAbsolute(parent))throw httpError(400,'Escolha uma pasta absoluta existente.');
    const resolved=await fs.realpath(parent).catch(()=>{throw httpError(400,'A pasta escolhida não existe.');});
    const inside=(base,target)=>{const relative=path.relative(base,target);return !relative||(!relative.startsWith('..'+path.sep)&&relative!=='..'&&!path.isAbsolute(relative));};
    for(const item of state.projects){const locations=projectLocations(item,dataDirectory);if((locations.root?[locations.root]:[locations.source,locations.native,locations.docker]).some(base=>inside(base,resolved)))throw httpError(400,'Escolha uma pasta fora das instalações dos apps.');}
    return resolved;
  };
  const updateLocation = project => {project.installationPath=projectLocations(project,dataDirectory).root||directory(project);};
  state.projects.forEach(updateLocation);
  const requestShortcut = async project => {
    const url='http://127.0.0.1:'+server.address().port+'/#app/'+project.id;
    project.shortcut=await integration.createShortcut(project,url);project.shortcutRequested=true;project.shortcutError='';await save();return project.shortcut;
  };
  const forgetProject = project => {
    state.projects=state.projects.filter(item=>item.id!==project.id);
    state.releaseNotifications=state.releaseNotifications.filter(item=>item.projectId!==project.id);
    activity(project,{status:'removed',label:'Removido da biblioteca',percent:null});
  };
  const logFile = id => path.join(dataDirectory, 'logs', id + '.log');
  await fs.mkdir(path.join(dataDirectory, 'logs'), { recursive: true });
  // Identifica o tipo de cada projeto (app web, servidor MCP, programa nativo…) para orientar antes de executar.
  const classify = async project => {
    const locations = projectLocations(project,dataDirectory);
    if (await fs.stat(path.join(locations.source,'.git')).catch(() => null)) {
      const result = await capture('git',['describe','--tags','--long','--always','--abbrev=8','HEAD'],{cwd:locations.source,timeout:3000});
      if (result.ok && result.output) {
        const exact = result.output.match(/^(.+)-0-g[\da-f]+$/i);
        project.sourceTag = exact?.[1] || '';
        project.sourceVersion = (exact?.[1] || result.output).slice(0,180);
      }
    }
    const recovered = await recoverInstalledRelease(project,locations.native);
    if (recovered) project.installedRelease = recovered;
    if (automaticProfile(project).recipe) return Object.assign(project, { kind: 'web', appDir: '' });
    const info = await classifyProject(directory(project)).catch(() => null);
    if (!info) return project;
    if (process.platform === 'win32' && !['mcp', 'android'].includes(info.kind) && project.installedRelease &&
      project.executionPreference !== 'docker' && !(project.userConfigured && project.command)) {
      const storage = await verifyProjectStorage(project, dataDirectory).catch(() => null);
      if (storage && await installedWindowsExecutable(project, storage.native)) {
        Object.assign(project, { kind: 'native', appDir: info.appDir || '', note: KIND_INFO.native.text, executionEnvironment: 'local' });
        return project;
      }
    }
    Object.assign(project, { kind: info.kind, appDir: info.appDir || '' });
    if (!RUNNABLE.has(info.kind)) project.note = KIND_INFO[info.kind].text;
    return project;
  };
  for (const project of state.projects) if (!['cloning'].includes(project.status)) {
    await classify(project);
    // Erros antigos de projetos que nunca foram apps (MCP, nativos…) dão lugar à explicação do tipo.
    if (project.kind && !RUNNABLE.has(project.kind) && project.status === 'error' && !(project.userConfigured && project.command)) Object.assign(project, { status: 'ready', lastError: '' });
  }
  // Projetos já baixados que são só documentação passam a dizer isso, em vez de tentar o Docker.
  for (const project of state.projects) if (project.language === 'Personalizado' && await isDocumentationOnly(directory(project)).catch(() => false)) Object.assign(project, { language: 'Documentação', image: '', note: DOCUMENTATION_NOTE, lastError: /receita Docker/.test(project.lastError || '') ? DOCUMENTATION_NOTE : project.lastError });
  const find = id => { const project = state.projects.find(item => item.id === id); if (!project) throw httpError(404, 'Projeto não encontrado.'); return project; };
  const ensureIdle = project => { if (jobs.has(project.id) || maintenance.has(project.id)) throw httpError(409, 'Pare o app e aguarde a tarefa atual terminar antes de gerenciá-lo.'); };
  const available = project => { ensureIdle(project); if (jobs.size >= 4) throw httpError(409, 'Aguarde: quatro tarefas já estão em andamento.'); };

  function launch(project, executable, args, { status, cwd, containerName, shell = false, onSuccess, env: extraEnv = {}, ipc = false, operation = status === 'cloning' ? 'download' : status === 'installing' ? 'install' : 'run' } = {}) {
    available(project);
    project.status = status;
    project.lastError = '';
    activity(project,{operation,status,label:status === 'cloning' ? 'Baixando projeto' : status === 'running' ? 'Em execução' : operation === 'run' ? 'Preparando execução' : 'Preparando dependências',percent:status === 'running' ? 100 : null},{reset:true});
    if (desktop && executable === process.execPath && ipc) {
      args = [path.join(ROOT, 'desktop', 'worker.cjs'), ...args];
      extraEnv = {...extraEnv, ELECTRON_RUN_AS_NODE:'1'};
    }
    const child = spawn(executable, args, { cwd, shell, windowsHide: true, stdio: ipc ? ['ignore', 'pipe', 'pipe', 'ipc'] : ['ignore', 'pipe', 'pipe'], detached: process.platform !== 'win32', env: normalizedEnv({ ...process.env, ...extraEnv, ORBIT_NATIVE_DIRECTORY:projectLocations(project,dataDirectory).native, ORBIT_DOCKER_DIRECTORY:projectLocations(project,dataDirectory).docker, ORBIT_PROJECT_PORT: String(project.containerPort || project.port || 0), PYTHONUNBUFFERED: '1', GIT_TERMINAL_PROMPT: '0', PYTHONPATH: path.join(cwd || directory(project), '.orbit-packages') }) });
    const exited = new Promise(resolve => {
      child.once('exit', () => resolve(true));
      child.once('error', () => { if (!child.pid) resolve(true); });
    });
    const job = { child, containerName, exited, containerStarting:false, stopping:false, stopTask:null, done:null };
    jobs.set(project.id, job);
    child.on('message', message => {
      if (message?.type === 'orbit-container-starting') job.containerStarting = true;
      if (job.stopping) return;
      if (message?.type === 'orbit-startup-error') {
        job.startupError = clean(message.message || 'O app local não respondeu.').slice(0,600);
        log(project.id,job.startupError,'error');
        stop(project).catch(error => log(project.id,error.message,'error'));
        return;
      }
      if (message?.type === 'orbit-executable') {
        const executable=typeof message.path==='string'?path.resolve(message.path):'';
        if(executable&&!/[\r\n]/.test(executable)&&[directory(project),projectLocations(project,dataDirectory).native].some(base=>{const relative=path.relative(base,executable);return relative&&!relative.startsWith('..')&&!path.isAbsolute(relative);})){
          project.executable=executable;project.externalInstaller=Boolean(message.installer);
          if(project.shortcut)requestShortcut(project).catch(error=>{project.shortcutError=error.message;save().catch(()=>{});});
          else save().catch(()=>{});
        }
        return;
      }
      if (message?.type === 'orbit-release') {
        const release = releaseReference(message.release, project.fullName);
        if (release) job.release = release;
        return;
      }
      if (message?.type === 'orbit-release-cached') {
        const release = releaseReference(message.release, project.fullName);
        if (release) (project.releaseTracking ||= {}).cached = release;
        return;
      }
      if (message?.type === 'orbit-recovery' && !job.stopping) {
        project.status = 'installing';
        activity(project,{status:'installing',label:clean(message.label || 'Tentando corrigir a execução').slice(0,160),percent:null});
        save().catch(error => console.error(error.message));
        return;
      }
      if (message?.type === 'orbit-progress') {
        if (project.status === 'installing' && typeof message.label === 'string') activity(project,{status:'installing',label:clean(message.label).slice(0,160),percent:null});
        return;
      }
      if (message?.type === 'orbit-opened') {
        project.surface = String(message.surface || ''); project.surfaceDetail = String(message.detail || '').slice(0, 300);
        if(project.surface==='device')project.androidInstalled=true;
        if (project.surface === 'window' && !job.stopping) { project.status = 'running'; activity(project,{status:'running',label:'Aberto no Windows',percent:100}); }
        Promise.resolve(job.release ? recordInstalledRelease(project, job.release) : null).then(save).catch(error => console.error(error.message));
        return;
      }
      if (message?.type === 'orbit-port') {
        const detected = Number(message.port || 0);
        if (Number.isInteger(detected) && detected >= 1 && detected <= 65535) { project.containerPort = detected; log(project.id, 'Porta do app ajustada para ' + detected + ' nas próximas execuções.'); save().catch(error => console.error(error.message)); }
        return;
      }
      if (message?.type !== 'orbit-running' || job.stopping) return;
      const port = Number(message.port || 0);
      if (port && (!Number.isInteger(port) || port < 1024 || port > 65535)) return;
      project.port = port; project.status = 'running';
      activity(project,{status:'running',label:'Em execução',percent:100});
      if (typeof message.image === 'string') project.image = message.image;
      save().catch(error => console.error(error.message));
    });
    const buffers = {stdout:'',stderr:''};
    const output = (chunk,stream) => {
      log(project.id,chunk,stream);
      if (project.status === 'running' || job.stopping) return;
      const lines = (buffers[stream] + clean(chunk)).split(/[\r\n]+/); buffers[stream] = lines.pop().slice(-8000);
      for (const line of lines) { const progress = progressFromOutput(line); if (progress) activity(project,{...progress,status:project.status}); }
    };
    let stderrTail = '', outputTail = '';
    child.stdout?.on('data', chunk => { outputTail = (outputTail + clean(chunk)).slice(-20000); output(chunk,'stdout'); });
    child.stderr?.on('data', chunk => { stderrTail = (stderrTail + clean(chunk)).slice(-8000); outputTail = (outputTail + clean(chunk)).slice(-20000); output(chunk,'stderr'); });
    let spawnError;
    child.on('error', error => { spawnError = error.message; log(project.id, error.message, 'error'); });
    job.done = new Promise(resolve => child.on('close', async code => {
      if (job.stopTask) await job.stopTask.catch(() => {});
      try {
        if (code === 0 && !job.stopping && onSuccess) { activity(project,{label:'Identificando requisitos',percent:null}); await onSuccess(); }
        if (code === 0 && !job.stopping && job.release) await recordInstalledRelease(project, job.release);
        project.status = job.startupError ? 'error' : job.stopping ? (job.wasRunning ? 'stopped' : 'interrupted') : code === 0 ? 'ready' : 'error';
        if (job.stopping) project.lastError = job.stopWarning || '';
        if (project.status === 'error') project.lastError = job.startupError || spawnError || explainFailure(outputTail) || lastMeaningfulLine(stderrTail) || `O comando terminou com código ${code}. Consulte o terminal.`;
        if (project.mode !== 'native') project.port = 0;
      } catch (error) { project.status = 'error'; project.lastError = error.message; log(project.id, error.message, 'error'); }
      jobs.delete(project.id);
      trimLogs(project.id);
      log(project.id, job.stopping ? 'Tarefa interrompida.' : `Processo encerrado (código ${code ?? 'indisponível'}).`, code === 0 ? 'info' : 'error');
      activity(project,{status:project.status,percent:project.status === 'ready' ? 100 : null,label:project.status === 'error' ? 'Falha na tarefa · consulte o terminal' : job.stopping ? (job.wasRunning ? 'Execução parada' : operation === 'download' ? 'Download cancelado' : operation === 'install' ? 'Instalação cancelada' : 'Inicialização cancelada') : operation === 'download' ? 'Download concluído' : operation === 'install' ? 'Instalação concluída' : ({terminal:'Terminal aberto',process:'Execução concluída',folder:'Arquivo baixado e pasta aberta',device:'Instalado no aparelho',window:'Programa fechado'})[project.surface] || 'Execução encerrada'});
      await save().catch(error => console.error(error.message));
      resolve();
    }));

    save().catch(error => console.error(error.message));
  }

  async function stop(project) {
    const job = jobs.get(project.id);
    if (!job) throw httpError(409, 'O projeto não está em execução.');
    if (!job.stopTask) {
      const previousStatus = project.status;
      job.wasRunning = previousStatus === 'running';
      job.stopping = true;
      project.status = 'stopping';
      activity(project,{status:'stopping',label:job.wasRunning ? 'Parando execução' : 'Cancelando tarefa',percent:null});
      job.stopTask = (async () => {
        const { child } = job;
        const waitForExit = ms => Promise.race([job.exited, new Promise(resolve => setTimeout(resolve,ms,false).unref())]);
        const signalTree = signal => {
          if (process.platform !== 'win32') {
            try { process.kill(-child.pid, signal); return; } catch {}
          }
          child.kill(signal);
        };
        if (child.pid && child.exitCode === null && child.signalCode === null) {
          if (process.platform === 'win32') await capture('taskkill', ['/pid', String(child.pid), '/T', '/F'], {timeout:3000});
          else signalTree('SIGTERM');
          if (!await waitForExit(1000)) {
            signalTree('SIGKILL');
            if (!await waitForExit(2500)) throw httpError(503, 'O processo ainda está ativo. Tente parar novamente.');
          }
        }
        // A saída pode continuar aberta se um programa externo herdou os pipes.
        child.stdout?.destroy();
        child.stderr?.destroy();
        if (job.containerName && (job.containerStarting || job.wasRunning)) {
          const result = await dockerCommand(['rm', '-f', job.containerName], {timeout:5000});
          if (!result.ok && !/no such container/i.test(result.output)) {
            job.stopWarning = 'O processo foi encerrado, mas o Docker não confirmou o encerramento do container. ' + result.output;
            log(project.id, job.stopWarning, 'error');
          }
        }
      })().catch(error => {
        job.stopping = false;
        job.stopTask = null;
        project.status = previousStatus;
        activity(project,{status:previousStatus,label:'Não foi possível parar a tarefa. Tente novamente.',percent:null});
        throw error;
      });
    }
    await job.stopTask;
    await job.done;
  }

  async function github(endpoint) {
    const response = await fetch(`https://api.github.com/${endpoint}`, { headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'Orbit-Local', ...(process.env.GITHUB_TOKEN ? { Authorization: `Bearer ${process.env.GITHUB_TOKEN}` } : {}) }, signal: AbortSignal.timeout(15000) });
    if (!response.ok) throw Object.assign(httpError(response.status === 404 ? 404 : 502, response.status === 403 || response.status === 429 ? 'Limite do GitHub atingido. Aguarde alguns minutos ou configure GITHUB_TOKEN ao iniciar o app.' : `O GitHub respondeu ${response.status}. Confira o endereço e tente novamente.`), { upstreamStatus: response.status });
    return response.json();
  }
  async function githubSocial(endpoint, method = 'GET') {
    const credential = process.env.GITHUB_TOKEN?.trim();
    if (!credential) return null;
    const headers = { Accept: 'application/vnd.github+json', 'User-Agent': 'Orbit-Local', Authorization: 'Bearer ' + credential };
    if (method === 'PUT') headers['Content-Length'] = '0';
    const response = await fetch('https://api.github.com/' + endpoint, { method, headers, redirect: 'error', signal: AbortSignal.timeout(15000) });
    await response.body?.cancel();
    return response.status;
  }
  const repoView = item => ({ fullName: item.full_name, name: item.name, owner: item.owner.login, avatarUrl: item.owner.avatar_url, url: item.html_url, description: item.description, language: item.language, stars: item.stargazers_count, topics: item.topics || [], updatedAt: item.pushed_at, license: item.license?.spdx_id });

  const ranking = createRanking({ github, repoView });
  const recommendations = createRecommendations({ github: recommendationGithub || github, repoView });

  // README e imagens de projetos que ainda não foram baixados: lidos direto do GitHub, sem clonar nada.
  // O arquivo bruto (raw.githubusercontent.com) não gasta o limite da API; a API só entra quando o README não se chama README.md.
  const remoteReadmes = new Map(), remoteImages = new Map();
  function remembered(cache, max, key, load) {
    const hit = cache.get(key);
    if (hit && hit.expires > Date.now()) return hit.value;
    const value = load().catch(error => { cache.delete(key); throw error; });
    cache.set(key, { value, expires: Date.now() + 10 * 60000 });
    if (cache.size > max) cache.delete(cache.keys().next().value);
    return value;
  }
  const projectReleases = new Map();
  async function recordInstalledRelease(project, release) {
    if (project.installedRelease?.tag !== release.tag) {
      const native = projectLocations(project, dataDirectory).native;
      const previous = process.platform === 'win32' && project.installedRelease &&
        await installedWindowsExecutable(project, native);
      project.previousRelease = previous ? project.installedRelease : null;
      const executable = process.platform === 'win32' &&
        await installedWindowsExecutable({...project, installedRelease:release, externalInstaller:false}, native);
      if (executable && project.kind !== 'android') {
        project.kind = 'native';
        project.executable = executable;
        project.externalInstaller = false;
        project.note = KIND_INFO.native.text;
      }
    }
    project.installedRelease = release;
    for (const item of state.releaseNotifications) if (item.projectId === project.id && item.tag === release.tag && !item.readAt) item.readAt = new Date().toISOString();
  }
  const systemInstallation = async (project, refresh = false) => process.platform === 'win32' && project.url
    ? findWindowsInstallation(project,await integration.windowsInstallations(refresh)) : null;
  const preferredWindowsPackage = (project, system) => project.windowsPackage || (system ? 'installer' : 'portable');
  async function installationFolder(project) {
    const system = project.kind !== 'android' && project.executionPreference !== 'docker' && !(project.userConfigured && project.command)
      ? await systemInstallation(project) : null;
    if (system && preferredWindowsPackage(project,system) === 'installer') return path.dirname(system.executable);

    const storage = await verifyProjectStorage(project,dataDirectory);
    const portable = await installedWindowsExecutable(project,storage.native);
    if (portable) return path.dirname(portable);
    if (!project.externalInstaller && path.isAbsolute(project.executable || '')) {
      for (const base of [storage.native,storage.source]) {
        const relative = path.relative(base,project.executable);
        if (!relative || relative === '..' || relative.startsWith('..'+path.sep) || path.isAbsolute(relative)) continue;
        const executable = await safePath(base,relative).catch(() => null);
        if (executable && await fs.stat(executable).then(stat => stat.isFile(),() => false)) return path.dirname(executable);
      }
    }
    const local = storage.root || storage.source;
    if (await fs.stat(local).then(stat => stat.isDirectory(),error => {
      if (['ENOENT','ENOTDIR'].includes(error.code)) return false;
      throw error;
    })) return local;
    throw httpError(404,'A pasta de instalação deste app não foi encontrada.');
  }
  const versionKey = value => String(value).replace(/^v(?=\d)/i,'');
  function releaseForInstallation(project, system) {
    if (preferredWindowsPackage(project,system) !== 'installer' || !system) return availableProjectRelease(project);
    const tracking = project.releaseTracking;
    const releaseTracking = tracking && Object.hasOwn(tracking,'windowsInstaller') ? {...tracking,compatible:tracking.windowsInstaller} : tracking;
    return availableProjectRelease({...project,releaseTracking,installedRelease:releaseReference({tag:system.version},project.fullName)});
  }
  async function executionPlan(project, action, requestedTag, requestedPackage) {
    const storage = await verifyProjectStorage(project, dataDirectory);
    const source = await sourceDirectory(project).catch(error => {
      if (error.status === 404) return null;
      throw error;
    });
    const forced = project.executionPreference === 'docker';
    const custom = project.userConfigured && project.command;
    const android = project.kind === 'android';
    const windows = process.platform === 'win32';
    const update = action === 'update';
    const repair = action === 'repair';
    if (requestedPackage && !['installer','portable'].includes(requestedPackage)) throw httpError(400, 'Tipo de instalação inválido.');
    const system = windows && !android && !forced && !custom ? await systemInstallation(project) : null;
    const preference = requestedPackage || preferredWindowsPackage(project,system);
    let notes = '';
    if (repair && !source) return {method:'checkout',source,storage,tag:project.sourceTag || project.sourceVersion || project.installedRelease?.tag,
      details:'Restaura a pasta do código na versão registrada, mantendo a instalação e os dados do app.'};
    if (allowNative && project.mode === 'native' && !update && source) {
      return { method:'command', source, storage, details:'Usa os comandos definidos em Configuração.' };
    }
    if (!forced && !custom && windows && !android && action === 'start') {
      if (preference === 'installer' && system) {
        return {method:'release',source,storage,releasePlan:{systemExecutable:system.executable},tag:system.version,packageMode:'installer',
          details:'Abre a instalação do Windows.'};
      }
      if (preference === 'portable' && await installedWindowsExecutable(project, storage.native)) {
        return {method:'release',source,storage,releasePlan:{useInstalled:true},tag:project.installedRelease.tag,packageMode:'portable',
          details:'Abre a versão portátil gerenciada pelo Orbit.'};
      }
    }
    if (update && (!requestedTag || requestedTag !== releaseForInstallation(project,system)?.tag)) {
      throw httpError(409, 'A atualização disponível mudou. Verifique a versão no projeto.');
    }
    if (update || (!forced && !custom && (windows || android) && !['mcp','docs'].includes(project.kind) && project.url && (!repair || project.installedRelease || system))) {
      const repo = parseRepository(project.fullName);
      const releases = await remembered(projectReleases, 50, repo.fullName.toLowerCase(),
        () => (releaseGithub || github)('repos/' + repo.fullName + '/releases?per_page=30')).catch(error => {
        if (error.upstreamStatus === 404) return [];
        throw error;
      });
      const targetTag = update ? requestedTag : repair ? (preference === 'installer' && system ? system.version : project.installedRelease?.tag) : null;
      const candidates = targetTag ? releases.filter(release => versionKey(release.tag_name) === versionKey(targetTag)) : releases;
      if (update) notes = String(candidates[0]?.body || '').slice(0,3000);
      if (!forced && !custom && android) {
        const pick = pickReleaseAsset(candidates,scoreAndroidAsset);
        if (pick) return {method:'release',source,storage,releasePlan:pick,tag:pick.release.tag_name,asset:pick.asset.name,notes,
          details:'Baixa o APK. Para instalar, use um aparelho Android conectado ou abra o arquivo no aparelho.'};
      }
      if (!forced && !custom && windows && !android) {
        const score = name => Math.max(scoreWindowsInstaller(name),scorePortableWindowsAsset(name));
        const release = pickReleaseAsset(candidates,score)?.release;
        if (release) {
          const packages = [
            ['portable',pickReleaseAsset([release],scorePortableWindowsAsset),'Prepara a versão portátil na pasta do Orbit.'],
            ['installer',pickReleaseAsset([release],scoreWindowsInstaller),'Abre o instalador oficial. Conclua o assistente do Windows para instalar ou atualizar.']
          ].filter(([,pick]) => pick);
          const selected = packages.find(([mode]) => mode === preference) || packages[0];
          if (requestedPackage && selected[0] !== requestedPackage) throw httpError(409, 'O pacote escolhido não está disponível nesta versão.');
          if ((update || repair) && (system || project.windowsPackage) && selected[0] !== preference) {
            throw httpError(409, 'Esta release não oferece um pacote para o tipo de instalação em uso. Consulte a release no GitHub.');
          }
          const [packageMode,pick,details] = selected;
          return {method:'release',source,storage,releasePlan:{...pick,packageMode},tag:release.tag_name,asset:pick.asset.name,notes,packageMode,details,
            packageChoices:packages.map(([mode,option,description]) => ({mode,asset:option.asset.name,details:description}))};
        }
      }
    }
    if (update) {
      if (!project.installedRelease && source && await fs.lstat(path.join(source,'.git')).then(info => info.isDirectory(), () => false)) {
        return {method:'source-update',source,storage,tag:requestedTag,notes,
          details:'Seleciona o código desta release. Alterações locais precisam estar salvas antes. As dependências são preparadas na próxima execução.'};
      }
      throw httpError(409, 'Esta versão não tem um pacote compatível para instalar pelo Orbit. Abra a release no GitHub.');
    }
    if (repair && project.installedRelease && !forced && !custom) throw httpError(409, 'O pacote da versão instalada não foi encontrado na origem.');
    if (!source) throw missingSource();
    if (project.kind === 'docs') throw httpError(400, KIND_INFO.docs.text);
    if (!forced) {
      const local = await dockerPlan(source, project, {local:true});
      if (local) return {method:'local',source,storage,local,details:'Usa as ferramentas locais e prepara as dependências do projeto.'};
      if (project.kind && !RUNNABLE.has(project.kind) && project.kind !== 'unknown' && !custom) {
        return {method:'native',source,storage,details:'Usa o código-fonte e as ferramentas locais detectadas.'};
      }
    }
    const container = await dockerPlan(source, project).catch(() => null);
    if (container && (forced || container.existing || container.voice || container.managed)) {
      return {method:'docker',source,storage,container,details:forced ? 'Docker foi escolhido em Configuração.' :
        container.existing ? 'O repositório fornece ' + container.existing + ' e o Orbit não encontrou um plano local compatível.' :
          'O perfil do projeto exige uma imagem Docker.'};
    }
    throw httpError(400, 'O Orbit não encontrou um comando local nem uma receita Docker compatível. Consulte o README e ajuste os comandos em Configuração.');
  }
  async function projectGit(cwd, args) {
    const options = ['-c','core.hooksPath=','-c','credential.helper=','-c','protocol.file.allow=never'];
    const result = await capture('git', [...options, ...args], {cwd,timeout:120000,env:{...process.env,GIT_TERMINAL_PROMPT:'0'}});
    if (!result.ok) throw httpError(502, lastMeaningfulLine(result.output) || 'Não foi possível concluir a operação do Git.');
    return result.output;
  }
  async function switchSourceVersion(project, source, target, remote = false) {
    if (!await fs.lstat(path.join(source,'.git')).then(info => info.isDirectory(), () => false)) {
      throw httpError(409, 'O Git não reconhece a pasta do código do projeto.');
    }
    if (await projectGit(source, ['status','--porcelain','--untracked-files=no'])) {
      throw httpError(409, 'Há alterações locais no código. Salve-as no Git antes de trocar a versão.');
    }
    const commit = await projectGit(source, ['rev-parse','--verify','HEAD']);
    const previous = {commit, tag:project.sourceTag || '', version:project.sourceVersion || commit.slice(0,8)};
    let next = target.commit;
    if (remote) {
      const ref = 'refs/tags/' + target.tag;
      await projectGit(source, ['check-ref-format',ref]);
      await projectGit(source, ['fetch','--no-tags','--depth=1','--',parseRepository(project.fullName).url + '.git',ref + ':' + ref]);
      next = await projectGit(source, ['rev-parse','--verify',ref + '^{commit}']);
    }
    if (!/^[a-f\d]{40,64}$/i.test(next)) throw httpError(400, 'O commit da versão é inválido.');
    await projectGit(source, ['checkout','--detach','--no-overwrite-ignore',next,'--']);
    await classify(project);
    Object.assign(project, {previousSource:next === commit ? project.previousSource : previous,
      sourceTag:target.tag || '', sourceVersion:target.version || target.tag || next.slice(0,8),status:'ready',lastError:''});
    await save();
  }
  async function restoreSource(project, storage) {
    const repo = parseRepository(project.fullName);
    const parent = path.dirname(storage.source);
    if (path.relative(parent, await fs.realpath(parent))) throw httpError(400, 'A pasta de armazenamento foi redirecionada.');
    const tag = project.sourceTag || (!project.sourceVersion && project.installedRelease?.tag) || '';
    const commit = !tag && (project.sourceVersion || '').match(/^(?:.*-\d+-g)?([a-f\d]{7,40})$/i)?.[1];
    if (!tag && project.sourceVersion && !commit) throw httpError(409, 'Não foi possível identificar o commit do código anterior.');
    const stage = await fs.mkdtemp(path.join(parent, '.orbit-repair-'));
    const checkout = path.join(stage, 'source');
    try {
      if (tag) await projectGit(parent,['check-ref-format','refs/tags/' + tag]);
      const clone = ['clone', ...(tag || !commit ? ['--depth','1'] : ['--no-checkout']), ...(tag ? ['--branch',tag] : []), '--', repo.url + '.git', checkout];
      await projectGit(parent,clone);
      if (tag || commit) await projectGit(checkout,['checkout','--detach',tag ? 'refs/tags/' + tag : commit,'--']);
      await verifyProjectStorage(project, dataDirectory);
      if (await fs.lstat(storage.source).then(() => true, error => { if (error.code === 'ENOENT') return false; throw error; })) {
        throw httpError(409, 'A pasta do código reapareceu durante o reparo.');
      }
      await fs.rename(checkout, storage.source);
      if (project.language === 'Detectando') Object.assign(project, await detectProject(storage.source), automaticProfile(project));
      await classify(project);
      Object.assign(project, {status:'ready',lastError:''});
      await save();
    } finally { await fs.rm(stage, {recursive:true,force:true}); }
  }
  async function rawFile(fullName, file, limit) {
    const response = await fetch(`https://raw.githubusercontent.com/${fullName}/HEAD/${file.split('/').map(encodeURIComponent).join('/')}`, { headers: { 'User-Agent': 'Orbit-Local' }, signal: AbortSignal.timeout(15000) })
      .catch(error => { throw error.name === 'TimeoutError' ? error : httpError(502, 'Não foi possível falar com o GitHub. Verifique a conexão com a internet e tente novamente.'); });
    const discard = () => response.body?.cancel().catch(() => {});
    if (response.status === 404) { discard(); return null; }
    if (!response.ok) { discard(); throw httpError(502, `O GitHub respondeu ${response.status}. Tente novamente em instantes.`); }
    if (Number(response.headers.get('content-length') || 0) > limit) { discard(); throw httpError(413, 'O arquivo é grande demais para abrir aqui. Abra-o no GitHub.'); }
    const bytes = Buffer.from(await response.arrayBuffer());
    if (bytes.length > limit) throw httpError(413, 'O arquivo é grande demais para abrir aqui. Abra-o no GitHub.');
    return bytes;
  }
  const readmeText = bytes => { const content = bytes.toString('utf8'); if (content.includes('\0')) throw httpError(400, 'O README deste repositório não é um arquivo de texto.'); return content; };
  const remoteReadme = fullName => remembered(remoteReadmes, 100, fullName.toLowerCase(), async () => {
    const direct = await rawFile(fullName, 'README.md', 350000);
    if (direct) return { name: 'README.md', content: readmeText(direct) };
    let info;
    try { info = await github(`repos/${fullName}/readme`); }
    catch (error) { if (error.status === 404) throw httpError(404, 'Este repositório não tem um README. Abra-o no GitHub para ver os arquivos.'); throw error; }
    if (info.size > 350000) throw httpError(413, 'O README é grande demais para abrir aqui. Abra-o no GitHub.');
    return { name: String(info.path || info.name || 'README.md'), content: readmeText(Buffer.from(info.content || '', info.encoding === 'base64' ? 'base64' : 'utf8')) };
  });
  const remoteImage = (fullName, file) => remembered(remoteImages, 40, fullName.toLowerCase() + ':' + file, async () => {
    const bytes = await rawFile(fullName, file, 2000000);
    if (!bytes) throw httpError(404, 'Imagem não encontrada no repositório.');
    try { return imageFromBytes(bytes); } catch (error) { throw httpError(415, error.message); }
  });
  const remotePath = value => {
    const file = String(value || '');
    if (!file || file.length > 500 || file.startsWith('/') || /[\\\0-\x1f]/.test(file) || file.split('/').some(part => !part || part === '.' || part === '..')) throw httpError(400, 'Caminho de arquivo inválido.');
    return file;
  };

  async function body(request) {
    if (!request.headers['content-type']?.startsWith('application/json')) throw httpError(415, 'Envie JSON.');
    let data = '';
    for await (const chunk of request) { data += chunk; if (Buffer.byteLength(data) > 32000) throw httpError(413, 'Dados muito grandes.'); }
    try { return JSON.parse(data || '{}'); } catch { throw httpError(400, 'JSON inválido.'); }
  }
  const server = http.createServer(async (request, response) => {
    const headers = { 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer', 'Cache-Control': 'no-store', 'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data: https://github.com https://avatars.githubusercontent.com; connect-src 'self'; frame-src http://127.0.0.1:* http://localhost:*; frame-ancestors 'none'; base-uri 'none'; form-action 'self'" };
    const send = (status, data, type = 'application/json; charset=utf-8') => { response.writeHead(status, { ...headers, 'Content-Type': type }); response.end(type.startsWith('application/json') ? JSON.stringify(data) : data); };
    let mutation = false;
    try {
      const ownPort = server.address()?.port;
      if (![`127.0.0.1:${ownPort}`, `localhost:${ownPort}`].includes(request.headers.host)) throw httpError(403, 'Host não autorizado.');
      if (request.headers.origin && ![`http://127.0.0.1:${ownPort}`, `http://localhost:${ownPort}`].includes(request.headers.origin)) throw httpError(403, 'Origem não autorizada.');
      if (request.headers['sec-fetch-site'] === 'cross-site') throw httpError(403, 'Requisição externa bloqueada.');
      const url = new URL(request.url, `http://127.0.0.1:${ownPort}`);
      const route = url.pathname;
      if (!route.startsWith('/api/')) {
        if (request.method !== 'GET') throw httpError(405, 'Método não permitido.');
        const asset = { '/': 'index.html', '/apoio': 'apoio.html', '/apoio.js': 'apoio.js', '/app.js': 'app.js', '/release-notifications.js': 'release-notifications.js', '/style.css': 'style.css', '/icon.svg': 'icon.svg' }[route];
        if (!asset) throw httpError(404, 'Página não encontrada.');
        return send(200, await fs.readFile(path.join(ROOT, 'public', asset)), MIMES[path.extname(asset)]);
      }
      if (route === '/api/session' && request.method === 'GET') return send(200, { token, supportUrl, capabilities: {ranking:true, rankingFilters:2, avatars:true, projectImages:true, remoteReadme:true, githubSocial:Boolean(process.env.GITHUB_TOKEN?.trim()), releaseNotifications:true, explorePins:true, exploreRecommendations:true, appManagement:true, folderPicker:process.platform==='win32', desktopShortcuts:process.platform==='win32', openInstallationFolder:process.platform==='win32', namedProjectFolders:true} });
      if (request.headers['x-orbit-token'] !== token) throw httpError(403, 'Sessão expirada. Recarregue o app.');
      if (closing) throw httpError(503, 'O Orbit está encerrando.');
      mutation = desktop && ['POST','DELETE'].includes(request.method);
      if (mutation) activeMutations++;
      if (route === '/api/storage/choose' && request.method === 'POST') {
        await body(request);
        if(folderSelection)throw httpError(409,'A janela de escolha de pasta já está aberta.');
        folderSelection=Promise.resolve().then(()=>integration.chooseFolder());
        try{return send(200,await folderSelection);}finally{folderSelection=null;}
      }
      if (route === '/api/state' && request.method === 'GET') {
        const projects = await Promise.all(state.projects.map(async project => {
          const system = await systemInstallation(project);
          return {...project,systemInstall:system && {version:system.version},availableRelease:releaseForInstallation(project,system),
            sourceMissing: project.status !== 'cloning' && await fs.stat(directory(project)).then(info => !info.isDirectory(), () => true)};
        }));
        return send(200,{...state,projects});
      }
      if (route === '/api/library/external-cleanup' && request.method === 'POST') {
        const {id, action} = await body(request);
        const entry = state.externalCleanup.find(item => item.id === id);
        if (!entry) throw httpError(404, 'Etapa de desinstalação não encontrada.');
        if (action === 'open' && entry.windows && process.platform === 'win32') await integration.openSystemUninstaller();
        else if (action === 'done') { state.externalCleanup = state.externalCleanup.filter(item => item !== entry); await save(); }
        else throw httpError(400, 'Ação inválida.');
        return send(200, {ok:true});
      }
      if (route === '/api/library/home-pins' && request.method === 'POST') {
        const input = await body(request);
        if (!Array.isArray(input?.ids) || !input.ids.length || input.ids.some(id => typeof id !== 'string') || typeof input.pinned !== 'boolean') {
          throw httpError(400, 'Selecione os projetos que deseja adicionar aos favoritos ou remover dos favoritos.');
        }
        const projects = [...new Set(input.ids)].map(find);
        for (const project of projects) {
          if (input.pinned) project.homePinned = true;
          else delete project.homePinned;
        }
        await save();
        return send(200, {ok:true});
      }
      if (route === '/api/explore/recommendations' && request.method === 'GET') return send(200, await recommendations(state, url.searchParams.get('language') || 'Todos'));
      if (route === '/api/explore/preferences' && request.method === 'POST') {
        const input = await body(request);
        if (!input || !['intent','lastSearch'].some(key => Object.hasOwn(input,key))) throw httpError(400, 'Informe o objetivo ou a busca recente.');
        for (const key of ['intent','lastSearch']) if (Object.hasOwn(input,key) && (typeof input[key] !== 'string' || input[key].length > 200)) throw httpError(400, 'Use um texto de até 200 caracteres.');
        for (const key of ['intent','lastSearch']) if (Object.hasOwn(input,key)) state.explorePreferences[key] = input[key].trim();
        await save();
        return send(200, state.explorePreferences);
      }
      if (route === '/api/explore/pins' && request.method === 'POST') {
        const input = await body(request);
        if (typeof input.pinned !== 'boolean' || typeof input.repo?.fullName !== 'string') throw httpError(400, 'Escolha um repositório para adicionar aos favoritos ou remover dos favoritos.');
        let repository;
        try { repository = parseRepository(input.repo.fullName); } catch { throw httpError(400, 'Repositório inválido. Use autor/projeto.'); }
        const key = repository.fullName.toLowerCase();
        const existing = state.explorePins.find(item => item.fullName.toLowerCase() === key);
        if (input.pinned && !existing) {
          if (state.explorePins.length >= 200) throw httpError(400, 'Você já tem 200 favoritos. Remova um para adicionar outro.');
          state.explorePins.unshift({ ...repository, topics: Array.isArray(input.repo.topics) ? input.repo.topics.filter(topic => typeof topic === 'string').slice(0, 12).map(topic => topic.slice(0, 80)) : [], description: typeof input.repo.description === 'string' ? input.repo.description.slice(0, 600) : '', language: typeof input.repo.language === 'string' ? input.repo.language.slice(0, 80) : '', ...(Number.isSafeInteger(input.repo.stars) && input.repo.stars >= 0 ? { stars: input.repo.stars } : {}) });
        } else if (!input.pinned) state.explorePins = state.explorePins.filter(item => item.fullName.toLowerCase() !== key);
        await save();
        return send(200, { items: state.explorePins });
      }
      if (route === '/api/notifications' && request.method === 'GET') return send(200, releaseUpdates.view());
      if (route === '/api/updates/check' && request.method === 'POST') { await body(request); return send(200, await releaseUpdates.check({ force: true })); }
      if (['/api/notifications/read', '/api/notifications/claim'].includes(route) && request.method === 'POST') {
        const input = await body(request);
        const ids = input.ids;
        if (!(route.endsWith('/read') && ids === 'all') && (!Array.isArray(ids) || ids.length > 100 || ids.some(id => typeof id !== 'string' || id.length > 120))) throw httpError(400, 'Lista de notificações inválida.');
        return send(200, route.endsWith('/read') ? await releaseUpdates.markRead(ids) : await releaseUpdates.claim(ids));
      }
      if (route === '/api/ranking' && request.method === 'GET') {
        return send(200, await ranking(Object.fromEntries(['language','period','updated','topic','stars','license','sort','lists'].map(key => [key, url.searchParams.get(key) || undefined]))));
      }
      if (route === '/api/search' && request.method === 'GET') {
        const query = (url.searchParams.get('q') || 'stars:>1000 archived:false').slice(0, 256);
        const data = await github(`search/repositories?q=${encodeURIComponent(query)}&sort=stars&order=desc&per_page=24`);
        return send(200, { total: data.total_count, items: data.items.map(repoView), incomplete: Boolean(data.incomplete_results) });
      }
      if (route === '/api/repository' && request.method === 'GET') { const repo = parseRepository(url.searchParams.get('url')); return send(200, repoView(await github(`repos/${repo.fullName}`))); }
      if (route === '/api/github/social') {
        if (!['GET', 'POST'].includes(request.method)) throw httpError(405, 'Método não permitido.');
        const repo = parseRepository(url.searchParams.get('repo'));
        const paths = { star: 'user/starred/' + repo.fullName, follow: 'user/following/' + repo.owner };
        if (request.method === 'GET') {
          if (!process.env.GITHUB_TOKEN?.trim()) return send(200, { star: null, follow: null });
          const read = async endpoint => {
            const status = await githubSocial(endpoint);
            return status === 204 ? true : status === 404 ? false : null;
          };
          const readFollow = async () => {
            const owner = await github('users/' + repo.owner);
            return owner.type === 'User' ? read(paths.follow) : null;
          };
          const [star, follow] = await Promise.all([read(paths.star).catch(() => null), readFollow().catch(() => null)]);
          return send(200, { star, follow });
        }
        const input = await body(request);
        if (!['star', 'follow'].includes(input?.action) || typeof input.active !== 'boolean') throw httpError(400, 'Ação inválida.');
        const status = await githubSocial(paths[input.action], input.active ? 'PUT' : 'DELETE');
        if (status === 204 || status === 304) return send(200, { active: input.active });
        if (!status || [401, 403, 404, 422].includes(status)) throw httpError(403, 'Conclua esta ação no GitHub.');
        throw httpError(502, 'O GitHub não confirmou a ação. Tente novamente.');
      }
      if (route === '/api/remote/readme' && request.method === 'GET') return send(200, await remoteReadme(parseRepository(url.searchParams.get('repo')).fullName));
      if (route === '/api/remote/image' && request.method === 'GET') { const repo = parseRepository(url.searchParams.get('repo')); return send(200, await remoteImage(repo.fullName, remotePath(url.searchParams.get('path')))); }
      if (route === '/api/runtimes' && request.method === 'GET') {
        const definitions = [['Node.js', 'node', ['--version']], ['Git', 'git', ['--version']], ['Docker', 'docker', ['version', '--format', '{{.Server.Version}}']], ['Python', process.platform === 'win32' ? 'python' : 'python3', ['--version']], ['Go', 'go', ['version']], ['Rust', 'cargo', ['--version']], ['Java', 'java', ['-version']], ['.NET', 'dotnet', ['--version']], ['PHP', 'php', ['--version']], ['Ruby', 'ruby', ['--version']]];
        return send(200, await Promise.all(definitions.map(async ([name, bin, args]) => { const result = await capture(bin, args, { timeout: 6000 }); return { name, available: result.ok, version: result.ok ? result.output.split('\n')[0].slice(0, 120) : '', detail: result.ok ? '' : result.output.slice(0, 350) }; })));
      }
      if (route === '/api/projects' && request.method === 'POST') {
        const input = await body(request);
        const repo = parseRepository(input.url),key=repo.fullName.toLowerCase();
        if(state.projects.some(item=>item.fullName.toLowerCase()===key)||pendingImports.has(key))throw httpError(409,'Este projeto já está na biblioteca ou está sendo adicionado.');
        if(jobs.size+pendingImports.size>=4)throw httpError(409,'Aguarde uma tarefa terminar antes de baixar outro projeto.');
        if(input.installationParent!=null&&(typeof input.installationParent!=='string'||input.installationParent.length>2000))throw httpError(400,'Pasta de instalação inválida.');
        if(input.desktopShortcut&&! (process.platform==='win32'))throw httpError(400,'Atalhos da área de trabalho estão disponíveis no Windows.');
        if(maintenance.size)throw httpError(409,'Aguarde a tarefa de gerenciamento terminar.');
        pendingImports.add(key);
        try{
          const project = {id:randomUUID(),...repo,language:'Detectando',mode:'docker',network:true,port:0,containerPort:0,image:'',install:'',command:'',createdAt:new Date().toISOString(),status:'cloning',trusted:false,shortcutRequested:input.desktopShortcut===true};
          const parent=input.installationParent?.trim() ? await validateParent(input.installationParent.trim()) : await defaultProjectParent();
          project.storage=await allocateProjectStorage(project,parent,{reserved:reservedProjectFolders(project)});
          if (jobs.size>=4) {
            await deleteProjectFiles(project,dataDirectory);
            throw httpError(409,'Aguarde uma tarefa terminar antes de baixar outro projeto.');
          }
          updateLocation(project);state.projects.push(project);
          log(project.id,'Baixando '+repo.url+'…');
          const cloneCommand=integration.cloneCommand?.(repo,directory(project));
          launch(project,cloneCommand?.executable||'git',cloneCommand?.args||['-c','core.hooksPath=','-c','credential.helper=','-c','protocol.file.allow=never','clone','--progress','--depth','1','--config','core.autocrlf=false','--config','core.eol=lf','--',repo.url+'.git',directory(project)],{status:'cloning',cwd:dataDirectory,onSuccess:async()=>{
            Object.assign(project,await detectProject(directory(project)));Object.assign(project,automaticProfile(project));await classify(project);
            if(project.shortcutRequested)try{await requestShortcut(project);}catch(error){project.shortcutError=error.message;log(project.id,'O download terminou, mas o atalho não foi criado: '+error.message,'error');}
          }});
          await save();return send(202,project);
        }finally{pendingImports.delete(key);}
      }
      const match = route.match(/^\/api\/projects\/([\w-]+)(?:\/(logs|files|file|image|config|plan|install|start|update|rollback|repair|stop|frame|mcp|mcp-connect|storage|shortcut|uninstall|system-uninstall|open-installation))?$/);
      if (match) {
        const project = find(match[1]);
        const action = match[2];
        if (action === 'plan' && request.method === 'GET') {
          const operation = url.searchParams.get('operation') || 'install';
          if (!['install','start','update','repair'].includes(operation)) throw httpError(400, 'Operação inválida.');
          const {method, details, local, container, tag, asset, notes, packageMode, packageChoices} = await executionPlan(project, operation, url.searchParams.get('tag'));
          return send(200, {method, details, tag:tag || project.sourceVersion || '', asset, notes, packageMode, packageChoices,
            requirements:local ? [local.runtime, local.install, local.build].filter(Boolean) : container ? ['Docker', container.image].filter(Boolean) : [],
            confirmLocal:['release','local','native'].includes(method) && !(method === 'local' && !local.command) && !project.nativeConsent
          });
        }
        if (action === 'rollback' && request.method === 'POST') {
          const {tag} = await body(request);
          ensureIdle(project);
          const previousSource = project.previousSource;
          const restoreSourceVersion = previousSource && !project.installedRelease && tag === (previousSource.tag || previousSource.version);
          if (!restoreSourceVersion && (process.platform !== 'win32' || !tag || tag !== project.previousRelease?.tag)) throw httpError(409, 'A versão anterior não está disponível.');
          maintenance.add(project.id);
          try {
            const {native} = await verifyProjectStorage(project, dataDirectory);
            if (restoreSourceVersion) {
              await switchSourceVersion(project, await sourceDirectory(project), previousSource);
              return send(200, project);
            }
            const candidate = {...project, installedRelease:project.previousRelease, externalInstaller:false};
            const executable = await installedWindowsExecutable(candidate, native);
            if (!executable) throw httpError(404, 'Os arquivos da versão anterior não estão mais disponíveis.');
            const current = project.installedRelease;
            const keepCurrent = await installedWindowsExecutable(project, native);
            Object.assign(project, {installedRelease:candidate.installedRelease, previousRelease:keepCurrent ? current : null,
              executable, externalInstaller:false, status:'ready', lastError:''});
            await save();
            return send(200, project);
          } finally { maintenance.delete(project.id); }
        }
        if(action==='storage'&&request.method==='POST'){
          const input=await body(request);ensureIdle(project);if(maintenance.size||pendingImports.size)throw httpError(409,'Aguarde a outra tarefa de gerenciamento terminar.');maintenance.add(project.id);
          try{
            const useProjectName=input.useProjectName===true;
            const requestedParent=useProjectName ? (project.storage?.root ? path.dirname(project.storage.root) : await defaultProjectParent()) : input.parent;
            const parent=await validateParent(requestedParent);
            const result=await moveProjectFiles(project,parent,dataDirectory,save,{useProjectName,reserved:reservedProjectFolders(project)});updateLocation(project);
            if(project.shortcut)try{await requestShortcut(project);}catch(error){result.warnings.push('A pasta foi alterada, mas o atalho não foi atualizado: '+error.message);}
            await save();return send(200,{project,...result});
          }finally{maintenance.delete(project.id);}
        }
        if(action==='shortcut'&&request.method==='POST'){
          await body(request);ensureIdle(project);maintenance.add(project.id);
          try{await requestShortcut(project);return send(200,{project});}finally{maintenance.delete(project.id);}
        }
        if (action === 'open-installation' && request.method === 'POST') {
          if (process.platform !== 'win32') throw httpError(501,'A abertura da pasta está disponível no Windows.');
          await body(request);
          const folder = await installationFolder(project);
          await integration.openInstallationFolder(folder);
          return send(200,{ok:true});
        }
        if(action==='system-uninstall'&&request.method==='POST'){
          await body(request);ensureIdle(project);await integration.openSystemUninstaller();return send(200,{ok:true});
        }
        if(action==='uninstall'&&request.method==='POST'){
          const input=await body(request);find(project.id);ensureIdle(project);
          if(maintenance.size||pendingImports.size)throw httpError(409,'Aguarde a outra tarefa de gerenciamento terminar.');
          if(input.confirm!==project.fullName)throw httpError(400,'Confirme a desinstalação deste app.');
          maintenance.add(project.id);
          const progress = project.uninstallProgress ||= {completed:[], step:'', error:''};
          const finishStep = async (step, perform) => {
            if (progress.completed.includes(step)) return;
            Object.assign(progress, {step,error:''});
            await save();
            await perform();
            progress.completed.push(step);
            progress.step = '';
            await save();
          };
          try{
            const locations=await verifyProjectStorage(project,dataDirectory,{allowMissing:true});
            await finishStep('docker', async () => {
              if (project.uninstallDockerPending || await fs.stat(locations.docker).catch(()=>null)) {
                project.uninstallDockerPending = true;
                await save();
                const warnings = await integration.cleanupDocker(project);
                if (warnings.length) throw httpError(503, warnings.join(' '));
              }
              delete project.uninstallDockerPending;
            });
            await finishStep('shortcut', () => integration.removeShortcut(project));
            await finishStep('logs', async () => {
              const logDirectory = path.join(dataDirectory, 'logs');
              if (path.relative(logDirectory, await fs.realpath(logDirectory))) throw new Error('A pasta de logs foi redirecionada.');
              await logWrites.get(project.id);
              await fs.unlink(logFile(project.id)).catch(error => { if (error.code !== 'ENOENT') throw error; });
              logs.delete(project.id);
              logWrites.delete(project.id);
            });
            await finishStep('files', () => deleteProjectFiles(project,dataDirectory,{allowMissing:true}));
            const externalInstaller = Boolean(project.externalInstaller);
            const android = Boolean(project.androidInstalled || project.surface === 'device');
            if ((externalInstaller || android) && !state.externalCleanup.some(item => item.id === project.id)) {
              state.externalCleanup.push({id:project.id, name:project.name, windows:externalInstaller, android});
            }
            forgetProject(project);await save();return send(200,{ok:true,warnings:[],externalInstaller,android});
          }catch(error){
            progress.error = error.message;
            await save();
            if (progress.step === 'docker') throw httpError(503, 'A limpeza Docker ainda não terminou. ' + error.message);
            throw error;
          }finally{maintenance.delete(project.id);}
        }
        if (action === 'logs' && request.method === 'GET') return send(200, { entries: await loadLogs(project.id) });
        if (action === 'frame' && request.method === 'GET') {
          const port = Number(project.port);
          if (project.status !== 'running' || !Number.isInteger(port) || port < 1024 || port > 65535) return send(200, { running: false, url: '', frameable: false, reachable: false, reason: '' });
          const target = 'http://127.0.0.1:' + port + '/';
          try {
            const answer = await fetch(target, { redirect: 'manual', signal: AbortSignal.timeout(4000) });
            answer.body?.cancel().catch(() => {});
            return send(200, { running: true, url: target, reachable: true, ...frameVerdict(answer.headers) });
          } catch { return send(200, { running: true, url: target, reachable: false, frameable: true, reason: '' }); }
        }
        if (action === 'image' && request.method === 'GET') return send(200,await projectImage(await sourceDirectory(project),url.searchParams.get('path')));
        if (action === 'files' && request.method === 'GET') {
          const target = await safePath(await sourceDirectory(project), url.searchParams.get('path') || '.');
          const entries = await fs.readdir(target, { withFileTypes: true });
          return send(200, entries.filter(item => !['.git', 'node_modules', '.venv', '.orbit-packages', 'target', 'vendor'].includes(item.name)).slice(0, 300).map(item => ({ name: item.name, directory: item.isDirectory(), link: item.isSymbolicLink() })).sort((a, b) => Number(b.directory) - Number(a.directory) || a.name.localeCompare(b.name)));
        }
        if (action === 'file' && request.method === 'GET') {
          const target = await safePath(await sourceDirectory(project), url.searchParams.get('path') || 'README.md');
          const stat = await fs.stat(target);
          if (!stat.isFile() || stat.size > 350000) throw httpError(400, 'Abra um arquivo de texto com até 350 KB.');
          const content = await fs.readFile(target, 'utf8');
          if (content.includes('\0')) throw httpError(400, 'Este arquivo é binário.');
          return send(200, { content });
        }
        if (action === 'config' && request.method === 'POST') {
          available(project);
          const input = await body(request);
          if (!(allowNative ? ['auto','docker','native'] : ['auto','docker']).includes(input.mode)) throw httpError(400, 'Escolha Automático ou Docker.');
          const port = Number(input.port || 0);
          if (!Number.isInteger(port) || (port !== 0 && (port < 1024 || port > 65535))) throw httpError(400, 'Use uma porta entre 1024 e 65535, ou 0.');
          for (const key of ['image', 'install', 'command']) if (typeof input[key] !== 'string' || input[key].length > 4000) throw httpError(400, 'Configuração inválida.');
          Object.assign(project, { mode: input.mode === 'native' ? 'native' : 'docker', executionPreference:input.mode, containerPort: port, network: Boolean(input.network), trusted: Boolean(input.trusted), image: input.image.trim(), install: input.install.trim(), command: input.command.trim(), userConfigured: Boolean(input.command.trim()) });
          if (project.mode === 'native') project.port = port;
          await save();
          return send(200, project);
        }
        if (action === 'mcp' && request.method === 'GET') {
          const launch = await mcpLaunch(directory(project));
          const [claude, codex] = await Promise.all([hasTool('claude'), hasTool('codex')]);
          return send(200, { launch, clients: { claude, codex } });
        }
        if (action === 'mcp-connect' && request.method === 'POST') {
          const input = await body(request);
          const launch = await mcpLaunch(directory(project));
          if (!launch) throw httpError(400, 'Não foi possível descobrir como iniciar este servidor MCP.');
          if (!['claude', 'codex'].includes(input.client)) throw httpError(400, 'Escolha Claude Code ou Codex.');
          const quote = value => '"' + String(value).replace(/"/g, '\\"') + '"';
          const args = input.client === 'claude' ? ['mcp', 'add', '-s', 'user', launch.name, '--', launch.command, ...launch.args] : ['mcp', 'add', launch.name, '--', launch.command, ...launch.args];
          const result = await capture(input.client + ' ' + args.map(quote).join(' '), [], { shell: true, timeout: 60000 });
          log(project.id, (result.ok ? 'Conectado ao ' : 'Falha ao conectar ao ') + (input.client === 'claude' ? 'Claude Code' : 'Codex') + ': ' + result.output.slice(-600), result.ok ? 'info' : 'error');
          if (!result.ok) throw httpError(400, 'Não foi possível conectar: ' + (result.output.split('\n').filter(Boolean).at(-1) || 'o comando falhou.'));
          return send(200, { ok: true, output: result.output.slice(-1200) });
        }
        if (['install', 'start', 'update', 'repair'].includes(action) && request.method === 'POST') {
          const input = await body(request);
          available(project);
          if (project.uninstallProgress || project.uninstallDockerPending) throw httpError(409, 'Retome a desinstalação deste projeto em Gerenciar.');
          if (project.status === 'cloning' || (action !== 'repair' && project.status === 'interrupted' && project.language === 'Detectando')) throw httpError(400, 'O download ainda não terminou. Aguarde a conclusão.');
          const plan = await executionPlan(project, action, input.tag, input.packageMode);
          find(project.id);
          available(project);
          if (input.method && (input.method !== plan.method || (plan.method === 'release' &&
            (input.tag !== plan.tag || (input.asset && input.asset !== plan.asset))))) {
            throw httpError(409, 'O plano mudou. Abra a operação novamente para conferir a versão.');
          }
          const {method, source:cwd, storage, local, releasePlan} = plan;
          if (method === 'checkout') {
            maintenance.add(project.id);
            try { await restoreSource(project, storage); return send(200, project); }
            finally { maintenance.delete(project.id); }
          }
          if (method === 'source-update') {
            maintenance.add(project.id);
            try { await switchSourceVersion(project, cwd, {tag:plan.tag}, true); return send(200, project); }
            finally { maintenance.delete(project.id); }
          }
          const workerAction = action === 'start' ? 'start' : 'install';
          const operation = action === 'start' ? 'run' : 'install';
          if (method === 'release' || method === 'native') {
            if (!project.nativeConsent && !input.confirmNative) throw httpError(409, 'confirm-native');
            project.nativeConsent = true; project.trusted = true; project.surface = ''; project.surfaceDetail = ''; project.executionEnvironment = 'local';
            log(project.id, plan.details + (plan.tag ? ' Versão ' + plan.tag + '.' : ''));
            const args = [path.join(ROOT, 'lib', 'native-project.mjs'), workerAction];
            if (!cwd) args.push('--without-source');
            const onSuccess = releasePlan?.packageMode === 'installer' ? async () => {
              const installed = await systemInstallation(project,true);
              if (!installed || versionKey(installed.version) !== versionKey(plan.tag)) {
                throw new Error('O instalador foi encerrado. Verifique a versão em Aplicativos instalados do Windows.');
              }
              project.windowsPackage = 'installer';
              log(project.id,'Instalação do Windows confirmada na versão ' + installed.version + '.');
            } : input.packageMode === 'portable' && action !== 'start' ? () => { project.windowsPackage = 'portable'; } : undefined;
            launch(project, process.execPath, args, {status:'installing', cwd:cwd || storage.root || dataDirectory, ipc:true, operation,onSuccess,
              env:{ORBIT_PROJECT:JSON.stringify(project), ORBIT_RELEASE_PLAN:JSON.stringify(releasePlan || null)}});
          } else if (method === 'command') {
            if (!project.trusted) throw httpError(400, 'Revise o projeto antes de executar.');
            const command = workerAction === 'install' ? project.install : project.command;
            if (!command) throw httpError(400, 'Comando ausente.');
            project.executionEnvironment = 'local';
            launch(project, command, [], { status:workerAction === 'install' ? 'installing' : 'running', cwd, shell:true });
          } else if (method === 'local') {
            if (local.command && !project.nativeConsent && !input.confirmNative) throw httpError(409, 'confirm-native');
            if (local.command) project.nativeConsent = true;
            project.trusted = true; project.executionEnvironment = 'local'; project.surface = ''; project.surfaceDetail = '';
            log(project.id,'Execução local: preparando ' + project.name + '.');
            launch(project,process.execPath,[path.join(ROOT,'lib','local-web.mjs'),workerAction],{
              status:'installing',cwd,ipc:true,operation,env:{ORBIT_PROJECT:JSON.stringify(project),ORBIT_LOCAL_PLAN:JSON.stringify(local)}
            });
          } else {
            project.trusted = true;
            project.executionEnvironment = 'docker';
            log(project.id, plan.details);
            launch(project, process.execPath, [path.join(ROOT, 'lib', 'docker-project.mjs'), workerAction], {status:'installing',cwd,
              containerName:action === 'start' ? 'orbit-' + project.id : undefined, ipc:true,operation,env:{ORBIT_PROJECT:JSON.stringify(project)}});
          }
          return send(202, project);
        }
        if (action === 'stop' && request.method === 'POST') { await body(request); await stop(project); return send(200, project); }
        if (!action && request.method === 'DELETE') {
          await body(request);find(project.id);ensureIdle(project);
          if (project.uninstallProgress || project.uninstallDockerPending) throw httpError(409, 'Retome a desinstalação em Gerenciar.');
          maintenance.add(project.id);
          try{
            const warnings=[];try{await integration.removeShortcut(project);}catch(error){warnings.push(error.message);}
            forgetProject(project);await save();return send(200,{ok:true,warnings});
          }finally{maintenance.delete(project.id);}
        }
      }
      throw httpError(404, 'Ação não encontrada.');
    } catch (error) { const status = error.status || (['ENOENT', 'ENOTDIR'].includes(error.code) ? 404 : 400); send(status, { error: error.name === 'TimeoutError' ? 'A conexão demorou demais. Tente novamente.' : error.message }); }
    finally { if (mutation) activeMutations--; }
  });
  await save();
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(port, '127.0.0.1', resolve); });
  if (backgroundReleaseChecks) releaseUpdates.start();
  // Containers que sobraram de uma sessão anterior (Orbit fechado com apps abertos) só ocupam memória: remove-os.
  if (cleanupContainers) (async () => {
    if (!(await dockerCommand(['info', '--format', '{{.ServerVersion}}'], { timeout: 4000 })).ok) return;
    const list = await dockerCommand(['ps', '-aq', '--filter', 'label=orbit.managed=true'], { timeout: 8000 });
    const ids = list.ok ? list.output.split(/\s+/).filter(Boolean) : [];
    if (ids.length) { await dockerCommand(['rm', '-f', ...ids], { timeout: 30000 }); console.log('  ' + ids.length + (ids.length === 1 ? ' container antigo removido.' : ' containers antigos removidos.')); }
  })().catch(() => {});
  const close = async () => { closing = true; while(maintenance.size||pendingImports.size||activeMutations) await new Promise(resolve=>setTimeout(resolve,50)); clearTimeout(activitySave); await releaseUpdates.close(); await Promise.allSettled(state.projects.filter(item => jobs.has(item.id)).map(stop)); await Promise.allSettled([...jobs.values()].map(job => job.done)); clearTimeout(activitySave); await save(); server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); };
  return { server, token, state, jobs, directory, isBusy, close, url: `http://127.0.0.1:${server.address().port}` };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const app = await createApp({ cleanupContainers: true });
  console.log(`\n  ORBIT • Seu GitHub, em um só lugar.\n  ${app.url}\n\n  Feche com Ctrl+C.\n`);
  if (process.argv.includes('--open')) {
    const executable = process.platform === 'win32' ? 'rundll32' : process.platform === 'darwin' ? 'open' : 'xdg-open';
    const args = process.platform === 'win32' ? ['url.dll,FileProtocolHandler', app.url] : [app.url];
    const browser = spawn(executable, args, { detached: true, stdio: 'ignore', windowsHide: true });
    browser.on('error', () => console.log(`Abra ${app.url} no navegador.`)); browser.unref();
  }
  let shuttingDown = false;
  const shutdown = async () => { if (shuttingDown) return; shuttingDown = true; await app.close(); process.exit(0); };
  process.on('SIGINT', shutdown); process.on('SIGTERM', shutdown);
}
