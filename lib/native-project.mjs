// Execução fora do navegador: programas nativos, ferramentas de terminal, servidores MCP e apps Android.
// Roda como processo filho do Orbit, direto no Windows (sem Docker), depois de a pessoa confirmar.
import { promises as fs, createReadStream, createWriteStream } from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { pipeline } from 'node:stream/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { classifyProject, pickNodeScript } from './classify.mjs';
import { prepareProject, projectEnvironment } from './prepare.mjs';
import { superviseNative } from './native-supervisor.mjs';
import { safePath } from './runner.mjs';
import { openWindowsInstaller } from './desktop-integration.mjs';

const SELF = fileURLToPath(import.meta.url);
const APP = path.dirname(path.dirname(SELF));
const WINDOWS = process.platform === 'win32';
const say = label => { console.log(label); process.send?.({ type: 'orbit-progress', label: label.replace(/[.…]+$/, '') }); };
const opened = (surface, detail = '') => process.send?.({ type: 'orbit-opened', surface, detail });
const downloadedRelease = release => process.send?.({ type: 'orbit-release', release: { id: release.id, tag: release.tag_name, publishedAt: release.published_at, prerelease: release.prerelease } });
const cachedRelease = release => process.send?.({ type: 'orbit-release-cached', release: { id: release.id, tag: release.tag_name, publishedAt: release.published_at, prerelease: release.prerelease } });

