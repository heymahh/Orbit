import { promises as fs } from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { prepareProject, projectEnvironment, normalizedEnv } from './prepare.mjs';

const PIP_NAMES = { cv2: 'opencv-python-headless', PIL: 'pillow', sklearn: 'scikit-learn', skimage: 'scikit-image', yaml: 'pyyaml', bs4: 'beautifulsoup4', dotenv: 'python-dotenv', fitz: 'pymupdf', Crypto: 'pycryptodome', docx: 'python-docx', serial: 'pyserial', jwt: 'pyjwt' };
const exists = file => fs.access(file).then(() => true, () => false);
const readPackage = async directory => { try { return JSON.parse(await fs.readFile(path.join(directory, 'package.json'), 'utf8')); } catch { return {}; } };

export async function nativeRepairPlan(output, directory) {
  const framework = output.match(/Framework:\s*['"](Microsoft\.(?:NETCore|WindowsDesktop)\.App)['"],?\s*version\s*['"](\d+)\.\d+\.\d+/i);
  if (framework && Number(framework[2]) >= 6 && Number(framework[2]) <= 10) {
    const major = framework[2];
    const runtime = framework[1].includes('WindowsDesktop') ? 'DesktopRuntime' : 'Runtime';
    return { id: 'dotnet-' + runtime + '-' + major, kind: 'dotnet', package: 'Microsoft.DotNet.' + runtime + '.' + major, arch: output.match(/Architecture:\s*(x64|x86|arm64)/i)?.[1]?.toLowerCase(), label: 'Instalando .NET ' + major + ' exigido pelo programa' };
  }
  const missing = [...output.matchAll(/ModuleNotFoundError: No module named ['"]([A-Za-z_][A-Za-z0-9_.]*)['"]/g)].at(-1)?.[1];
  if (missing) {
    const top = missing.split('.')[0];
    if (missing !== top || ['google', 'azure', 'zope', 'mpl_toolkits'].includes(top)) return null;
    for (const base of [directory, path.join(directory, 'src')]) if (await exists(path.join(base, top)) || await exists(path.join(base, top + '.py'))) return null;
    const name = PIP_NAMES[top] || top;
    return { id: 'pip-' + name, kind: 'python', package: name, label: 'Instalando pacote Python ausente: ' + name };
  }
  const pkg = await readPackage(directory);
  const nodeMissing = output.match(/Cannot find (?:module|package) ['"]([^'"]+)['"]/i)?.[1];
  if (nodeMissing && !/^(?:\.|[A-Za-z]:|\/)/.test(nodeMissing)) {
    const name = nodeMissing.startsWith('@') ? nodeMissing.split('/').slice(0, 2).join('/') : nodeMissing.split('/')[0];
    if (name in { ...pkg.dependencies, ...pkg.devDependencies, ...pkg.optionalDependencies }) return { id: 'node-dependencies', kind: 'dependencies', label: 'Reinstalando as dependências declaradas pelo projeto' };
  }
  if (/compiled runtime is missing|Cannot find module ['"](?:\.|[A-Za-z]:[\\/])|ERR_MODULE_NOT_FOUND[\s\S]*(?:dist|build)/i.test(output) && typeof pkg.scripts?.build === 'string') return { id: 'node-build', kind: 'build', label: 'Compilando o programa antes de tentar novamente' };
  if (/ECONNRESET|ETIMEDOUT|EAI_AGAIN|ENOTFOUND|Temporary failure in name resolution|socket hang up/i.test(output)) return { id: 'network-retry', kind: 'retry', label: 'Aguardando a conexão antes de tentar novamente' };
  return null;
}

function execute(spec, { output, started }) {
  return new Promise(resolve => {
    let tail = '', error, timedOut = false, ready = !spec.ready;
    const readiness = spec.ready ? new AbortController() : null;
    const child = spawn(spec.command, spec.args || [], { cwd: spec.cwd, env: normalizedEnv(spec.env || process.env), shell: Boolean(spec.shell), windowsHide: spec.surface !== 'window', stdio: [spec.keepStdin ? 'pipe' : 'ignore', 'pipe', 'pipe'] });
    const timer = spec.timeout ? setTimeout(() => { timedOut = true; child.kill(); }, spec.timeout) : null;
    child.once('spawn', () => {
      if (!readiness) { started?.(child.pid); return; }
      spec.ready(readiness.signal).then(() => {
        if (!readiness.signal.aborted) { ready = true; started?.(child.pid); }
      }).catch(error => { if (!readiness.signal.aborted) spec.onStartupError?.(error); });
    });
    child.once('exit', () => readiness?.abort());
    const collect = (chunk, stream) => {
      tail = (tail + String(chunk).replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, '')).slice(-24000);
      output?.(chunk, stream);
    };
    child.stdout?.on('data', chunk => collect(chunk, 'stdout'));
    child.stderr?.on('data', chunk => collect(chunk, 'stderr'));
    child.once('error', value => { error = value.message; });
    child.once('close', (code, signal) => {
      clearTimeout(timer);
      readiness?.abort();
      resolve({ code, signal, output: tail, error: timedOut ? 'O programa não respondeu no tempo esperado.' : error || (!ready && code === 0 ? 'O programa terminou antes de abrir a aplicação web.' : '') });
    });
  });
}

export async function repairNative(plan, context) {
  const run = async (command, args, shell = false) => {
    const result = await execute({ command, args, shell, cwd: context.directory, env: context.env, timeout: 15 * 60000 }, { output: context.output });
    if (result.code !== 0) throw new Error(result.error || result.output.slice(-1500) || 'A instalação da dependência falhou.');
  };
  if (plan.kind === 'dotnet') {
    if (process.platform !== 'win32') throw new Error('Este runtime precisa ser instalado no Windows.');
    await run('winget', ['install', '--id', plan.package, '--exact', '--silent', '--accept-package-agreements', '--accept-source-agreements', '--disable-interactivity', ...(plan.arch ? ['--architecture', plan.arch] : [])]);
  } else if (plan.kind === 'retry') {
    await new Promise(resolve => setTimeout(resolve, 3000));
  } else if (plan.kind === 'python') {
    if (!context.python) throw new Error('Não foi possível identificar o ambiente Python usado por este programa.');
    await run(context.python, ['-m', 'pip', 'install', '--disable-pip-version-check', plan.package]);
  } else if (plan.kind === 'dependencies') {
    await prepareProject(context.directory);
    return { env: await projectEnvironment(context.directory, context.env) };
  } else if (plan.kind === 'build') {
    const pkg = await readPackage(context.directory);
    const manager = ['npm', 'pnpm', 'yarn', 'bun'].includes(pkg.packageManager?.split('@')[0]) ? pkg.packageManager.split('@')[0] : 'npm';
    await run(manager + ' run build', [], true);
  }
  return {};
}

// The child remains attached to Orbit so Stop, output and failures share its lifecycle.
export async function superviseNative(spec, { directory = spec.cwd, reportFile, network = true, maxRepairs = 3, repair = repairNative, output = (chunk, stream) => process[stream].write(chunk), notify = event => process.send?.(event) } = {}) {
  spec = { ...spec, env: spec.env || process.env };
  const report = { status: 'starting', program: path.basename(spec.command), attempts: [] };
  const save = async () => { if (reportFile) await fs.writeFile(reportFile, JSON.stringify(report, null, 2)); };
  const attempted = new Set();
  const message = text => output(Buffer.from(text + '\n'), 'stdout');
  while (true) {
    const attempt = { startedAt: new Date().toISOString() };
    report.attempts.push(attempt);
    await save();
    message('Orbit: executando ' + (spec.label || path.basename(spec.command)) + ' · tentativa ' + report.attempts.length);
    const result = await execute(spec, { output, started: () => {
      report.status = 'running';
      notify({ type: 'orbit-opened', surface: spec.surface || 'process', detail: spec.label || path.basename(spec.command) });
      notify({ type: 'orbit-running', port: spec.port || 0 });
    } });
    Object.assign(attempt, { endedAt: new Date().toISOString(), exitCode: result.code, signal: result.signal, error: result.error || '' });
    if (result.code === 0 && !result.error) {
      report.status = 'complete'; await save();
      message('Orbit: execução concluída (código 0).');
      return report;
    }
    const plan = network && attempted.size < maxRepairs ? await nativeRepairPlan(result.output + '\n' + (result.error || ''), directory) : null;
    if (!plan || attempted.has(plan.id)) {
      report.status = 'error'; await save();
      const detail = result.error || result.output.trim().split(/\r?\n/).filter(Boolean).slice(-3).join(' ').slice(-600);
      throw new Error('A execução falhou (código ' + (result.code ?? result.signal ?? 'indisponível') + '). ' + detail);
    }
    attempted.add(plan.id);
    attempt.repair = plan.id;
    report.status = 'recovering'; await save();
    message('Orbit: ' + plan.label + '.');
    notify({ type: 'orbit-recovery', label: plan.label, attempt: report.attempts.length });
    try {
      const updated = await repair(plan, { directory, env: spec.env, python: spec.python, output });
      if (updated?.env) spec.env = updated.env;
      message('Orbit: correção concluída; tentando executar novamente.');
    } catch (error) {
      report.status = 'error'; attempt.repairError = error.message; await save();
      throw new Error('Não foi possível concluir a correção automática: ' + error.message);
    }
  }
}
