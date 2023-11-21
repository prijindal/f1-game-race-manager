/* eslint global-require: off, no-console: off, promise/always-return: off */

/**
 * This module executes inside of electron's main process. You can start
 * electron renderer process from here and communicate with the other processes
 * through IPC.
 *
 * When running `npm run build` or `npm run build:main`, this file is compiled to
 * `./src/main.js` using webpack. This gives us some performance wins.
 */
import {
  BrowserWindow,
  Menu,
  Tray,
  app,
  ipcMain,
  screen,
  shell,
} from 'electron';
import log from 'electron-log';
import { autoUpdater } from 'electron-updater';
import express from 'express';
import { F123UDP } from 'f1-23-udp';
import { createWriteStream } from 'fs';
import http from 'http';
import type { AddressInfo } from 'net';
import path from 'path';
import favicon from 'serve-favicon';
import { Server } from 'socket.io';
import MenuBuilder from './menu';
import { resolveHtmlPath } from './util';

const RESOURCES_PATH = app.isPackaged
  ? path.join(process.resourcesPath, 'assets')
  : path.join(__dirname, '../../assets');

const getAssetPath = (...paths: string[]): string => {
  return path.join(RESOURCES_PATH, ...paths);
};

let io: Server | undefined;
let server: http.Server | undefined;
let tray: Tray | undefined;

const startExpressServer = () => {
  return new Promise<void>((resolve) => {
    const expressApp = express();
    server = http.createServer(expressApp);
    io = new Server(server, {
      cors: {
        origin: 'http://localhost:1212',
        methods: ['GET', 'POST'],
      },
    });

    io.on('connection', (socket) => {
      console.log('Browser connected');

      socket.on('disconnect', () => {
        console.log('user disconnected');
      });
    });

    expressApp.use(favicon(getAssetPath('icon.png')));

    expressApp.use(express.static(path.resolve(__dirname, '../renderer/')));

    const EXPRESS_PORT = Number(process.env.EXPRESS_PORT || 8080);
    const EXPRESS_HOST = process.env.EXPRESS_HOST || '0.0.0.0';

    server.listen(EXPRESS_PORT, EXPRESS_HOST, () => {
      console.log(`Started listening on port: ${EXPRESS_PORT}`);
      resolve();
    });

    server.on('close', () => {
      console.log('Server stop listening');
    });
  });
};

const stopExpressServer = () => {
  return new Promise<void>((resolve) => {
    if (server != null) {
      server.close(() => {
        resolve();
      });
    } else {
      resolve();
    }
  });
};

const f123: F123UDP = new F123UDP();
f123.start();

class AppUpdater {
  constructor() {
    log.transports.file.level = 'info';
    autoUpdater.logger = log;
    autoUpdater.checkForUpdatesAndNotify();
  }
}

let mainWindow: BrowserWindow | null = null;

const recordFile = getAssetPath('records.log');
const recordLog = createWriteStream(recordFile, { flags: 'a' });

const recordData = (data: any, type: string) => {
  const record = { timestamp: new Date(), data, type };
  recordLog.write(`${JSON.stringify(record)}\n`, 'utf-8');
};

const forwardF123Data = (data: any, type: string) => {
  recordData(data, type);
  if (mainWindow != null) {
    mainWindow.webContents.send(type, data);
  }
  io?.emit(type, data);
};

forwardF123Data({ address: f123.address, port: f123.port }, 'start-instance');

// f123.socket.on('connect', (connection: any) => {
//   console.log(connection);
// });

// f123.socket.on('close', (close: any) => {
//   console.log(close);
// });

f123.on('lapData', (data) => {
  forwardF123Data(data, 'lapData');
});

f123.on('participants', (data) => {
  forwardF123Data(data, 'participants');
});

f123.on('sessionHistory', (data) => {
  forwardF123Data(data, 'sessionHistory');
});

f123.on('event', (data) => {
  forwardF123Data(data, 'event');
});

f123.on('session', (data) => {
  forwardF123Data(data, 'session');
});

f123.on('carStatus', (data) => {
  forwardF123Data(data, 'carStatus');
});

f123.on('carTelemetry', (data) => {
  forwardF123Data(data, 'carTelemetry');
});

f123.on('tyreSets', (data) => {
  forwardF123Data(data, 'tyreSets');
});

ipcMain.on('ipc-example', async (event, arg) => {
  const msgTemplate = (pingPong: string) => `IPC test: ${pingPong}`;
  console.log(msgTemplate(arg));
  event.reply('ipc-example', msgTemplate('pong'));
});

