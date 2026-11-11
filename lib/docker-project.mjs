import { promises as fs } from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { spawn } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { ensureDockerReady, dockerCommand } from './docker-engine.mjs';
import { DOCUMENTATION_NOTE } from './runner.mjs';
import { classifyProject, pickNodeScript, KIND_INFO, RUNNABLE } from './classify.mjs';
import { pythonSources, pythonWebEntry } from './python-entry.mjs';

const SELF = fileURLToPath(import.meta.url);
const APP = path.dirname(path.dirname(SELF));
const IGNORE = '.git\nnode_modules\n**/node_modules\n.venv\n.orbit-venv\n.orbit-runtime\n.orbit-packages\n.orbit-environment.json\n.env\n.env.*\n**/.env\n**/.env.*\n*.log\n';
export function automaticProfile(project) {
  const repo = project.fullName?.toLowerCase();
  if (repo === 'debpalash/voicestudio') return { mode: 'docker', dockerAutomatic: true, image: 'ghcr.io/debpalash/voicestudio:stable', port: 0, install: '', command: '', recipe: 'docker-voicestudio', note: 'Docker automático: o Orbit inicia o Docker, baixa a imagem oficial com as dependências e prepara o serviço. Clique em Executar; a primeira inicialização pode baixar modelos grandes.' };
  if (repo === 'boykopovar/anyps5') return { mode: 'docker', dockerAutomatic: true, image: '', port: 0, install: '', command: '', recipe: 'docker-anyps5', note: 'O Orbit prepara o conversor com os pacotes oficiais. Clique em Executar e aguarde a preparação.' };
  return { mode: 'docker', dockerAutomatic: true };
}
// ── Plano de execução ────────────────────────────────────────────────
// Servidores de desenvolvimento conhecidos: porta padrão, como pedir 0.0.0.0 e se precisam de build antes.
const NODE_SERVERS = [
  { test: /\bvite\s+preview\b/, port: 4173, host: '--host 0.0.0.0', portFlag: '--port', build: true },
  { test: /(^|[\s;&(])vite(?!\s+(?:build|optimize))\b/, port: 5173, host: '--host 0.0.0.0', portFlag: '--port' },
  { test: /(^|[\s;&(])next\s+start\b/, port: 3000, host: '--hostname 0.0.0.0', portFlag: '--port', build: true },
  { test: /(^|[\s;&(])next(?:\s+dev)?(?=\s+-|\s*$)/, port: 3000, host: '--hostname 0.0.0.0', portFlag: '--port' },
  { test: /\b(?:nuxt|nuxi)\s+(?:dev|preview|start)\b/, port: 3000, host: '--host 0.0.0.0', portFlag: '--port' },
  { test: /\bastro\s+(?:dev|preview)\b|(^|\s)astro\s*$/, port: 4321, host: '--host 0.0.0.0', portFlag: '--port' },
  { test: /\bvitepress\s+(?:dev|preview)\b/, port: 5173, host: '--host 0.0.0.0', portFlag: '--port' },
  { test: /\bng\s+serve\b/, port: 4200, host: '--host 0.0.0.0', portFlag: '--port' },
  { test: /\bgatsby\s+develop\b/, port: 8000, host: '-H 0.0.0.0', portFlag: '-p' },
  { test: /\bvue-cli-service\s+serve\b/, port: 8080, host: '--host 0.0.0.0', portFlag: '--port' },
  { test: /\bwebpack(?:-dev-server|\s+serve)\b/, port: 8080, host: '--host 0.0.0.0', portFlag: '--port' },
  { test: /\bparcel\b(?!\s+build)/, port: 1234, host: '--host 0.0.0.0', portFlag: '--port' },
  { test: /\bdocusaurus\s+start\b/, port: 3000, host: '--host 0.0.0.0', portFlag: '--port' },
  { test: /\bstorybook\s+dev\b/, port: 6006, host: '--host 0.0.0.0 --no-open', portFlag: '-p' },
  { test: /\breact-scripts\s+start\b/, port: 3000 },
  { test: /\bremix\s+dev\b/, port: 3000 }
];
const COMPOUND = /&&|\|\||;|\bconcurrently\b|\bnpm-run-all\b|\brun-[ps]\b|\bturbo\b|\bnx\b|\blerna\b/;
const IGNORED_PORTS = new Set([9229, 9230, 24678, 35729, 5037]);
const quoteEnv = value => JSON.stringify(String(value));
const shellQuote = value => "'" + String(value).replaceAll("'", "'\\''") + "'";
export const OOM_NOTE = 'O app ficou sem memória e o Docker o encerrou. Feche outros projetos em execução ou aumente a memória do Docker Desktop em Settings › Resources, e tente de novo.';
export const SILENT_EXIT_NOTE = 'O programa terminou sozinho sem abrir nenhum endereço. Provavelmente é uma ferramenta de terminal, não um app com tela. Veja no README como usar.';

// Escolhe a versão principal do Node que atende ao campo engines do projeto.
export function nodeMajor(range = '') {
  const parts = String(range || '').split('||').map(part => part.trim()).filter(Boolean);
  if (!parts.length) return 22;
  const fits = (part, major) => [...part.matchAll(/(>=|<=|>|<|\^|~|=)?\s*v?(\d+)(?:\.(\d+|x|\*))?(?:\.(\d+|x|\*))?/g)].every(([, op = '', value]) => {
    const n = Number(value);
    return op === '>=' ? major >= n : op === '>' ? major > n || major === n : op === '<' ? major < n : op === '<=' ? major <= n : major === n;
  });
  return [22, 24, 20, 26, 18].find(major => parts.some(part => fits(part, major))) || 22;
}
// Lê no texto uma porta explícita (--port 5188, -p 8080, PORT=3000).
export function explicitPort(source = '') {
  const match = String(source).match(/(?:--port[=\s]+|(?:^|\s)-p\s+|\bPORT=)(\d{2,5})\b/);
  const port = Number(match?.[1] || 0);
  return port >= 1024 && port <= 65535 ? port : 0;
}
// Procura no código e no README uma porta provável, para apps sem padrão conhecido.
export function portHint(...sources) {
  for (const source of sources) {
    const text = String(source || '');
    const match = text.match(/\.listen\(\s*(\d{4,5})|\bport\s*[:=]\s*(\d{4,5})\b|(?:localhost|127\.0\.0\.1|0\.0\.0\.0):(\d{4,5})\b/i);
    const port = Number(match?.[1] || match?.[2] || match?.[3] || 0);
    if (port >= 1024 && port <= 65535) return port;
  }
  return 0;
}
function installNode(manager, has, pkg) {
  const quiet = ' --no-audit --no-fund';
  if (manager === 'pnpm') return 'pnpm install --frozen-lockfile || pnpm install';
  if (manager === 'yarn') return 'yarn install --frozen-lockfile || yarn install';
  if (manager === 'bun') return 'bun install --frozen-lockfile || bun install';
  return (has('package-lock.json') || has('npm-shrinkwrap.json') ? 'npm ci' + quiet + ' || ' : '') + 'npm install' + quiet + ' || npm install' + quiet + ' --legacy-peer-deps';
}
function dockerfileOf({ from, prepare = '', appDir = '', install = '', build = '', env = {}, port = 0, command }) {
  const lines = ['FROM ' + from];
  if (prepare) lines.push('RUN ' + prepare);
  lines.push('WORKDIR /workspace', 'COPY . .');
  if (appDir) lines.push('WORKDIR /workspace/' + appDir);
  if (install) lines.push('RUN ' + install);
  if (build) lines.push('RUN ' + build);
  for (const [key, value] of Object.entries(env)) lines.push('ENV ' + key + '=' + quoteEnv(value));
  if (port) lines.push('EXPOSE ' + port);
  lines.push('CMD ' + JSON.stringify(['sh', '-lc', command]));
  return lines.join('\n') + '\n';
}
async function readText(file, max = 200000) { try { return (await fs.readFile(file, 'utf8')).slice(0, max); } catch { return ''; } }

async function nodePlan(base, files, project, appDir, local) {
  const has = name => files.includes(name);
  const pkg = JSON.parse(await fs.readFile(path.join(base, 'package.json'), 'utf8'));
  if (local && [['os',process.platform],['cpu',process.arch]].some(([key,current]) => {
    const values = Array.isArray(pkg[key]) ? pkg[key] : [];
    const allowed = values.filter(value => typeof value === 'string' && !value.startsWith('!'));
    return values.includes('!'+current) || (allowed.length && !allowed.includes(current));
  })) return null;
  const manager = pkg.packageManager?.split('@')[0] || (has('pnpm-lock.yaml') ? 'pnpm' : has('yarn.lock') ? 'yarn' : has('bun.lock') || has('bun.lockb') ? 'bun' : 'npm');
  if (!['npm', 'pnpm', 'yarn', 'bun'].includes(manager)) throw new Error('Gerenciador de pacotes não reconhecido: ' + manager + '.');
  let from = 'node:' + nodeMajor(pkg.engines?.node) + '-bookworm';
  let prepare = '';
  if (manager === 'bun') prepare = 'npm install -g bun';
  if (manager === 'pnpm') prepare = 'npm install -g pnpm' + (/^pnpm@(\d+)/.test(pkg.packageManager || '') ? '@' + pkg.packageManager.match(/^pnpm@(\d+)/)[1] : '');
  if (manager === 'yarn') prepare = /^yarn@[2-9]/.test(pkg.packageManager || '') ? 'corepack enable' : 'npm install -g yarn --force';
  const script = project.command ? '' : pickNodeScript(pkg);
  if (!script && !project.command) throw new Error('O pacote não declara um programa de início. Bibliotecas precisam de um exemplo ou comando executável.');
  const scriptText = script ? pkg.scripts[script] : project.command;
  const server = NODE_SERVERS.find(item => item.test.test(scriptText));
  let port = Number(project.containerPort || 0) || explicitPort(scriptText) || server?.port || 0;
  let command = project.command || manager + ' run ' + script;
  const lastStep = scriptText.split('&&').at(-1).trim();
  const forwardsServerArgs = !COMPOUND.test(scriptText) ||
    (local && !/\|\||;/.test(scriptText) && !COMPOUND.test(lastStep) && server?.test.test(lastStep));
  if (!project.command && server?.host && forwardsServerArgs) {
    const extra = [];
    if (!/--host(?:name)?\b|(?:^|\s)-H\s/.test(scriptText)) extra.push(local ? server.host.replace('0.0.0.0','127.0.0.1') : server.host);
    if (!explicitPort(scriptText) || Number(project.containerPort || 0)) extra.push(server.portFlag + ' ' + port);
    if (extra.length) command += (manager === 'npm' ? ' -- ' : ' ') + extra.join(' ');
  }
  if (!port) port = portHint(scriptText, await readText(path.join(base, 'README.md'), 60000)) || 3000;
  const needsBuild = !project.command && typeof pkg.scripts?.build === 'string' && (server?.build || (script === 'start' && !server) || script === 'preview' || script === 'serve' && /\bserve\b.*\b(dist|build|out)\b/.test(scriptText));
  const build = needsBuild ? manager + ' run build' : '';
  if (local) return {runtime:'node',port,command,build,install:project.install || installNode(manager,has,pkg),env:{BROWSER:'none'}};
  return {
    runtime: 'node', port,
    dockerfile: dockerfileOf({ from, prepare, appDir, install: project.install || installNode(manager, has, pkg), build, env: { HOST: '0.0.0.0', PORT: port, BROWSER: 'none', NODE_OPTIONS: '--max-old-space-size=3072' }, port, command })
  };
}

async function pythonPlan(base, files, project, appDir, local) {
  const has = name => files.includes(name);
  const manifest = (await Promise.all(['requirements.txt', 'pyproject.toml', 'Pipfile', 'setup.py', '.python-version'].filter(has).map(name => readText(path.join(base, name))))).join('\n');
  const lower = manifest.toLowerCase();
  const sources = await pythonSources(base);
  const pyFiles = files.filter(name => name.endsWith('.py'));
  const minMinor = Number(manifest.match(/(?:>=|~=|==|\^)\s*3\.(\d+)/)?.[1] || (manifest.match(/^3\.(\d+)/m)?.[1]) || 0);
  const maxMinor = Number(manifest.match(/<\s*3\.(\d+)/)?.[1] || 0);
  let minor = Math.max(12, minMinor || 0); if (maxMinor && minor >= maxMinor) minor = maxMinor - 1; minor = Math.min(Math.max(minor, 9), 13);
  const from = 'python:3.' + minor + '-bookworm';
  const prepare = 'apt-get update && apt-get install -y --no-install-recommends ffmpeg libsndfile1 libgl1 libglib2.0-0 build-essential pkg-config git && rm -rf /var/lib/apt/lists/*';
  let install = project.install;
  if (!install) {
    const steps = ['python -m pip install --upgrade pip'];
    if (has('requirements.txt')) steps.push('python -m pip install -r requirements.txt');
    else if (has('Pipfile')) steps.push('python -m pip install pipenv && (pipenv install --system --deploy || pipenv install --system)');
    else if (/\[tool\.poetry\]/.test(manifest) && !/\[project\]/.test(manifest)) steps.push('python -m pip install poetry && poetry config virtualenvs.create false && poetry install --no-root --no-interaction');
    else if (has('pyproject.toml') || has('setup.py')) steps.push('python -m pip install .');
    install = steps.join(' && ');
  }
  const find = (pattern, preferred) => [...preferred.filter(name => sources[name] !== undefined), ...pyFiles].find(name => pattern.test(sources[name] || ''));
  const entries = ['app.py', 'main.py', 'server.py', 'run.py', 'webui.py', 'launch.py', 'demo.py', 'streamlit_app.py', 'Home.py', 'api.py', 'wsgi.py', 'asgi.py'];
  let command = project.command, port = Number(project.containerPort || 0), env = { HOST: '0.0.0.0', PYTHONUNBUFFERED: '1' };
  if (!command) {
    let file;
    const nested = pythonWebEntry(sources);
    if (has('manage.py')) { port ||= 8000; command = 'python manage.py migrate --noinput; python manage.py runserver 0.0.0.0:' + port; }
    else if ((file = find(/^\s*import\s+streamlit|^\s*from\s+streamlit/m, ['streamlit_app.py', 'Home.py', 'app.py', 'main.py']))) { port ||= 8501; command = 'streamlit run ' + file + ' --server.address 0.0.0.0 --server.port ' + port + ' --server.headless true'; }
    else if ((file = find(/^\s*import\s+gradio|^\s*from\s+gradio/m, entries))) { port ||= explicitPort(sources[file]) || 7860; env = { ...env, GRADIO_SERVER_NAME: '0.0.0.0', GRADIO_SERVER_PORT: port }; command = 'python ' + file; }
    else if ((file = find(/^\s*(\w+)\s*=\s*FastAPI\(/m, entries))) { const variable = sources[file].match(/^\s*(\w+)\s*=\s*FastAPI\(/m)[1]; port ||= 8000; install += ' && python -m pip install "uvicorn[standard]"'; command = 'python -m uvicorn ' + file.replace(/\.py$/, '') + ':' + variable + ' --host 0.0.0.0 --port ' + port; }
    else if ((file = find(/^\s*(\w+)\s*=\s*Flask\(/m, entries))) { const variable = sources[file].match(/^\s*(\w+)\s*=\s*Flask\(/m)[1]; port ||= 5000; command = 'python -m flask --app ' + file.replace(/\.py$/, '') + ':' + variable + ' run --host 0.0.0.0 --port ' + port; }
    else if (nested) {
      if (nested.file.startsWith('src/')) env.PYTHONPATH = '/workspace/' + (appDir ? appDir + '/' : '') + 'src';
      if (nested.framework === 'fastapi') { port ||= 8000; install += ' && python -m pip install "uvicorn[standard]"'; command = 'python -m uvicorn ' + nested.module + ':' + nested.target + (nested.factory ? ' --factory' : '') + ' --host 0.0.0.0 --port ' + port; }
      else if (nested.framework === 'flask') { port ||= 5000; command = 'python -m flask --app ' + nested.module + ':' + nested.target + ' run --host 0.0.0.0 --port ' + port; }
      else if (nested.framework === 'streamlit') { port ||= 8501; command = 'python -m streamlit run ' + (local && process.platform === 'win32' ? JSON.stringify(nested.file) : shellQuote(nested.file)) + ' --server.address 0.0.0.0 --server.port ' + port + ' --server.headless true'; }
      else { port ||= 7860; env.GRADIO_SERVER_NAME = '0.0.0.0'; env.GRADIO_SERVER_PORT = port; command = 'python ' + shellQuote(nested.file); }
    }
    else if ((file = entries.find(name => sources[name] !== undefined))) { port ||= portHint(sources[file]) || 8000; command = 'python ' + file; }
  }
  if (!command) throw new Error('As dependências Python foram identificadas, mas o repositório não declara qual programa executar. Informe o comando em Configuração, conforme o README.');
  port ||= portHint(command, ...Object.values(sources), await readText(path.join(base, 'README.md'), 60000)) || 8000;
  if (local) {
    const localEnv = Object.fromEntries(Object.entries(env).map(([key,value]) => [key,String(value).replaceAll('0.0.0.0','127.0.0.1')]));
    if (localEnv.PYTHONPATH) localEnv.PYTHONPATH = path.join(base,'src');
    return {runtime:'python',port,command:project.command || command.replaceAll('0.0.0.0','127.0.0.1').replace('; python manage.py',' && python manage.py'),
      install:project.install,env:{...localEnv,FLASK_RUN_HOST:'127.0.0.1',STREAMLIT_SERVER_ADDRESS:'127.0.0.1',STREAMLIT_SERVER_HEADLESS:'true'}};
  }
  const runner = (await fs.readFile(path.join(APP, 'lib', 'python-runner.py'))).toString('base64');
  install += ' && python -c ' + shellQuote('import base64; from pathlib import Path; Path("/opt/orbit").mkdir(parents=True, exist_ok=True); Path("/opt/orbit/python-runner.py").write_bytes(base64.b64decode("' + runner + '"))');
  return { runtime: 'python', port, dockerfile: dockerfileOf({ from, prepare, appDir, install, env: { ...env, ORBIT_AUTO_DEPENDENCIES: project.network === false ? '0' : '1', PORT: port, FLASK_RUN_HOST: '0.0.0.0', STREAMLIT_SERVER_ADDRESS: '0.0.0.0', STREAMLIT_SERVER_HEADLESS: 'true' }, port, command: 'python /opt/orbit/python-runner.py ' + shellQuote(command) }) };
}

async function otherPlan(runtime, base, files, project, appDir, local) {
  const has = name => files.includes(name);
  let port = Number(project.containerPort || 0);
  const readme = await readText(path.join(base, 'README.md'), 60000);
  const plan = (from, install, command, defaultPort, prepare = '') => {
    port ||= portHint(command, readme) || defaultPort;
    if (local) return {runtime,port,install:project.install,command:project.command || command.replaceAll('{port}',port).replaceAll('0.0.0.0','127.0.0.1').replace('; bundle exec',' && bundle exec')};
    return { runtime, port, dockerfile: dockerfileOf({ from, prepare, appDir, install: project.install || install, env: { HOST: '0.0.0.0', PORT: port }, port, command: project.command || command.replaceAll('{port}', port) }) };
  };
  if (runtime === 'static') { if (local) return project.command ? null : {runtime,port}; port ||= 8000; return { runtime, port, dockerfile: dockerfileOf({ from: 'python:3.12-alpine', appDir, port, command: project.command || 'python -m http.server ' + port + ' --bind 0.0.0.0' }) }; }
  if (runtime === 'rust') return plan('rust:1-bookworm', 'cargo build --release', 'cargo run --release', 8080);
  if (runtime === 'go') return plan('golang:1-bookworm', 'go mod download', 'go run .', 8080);
  if (runtime === 'java') return has('pom.xml') ? plan('maven:3-eclipse-temurin-21', 'mvn -B -DskipTests package', 'mvn -B -DskipTests spring-boot:run || java -jar target/*.jar', 8080) : plan('gradle:8-jdk21', 'gradle build -x test --no-daemon', 'gradle bootRun --no-daemon || gradle run --no-daemon', 8080);
  if (runtime === 'dotnet') { const project_ = files.find(name => /\.(cs|fs)proj$/.test(name)); const framework = (await readText(path.join(base, project_))).match(/net(\d+)\.0/)?.[1] || '8'; return plan('mcr.microsoft.com/dotnet/sdk:' + framework + '.0', 'dotnet restore', 'dotnet run --urls http://0.0.0.0:{port}', 5000); }
  if (runtime === 'php') return plan('php:8.3-cli', has('composer.json') ? 'curl -sS https://getcomposer.org/installer | php -- --install-dir=/usr/local/bin --filename=composer && composer install --no-interaction' : 'php --version', 'php -S 0.0.0.0:{port}' + (await readText(path.join(base, 'public', 'index.php')) ? ' -t public' : ''), 8000, 'apt-get update && apt-get install -y --no-install-recommends git unzip && rm -rf /var/lib/apt/lists/*');
  if (runtime === 'ruby') { const gem = await readText(path.join(base, 'Gemfile')); return plan('ruby:3-bookworm', 'bundle install', /\brails\b/.test(gem) ? 'bundle exec rails db:prepare; bundle exec rails server -b 0.0.0.0 -p {port}' : 'bundle exec rackup --host 0.0.0.0 --port {port}', /\brails\b/.test(gem) ? 3000 : 9292); }
  return null;
}

export async function dockerPlan(directory, project, {local=false}={}) {
  const authentication = project.fullName?.toLowerCase() === 'open-jarvis/openjarvis' ? { authEnv: 'OPENJARVIS_API_KEY', authPrefix: 'oj_sk_', readyPath: '/health', volume: '/home/openjarvis' } : {};
  if (project.fullName?.toLowerCase() === 'debpalash/voicestudio') return local ? null : { image: 'ghcr.io/debpalash/voicestudio:stable', mirror: 'palashdeb/omnivoice-studio:stable', port: 3900, volume: '/app/omnivoice_data', voice: true };
  if (local && authentication.authEnv) return null;
  if (local && project.fullName?.toLowerCase() === 'boykopovar/anyps5') return {runtime:'anyps5',appDir:'',port:Number(project.containerPort) || 4385};
  if (project.fullName?.toLowerCase() === 'boykopovar/anyps5') return {
    port: 4385, managed: true, generated: true,
    dockerfile: 'FROM node:22-bookworm\nRUN apt-get update && apt-get install -y --no-install-recommends unzip ca-certificates && rm -rf /var/lib/apt/lists/*\nCOPY managed-project.mjs /orbit/managed-project.mjs\nWORKDIR /workspace\nRUN node /orbit/managed-project.mjs install-anyps5\nENV ORBIT_PROJECT_PORT=4385\nENV ORBIT_LISTEN_HOST=0.0.0.0\nEXPOSE 4385\nCMD ["node","/orbit/managed-project.mjs","run-anyps5"]\n'
  };
  // Comandos sugeridos pela detecção antiga não contam: só o que a pessoa salvou em Configuração substitui o plano automático.
  project = { ...project, install: project.userConfigured ? project.install || '' : '', command: project.userConfigured ? project.command || '' : '', image: project.userConfigured ? project.image || '' : '' };
  const custom = Boolean(project.command);
  const info = await classifyProject(directory,{preferSource:local});
  if (local && (!RUNNABLE.has(info.kind) || info.runtime === 'docker') && !custom) return null;
  if (!RUNNABLE.has(info.kind) && !custom) throw new Error(info.kind === 'docs' ? DOCUMENTATION_NOTE : KIND_INFO[info.kind].text);
  const appDir = info.appDir || '';
  const base = path.join(directory, appDir);
  for (const file of local ? [] : ['Dockerfile', 'deploy/Dockerfile', 'docker/Dockerfile', 'deploy/docker/Dockerfile']) {
    const content = await readText(path.join(base, file));
    if (!content) continue;
    const port = Number(project.containerPort || 0) || Number(content.match(/^\s*EXPOSE\s+(\d+)/im)?.[1] || 0);
    return { ...authentication, existing: path.posix.join(appDir, file), context: file === 'Dockerfile' ? appDir : '', port, image: 'orbit-project-' + project.id + ':latest' };
  }
  const files = await fs.readdir(base);
  const has = name => files.includes(name);
  const runtime = info.runtime || (has('package.json') ? 'node' : '');
  let plan;
  if (runtime === 'node' || has('package.json')) plan = await nodePlan(base, files, project, appDir, local);
  else if (runtime === 'python') plan = await pythonPlan(base, files, project, appDir, local);
  else plan = await otherPlan(runtime, base, files, project, appDir, local);
  if (local) {
    if (!plan && custom && Number(project.containerPort)) plan = {runtime:'custom',port:Number(project.containerPort),command:project.command,install:project.install};
    return plan ? {...plan,appDir} : null;
  }
  if (!plan && custom) {
    const port = Number(project.containerPort || 0);
    plan = { runtime: 'custom', port, dockerfile: dockerfileOf({ from: project.image || 'ubuntu:24.04', appDir, install: project.install, env: { HOST: '0.0.0.0', ...(port ? { PORT: port } : {}) }, port, command: project.command }) };
  }
  if (!plan) throw new Error(KIND_INFO.unknown.text);
  return { ...plan, ...authentication, generated: true, image: 'orbit-project-' + project.id + ':latest' };
}

async function shellDocker(args) {
  const child = spawn('docker', args, { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  let output = '';
  child.stdout.on('data', data => { process.stdout.write(data); output = (output + data).slice(-24000); });
  child.stderr.on('data', data => { process.stderr.write(data); output = (output + data).slice(-24000); });
  await new Promise((resolve, reject) => { child.on('error', reject); child.on('close', code => code === 0 ? resolve() : reject(Object.assign(new Error('Docker terminou com código ' + code + '. Veja o terminal.'), { output }))); });
}

// A dependency can require a newer compiler than the repository's Dockerfile.
// Keep the original checkout intact and change only the container build recipe.
export function rustDependencyRepair(source, output) {
  if (!/\brustup\b/.test(source)) return null;
  const versions = [...String(output).matchAll(/requires rustc (\d+\.\d+\.\d+)/g)].map(match => match[1]);
  versions.sort((a, b) => a.localeCompare(b, 'en', { numeric: true }));
  const version = versions.at(-1);
  if (!version) return null;
  let changed = false;
  const dockerfile = source.replaceAll('\r\n', '\n').replace(/^RUN (?:[^\n]*\\\n)*[^\n]*/gm, instruction => {
    if (!/\bmaturin\s+build\b|\bcargo\s+(?:build|rustc)\b/.test(instruction)) return instruction;
    changed = true;
    return 'RUN rustup toolchain install ' + version + ' --profile minimal && rustup default ' + version + '\n' + instruction;
  });
  return changed ? { version, dockerfile } : null;
}
export function containerArguments(project, plan, { name, envFile } = {}) {
  const args = ['run', '--init', '--name', name, '--label', 'orbit.managed=true', '--label', 'orbit.project=' + project.id, '--security-opt=no-new-privileges', '--pids-limit=1024', '--memory=' + (plan.voice ? '8g' : '4g'), '--cpus=2'];
  // Dockerfiles gerados pelo Orbit rodam sem privilégios; imagens de terceiros mantêm o básico de que costumam precisar.
  if (plan.generated) { args.push('--cap-drop=ALL'); if (plan.port && plan.port < 1024) args.push('--cap-add=NET_BIND_SERVICE'); }
  else for (const cap of ['NET_RAW', 'MKNOD', 'AUDIT_WRITE', 'SETFCAP', 'SYS_CHROOT']) args.push('--cap-drop=' + cap);
  if (plan.port) args.push('-p', '127.0.0.1::' + plan.port);
  if (plan.generated && plan.port) args.push('-e', 'PORT=' + plan.port);
  if (plan.runtime === 'node') args.push('-e', 'HOSTNAME=0.0.0.0');
  if (plan.volume) args.push('--mount', 'type=volume,source=orbit-data-' + project.id + ',target=' + plan.volume);
  if (envFile) args.push('--env-file', envFile);
  if (!project.network) args.push('--network=none');
  if (plan.voice) args.push('--platform', 'linux/amd64');
  args.push(plan.image);
  return args;
}
// Lê /proc/net/tcp(6) e devolve as portas em escuta, indicando se aceitam conexões de fora (0.0.0.0/::).
export function listeningPorts(text) {
  const ports = new Map();
  for (const line of String(text).split('\n')) {
    const cols = line.trim().split(/\s+/);
    if (cols.length < 4 || cols[3] !== '0A' || !cols[1]?.includes(':')) continue;
    const [address, hex] = cols[1].split(':');
    const port = parseInt(hex, 16);
    if (!port) continue;
    const loopback = (address.length === 8 && /7F$/i.test(address)) || /^0{24}01000000$/i.test(address) || /^0{16}FFFF0000[0-9A-F]{6}7F$/i.test(address);
    const current = ports.get(port) || { port, wildcard: false, loopback: false };
    if (loopback) current.loopback = true; else current.wildcard = true;
    ports.set(port, current);
  }
  return ports;
}
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
async function containerPorts(name) {
  const result = await dockerCommand(['exec', name, 'sh', '-c', 'cat /proc/net/tcp /proc/net/tcp6 2>/dev/null'], { timeout: 6000 });
  return result.ok ? listeningPorts(result.output) : new Map();
}
// Apps que escutam só em localhost dentro do container ficam inacessíveis. Uma ponte no IP do container resolve sem mexer no app.
async function bridgeLoopback(name, port) {
  const available = async bin => (await dockerCommand(['exec', name, 'sh', '-c', 'command -v ' + bin], { timeout: 6000 })).ok;
  const node = "const net=require('net'),os=require('os');const P=" + port + ";for(const i of Object.values(os.networkInterfaces()).flat()){if(!i||i.internal||i.family!=='IPv4')continue;net.createServer(c=>{const u=net.connect(P,'localhost');c.pipe(u).pipe(c);c.on('error',()=>u.destroy());u.on('error',()=>c.destroy());}).listen(P,i.address);}setInterval(()=>{},1<<30);";
  const python = 'import socket,threading\nP=' + port + '\nip=socket.gethostbyname(socket.gethostname())\ns=socket.socket();s.setsockopt(socket.SOL_SOCKET,socket.SO_REUSEADDR,1);s.bind((ip,P));s.listen(64)\ndef pipe(a,b):\n  try:\n    while True:\n      d=a.recv(65536)\n      if not d: break\n      b.sendall(d)\n  except Exception: pass\n  finally:\n    for x in (a,b):\n      try: x.shutdown(socket.SHUT_RDWR)\n      except Exception: pass\nwhile True:\n  c,_=s.accept()\n  try: u=socket.create_connection(("localhost",P))\n  except Exception:\n    c.close(); continue\n  threading.Thread(target=pipe,args=(c,u),daemon=True).start();threading.Thread(target=pipe,args=(u,c),daemon=True).start()\n';
  if (await available('node')) return (await dockerCommand(['exec', '-d', name, 'node', '-e', node], { timeout: 8000 })).ok;
  if (await available('python3')) return (await dockerCommand(['exec', '-d', name, 'python3', '-c', python], { timeout: 8000 })).ok;
  return false;
}

export async function prepareRuntimeAuth(folder, plan) {
  const variable = plan.authEnv || (plan.voice ? 'OMNIVOICE_API_KEY' : '');
  if (!variable) return {};
  if (!/^[A-Z][A-Z0-9_]+$/.test(variable)) throw new Error('Variável de autenticação inválida.');
  const envFile = path.join(folder, 'runtime.env');
  let key = (await readText(envFile)).match(new RegExp('^' + variable + '=(.+)$', 'm'))?.[1]?.trim();
  key ||= (plan.authPrefix || '') + randomBytes(32).toString('base64url');
  let contents = variable + '=' + key + '\n';
  if (plan.voice) contents += 'OMNIVOICE_ANALYTICS_DISABLED=1\nOMNIVOICE_SERVER_MODE=1\nHF_HOME=/app/omnivoice_data/huggingface\n';
  await fs.writeFile(envFile, contents, { mode: 0o600 });
  return { envFile, key };
}

export async function executeDockerProject(action, directory, project) {
  process.send?.({type:'orbit-progress',label:'Identificando o tipo de projeto e as dependências'});
  const plan = await dockerPlan(directory, project);
  process.send?.({type:'orbit-progress',label:'Verificando e iniciando Docker'});
  await ensureDockerReady();
  const folder = path.resolve(process.env.ORBIT_DOCKER_DIRECTORY || path.join(APP, '.orbit', 'docker', project.id));
  await fs.mkdir(folder, { recursive: true });
  const { envFile, key } = await prepareRuntimeAuth(folder, plan);
  if (plan.dockerfile || plan.existing) {
    const context = plan.managed ? path.join(folder, 'context') : path.join(directory, plan.context || '');
    if (plan.managed) { await fs.mkdir(context, { recursive: true }); await fs.copyFile(path.join(APP, 'lib', 'managed-project.mjs'), path.join(context, 'managed-project.mjs')); }
    let file = plan.existing ? path.join(directory, plan.existing) : path.join(folder, 'Dockerfile');
    if (!plan.existing) { await fs.writeFile(file, plan.dockerfile); await fs.writeFile(file + '.dockerignore', IGNORE); }
    const original = await fs.readFile(file, 'utf8');
    const sourceHash = createHash('sha256').update(original).digest('hex');
    const repairFile = path.join(folder, 'rust-toolchain.json');
    const repairedFile = path.join(folder, 'Dockerfile.rust-repair');
    const useRepair = async repair => {
      await fs.writeFile(repairedFile, repair.dockerfile);
      // Preserve the author's context exclusions when building a derived recipe.
      const ignore = await readText(file + '.dockerignore') || await readText(path.join(context, '.dockerignore')) || IGNORE;
      await fs.writeFile(repairedFile + '.dockerignore', ignore);
      file = repairedFile;
    };
    try {
      const saved = JSON.parse(await fs.readFile(repairFile, 'utf8'));
      if (saved.sourceHash === sourceHash && /^\d+\.\d+\.\d+$/.test(saved.version)) {
        const repair = rustDependencyRepair(original, 'requires rustc ' + saved.version);
        if (repair) await useRepair(repair);
      }
    } catch {}
    plan.image ||= 'orbit-project-' + project.id + ':latest';
    process.send?.({type:'orbit-progress',label:'Compilando imagem e instalando dependências'});
    console.log('Preparando imagem Docker e instalando as dependências…');
    const build = () => shellDocker(['build', '--progress=plain', '-t', plan.image, '-f', file, context]);
    try { await build(); }
    catch (error) {
      const repair = rustDependencyRepair(original, error.output);
      if (!repair) throw error;
      console.log('Uma dependência exige Rust ' + repair.version + '. Instalando o compilador no container e tentando novamente…');
      process.send?.({type:'orbit-progress',label:'Instalando Rust ' + repair.version + ' exigido por uma dependência'});
      await useRepair(repair);
      await build();
      await fs.writeFile(repairFile, JSON.stringify({ sourceHash, version: repair.version }, null, 2));
    }
  } else {
    process.send?.({type:'orbit-progress',label:'Baixando imagem com as dependências'});
    console.log('Baixando imagem oficial com as dependências: ' + plan.image);
    try { await shellDocker(['pull', '--platform', 'linux/amd64', plan.image]); }
    catch (error) { if (!plan.mirror) throw error; console.log('Tentando o espelho oficial…'); plan.image = plan.mirror; await shellDocker(['pull', '--platform', 'linux/amd64', plan.image]); }
  }
  await fs.writeFile(path.join(folder, 'prepared.json'), JSON.stringify({ image: plan.image, port: plan.port, preparedAt: new Date().toISOString() }, null, 2));
  console.log('Imagem preparada. As dependências permanecem dentro do Docker.');
  if (action === 'install') return;
  if(plan.volume)await shellDocker(['volume','create','--label','orbit.managed=true','--label','orbit.project='+project.id,'orbit-data-'+project.id]);
  const name = 'orbit-' + project.id;
  process.send?.({type:'orbit-container-starting'});
  for (let attempt = 0; ; attempt++) {
    process.send?.({type:'orbit-progress',label:'Inicializando aplicativo no Docker'});
    await dockerCommand(['rm', '-f', name]);
    const outcome = await superviseContainer(project, plan, { name, envFile, key, adjust: attempt === 0 });
    if (!outcome.restartOn) return;
    console.log('O app abriu na porta ' + outcome.restartOn + ', não na ' + plan.port + ' esperada. O Orbit vai reiniciá-lo já na porta certa.');
    process.send?.({ type: 'orbit-port', port: outcome.restartOn });
    plan.port = outcome.restartOn;
    await fs.writeFile(path.join(folder, 'prepared.json'), JSON.stringify({ image: plan.image, port: plan.port, preparedAt: new Date().toISOString() }, null, 2));
  }
}

async function superviseContainer(project, plan, { name, envFile, key, adjust }) {
  const child = spawn('docker', containerArguments(project, plan, { name, envFile }), { windowsHide: true, stdio: 'inherit' });
  let ended = false, exitCode = null;
  const closed = new Promise((resolve, reject) => { child.on('error', reject); child.on('close', code => { ended = true; exitCode = code; resolve(); }); });
  closed.catch(() => {});
  let proxy, announced = false, sawListening = false, settled = !plan.port, mismatchSince = 0;
  const started = Date.now();
  try {
    while (!ended) {
      await sleep(Date.now() - started > 120000 ? 5000 : 1500);
      if (ended) break;
      if (!announced) {
        const inspected = await dockerCommand(['inspect', name, '--format', '{{json .NetworkSettings.Ports}}']);
        const published = inspected.ok ? Number(JSON.parse(inspected.output || '{}')?.[plan.port + '/tcp']?.[0]?.HostPort || 0) : 0;
        if ((published && (!plan.readyPath || await httpReady(published, plan.readyPath))) || (inspected.ok && !plan.port)) {
          announced = true;
          let browserPort = published;
          if (key && published) { proxy = await createProxy(published, key); browserPort = proxy.address().port; }
          if (process.send) process.send({ type: 'orbit-running', port: browserPort, image: plan.image });
          else console.log('[orbit:running]' + JSON.stringify({ port: browserPort, image: plan.image }));
          if (browserPort) console.log('Aplicativo: http://127.0.0.1:' + browserPort + ' — use Abrir app. A primeira inicialização pode continuar baixando modelos.');
        }
      }
      if (settled || Date.now() - started > 15 * 60000) continue;
      const ports = await containerPorts(name);
      if (!ports.size) continue;
      sawListening = true;
      const expected = ports.get(plan.port);
      if (expected) {
        settled = true;
        if (!expected.wildcard) {
          const bridged = await bridgeLoopback(name, plan.port);
          console.log(bridged ? 'O app escuta só em localhost dentro do container; o Orbit criou uma ponte para abri-lo no navegador.' : 'Atenção: o app escuta só em localhost dentro do container e não há Node nem Python na imagem para criar uma ponte. Configure o projeto para escutar em 0.0.0.0.');
        }
        continue;
      }
      const other = [...ports.keys()].filter(port => !IGNORED_PORTS.has(port) && port >= 1024).sort((a, b) => a - b)[0];
      if (!other || !adjust) continue;
      mismatchSince ||= Date.now();
      if (Date.now() - mismatchSince >= 6000) { await dockerCommand(['rm', '-f', name]); await closed; return { restartOn: other }; }
    }
    await closed;
  } finally { proxy?.closeAllConnections(); proxy?.close(); }
  const state = await dockerCommand(['inspect', name, '--format', '{{.State.OOMKilled}}|{{.State.ExitCode}}']);
  await dockerCommand(['rm', '-f', name]);
  if (state.ok && state.output.startsWith('true')) throw new Error(OOM_NOTE);
  if (exitCode === 0 && plan.port && !sawListening) throw new Error(SILENT_EXIT_NOTE);
  if (exitCode !== 0) throw new Error('O container encerrou com código ' + exitCode);
  return {};
}

export function httpReady(port, endpoint, accept = status => status >= 200 && status < 300) {
  return new Promise(resolve => {
    const request = http.get({ host: '127.0.0.1', port, path: endpoint, timeout: 1500 }, response => {
      response.resume(); resolve(accept(response.statusCode));
    });
    request.on('timeout', () => { request.destroy(); resolve(false); });
    request.on('error', () => resolve(false));
  });
}

export async function createProxy(targetPort, key) {
  const server = http.createServer((request, response) => {
    if (request.headers['sec-fetch-site'] === 'cross-site') { response.writeHead(403); response.end(); return; }
    const currentPort = server.address().port;
    if (request.headers.origin && !['http://127.0.0.1:' + currentPort, 'http://localhost:' + currentPort].includes(request.headers.origin)) { response.writeHead(403); response.end(); return; }
    if (!['127.0.0.1:' + currentPort, 'localhost:' + currentPort].includes(request.headers.host)) { response.writeHead(403); response.end(); return; }
    const headers = { ...request.headers, host: '127.0.0.1:' + targetPort, authorization: 'Bearer ' + key };
    if (headers.origin) headers.origin = 'http://127.0.0.1:' + targetPort;
    const upstream = http.request({ host: '127.0.0.1', port: targetPort, method: request.method, path: request.url, headers }, received => {
      response.writeHead(received.statusCode, received.headers); received.pipe(response);
    });
    upstream.on('error', () => { if (!response.headersSent) response.writeHead(502); response.end('Aplicativo iniciando. Aguarde e atualize esta página.'); });
    request.pipe(upstream);
  });
  server.on('upgrade', (request, socket, head) => {
    const ownPort = server.address().port;
    const origins = ['http://127.0.0.1:' + ownPort, 'http://localhost:' + ownPort];
    if (!['127.0.0.1:' + ownPort, 'localhost:' + ownPort].includes(request.headers.host) || (request.headers.origin && !origins.includes(request.headers.origin)) || request.headers['sec-fetch-site'] === 'cross-site') { socket.destroy(); return; }
    const headers = { ...request.headers, host: '127.0.0.1:' + targetPort, authorization: 'Bearer ' + key };
    if (headers.origin) headers.origin = 'http://127.0.0.1:' + targetPort;
    const upstream = http.request({ host: '127.0.0.1', port: targetPort, method: 'GET', path: request.url, headers });
    upstream.on('upgrade', (received, remote, receivedHead) => {
      socket.write('HTTP/1.1 101 Switching Protocols\r\n' + Object.entries(received.headers).map(([key, value]) => key + ': ' + value).join('\r\n') + '\r\n\r\n');
      if (head.length) remote.write(head); if (receivedHead.length) socket.write(receivedHead);
      socket.pipe(remote); remote.pipe(socket);
      socket.on('error', () => remote.destroy()); remote.on('error', () => socket.destroy());
    });
    upstream.on('response', () => socket.destroy()); upstream.on('error', () => socket.destroy()); upstream.end();
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  return server;
}
if (process.argv[1] && path.resolve(process.argv[1]) === SELF) {
  try { await executeDockerProject(process.argv[2], process.cwd(), JSON.parse(process.env.ORBIT_PROJECT || '{}')); }
  catch (error) { console.error(error.message); process.exitCode = 1; }
}