// ── Escolha do arquivo certo na página de Releases ───────────────────
const NOT_PROGRAM = /\.(?:sig|asc|sha\d*|sha\d*sum|md5|blockmap|txt|json|ya?ml|pdb|dbg|sym|map)$/i;
const OTHER_SYSTEM = /(?:^|[-_.\s(])(?:mac|macos|darwin|osx|apple|linux|ubuntu|debian|fedora|android|ios|freebsd|source|src|symbols|debug)(?=[-_.\s)]|$)/i;
export function scoreWindowsAsset(name, arch = process.arch === 'arm64' ? 'arm64' : 'x64') {
  const n = String(name).toLowerCase();
  if (NOT_PROGRAM.test(n) || OTHER_SYSTEM.test(n) || !/\.(?:zip|7z|exe|msi)$/.test(n)) return -1;
  if (!/win(?:dows|64|32)?(?![a-z])|\.exe$|\.msi$/.test(n)) return -1;
  if (arch === 'x64' ? /arm64|aarch64|armv7|arm32/.test(n) : /x86_64|amd64|x64|win64/.test(n)) return -1;
  let score = 50;
  if (arch === 'x64' && /x64|x86_64|amd64|win64/.test(n)) score += 15;
  if (/x86(?!_64)|win32|i686|ia32/.test(n) && arch === 'x64') score -= 10;
  if (/portable/.test(n)) score += 12;
  score += /\.(?:zip|7z)$/.test(n) ? 8 : /\.exe$/.test(n) ? 6 : 4;
  if (/setup|installer|install/.test(n)) score -= 3;
  return score;
}
export function scoreAndroidAsset(name) {
  const n = String(name).toLowerCase();
  if (!n.endsWith('.apk')) return -1;
  return 50 + (/universal/.test(n) ? 10 : 0) + (/arm64|v8a/.test(n) ? 5 : 0) + (/release/.test(n) ? 3 : 0) - (/debug/.test(n) ? 5 : 0);
}
export function scorePortableWindowsAsset(name) {
  return /\.(?:zip|7z|exe)$/i.test(name) && !/(?:setup|installer|uninstall)/i.test(name) && scoreWindowsInstaller(name) < 0
    ? scoreWindowsAsset(name) : -1;
}
export function scoreWindowsInstaller(name) {
  if (/uninstall|unins\d/i.test(name)) return -1;
  return /\.msi$/i.test(name) || (/\.exe$/i.test(name) && /setup|installer|(?:^|[-_.])install(?:[-_.]|$)/i.test(name))
    ? scoreWindowsAsset(name) : -1;
}
// Prefere versões estáveis; usa pré-lançamentos (alfa, beta) só quando são as únicas com o arquivo certo.
export function pickReleaseAsset(releases, score) {
  const usable = (releases || []).filter(release => !release.draft);
  for (const pool of [usable.filter(release => !release.prerelease), usable.filter(release => release.prerelease)]) {
    for (const release of pool) {
      const best = (release.assets || []).map(asset => ({ asset, score: score(asset.name) })).filter(item => item.score > 0).sort((a, b) => b.score - a.score)[0];
      if (best) return { release, asset: best.asset };
    }
  }
  return null;
}
// Para projetos de outras plataformas (console, Linux, Mac): o arquivo principal da versão mais recente.
export function pickAnyAsset(releases) {
  const release = (releases || []).find(item => !item.draft && item.assets?.length);
  if (!release) return null;
  const asset = release.assets.filter(item => !NOT_PROGRAM.test(item.name)).sort((a, b) => b.size - a.size)[0];
  return asset ? { release, asset } : null;
}
// Escolhe o executável principal de uma pasta extraída: nome parecido com o do projeto, mais raso, maior.
const HELPER_EXE = /unins|uninstall|updater?\b|update\.exe|crash|helper|elevate|vc_?redist|dxsetup|squirrel|notif|setup|install|createdump|7z|unzip/i;
const mainExecutable = (base, name) => /\.exe$/i.test(base) && (!HELPER_EXE.test(base) || base.toLowerCase() === name?.toLowerCase() + '.exe');
export function rankExecutables(files, projectName = '') {
  const tokens = String(projectName).toLowerCase().split(/[^a-z0-9]+/).filter(token => token.length > 2);
  const score = file => {
    const base = path.basename(file.path).toLowerCase();
    let value = Math.log10(Math.max(file.size, 1)) * 3 - file.depth * 6;
    for (const token of tokens) if (base.includes(token)) value += 30;
    if (HELPER_EXE.test(base)) value -= 60;
    if (/launcher/.test(base)) value += 8;
    return value;
  };
  return [...files].sort((a, b) => score(b) - score(a));
}
// Lê o cabeçalho PE do .exe: 2 = programa com janela, 3 = programa de terminal.
export function peSubsystem(buffer) {
  if (buffer.length < 0x40 || buffer.toString('latin1', 0, 2) !== 'MZ') return 0;
  const offset = buffer.readUInt32LE(0x3c);
  if (offset + 0x5e > buffer.length || buffer.toString('latin1', offset, offset + 4) !== 'PE\0\0') return 0;
  return buffer.readUInt16LE(offset + 24 + 68);
}
// Comando para iniciar um servidor MCP, a partir do server.json (registro oficial) ou do package.json.
export async function mcpLaunch(directory) {
  let manifest = {};
  try { manifest = JSON.parse(await fs.readFile(path.join(directory, 'server.json'), 'utf8')); } catch {}
  const name = String(manifest.title || manifest.name || path.basename(directory)).split('/').pop().toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '') || 'mcp';
  const positional = item => (item.packageArguments || []).filter(arg => arg.type === 'positional' && arg.value).map(arg => String(arg.value));
  for (const item of manifest.packages || []) {
    const version = item.version ? '@' + item.version : '';
    if (item.registryType === 'npm') return { name, command: 'npx', args: ['-y', item.identifier + version, ...positional(item)], source: 'npm' };
    if (item.registryType === 'pypi') return { name, command: 'uvx', args: [item.identifier + (item.version ? '==' + item.version : ''), ...positional(item)], source: 'pypi' };
    if (item.registryType === 'oci') return { name, command: 'docker', args: ['run', '-i', '--rm', item.identifier + (item.version ? ':' + item.version : ''), ...positional(item)], source: 'docker' };
  }
  try {
    const pkg = JSON.parse(await fs.readFile(path.join(directory, 'package.json'), 'utf8'));
    const label = pkg.name?.split('/').pop() || name;
    const bin = typeof pkg.bin === 'string' ? pkg.bin : pkg.bin && Object.values(pkg.bin)[0];
    if (bin) return { name: label, command: 'node', args: [path.join(directory, bin)], source: 'local' };
    const script = pickNodeScript(pkg);
    if (script) return { name: label, command: 'npm', args: ['--prefix', directory, 'run', script, '--silent'], source: 'local' };
  } catch {}
  for (const entry of ['server.py', 'main.py', 'mcp_server.py', 'app.py']) {
    try { await fs.access(path.join(directory, entry)); return { name, command: path.join(directory, '.orbit-venv', 'Scripts', 'python.exe'), args: [path.join(directory, entry)], source: 'local-python' }; } catch {}
  }
  return null;
}
// Escapa um texto para o comando echo de um .cmd.
const cmdEcho = line => line ? 'echo ' + String(line).replace(/[\^&|<>]/g, '^$&').replace(/%/g, '%%') : 'echo.';
export function terminalScript({ title, cwd, pathDirs = [], aliases = {}, lines = [], run = '' }) {
  return ['@echo off', 'chcp 65001 >nul', 'title ' + String(title).replace(/[\^&|<>%]/g, ''), 'cd /d "' + cwd + '"',
    ...(pathDirs.length ? ['set "PATH=' + pathDirs.join(';') + ';%PATH%"'] : []),
    ...Object.entries(aliases).map(([alias, target]) => 'doskey ' + alias + '=' + target + ' $*'),
    ...lines.map(cmdEcho), 'echo.', ...(run ? [run] : [])].join('\r\n') + '\r\n';
}