if (process.env.NODE_ENV === 'production') {
  const sourceMapSupport = require('source-map-support');
  sourceMapSupport.install();
}

const isDebug =
  process.env.NODE_ENV === 'development' || process.env.DEBUG_PROD === 'true';

// if (isDebug) {
//   require('electron-debug')();
// }

const installExtensions = async () => {
  const installer = require('electron-devtools-installer');
  const forceDownload = !!process.env.UPGRADE_EXTENSIONS;
  const extensions = ['REACT_DEVELOPER_TOOLS'];

  return installer
    .default(
      extensions.map((name) => installer[name]),
      forceDownload,
    )
    .catch(console.log);
};

const resetSysTray = async () => {
  if (tray == null) {
    tray = new Tray(getAssetPath('icon.png'));
  }
  const toggleWindow = () => {
    if (mainWindow != null) {
      if (mainWindow.isVisible()) {
        mainWindow.hide();
      } else {
        mainWindow.show();
      }
      resetSysTray();
    }
  };
  const contextMenu = Menu.buildFromTemplate([
    {
      label:
        mainWindow == null || !mainWindow.isVisible()
          ? 'Show Window'
          : 'Hide Window',
      type: 'normal',
      role: 'minimize',
      click: toggleWindow,
    },
    {
      label:
        server == null || !server.listening ? 'Start Server' : 'Stop Server',
      click: async () => {
        if (server == null || !server.listening) {
          await startExpressServer();
        } else {
          await stopExpressServer();
        }
        resetSysTray();
      },
    },
    {
      label: 'Close',
      role: 'close',
      click: () => {
        mainWindow?.close();
      },
    },
  ]);
  let tooltip = '';
  if (server == null || !server.listening) {
    tooltip = 'Server is not started';
  } else {
    const addressInfo = server.address() as AddressInfo;
    tooltip = `Server listening at ${addressInfo.address}:${addressInfo.port}`;
  }
  // tray.on('click', toggleWindow);
  tray.setToolTip(tooltip);
  tray.setContextMenu(contextMenu);
};

const createWindow = async () => {
  if (isDebug) {
    await installExtensions();
  }

  const primaryDisplay = screen.getPrimaryDisplay();
  const { width: screenWidth } = primaryDisplay.workAreaSize;

  const width = 300;
  const height = 380;

  mainWindow = new BrowserWindow({
    show: false,
    width,
    height,
    y: 200,
    x: screenWidth - width,
    transparent: true,
    frame: false,
    backgroundColor: 'rgba(0, 0, 0, 0.0)',
    alwaysOnTop: true,
    icon: getAssetPath('icon.png'),
    webPreferences: {
      preload: app.isPackaged
        ? path.join(__dirname, 'preload.js')
        : path.join(__dirname, '../../.erb/dll/preload.js'),
    },
  });

  mainWindow.loadURL(resolveHtmlPath('index.html'));

  mainWindow.on('ready-to-show', () => {
    if (!mainWindow) {
      throw new Error('"mainWindow" is not defined');
    }
    mainWindow.show();
    resetSysTray();
    // if (true) {
    //   console.log('Minimizing');
    //   setTimeout(() => {
    //     mainWindow?.minimize();
    //   }, 500);
    //   mainWindow.minimize();
    // } else {
    //   mainWindow.show();
    // }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  const menuBuilder = new MenuBuilder(mainWindow);
  menuBuilder.buildMenu();

  // Open urls in the user's browser
  mainWindow.webContents.setWindowOpenHandler((edata) => {
    shell.openExternal(edata.url);
    return { action: 'deny' };
  });

  // Remove this if your app does not use auto updates
  // eslint-disable-next-line
  new AppUpdater();
};

/**
 * Add event listeners...
 */

app.on('window-all-closed', () => {
  // Respect the OSX convention of having the application in memory even
  // after all windows have been closed
  if (process.platform !== 'darwin') {
    app.quit();
  }

  recordData({}, 'stop-instance');

  recordLog.close();

  stopExpressServer();

  f123.stop();

  process.exit(0);
});

app
  .whenReady()
  .then(() => {
    createWindow();
    resetSysTray();
    app.on('activate', () => {
      // On macOS it's common to re-create a window in the app when the
      // dock icon is clicked and there are no other windows open.
      if (mainWindow === null) createWindow();
    });
  })
  .catch(console.log);
