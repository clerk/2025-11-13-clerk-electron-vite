import { app, shell, BrowserWindow, ipcMain } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'
import http from 'http'
import fs from 'fs'
import { extname } from 'path'

let server: http.Server | null = null

// MIME type mapping
const mimeTypes: Record<string, string> = {
  '.html': 'text/html',
  '.js': 'application/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.eot': 'application/vnd.ms-fontobject'
}

function getMimeType(filePath: string): string {
  const ext = extname(filePath).toLowerCase()
  return mimeTypes[ext] || 'application/octet-stream'
}

function createServer(): Promise<void> {
  // If server already exists, resolve immediately
  if (server) {
    return Promise.resolve()
  }

  return new Promise((resolve, reject) => {
    const rendererPath = join(__dirname, '../renderer')

    server = http.createServer((req, res) => {
      let filePath = rendererPath

      // Handle root path
      if (req.url === '/' || req.url === '/index.html') {
        filePath = join(rendererPath, 'index.html')
      } else {
        // Handle other paths (assets, etc.)
        filePath = join(rendererPath, req.url || '')
      }

      // Security: prevent directory traversal
      if (!filePath.startsWith(rendererPath)) {
        res.writeHead(403)
        res.end('Forbidden')
        return
      }

      fs.readFile(filePath, (err, data) => {
        if (err) {
          if (err.code === 'ENOENT') {
            res.writeHead(404, { 'Content-Type': 'text/plain' })
            res.end('Not found')
          } else {
            res.writeHead(500, { 'Content-Type': 'text/plain' })
            res.end('Server error')
          }
          return
        }

        const mimeType = getMimeType(filePath)
        res.writeHead(200, { 'Content-Type': mimeType })
        res.end(data)
      })
    })

    server.listen(3000, '127.0.0.1', () => {
      console.log('HTTP server running on http://127.0.0.1:3000')
      resolve()
    })

    server.on('error', (err) => {
      reject(err)
    })
  })
}

async function createWindow(): Promise<void> {
  // Create the browser window.
  const mainWindow = new BrowserWindow({
    width: 900,
    height: 670,
    show: false,
    autoHideMenuBar: true,
    ...(process.platform === 'linux' ? { icon } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  // HMR for renderer base on electron-vite cli.
  // Load the remote URL for development or use HTTP server for production.
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    // Start HTTP server and load via HTTP to ensure window.location.protocol is 'http:'
    await createServer()
    mainWindow.loadURL('http://127.0.0.1:3000/')
  }
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

// Clean up HTTP server on app quit
app.on('before-quit', () => {
  if (server) {
    server.close()
    server = null
  }
})

// In this file you can include the rest of your app's specific main process
// code. You can also put them in separate files and require them here.
