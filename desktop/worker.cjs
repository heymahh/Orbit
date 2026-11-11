// The embedded Node runtime is only for Orbit's worker. Installed apps inherit a normal environment.
delete process.env.ELECTRON_RUN_AS_NODE;
const { pathToFileURL } = require('node:url');
process.argv.splice(1, 1);
import(pathToFileURL(process.argv[1]).href).catch(error => {
  console.error(error);
  process.exitCode = 1;
});