// ── Ações no Windows ────────────────────────────────────────────────
function run(command, { cwd, env } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, { cwd, env: { ...process.env, ...env }, shell: true, windowsHide: true, stdio: 'inherit' });
    child.on('error', reject);
    child.on('close', code => code === 0 ? resolve() : reject(new Error('O comando "' + command.slice(0, 120) + '" terminou com código ' + code + '.')));
  });
}
function quiet(executable, args = [], options = {}) {
  return new Promise(resolve => {
    let output = '';
    const child = spawn(executable, args, { windowsHide: true, ...options });
    const timer = setTimeout(() => child.kill(), options.timeout || 15000);
    child.stdout?.on('data', data => { output += data; }); child.stderr?.on('data', data => { output += data; });
    child.on('error', () => { clearTimeout(timer); resolve({ ok: false, output }); });
    child.on('close', code => { clearTimeout(timer); resolve({ ok: code === 0, output: output.trim() }); });
  });
}
export async function hasTool(name) { return (await quiet(WINDOWS ? 'where' : 'which', [name])).ok; }
async function walk(directory, depth = 0, found = []) {
  let entries; try { entries = await fs.readdir(directory, { withFileTypes: true }); } catch { return found; }
  for (const entry of entries) {
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) { if (depth < 7 && !['node_modules', '.git', '.orbit-venv', '.venv'].includes(entry.name)) await walk(full, depth + 1, found); }
    else if (/\.exe$/i.test(entry.name)) { const stat = await fs.stat(full).catch(() => null); if (stat) found.push({ path: full, size: stat.size, depth }); }
  }
  return found;
}
export async function installedWindowsExecutable(project, nativeDirectory) {
  const tag = project.installedRelease?.tag;
  if (typeof tag !== 'string' || !tag || project.externalInstaller) return null;
  const name = tag.replace(/[^\w.-]/g, '_');
  if (name === '.' || name === '..') return null;
  const root = await fs.realpath(nativeDirectory).catch(() => null);
  if (!root) return null;
  const release = await safePath(root, name).catch(() => null);
  if (release !== path.join(root, name)) return null;
  const candidates = await walk(path.join(release, 'app'));
  for (const entry of await fs.readdir(release, { withFileTypes: true }).catch(() => [])) {
    if (entry.isFile() && scorePortableWindowsAsset(entry.name) > 0 && /\.exe$/i.test(entry.name)) {
      candidates.push({ path: path.join(release, entry.name), size: 1, depth: 0 });
    }
  }
  return findWindowsExecutable(release, candidates, project.name);
}
async function findWindowsExecutable(root, candidates, name, verifyPE = false) {
  for (const candidate of rankExecutables(candidates, name)) {
    const base = path.basename(candidate.path);
    if (!mainExecutable(base, name)) continue;
    const file = await safePath(root, path.relative(root, candidate.path)).catch(() => null);
    if (file !== candidate.path) continue;
    const stat = await fs.stat(file).catch(() => null);
    if (stat?.isFile() && stat.size && (!verifyPE || [2,3].includes(await subsystemOf(file).catch(() => 0)))) return file;
  }
  return null;
}
async function subsystemOf(file) { const handle = await fs.open(file, 'r'); try { const buffer = Buffer.alloc(4096); await handle.read(buffer, 0, 4096, 0); return peSubsystem(buffer); } finally { await handle.close(); } }
async function github(endpoint) {
  const response = await fetch('https://api.github.com/' + endpoint, { headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'Orbit-Local', ...(process.env.GITHUB_TOKEN ? { Authorization: 'Bearer ' + process.env.GITHUB_TOKEN } : {}) }, signal: AbortSignal.timeout(20000) });
  if (response.status === 404) return [];
  if (!response.ok) throw new Error(response.status === 403 || response.status === 429 ? 'Limite do GitHub atingido. Aguarde alguns minutos e tente de novo.' : 'O GitHub respondeu ' + response.status + ' ao listar as versões.');
  return response.json();
}
async function download(asset, folder) {
  if (!asset.name || /[\\/:]/.test(asset.name) || /^\.{1,2}$/.test(asset.name)) throw new Error('O nome do pacote é inválido.');
  await fs.mkdir(folder, { recursive: true });
  const file = path.join(folder, asset.name);
  const digest = /^sha256:([a-f\d]{64})$/i.exec(asset.digest || '')?.[1]?.toLowerCase();
  const valid = async target => {
    const stat = await fs.lstat(target).catch(() => null);
    if (!stat?.isFile() || !stat.size || (asset.size && stat.size !== asset.size)) return false;
    if (!digest) return true;
    const hash = createHash('sha256');
    for await (const chunk of createReadStream(target)) hash.update(chunk);
    return hash.digest('hex') === digest;
  };
  if (await valid(file)) { say('Arquivo já baixado: ' + asset.name); return file; }
  const response = await fetch(asset.browser_download_url, { headers: { 'User-Agent': 'Orbit-Local' }, redirect: 'follow' });
  if (!response.ok || !response.body) throw new Error('Não foi possível baixar ' + asset.name + ' (HTTP ' + response.status + ').');
  const total = Number(response.headers.get('content-length') || asset.size || 0);
  const stage = await fs.mkdtemp(path.join(folder, '.download-'));
  const temporary = path.join(stage, asset.name);
  let received = 0, last = 0;
  try {
    await pipeline(response.body, async function* (chunks) {
      for await (const chunk of chunks) {
        received += chunk.length;
        if (Date.now() - last > 1500) {
          last = Date.now();
          say('Baixando ' + asset.name + ': ' + (total ? Math.round(received / total * 100) + '%' : Math.round(received / 1e6) + ' MB'));
        }
        yield chunk;
      }
    }, createWriteStream(temporary, {flags:'wx'}));
    if (!await valid(temporary)) throw new Error('O pacote baixado está incompleto ou não corresponde ao arquivo publicado.');
    await fs.rename(temporary, file);
  } finally { await fs.rm(stage,{recursive:true,force:true}); }
  say('Download concluído: ' + asset.name);
  return file;
}
async function extract(file, destination) {
  await fs.mkdir(destination, { recursive: true });
  say('Extraindo ' + path.basename(file));
  if ((await quiet('tar', ['-xf', file, '-C', destination], { timeout: 600000 })).ok) return;
  if (/\.zip$/i.test(file) && WINDOWS && (await quiet('powershell', ['-NoProfile', '-Command', "Expand-Archive -LiteralPath '" + file.replace(/'/g, "''") + "' -DestinationPath '" + destination.replace(/'/g, "''") + "' -Force"], { timeout: 600000 })).ok) return;
  throw new Error('Não foi possível extrair ' + path.basename(file) + '.');
}
async function prepareArchive(file, target, name) {
  const extracted = path.join(target, 'app');
  const existing = await findWindowsExecutable(target, await walk(extracted), name, true);
  if (existing) return existing;
  const staging = await fs.mkdtemp(path.join(target, '.extract-'));
  try {
    await extract(file, staging);
    const executable = await findWindowsExecutable(staging, await walk(staging), name, true);
    if (!executable) throw new Error('O pacote não contém um executável Windows válido.');
    const old = await fs.lstat(extracted).catch(error => {
      if (error.code !== 'ENOENT') throw error;
      return null;
    });
    let backup;
    if (old) {
      if (!old.isDirectory() || old.isSymbolicLink()) throw new Error('A pasta de arquivos do pacote mudou de destino.');
      backup = await fs.mkdtemp(path.join(target, 'backup-reparo-'));
      await fs.rename(extracted, path.join(backup, 'app'));
    }
    try { await fs.rename(staging, extracted); }
    catch (error) {
      if (backup) await fs.rename(path.join(backup, 'app'), extracted);
      throw error;
    }
    if (backup) console.log('Arquivos anteriores preservados em ' + backup);
    return path.join(extracted, path.relative(staging, executable));
  } finally { await fs.rm(staging,{recursive:true,force:true}); }
}
function revealFile(file) {
  if (WINDOWS) spawn('explorer.exe', ['/select,' + file], { detached: true, stdio: 'ignore' }).unref();
  console.log('Pasta aberta: ' + path.dirname(file));
  opened('folder', file);
}
export function nativeDefaultArguments(project) {
  // Scanning lists hardware; driver installation remains an explicit command.
  return project.fullName?.toLowerCase() === 'opendriverupdater/opendriverupdater' ? ['scan'] : [];
}
async function tracked(spec, project, folder, directory = spec.cwd) {
  return superviseNative(spec, { directory, network: project.network !== false, reportFile: path.join(folder, 'execution.json') });
}
async function runExecutable(executable, project, folder, env = process.env) {
  process.send?.({type:'orbit-executable',path:executable,installer:/setup|installer|\.msi$/i.test(path.basename(executable))});
  if (/\.msi$/i.test(executable)) return tracked({ command: 'msiexec', args: ['/i', executable], cwd: path.dirname(executable), surface: 'window' }, project, folder);
  const subsystem = await subsystemOf(executable).catch(() => 0);
  const consoleApp = subsystem === 3 || project.kind === 'cli' || project.kind === 'library';
  return tracked({ command: executable, args: nativeDefaultArguments(project), cwd: path.dirname(executable), env, surface: consoleApp ? 'process' : 'window', label: path.basename(executable) }, project, folder);
}

