const updateUrl = process.env.ORBIT_UPDATE_URL;
const publisher = process.env.ORBIT_UPDATE_PUBLISHER?.trim();
if (updateUrl) {
  const url = new URL(updateUrl);
  if (url.protocol !== 'https:' || url.username || url.password) {
    throw new Error('ORBIT_UPDATE_URL precisa ser uma URL HTTPS sem credenciais.');
  }
  if (process.platform === 'win32' && !publisher) {
    throw new Error('Informe ORBIT_UPDATE_PUBLISHER com o nome do assinante dos instaladores.');
  }
}

module.exports = {
  appId: 'com.orbit.local',
  productName: 'Orbit',
  asar: false,
  icon: 'desktop/icon.png',
  files: ['desktop/**','server.mjs','lib/**','public/**','vendor/**','!public/app.source.js'],
  publish: updateUrl ? {provider:'generic',url:updateUrl} : null,
  forceCodeSigning: Boolean(updateUrl && process.platform !== 'linux'),
  win: {
    target: ['nsis'],
    ...(publisher ? {signtoolOptions:{publisherName:publisher}} : {})
  },
  nsis: {oneClick:false, perMachine:false, createDesktopShortcut:true, deleteAppDataOnUninstall:false},
  mac: {target:['dmg','zip'], category:'public.app-category.developer-tools'},
  linux: {target:['deb'], category:'Development', syncDesktopName:true, maintainer:process.env.ORBIT_LINUX_MAINTAINER || 'Orbit <orbit@localhost>'},
  deb: {
    depends:['libgtk-3-0','libnotify4','libnss3','libxss1','libxtst6','xdg-utils','libatspi2.0-0','libuuid1','libsecret-1-0','libasound2 | libasound2t64']
  }
};
