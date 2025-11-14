import { app, shell, BrowserWindow, ipcMain } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'

import { channels } from '../shared/channels'

function createWindow(): void {
  // Create the browser window.
  const mainWindow = new BrowserWindow({
    width: 900,
    height: 870,
    show: false,
    autoHideMenuBar: true,

    // NOTE: Don't actually use this in production.
    // Just printing the env + not-private PK for demonstrative purposes.
    // This also does not update during HMR.
    title:
      (is.dev ? 'Mode: DEV | PK: ' : 'Mode: PROD | PK: ') +
      import.meta.env.VITE_CLERK_PUBLISHABLE_KEY,
    ...(process.platform === 'linux' ? { icon } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  })

  // How do I change the name of the electron window?
  // https://github.com/electron/electron/issues/2543#issuecomment-420513776
  mainWindow.on('page-title-updated', function (e) {
    e.preventDefault()
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  // HMR for renderer base on electron-vite cli.
  // Load the remote URL for development or the local html file for production.
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }

  // [DEBUG] Open DevTools
  mainWindow.webContents.openDevTools()
}

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.whenReady().then(() => {
  // Set app user model id for windows
  electronApp.setAppUserModelId('com.electron')

  // Default open or close DevTools by F12 in development
  // and ignore CommandOrControl + R in production.
  // see https://github.com/alex8088/electron-toolkit/tree/master/packages/utils
  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  // IPC test
  ipcMain.on('ping', () => console.log('pong'))

  createWindow()

  app.on('activate', function () {
    // On macOS it's common to re-create a window in the app when the
    // dock icon is clicked and there are no other windows open.
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

// In this file you can include the rest of your app's specific main process
// code. You can also put them in separate files and require them here.

/**
 * Clerk token cache
 */
let _token: string | null = null

// Main process IPC Handlers
ipcMain.on(channels.AUTH_TOKEN_SET, (_event, token) => {
  console.log('[main] auth:token:set')
  _token = token
})

ipcMain.handle(channels.AUTH_TOKEN_GET, async () => {
  console.log('[main] auth:token:get')
  return _token
})

ipcMain.on(channels.AUTH_TOKEN_CLEAR, () => {
  console.log('[main] auth:token:clear')
  _token = null
})

// HTTP proxy handler - forwards HTTP requests from renderer to main process
ipcMain.handle(channels.HTTP_REQUEST, async (_event, options) => {
  const { url, method = 'GET', headers = {}, body } = options

  try {
    const res = await fetch(url, { method, headers, body })
    const text = await res.text()

    return {
      ok: res.ok,
      status: res.status,
      statusText: res.statusText,
      headers: Object.fromEntries(res.headers.entries()),
      body: text
    }
  } catch (error) {
    console.error('[main] http:request error', url, error)
    // Return error information in a structured way
    return {
      ok: false,
      status: 0,
      statusText: error instanceof Error ? error.message : 'Unknown error',
      headers: {},
      body: '',
      error: error instanceof Error ? error.message : String(error)
    }
  }
})
