import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFile, writeFile, rename } from 'node:fs/promises';
import { app, BrowserWindow, dialog, ipcMain, Menu, nativeImage, Notification, shell, Tray } from 'electron';
import { createDesktopUpdates } from './update.mjs';

app.setName('Orbit');
app.setAppUserModelId('com.orbit.local');
const desktopDirectory = path.dirname(fileURLToPath(import.meta.url));
let service;
let window;
let updates;
let tray;
let settingsFile;
let keepInTray = true;
let notification;
let exiting = false;
let confirming = false;
let installingUpdate = false;
let restartAfterUpdate = false;

function localPage(url) {
  const target = URL.parse(url);
  return target?.origin === service.url && target.pathname === '/';
}

function showWindow() {
  if (!window) return;
  if (window.isMinimized()) window.restore();
  window.show();
  window.focus();
}
function installUpdate() {
  if (!updates.ready()) return 'unavailable';
  if (service.isBusy()) return 'busy';
  void quit(true,true);
  return 'installing';
}
function refreshTrayMenu() {
  if (!tray) return;
  const menu = [{label:'Abrir Orbit',click:showWindow}];
  if (updates.ready()) menu.push({label:'Reiniciar e atualizar',click:() => {
    if (installUpdate() === 'busy') {
      showWindow();
      void dialog.showMessageBox(window,{message:'Conclua as tarefas e feche os apps em execução para atualizar o Orbit.'});
    }
  }});
  menu.push({type:'separator'}, {label:'Sair do Orbit',click:() => app.quit()});
  tray.setContextMenu(Menu.buildFromTemplate(menu));
}
function createTray() {
  const image = nativeImage.createFromPath(path.join(desktopDirectory,'icon.png'));
  const size = process.platform === 'win32' ? 16 : 22;
  tray = new Tray(image.resize({width:size,height:size}));
  tray.setToolTip('Orbit');
  tray.on('click',showWindow);
  refreshTrayMenu();
}
async function saveKeepInTray(value) {
  if (typeof value !== 'boolean') throw new Error('Preferência inválida.');
  const temporary = settingsFile + '.tmp';
  await writeFile(temporary,JSON.stringify({keepInTray:value}));
  await rename(temporary,settingsFile);
  keepInTray = value;
  return keepInTray;
}

function createWindow() {
  const win = new BrowserWindow({
    title: 'Orbit',
    icon: path.join(desktopDirectory,'icon.png'),
    width: 1400, height: 900, minWidth: 390, minHeight: 560,
    backgroundColor: '#090d19',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(desktopDirectory,'preload.cjs'),
      nodeIntegration: false, contextIsolation: true, sandbox: true
    }
  });
  win.webContents.on('will-navigate', (event,url) => {
    if (!localPage(url)) event.preventDefault();
  });
  win.webContents.on('will-redirect', (event,url,_isInPlace,isMainFrame) => {
    if (isMainFrame && !localPage(url)) event.preventDefault();
  });
  win.webContents.setWindowOpenHandler(({url}) => {
    const target = URL.parse(url);
    if (target && !target.username && !target.password &&
      (target.protocol === 'https:' || (target.protocol === 'http:' && ['127.0.0.1','localhost'].includes(target.hostname)))) {
      shell.openExternal(target.href).catch(console.error);
    }
    return {action:'deny'};
  });
  win.on('close', event => {
    if (exiting) return;
    event.preventDefault();
    if (keepInTray && tray) win.hide();
    else app.quit();
  });
  win.on('closed', () => { if (window === win) window = undefined; });
  return win;
}

async function quit(install, restart = false) {
  if (exiting) return;
  exiting = true;
  try {
    await service?.close();
    if (install) {
      installingUpdate = true;
      restartAfterUpdate = restart;
      updates.install(restart);
    } else app.quit();
  } catch (error) {
    console.error(error);
    dialog.showErrorBox('Orbit', 'Não foi possível concluir o encerramento do Orbit.');
    app.exit(1);
  }
}

app.on('before-quit', event => {
  if (exiting || !service) return;
  event.preventDefault();
  if (!service.isBusy()) {
    void quit(updates?.ready());
  } else if (!confirming && window) {
    confirming = true;
    dialog.showMessageBox(window, {
      type:'warning', title:'Orbit', message:'Há apps ou tarefas em execução.',
      detail:'Sair agora encerra as tarefas em andamento.',
      buttons:['Continuar no Orbit','Encerrar tarefas e sair'], defaultId:0, cancelId:0
    }).then(({response}) => {
      if (response === 1) void quit(false);
    }).catch(console.error).finally(() => { confirming = false; });
  }
});

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance',showWindow);
  app.on('activate',showWindow);

  app.whenReady().then(async () => {
    const dataDirectory = process.env.ORBIT_DATA || path.join(app.getPath('userData'),'workspace');
    process.env.ORBIT_DATA = dataDirectory;
    const {createApp} = await import('../server.mjs');
    // Keep the origin stable so Chromium can restore home preferences across launches.
    service = await createApp({dataDirectory, port:4311, desktop:true});
    settingsFile = path.join(app.getPath('userData'),'desktop-settings.json');
    const settings = await readFile(settingsFile,'utf8').then(JSON.parse).catch(() => ({}));
    keepInTray = settings?.keepInTray !== false;
    updates = createDesktopUpdates(state => {
      window?.webContents.send('orbit:update-state',state);
      refreshTrayMenu();
      if (installingUpdate && state.status === 'error') {
        installingUpdate = false;
        dialog.showErrorBox('Orbit','A atualização não pôde ser instalada. Você pode tentar novamente ao abrir o Orbit.');
        if (restartAfterUpdate) app.relaunch();
        app.quit();
      }
      if (state.status === 'ready' && !window?.isVisible() && Notification.isSupported()) {
        notification = new Notification({title:'Orbit',body:'Atualização pronta. Abra o Orbit para instalar ou escolha Sair do Orbit na bandeja.'});
        notification.on('click',showWindow);
        notification.show();
      }
    });
    createTray();
    const register = (channel, handle) => ipcMain.handle(channel, (event,...args) => {
      if (event.sender !== window?.webContents || event.senderFrame !== event.sender.mainFrame ||
          !localPage(event.senderFrame.url)) throw new Error('Janela do Orbit não autorizada.');
      return handle(...args);
    });
    register('orbit:update-state',updates.state);
    register('orbit:check-update',updates.check);
    register('orbit:install-update',installUpdate);
    register('orbit:tray-preference',() => keepInTray);
    register('orbit:set-tray-preference',saveKeepInTray);

    window = createWindow();
    await window.loadURL(service.url);
    const firstCheck = setTimeout(updates.check, 8000);
    const periodicCheck = setInterval(updates.check, 6 * 60 * 60 * 1000);
    firstCheck.unref();
    periodicCheck.unref();
  }).catch(error => {
    console.error(error);
    const message = error.code === 'EADDRINUSE' ? 'A porta local 4311 está em uso. Feche a outra instância do Orbit e tente novamente.' : error.message;
    dialog.showErrorBox('Não foi possível abrir o Orbit', message);
    void quit(false);
  });
}
