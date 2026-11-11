import { promises as fs, createReadStream, createWriteStream } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { createHash } from 'node:crypto';
import { extract } from './managed-project.mjs';

const SELF = fileURLToPath(import.meta.url);
const APP = path.dirname(path.dirname(SELF));
const TOOLS = path.resolve(process.env.ORBIT_DATA || path.join(APP,'.orbit'),'tools');
const quote = text => '"' + String(text).replace(/"/g, '') + '"';
const read = (directory, file) => fs.readFile(path.join(directory, file), 'utf8').catch(() => '');
const tool = (id, version, bin = id, args = ['--version']) => ({ id, version, bin, args });
const safeVersion = (value, fallback) => /^[\d]+(?:\.[\d]+){0,3}$/.test(String(value).trim()) ? String(value).trim() : fallback;
export function normalizedEnv(env) {
  const out = { ...env };
  if (process.platform === 'win32') {
    const value = Object.entries(out).find(([key]) => key === 'PATH')?.[1] || Object.entries(out).find(([key]) => key.toLowerCase() === 'path')?.[1] || '';
    for (const key of Object.keys(out)) if (key.toLowerCase() === 'path') delete out[key];
    out.PATH = value;
  }
  return out;
}
function command(bin, args, { env = process.env, cwd, capture = false, shell = false } = {}) {
  return new Promise((resolve, reject) => {
    const extension = process.platform === 'win32' && /^(npm|pnpm|yarn|corepack|mvn|gradle|composer|bundle)$/.test(bin);
    const child = spawn(extension ? bin + '.cmd' : bin, args, { env: normalizedEnv(env), cwd, shell: shell || extension, windowsHide: true, stdio: capture ? ['ignore', 'pipe', 'pipe'] : 'inherit' });
    let stdout = '', stderr = '';
    child.stdout?.on('data', data => { stdout = (stdout + data).slice(-2 * 1024 * 1024); });
    child.stderr?.on('data', data => { stderr = (stderr + data).slice(-12000); });
    child.on('error', reject);
    child.on('close', code => code === 0 ? resolve((stdout || stderr).trim()) : reject(Object.assign(new Error((stderr || 'O comando ' + bin + ' terminou com código ' + code).trim()), { code })));
  });
}
export async function dependencyPlan(directory) {
  const names = await fs.readdir(directory);
  const has = name => names.includes(name);
  const tools = [], steps = [], warnings = [];
  let kind = 'custom', python = false, cxx = false;
  if (has('package.json')) {
    kind = 'node';
    const pkg = JSON.parse(await read(directory, 'package.json'));
    const explicit = (await read(directory, '.nvmrc') || await read(directory, '.node-version')).trim().replace(/^v/, '');
    const requested = safeVersion(explicit, String(pkg.engines?.node || '').match(/\d+/)?.[0] || '22');
    tools.push({ ...tool('node', requested), minimum: !explicit });
    const manager = pkg.packageManager?.split('@')[0] || (has('pnpm-lock.yaml') ? 'pnpm' : has('yarn.lock') ? 'yarn' : has('bun.lock') || has('bun.lockb') ? 'bun' : 'npm');
    if (!['npm', 'pnpm', 'yarn', 'bun'].includes(manager)) throw new Error('Gerenciador packageManager não reconhecido.');
    if (manager !== 'npm') tools.push(tool(manager, safeVersion(pkg.packageManager?.split('@')[1], manager === 'yarn' ? '1' : 'latest')));
    steps.push(manager === 'npm' && has('package-lock.json') ? 'npm ci' : manager + ' install');
  } else if (has('pyproject.toml') || has('requirements.txt') || names.some(name => name.endsWith('.py'))) {
    kind = 'python'; python = true;
    const pyproject = await read(directory, 'pyproject.toml');
    const version = safeVersion((await read(directory, '.python-version')).trim(), '3.' + (pyproject.match(/requires-python\s*=\s*["'][^"']*>=\s*3\.(\d+)/)?.[1] || '12'));
    tools.push(tool('python', version, process.platform === 'win32' ? 'python' : 'python3'));
    if (has('uv.lock')) { tools.push(tool('uv', 'latest')); steps.push('uv sync'); }
    else if (has('poetry.lock')) { tools.push(tool('poetry', 'latest')); steps.push('poetry install'); }
    else if (has('requirements.txt')) steps.push('python -m pip install -r requirements.txt');
    else if (has('pyproject.toml')) steps.push('python -m pip install .');
  } else if (has('Cargo.toml')) {
    kind = 'rust'; tools.push(tool('rust', 'stable', 'cargo')); steps.push('cargo fetch');
    if (process.platform === 'win32') warnings.push('Crates com código nativo podem exigir as ferramentas C++ do Visual Studio.');
  } else if (has('go.mod')) {
    kind = 'go'; const version = (await read(directory, 'go.mod')).match(/^go\s+([\d.]+)/m)?.[1] || '1';
    tools.push(tool('go', version, 'go', ['version'])); steps.push('go mod download');
  } else if (has('pom.xml') || has('build.gradle') || has('build.gradle.kts')) {
    kind = 'java'; tools.push(tool('java', '21', 'java', ['-version']));
    const maven = has('pom.xml'); tools.push(tool(maven ? 'maven' : 'gradle', maven ? '3' : '8', maven ? 'mvn' : 'gradle', ['--version']));
    steps.push(maven ? 'mvn -B package -DskipTests' : 'gradle assemble');
  } else if (names.some(name => /\.(csproj|fsproj|sln)$/.test(name))) {
    kind = 'dotnet';
    let version = '8'; try { version = safeVersion(JSON.parse(await read(directory, 'global.json')).sdk?.version, '8'); } catch {}
    tools.push(tool('dotnet', version)); steps.push('dotnet restore');
  } else if (has('composer.json') || has('index.php')) {
    kind = 'php'; tools.push(tool('php', '8.3'));
    if (has('composer.json')) { tools.push(tool('composer', '2')); steps.push('composer install --no-interaction'); }
  } else if (has('Gemfile')) {
    kind = 'ruby'; tools.push(tool('ruby', safeVersion((await read(directory, '.ruby-version')).trim(), '3.3')));
    steps.push('gem install bundler --no-document', 'bundle config set --local path vendor/bundle && bundle install');
  } else if (has('CMakeLists.txt')) {
    kind = 'cmake'; cxx = true;
    const minimum = (await read(directory, 'CMakeLists.txt')).match(/cmake_minimum_required\s*\(\s*VERSION\s+(\d+)/i)?.[1] || '3';
    tools.push(tool('cmake', minimum), tool('ninja', 'latest'));
    steps.push('cmake -S . -B build -G Ninja -DCMAKE_BUILD_TYPE=Release', 'cmake --build build --parallel 2');
  }
  for (const name of ['.env.example', '.env.sample', '.env.template']) {
    const template = await read(directory, name);
    const keys = template.split(/\r?\n/).filter(line => /^\s*[A-Z][A-Z0-9_]*\s*=\s*(?:["']?["']?\s*|(?:your|changeme|replace).*)$/i.test(line)).map(line => line.split('=')[0].trim());
    if (keys.length && !has('.env')) warnings.push('Confira as variáveis de ' + name + ': ' + keys.slice(0, 20).join(', ') + '. O Orbit não inventa credenciais.');
  }
  return { kind, tools, steps, warnings, python, cxx, submodules: has('.gitmodules') };
}

async function release(repo, suffix = 'latest') {
  const response = await fetch('https://api.github.com/repos/' + repo + '/releases/' + suffix, { headers: { 'User-Agent': 'Orbit', ...(process.env.GITHUB_TOKEN ? { Authorization: 'Bearer ' + process.env.GITHUB_TOKEN } : {}) }, signal: AbortSignal.timeout(30000) });
  if (!response.ok) throw new Error('Não foi possível consultar ' + repo + ' (HTTP ' + response.status + ').');
  return response.json();
}
async function getAsset(repo, data, asset, target) {
  if (!asset?.browser_download_url?.startsWith('https://github.com/' + repo + '/releases/download/' + data.tag_name + '/') || !/^sha256:[a-f0-9]{64}$/.test(asset.digest || '')) throw new Error('Pacote de ferramenta sem origem ou hash verificável.');
  await fs.mkdir(path.dirname(target), { recursive: true });
  console.log('Baixando ferramenta: ' + asset.name + ' (' + Math.round(asset.size / 1024 / 1024) + ' MB)');
  const response = await fetch(asset.browser_download_url, { signal: AbortSignal.timeout(15 * 60 * 1000) });
  if (!response.ok) throw new Error('Falha no download: HTTP ' + response.status);
  const hash = createHash('sha256');
  let bytes = 0;
  const stream = Readable.fromWeb(response.body);
  stream.on('data', chunk => { bytes += chunk.length; hash.update(chunk); if (bytes > asset.size) stream.destroy(new Error('Tamanho do pacote inválido.')); });
  await pipeline(stream, createWriteStream(target));
  if (bytes !== asset.size || 'sha256:' + hash.digest('hex') !== asset.digest) throw new Error('A verificação do pacote falhou.');
}
function miseEnv() {
  return normalizedEnv({ ...process.env, MISE_DATA_DIR: path.join(TOOLS, 'mise-data'), MISE_CACHE_DIR: path.toNamespacedPath(path.join(TOOLS, 'c')), MISE_CONFIG_DIR: path.join(TOOLS, 'mise-config'), MISE_STATE_DIR: path.join(TOOLS, 'mise-state'), MISE_IGNORED_CONFIG_PATHS: '**', MISE_YES: '1', MISE_COLOR: '0', MISE_PYTHON_COMPILE: '0', MISE_AUTO_INSTALL: '0', MISE_INSTALL_LAYOUT: 'legacy', CARGO_HOME: path.join(TOOLS, 'cargo'), RUSTUP_HOME: path.join(TOOLS, 'rustup'), DOTNET_CLI_HOME: path.join(TOOLS, 'dotnet-home') });
}
export async function ensureMise() {
  const known = path.join(TOOLS, 'mise-path.json');
  try { const bin = JSON.parse(await fs.readFile(known, 'utf8')).bin; await fs.access(bin); return bin; } catch {}
  const data = await release('jdx/mise');
  const platform = { win32: 'windows', darwin: 'macos', linux: 'linux' }[process.platform];
  const arch = { x64: 'x64', arm64: 'arm64' }[process.arch];
  if (!platform || !arch) throw new Error('Esta plataforma não tem um instalador automático disponível.');
  const extension = process.platform === 'win32' ? '.zip' : '.tar.gz';
  const name = 'mise-' + data.tag_name + '-' + platform + '-' + arch + extension;
  const asset = data.assets.find(item => item.name === name);
  const directory = path.join(TOOLS, 'bootstrap-' + process.pid + '-' + Date.now());
  const archive = path.join(directory, name);
  await getAsset('jdx/mise', data, asset, archive);
  const destination = path.join(directory, 'unpacked');
  if (extension === '.zip') await extract(archive, destination);
  else { await fs.mkdir(destination, { recursive: true }); await command('tar', ['-xzf', archive, '-C', destination]); }
  const bin = path.join(destination, 'mise', 'bin', process.platform === 'win32' ? 'mise.exe' : 'mise');
  await command(bin, ['--version'], { capture: true });
  await fs.writeFile(known, JSON.stringify({ bin, tag: data.tag_name }));
  return bin;
}
async function prepareCompiler(env) {
  for (const bin of ['g++', 'clang++']) try { await command(bin, ['--version'], { env, capture: true }); return env; } catch {}
  if (process.platform !== 'win32' || process.arch !== 'x64') throw new Error('Nenhum compilador C++ foi encontrado. Instale GCC/Clang ou use um perfil Docker com as bibliotecas de sistema deste projeto.');
  console.log('C++ não encontrado. Preparando WinLibs GCC para Windows.');
  const known = path.join(TOOLS, 'winlibs-path.json');
  let bin;
  try { bin = JSON.parse(await fs.readFile(known, 'utf8')).bin; await fs.access(path.join(bin, 'g++.exe')); } catch {
    const data = await release('brechtsanders/winlibs_mingw', 'tags/15.2.0posix-14.0.0-ucrt-r7');
    const asset = data.assets.find(item => /x86_64-posix-seh-gcc-15\.2\.0-.*ucrt.*\.zip$/.test(item.name) && !/llvm/i.test(item.name));
    const directory = path.join(TOOLS, 'winlibs-15.2.0');
    const archive = path.join(directory, 'winlibs.zip');
    await getAsset('brechtsanders/winlibs_mingw', data, asset, archive);
    await extract(archive, directory);
    bin = path.join(directory, 'mingw64', 'bin');
    await fs.writeFile(known, JSON.stringify({ bin }));
  }
  await command(path.join(bin, 'g++.exe'), ['--version'], { capture: true });
  return normalizedEnv({ ...env, PATH: env.PATH + path.delimiter + bin });
}

export async function projectEnvironment(directory, base = process.env) {
  let saved = {};
  try { saved = JSON.parse(await fs.readFile(path.join(directory, '.orbit-environment.json'), 'utf8')).env || {}; } catch {}
  const env = normalizedEnv({ ...base, ...saved });
  for (const bin of [path.join(directory, '.orbit-venv', process.platform === 'win32' ? 'Scripts' : 'bin'), path.join(directory, '.venv', process.platform === 'win32' ? 'Scripts' : 'bin'), path.join(directory, '.orbit-packages', process.platform === 'win32' ? 'Scripts' : 'bin')]) {
    try { await fs.access(bin); env.PATH = bin + path.delimiter + env.PATH; } catch {}
  }
  return env;
}
export async function prepareProject(directory, customCommand = '') {
  const report = { status: 'preparing', stage: 'detect', tools: [], warnings: [], env: {}, at: new Date().toISOString() };
  const reportFile = path.join(directory, '.orbit-environment.json');
  try {
    const plan = await dependencyPlan(directory);
    console.log('Preparando dependências do projeto: ' + plan.kind);
    report.warnings = plan.warnings;
    let env = normalizedEnv(process.env);
    const managed = [];
    report.stage = 'runtimes';
    for (const requirement of plan.tools) {
      let available = false;
      try {
        const output = await command(requirement.bin, requirement.args, { env, capture: true });
        const wanted = requirement.version.split('.').map(Number);
        const actual = (output.match(/\d+(?:\.\d+)*/)?.[0] || '').split('.').map(Number);
        const prefix = wanted.every((part, i) => part === actual[i]);
        const compared = wanted.map((part, i) => (actual[i] || 0) - part).find(value => value !== 0) || 0;
        available = requirement.version === 'latest' || requirement.version === 'stable' || (requirement.minimum ? compared >= 0 : prefix);
        if (available) console.log('Disponível: ' + requirement.id + ' — ' + output.split('\n')[0].slice(0, 100));
      } catch {}
      if (!available) {
        console.log('Instalando ambiente ausente/compatível: ' + requirement.id + '@' + requirement.version);
        const mise = await ensureMise();
        const spec = requirement.id + '@' + requirement.version;
        await command(mise, ['--yes', 'install', spec], { cwd: TOOLS, env: miseEnv() });
        managed.push(spec);
        const values = JSON.parse(await command(mise, ['env', '--json', ...managed], { cwd: TOOLS, env: miseEnv(), capture: true }));
        const allowed = {};
        for (const [key, value] of Object.entries(values)) if (/^(PATH|GOROOT|JAVA_HOME|DOTNET_ROOT|CARGO_HOME|RUSTUP_HOME)$/.test(key)) allowed[key] = value;
        env = normalizedEnv({ ...env, ...allowed });
        await command(requirement.bin, requirement.args, { env, capture: true });
      }
      report.tools.push({ ...requirement, ready: true });
    }
    if (plan.cxx) env = await prepareCompiler(env);
    if (plan.python && !plan.tools.some(item => ['uv', 'poetry'].includes(item.id))) {
      const venv = path.join(directory, '.orbit-venv');
      const interpreter = process.platform === 'win32' ? 'python' : 'python3';
      try { await fs.access(path.join(venv, process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python')); }
      catch { console.log('Criando ambiente Python do projeto…'); await command(interpreter, ['-m', 'venv', venv], { cwd: directory, env }); }
      env.PATH = path.join(venv, process.platform === 'win32' ? 'Scripts' : 'bin') + path.delimiter + env.PATH;
    }
    report.env = Object.fromEntries(Object.entries(env).filter(([key]) => /^(PATH|GOROOT|JAVA_HOME|DOTNET_ROOT|CARGO_HOME|RUSTUP_HOME)$/.test(key)));
    await fs.writeFile(reportFile, JSON.stringify(report, null, 2));
    report.stage = 'submodules';
    if (plan.submodules) { console.log('Baixando submódulos necessários…'); await command('git', ['-c', 'credential.helper=', '-c', 'protocol.file.allow=never', 'submodule', 'update', '--init', '--recursive', '--depth', '1'], { cwd: directory, env: { ...env, GIT_TERMINAL_PROMPT: '0', GIT_ALLOW_PROTOCOL: 'https' } }); }
    report.stage = 'packages';
    const steps = customCommand.trim() ? [customCommand] : plan.steps;
    if (!steps.length && plan.kind === 'custom') throw new Error('Não há um manifesto ou comando de instalação reconhecido. Configure o comando indicado pelo README.');
    if (plan.cxx) { await fs.mkdir(path.join(directory, 'build', '.cmake', 'api', 'v1', 'query'), { recursive: true }); await fs.writeFile(path.join(directory, 'build', '.cmake', 'api', 'v1', 'query', 'codemodel-v2'), ''); }
    for (const step of steps) {
      console.log('Instalando pacotes: ' + step);
      await command(step, [], { cwd: directory, env: { ...env, PIP_DISABLE_PIP_VERSION_CHECK: '1', PIP_NO_INPUT: '1', POETRY_VIRTUALENVS_IN_PROJECT: 'true', PIP_CACHE_DIR: path.join(TOOLS, 'pip-cache'), npm_config_cache: path.join(TOOLS, 'npm-cache') }, shell: true });
    }
    for (const warning of report.warnings) console.log('Atenção: ' + warning);
    if (plan.cxx) {
      const reply = path.join(directory, 'build', '.cmake', 'api', 'v1', 'reply');
      const executables = [];
      for (const name of await fs.readdir(reply).catch(() => [])) {
        if (!/^target-.*\.json$/.test(name)) continue;
        const target = JSON.parse(await fs.readFile(path.join(reply, name), 'utf8'));
        if (target.type === 'EXECUTABLE' && !/test/i.test(target.name)) for (const item of target.artifacts || []) {
          const file = path.resolve(directory, 'build', item.path);
          if (file.startsWith(path.resolve(directory, 'build') + path.sep)) try { await fs.access(file); executables.push(file); } catch {}
        }
      }
      if (new Set(executables).size === 1) report.command = quote(executables[0]);
    }
    report.status = 'ready'; report.stage = 'complete';
    await fs.writeFile(reportFile, JSON.stringify(report, null, 2));
    console.log('Ambiente e dependências preparados. Os detalhes estão em .orbit-environment.json.');
    return report;
  } catch (error) {
    report.status = 'error'; report.error = error.message;
    await fs.writeFile(reportFile, JSON.stringify(report, null, 2)).catch(() => {});
    throw new Error('Preparação interrompida na etapa ' + report.stage + ': ' + error.message);
  }
}
if (process.argv[1] && path.resolve(process.argv[1]) === SELF) {
  try { await prepareProject(process.cwd(), process.env.ORBIT_INSTALL_COMMAND || ''); }
  catch (error) { console.error(error.message); process.exitCode = 1; }
}
