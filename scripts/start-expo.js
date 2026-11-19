const { spawn } = require('node:child_process');

const expoCli = require.resolve('expo/bin/cli');
const child = spawn(process.execPath, [expoCli, 'start', ...process.argv.slice(2)], {
  env: { ...process.env, EXPO_NO_DEV_MENU: '1' },
  stdio: 'inherit',
});

child.on('error', (error) => {
  console.error('Unable to start Expo CLI.', error);
  process.exitCode = 1;
});

child.on('exit', (code) => {
  process.exitCode = code ?? 1;
});
