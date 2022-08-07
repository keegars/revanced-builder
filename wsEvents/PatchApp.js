const { promisify } = require('util');
const { exec, spawn } = require('child_process');
const os = require('os');
const mountReVanced = require('../utils/mountReVanced.js');
const actualExec = promisify(exec);
const actualSpawn = promisify(spawn);

async function mount(ws) {
  let pkg;
  switch (global.jarNames.selectedApp) {
    case 'youtube': {
      pkg = 'com.google.android.youtube';
      break;
    }

    case 'music': {
      pkg = 'com.google.android.apps.youtube.music';
      break;
    }
  }

  ws.send(
    JSON.stringify({
      event: 'patchLog',
      log: 'Trying to mount ReVanced...'
    })
  );
  await mountReVanced(pkg, ws);
}

async function afterBuild(ws) {
  if (!global.jarNames.isRooted && os.platform() === 'android') {
    await actualExec(
      'cp revanced/revanced.apk /storage/emulated/0/revanced.apk'
    );
    await actualExec('cp revanced/microg.apk /storage/emulated/0/microg.apk');

    ws.send(
      JSON.stringify({
        event: 'patchLog',
        log: 'Copied files over to /storage/emulated/0/!\nPlease install ReVanced, its located in /storage/emulated/0/revanced.apk\nand if you are building YT/YTM ReVanced without root, also install /storage/emulated/0/microg.apk.'
      })
    );
  } else if (os.platform() === 'android') {
    await mount(ws);
  } else if (!global.jarNames.deviceID) {
    ws.send(
      JSON.stringify({
        event: 'patchLog',
        log: 'ReVanced has been built!\nPlease transfer over revanced/revanced.apk and if you are using YT/YTM, revanced/microg.apk and install them!'
      })
    );
  } else if (!global.jarNames.isRooted && global.jarNames.deviceID) {
    await actualExec('adb install revanced/microg.apk');
    ws.send(
      JSON.stringify({
        event: 'patchLog',
        log: 'MicroG has been installed.'
      })
    );
  }

  ws.send(
    JSON.stringify({
      event: 'buildFinished'
    })
  );
}

async function reinstallReVanced(ws) {
  let pkgNameToGetUninstalled;

  switch (global.jarNames.selectedApp) {
    case 'youtube': {
      if (!global.jarNames.isRooted) {
        pkgNameToGetUninstalled = 'app.revanced.android.youtube';
        break;
      } else break;
    }

    case 'music': {
      if (!global.jarNames.isRooted) {
        pkgNameToGetUninstalled = 'app.revanced.android.apps.youtube.music';
        break;
      } else break;
    }

    case 'android': {
      pkgNameToGetUninstalled = 'com.twitter.android';
      break;
    }

    case 'frontpage': {
      pkgNameToGetUninstalled = 'com.reddit.frontpage';
      break;
    }
  }

  await actualExec(`adb uninstall ${pkgNameToGetUninstalled}`);
  await actualExec('adb install revanced/revanced.apk');
  ws.send(
    JSON.stringify({
      event: 'buildFinished'
    })
  );
}

module.exports = async function (message, ws) {
  const args = [
    '-jar',
    global.jarNames.cli,
    '-b',
    global.jarNames.patchesJar,
    '-t',
    './revanced-cache',
    '--experimental',
    '-a',
    `./revanced/${global.jarNames.selectedApp}.apk`,
    '-o',
    './revanced/revanced.apk'
  ];

  if (os.platform() === 'android') {
    args.push('--custom-aapt2-binary');
    args.push('revanced/aapt2');
  }

  if (global.jarNames.selectedApp === 'youtube') {
    args.push('-m');
    args.push(global.jarNames.integrations);
  }

  if (global.jarNames.deviceID) {
    args.push('-d');
    args.push(global.jarNames.deviceID);
  }

  for (const patch of global.jarNames.patches.split(' ')) {
    args.push(patch);
  }

  if (global.jarNames.selectedApp.endsWith('frontpage')) {
    args.push('-r');
  }

  if (global.jarNames.isRooted && global.jarNames.deviceID) {
    args.push('--mount');
  }
  console.log(`java ${args.join(' ')}`);

  const buildProcess = await spawn('java', args, {
    maxBuffer: 5120 * 1024
  });

  buildProcess.stdout.on('data', async (data) => {
    ws.send(
      JSON.stringify({
        event: 'patchLog',
        log: data.toString(),
        isStdErr: false
      })
    );

    if (data.toString().includes('Finished')) {
      await afterBuild(ws);
    }

    if (data.toString().includes('INSTALL_FAILED_UPDATE_INCOMPATIBLE')) {
      await reinstallReVanced(ws);
    }
  });

  buildProcess.stderr.on('data', async (data) => {
    ws.send(
      JSON.stringify({
        event: 'patchLog',
        log: data.toString(),
        isStdErr: true
      })
    );

    if (data.toString().includes('Finished')) {
      await afterBuild(ws);
    }

    if (data.toString().includes('INSTALL_FAILED_UPDATE_INCOMPATIBLE')) {
      await reinstallReVanced(ws);
    }
  });
};