// ── Compilar a partir do código, com as ferramentas instaladas no computador ──
export async function executeNativeSource(directory, project, folder, action = 'start') {
  const info = await classifyProject(directory);
  const base = path.join(directory, info.appDir || '');
  const files = await fs.readdir(base);
  const has = name => files.includes(name);
  let env = await projectEnvironment(base);
  const prepare = async () => { await prepareProject(base); env = await projectEnvironment(base); };
  const execute = spec => tracked({ cwd: base, env, ...spec }, project, folder, base);
  let pkg = null;
  try { pkg = JSON.parse(await fs.readFile(path.join(base, 'package.json'), 'utf8')); } catch {}
  // package.json que só chama ferramentas de Linux/Mac (clang, python3, bash) não é um projeto Node de verdade.
  const nodeProject = pkg && !(Object.keys({ ...pkg.dependencies, ...pkg.devDependencies }).length === 0 && /\b(?:python3?|bash|clang\+?\+?|gcc|make|cmake)\b|\bCC=/.test(Object.values(pkg.scripts || {}).join(' ')));
  if (nodeProject) {
    await prepare();
    const manager = pkg.packageManager?.split('@')[0] || (has('pnpm-lock.yaml') ? 'pnpm' : has('yarn.lock') ? 'yarn' : 'npm');
    if (action === 'install') return;
    const script = pickNodeScript(pkg);
    if (script) return execute({ command: manager + ' run ' + script, shell: true, surface: project.kind === 'native' ? 'window' : 'process', label: manager + ' run ' + script });
    const bins = typeof pkg.bin === 'string' ? { [pkg.name?.split('/').pop() || 'app']: pkg.bin } : pkg.bin || {};
    const entry = Object.values(bins).find(value => typeof value === 'string');
    if (entry) return execute({ command: 'node', args: [path.join(base, entry)], label: Object.keys(bins)[0] });
    const exported = pkg.exports?.['.'] || pkg.exports;
    const main = typeof exported === 'string' ? exported : exported?.import || exported?.default || pkg.main || 'index.js';
    if (typeof main !== 'string') throw new Error('A biblioteca não declara uma entrada JavaScript executável.');
    return execute({ command: 'node', args: ['--input-type=module', '-e', 'await import(process.argv[1]); console.log("Orbit: biblioteca importada com sucesso.");', pathToFileURL(path.resolve(base, main)).href], label: 'Verificando a biblioteca ' + project.name });
  }
  if (has('requirements.txt') || has('pyproject.toml') || has('setup.py') || files.some(name => name.endsWith('.py'))) {
    await prepare();
    if (action === 'install') return;
    const python = WINDOWS ? 'python' : 'python3';
    const entry = ['main.py', 'app.py', 'run.py', 'game.py', 'gui.py', 'start.py', '__main__.py'].find(has);
    if (entry) return execute({ command: python, args: [entry], python, surface: project.kind === 'native' ? 'window' : 'process', label: entry });
    const manifest = await fs.readFile(path.join(base, 'pyproject.toml'), 'utf8').catch(() => '');
    const scripts = manifest.match(/^\[project\.scripts\]\s*\n([\s\S]*?)(?=^\[|$)/m)?.[1] || '';
    const cli = scripts.match(/^\s*[\w-]+\s*=\s*["']([\w.]+):([\w.]+)["']/m);
    if (cli) return execute({ command: python, args: ['-c', 'import importlib,sys; obj=importlib.import_module(sys.argv[1]);\nfor name in sys.argv[2].split("."): obj=getattr(obj,name)\nsys.exit(obj())', cli[1], cli[2]], python, label: project.name });
    const candidates = [...files.filter(name => /^[A-Za-z_]\w*$/.test(name) && !['tests', 'test', 'docs', 'scripts'].includes(name)), ...(await fs.readdir(path.join(base, 'src')).catch(() => []))];
    for (const name of candidates) {
      if (!/^[A-Za-z_]\w*$/.test(name)) continue;
      if (await fs.access(path.join(base, name, '__init__.py')).then(() => true, () => false) || await fs.access(path.join(base, 'src', name, '__init__.py')).then(() => true, () => false)) return execute({ command: python, args: ['-c', 'import importlib,sys; importlib.import_module(sys.argv[1]); print("Orbit: biblioteca importada com sucesso.")', name], python, label: 'Verificando a biblioteca ' + name });
    }
    throw new Error('A biblioteca foi preparada, mas não declara um programa nem um módulo importável.');
  }
  if (has('Cargo.toml')) {
    await prepare();
    say('Compilando com cargo (pode demorar)');
    await run('cargo build --release', { cwd: base, env });
    if (action === 'install') return;
    const built = rankExecutables(await walk(path.join(base, 'target', 'release'), 3), project.name)[0];
    if (!built) throw new Error('A compilação terminou, mas nenhum programa .exe foi gerado.');
    return runExecutable(built.path, project, folder, env);
  }
  if (has('go.mod')) {
    await prepare();
    const output = path.join(base, '.orbit-bin', project.name.replace(/[^\w.-]/g, '') + '.exe');
    await fs.mkdir(path.dirname(output), { recursive: true });
    say('Compilando com go');
    await run('go build -o "' + output + '" .', { cwd: base, env });
    if (action === 'install') return;
    return runExecutable(output, project, folder, env);
  }
  const dotnet = files.find(name => /\.(?:sln|csproj|fsproj)$/.test(name));
  if (dotnet) {
    await prepare();
    say('Compilando com dotnet');
    await run('dotnet build -c Release "' + dotnet + '"', { cwd: base, env });
    if (action === 'install') return;
    const built = rankExecutables((await walk(base)).filter(file => /[\\/]bin[\\/]Release[\\/]/i.test(file.path)), project.name)[0];
    if (!built) throw new Error('A compilação terminou, mas nenhum programa .exe foi gerado.');
    return runExecutable(built.path, project, folder, env);
  }
  if (has('CMakeLists.txt')) {
    await prepare();
    if (action === 'install') return;
    const built = rankExecutables(await walk(path.join(base, 'build')), project.name)[0];
    if (!built) throw new Error('A compilação terminou, mas nenhum programa .exe foi gerado.');
    return runExecutable(built.path, project, folder, env);
  }
  const script = files.find(name => /^(?:run|start|launch|play|build-and-install|install|setup)\.(?:bat|cmd|ps1)$/i.test(name));
  if (script) return execute(/\.ps1$/i.test(script) ? { command: 'powershell', args: ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', path.join(base, script)], label: script } : { command: 'call "' + script + '"', shell: true, label: script });
  if (has('Makefile') || has('makefile')) throw new Error('Este projeto não publica uma versão pronta para Windows e só tem instruções de compilação para Linux/Mac (Makefile). Instale o WSL (Ubuntu) para compilar, ou aguarde uma versão para Windows na página de Releases.');
  return null;
}

// ── Fluxos por tipo ─────────────────────────────────────────────────
async function runAndroid(directory, project, folder, releases) {
  const pick = pickReleaseAsset(releases, scoreAndroidAsset);
  if (pick) {
    const apk = await download(pick.asset, path.join(folder, (pick.release.tag_name || 'latest').replace(/[^\w.-]/g, '_')));
    if (await hasTool('adb')) {
      const devices = (await quiet('adb', ['devices'])).output.split(/\r?\n/).slice(1).filter(line => /\sdevice$/.test(line.trim()) || /\tdevice$/.test(line));
      if (devices.length) { say('Instalando no aparelho Android conectado'); await run('adb install -r "' + apk + '"'); downloadedRelease(pick.release); console.log('Instalado. Abra o app no aparelho.'); opened('device', pick.asset.name); return; }
    }
    console.log('APK baixado. Para instalar, copie para o aparelho Android ou conecte-o com depuração USB e execute de novo.');
    return revealFile(apk);
  }
  const scripts = [];
  const folders = ['', ...(await fs.readdir(directory, { withFileTypes: true })).filter(entry => entry.isDirectory() && !entry.name.startsWith('.')).map(entry => entry.name)];
  for (const sub of folders) for (const name of await fs.readdir(path.join(directory, sub)).catch(() => [])) if (/^(?:build-and-install|install|run|deploy)\.(?:ps1|bat|cmd)$/i.test(name)) scripts.push(path.join(sub, name));
  if (scripts.length) {
    const script = scripts[0];
    return tracked({ command: /\.ps1$/i.test(script) ? 'powershell' : 'call "' + path.basename(script) + '"', args: /\.ps1$/i.test(script) ? ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', path.join(directory, script)] : [], shell: !/\.ps1$/i.test(script), cwd: path.join(directory, path.dirname(script)), label: script }, project, folder);
  }
  throw new Error('Este app Android não publica um APK nas Releases nem traz um script de instalação. Compile com o Android Studio seguindo o README.');
}
async function runMcp(directory, project, folder) {
  const launch = await mcpLaunch(directory);
  if (!launch) throw new Error('Não foi possível descobrir como iniciar este servidor MCP. Veja o README.');
  if (launch.source === 'local' || launch.source === 'local-python') { say('Instalando dependências'); await prepareProject(directory); }
  console.log('Iniciando o servidor MCP e acompanhando o processo. Use Parar para encerrar.');
  return tracked({ command: launch.command, args: launch.args, cwd: directory, env: await projectEnvironment(directory), shell: WINDOWS && /^(npm|npx|pnpm|yarn)$/.test(launch.command), keepStdin: true, label: 'MCP ' + launch.name }, project, folder);
}
export async function executeNative(action, directory, project, releasePlan) {
  const folder = path.resolve(process.env.ORBIT_NATIVE_DIRECTORY || path.join(APP, '.orbit', 'native', project.id));
  await fs.mkdir(folder, { recursive: true });
  if (project.kind === 'mcp') return runMcp(directory, project, folder);
  if (WINDOWS && action === 'start' && releasePlan?.systemExecutable) {
    return runExecutable(releasePlan.systemExecutable, project, folder);
  }
  if (WINDOWS && action === 'start' && (releasePlan?.useInstalled || (!releasePlan && project.kind === 'native'))) {
    const executable = await installedWindowsExecutable(project, folder);
    if (executable) {
      say('Abrindo a versão instalada ' + project.installedRelease.tag);
      return runExecutable(executable, project, folder);
    }
    if (releasePlan?.useInstalled) throw new Error('O executável instalado não está disponível. Use Reparar instalação.');
  }
  say('Procurando uma versão pronta para Windows nas Releases');
  const releases = releasePlan === undefined ? await github('repos/' + project.fullName + '/releases?per_page=15').catch(error => { console.log('Atenção: ' + error.message); return []; }) : [];
  if (project.kind === 'android') return runAndroid(directory, project, folder, releasePlan?.release ? [releasePlan.release] : releases);
  const pick = releasePlan === undefined ? pickReleaseAsset(releases, scoreWindowsAsset) : releasePlan;
  if (pick) {
    say('Versão encontrada: ' + (pick.release.name || pick.release.tag_name) + (pick.release.prerelease ? ' (pré-lançamento)' : ''));
    const tag = (pick.release.tag_name || 'latest').replace(/[^\w.-]/g, '_');
    if (tag === '.' || tag === '..' || path.basename(pick.asset.name) !== pick.asset.name || /[\\/:]/.test(pick.asset.name)) throw new Error('O nome do pacote é inválido.');
    const target = path.join(folder, tag);
    await fs.mkdir(target, { recursive: true });
    if (await safePath(folder, tag) !== target) throw new Error('A pasta do pacote mudou de destino.');
    const file = await download(pick.asset, target);
    if (pick.packageMode === 'installer') {
      say('Conclua a instalação no assistente do Windows');
      const code = await openWindowsInstaller(file);
      if (!['0','1641','3010'].includes(code)) throw new Error('O instalador do Windows terminou com código ' + code + '.');
      return;
    }
    if (/\.(?:zip|7z)$/i.test(file)) {
      const executable = await prepareArchive(file, target, project.name);
      downloadedRelease(pick.release);
      if (action === 'install') { console.log('Pronto para executar.'); return; }
      return runExecutable(executable, project, folder);
    }
    if (scorePortableWindowsAsset(pick.asset.name) > 0) {
      if (![2,3].includes(await subsystemOf(file))) throw new Error('O pacote não contém um executável Windows válido.');
      downloadedRelease(pick.release);
    }
    else cachedRelease(pick.release);
    if (action === 'install') { console.log('Pronto para executar.'); return; }
    return runExecutable(file, project, folder);
  }
  if (!directory) throw new Error('A pasta do código local não foi encontrada e nenhuma versão pronta para Windows está disponível.');
  console.log('Nenhuma versão pronta para Windows nas Releases. Tentando a partir do código-fonte.');
  const fromCode = await executeNativeSource(directory, project, folder, action);
  if (fromCode !== null) return fromCode;
  const other = pickAnyAsset(releases);
  if (other) {
    const file = await download(other.asset, path.join(folder, (other.release.tag_name || 'latest').replace(/[^\w.-]/g, '_')));
    console.log('Este projeto não roda no Windows: ' + other.asset.name + ' é para outro sistema ou aparelho (por exemplo, console ou Linux). O arquivo foi baixado e a pasta foi aberta; siga o README para usá-lo.');
    revealFile(file);
    throw new Error('O arquivo baixado não é executável neste Windows. É necessário o sistema ou aparelho indicado pelo projeto.');
  }
  throw new Error('Este projeto não publica uma versão para Windows e não há como compilá-lo aqui. Veja no README os requisitos.');
}
if (process.argv[1] && path.resolve(process.argv[1]) === SELF) {
  try {
    const plan = process.env.ORBIT_RELEASE_PLAN;
    await executeNative(process.argv[2], process.argv[3] === '--without-source' ? null : process.cwd(), JSON.parse(process.env.ORBIT_PROJECT || '{}'), plan === undefined ? undefined : JSON.parse(plan));
  }
  catch (error) { console.error(error.message); process.exitCode = 1; }
}
