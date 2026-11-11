import path from 'node:path';
import { existsSync } from 'node:fs';
import { app } from 'electron';
import updaterModule from 'electron-updater';

export function createDesktopUpdates(onChange) {
  const version = app.getVersion();
  const managed = app.isPackaged && process.platform === 'linux';
  const available = app.isPackaged &&
    existsSync(path.join(process.resourcesPath, 'app-update.yml'));
  let status = available ? 'idle' : managed ? 'managed' : 'unavailable';
  let nextVersion = '';
  const state = () => ({version, status, nextVersion});
  const transition = (value, target = '') => {
    status = value;
    nextVersion = target;
    onChange(state());
  };
  if (!available) return {state, check: async () => {}, ready: () => false};

  const {autoUpdater} = updaterModule;
  autoUpdater.autoDownload = !managed;
  autoUpdater.autoInstallOnAppQuit = false;
  autoUpdater.allowPrerelease = false;
  autoUpdater.allowDowngrade = false;
  autoUpdater.on('checking-for-update', () => transition('checking'));
  autoUpdater.on('update-not-available', () => transition('current'));
  autoUpdater.on('update-available', info => transition(managed ? 'managed-update' : 'downloading', info.version));
  autoUpdater.on('update-downloaded', info => transition('ready', info.version));
  autoUpdater.on('error', error => {
    console.error('Falha na atualização do Orbit:', error);
    transition('error');
  });

  const check = async () => {
    if (['checking','downloading','ready'].includes(status)) return;
    transition('checking');
    try {
      const result = await autoUpdater.checkForUpdates();
      await result?.downloadPromise;
    } catch (error) {
      if (status !== 'error') {
        console.error('Falha na atualização do Orbit:', error);
        transition('error');
      }
    }
  };
  return {
    state, check, ready: () => status === 'ready',
    install: restart => {
      autoUpdater.autoRunAppAfterInstall = restart;
      autoUpdater.quitAndInstall(true,restart);
    }
  };
}
