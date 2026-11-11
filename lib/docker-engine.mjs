import { spawn } from 'node:child_process';
import { promises as fs } from 'node:fs';
import path from 'node:path';

export function dockerCommand(args, { timeout = 10000, capture = true } = {}) {
  return new Promise(resolve => {
    let output = '', done = false;
    const child = spawn('docker', args, { windowsHide: true, stdio: capture ? ['ignore', 'pipe', 'pipe'] : 'inherit' });
    const finish = (ok, error = '') => { if (done) return; done = true; clearTimeout(timer); resolve({ ok, output: (output || error).trim() }); };
    const timer = setTimeout(() => {
      child.kill();
      finish(false, 'Docker não respondeu no tempo esperado.');
      child.stdout?.destroy();
      child.stderr?.destroy();
    }, timeout);
    child.stdout?.on('data', data => { output = (output + data).slice(-16000); });
    child.stderr?.on('data', data => { output = (output + data).slice(-16000); });
    child.on('error', error => finish(false, error.message));
    child.on('close', code => finish(code === 0));
  });
}
export async function dockerStartupDiagnosis({since=Date.now()-10*60*1000}={}) {
  if (process.platform !== 'win32') return '';
  const file = path.join(process.env.LOCALAPPDATA || '', 'Docker', 'log', 'host', 'com.docker.backend.exe.log');
  const lines = (await fs.readFile(file, 'utf8').catch(() => '')).split('\n').slice(-1200);
  const problem = lines.reverse().find(line => /attempting to recover from error|reporting error to user/.test(line));
  if (!problem) return '';
  const timestamp = problem.match(/^\[([^\]]+)\]/)?.[1];
  if (!timestamp || new Date(timestamp).getTime() < since) return '';
  if (/vsock|AF_UNIX/.test(problem)) return 'O Docker Desktop falhou em uma conexão interna do Windows (vsock). A inicialização automática foi tentada; o serviço precisa de reparação no computador. Seus dados não foram apagados.';
  if (/virtualization|WSL|wsl/i.test(problem)) return 'O Docker Desktop encontrou uma falha no WSL/virtualização do Windows. Corrija o serviço do sistema para continuar.';
  return 'O Docker Desktop encontrou um erro ao iniciar. Consulte o diagnóstico do Docker Desktop.';
}
const elapsedLabel = ms => { const total = Math.round(ms / 1000); const minutes = Math.floor(total / 60), seconds = total % 60; return (minutes ? minutes + ' min ' : '') + (seconds || !minutes ? seconds + ' s' : '').trim(); };
export async function ensureDockerReady({ log = console.log, timeout = 420000, run = dockerCommand, diagnose = dockerStartupDiagnosis, sleep = ms => new Promise(resolve => setTimeout(resolve, ms)) } = {}) {
  let result = await run(['info', '--format', '{{.ServerVersion}}'], { timeout: 5000 });
  if (result.ok) { log('Docker pronto: ' + result.output); return; }
  log('Docker desligado ou inicializando. Iniciando automaticamente…');
  const startupAt = Date.now();
  const start = await run(['desktop', 'start'], { timeout: 15000 });
  if (!start.ok) {
    if (process.platform === 'win32') {
      const executable = path.join(process.env.ProgramFiles || 'C:\\Program Files', 'Docker', 'Docker', 'Docker Desktop.exe');
      try {
        await fs.access(executable);
        const child = spawn(executable, [], { detached: true, windowsHide: true, stdio: 'ignore' });
        child.on('error', () => {}); child.unref();
      } catch { throw new Error('Docker Desktop não está instalado. A instalação do Docker requer autorização do sistema operacional.'); }
    } else if (process.platform === 'darwin') {
      const child = spawn('open', ['-g', '-a', 'Docker'], { detached: true, stdio: 'ignore' });
      child.on('error', () => {}); child.unref();
    } else {
      const child = spawn('systemctl', ['--user', '--no-ask-password', 'start', 'docker'], { stdio: 'ignore' });
      child.on('error', () => {});
    }
  }
  const started = Date.now(), deadline = started + timeout;
  let lastNote = started;
  do {
    await sleep(2500);
    result = await run(['info', '--format', '{{.ServerVersion}}'], { timeout: 5000 });
    if (result.ok) { log('Docker iniciado e pronto: ' + result.output); return; }
    const problem = await diagnose({since:startupAt});
    if (problem) throw new Error(problem);
    if (Date.now() - lastNote >= 30000) { lastNote = Date.now(); log('Aguardando o Docker Desktop terminar de iniciar… ' + elapsedLabel(Date.now() - started) + ' (pode levar alguns minutos na primeira vez).'); process.send?.({type:'orbit-progress',label:'Aguardando o Docker Desktop · ' + elapsedLabel(Date.now() - started)}); }
  } while (Date.now() < deadline);
  throw new Error('O Docker Desktop não terminou de iniciar em ' + elapsedLabel(timeout) + '. Espere o ícone do Docker indicar que está em execução e clique em Executar de novo; o projeto continua preservado.');
}
