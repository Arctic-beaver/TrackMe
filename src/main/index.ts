import { join } from 'node:path'
import { app, BrowserWindow, Menu, nativeTheme } from 'electron'
import { is } from '@electron-toolkit/utils'
import {
	createDefaultApplicationSettings,
	type ApplicationSettings,
	type DesktopPlatform,
	type ResolvedInterfaceLocale
} from '../shared/contracts'
import {
	SettingsApplicationService,
	TaskApplicationService,
	type SettingsApplication,
	type TaskApplication
} from '../shared/application/services'
import { resolveInterfaceLocale } from '../shared/localization'
import { appProtocolUrl } from './appAssetPath'
import { registerAppProtocol, registerAppScheme } from './appProtocol'
import { createApplicationMenuTemplate } from './applicationMenu'
import { openTiempioDatabase, type TiempioDatabase } from './database/database'
import { SqliteSettingsRepository } from './database/settingsRepository'
import { SqliteTaskRepository } from './database/taskRepository'
import { prepareTiempioDatabasePath } from './database/userDataMigration'
import { registerIpcHandlers } from './ipc'

app.setName('Tiempio')

const packagedSmokeTest = process.argv.includes('--tiempio-packaged-smoke-test')
const smokeUserDataArgument = process.argv.find((argument) =>
	argument.startsWith('--tiempio-smoke-user-data=')
)
if (smokeUserDataArgument !== undefined) {
	app.setPath('userData', smokeUserDataArgument.slice('--tiempio-smoke-user-data='.length))
}

let mainWindow: BrowserWindow | null = null
let database: TiempioDatabase | null = null
let settingsApplication: SettingsApplication | null = null
let taskApplication: TaskApplication | null = null
let disposeIpc: (() => void) | null = null
let disposeProtocol: (() => void) | null = null
let activeSettings = createDefaultApplicationSettings()

function desktopPlatform(): DesktopPlatform {
	return process.platform === 'darwin'
		? 'darwin'
		: process.platform === 'linux'
			? 'linux'
			: 'win32'
}

function resolvedInterfaceLocale(): ResolvedInterfaceLocale {
	return resolveInterfaceLocale(activeSettings.language.interfaceLocale, app.getLocale())
}

function resolvedNativeScheme(): 'light' | 'dark' {
	return nativeTheme.shouldUseDarkColors ? 'dark' : 'light'
}

function nativeBackgroundColor(): string {
	return resolvedNativeScheme() === 'dark' ? '#0b1220' : '#dce6f1'
}

function configureApplicationMenu(): void {
	Menu.setApplicationMenu(
		Menu.buildFromTemplate(
			createApplicationMenuTemplate(process.platform, resolvedInterfaceLocale())
		)
	)
}

function applySettings(settings: ApplicationSettings): void {
	activeSettings = settings
	nativeTheme.themeSource = settings.appearance.scheme
	mainWindow?.setBackgroundColor(nativeBackgroundColor())
	configureApplicationMenu()
}

function configureWindowSecurity(window: BrowserWindow): void {
	window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
	window.webContents.on('will-navigate', (event) => event.preventDefault())
	window.webContents.on('will-attach-webview', (event) => event.preventDefault())
	window.webContents.session.setPermissionRequestHandler((_webContents, _permission, callback) =>
		callback(false)
	)
}

function createWindow(): BrowserWindow {
	const isMac = process.platform === 'darwin'
	const window = new BrowserWindow({
		width: 1440,
		height: 920,
		minWidth: 360,
		minHeight: 560,
		show: false,
		frame: isMac,
		titleBarStyle: isMac ? 'hiddenInset' : 'hidden',
		trafficLightPosition: isMac ? { x: 18, y: 17 } : undefined,
		backgroundColor: nativeBackgroundColor(),
		webPreferences: {
			preload: join(__dirname, '../preload/index.js'),
			contextIsolation: true,
			sandbox: true,
			nodeIntegration: false,
			webSecurity: true,
			allowRunningInsecureContent: false
		}
	})
	mainWindow = window
	configureWindowSecurity(window)
	window.on('closed', () => {
		if (mainWindow === window) mainWindow = null
	})
	window.webContents.once('did-fail-load', (_event, code, description) => {
		console.error('Tiempio renderer failed to load:', code, description)
		if (packagedSmokeTest) app.exit(1)
	})

	const loadRenderer =
		is.dev && process.env['ELECTRON_RENDERER_URL'] !== undefined
			? window.loadURL(process.env['ELECTRON_RENDERER_URL'])
			: window.loadURL(appProtocolUrl)
	void loadRenderer.catch((error: unknown) => {
		console.error('Tiempio renderer load failed:', error)
		if (packagedSmokeTest) app.exit(1)
	})
	return window
}

async function startApplication(): Promise<void> {
	app.setAppUserModelId('app.tiempio.desktop')
	const databasePath = await prepareTiempioDatabasePath({
		appDataPath: app.getPath('appData'),
		userDataPath: app.getPath('userData'),
		migratePreviousInstallation: smokeUserDataArgument === undefined
	})
	database = await openTiempioDatabase(databasePath)
	settingsApplication = new SettingsApplicationService(new SqliteSettingsRepository(database))
	taskApplication = new TaskApplicationService(new SqliteTaskRepository(database))
	applySettings(await settingsApplication.get())
	disposeProtocol = registerAppProtocol(join(__dirname, '../renderer'))
	disposeIpc = registerIpcHandlers({
		getWindow: () => mainWindow,
		getStartupState: (window) => ({
			settings: activeSettings,
			platform: desktopPlatform(),
			windowMaximized: window.isMaximized(),
			schemaVersion: database?.schemaVersion ?? 0
		}),
		settings: settingsApplication,
		tasks: taskApplication,
		onSettingsChanged: applySettings,
		onRendererReady: (window) => {
			if (packagedSmokeTest) {
				setTimeout(() => app.exit(0), 100)
				return
			}
			window.show()
		}
	})
	configureApplicationMenu()
	createWindow()

	app.on('activate', () => {
		if (mainWindow === null) createWindow()
		else mainWindow.focus()
	})
}

registerAppScheme()

const hasSingleInstanceLock = app.requestSingleInstanceLock()
if (!hasSingleInstanceLock) {
	app.quit()
} else {
	app.on('second-instance', () => {
		if (mainWindow === null && app.isReady()) createWindow()
		mainWindow?.focus()
	})

	void app
		.whenReady()
		.then(startApplication)
		.catch((error: unknown) => {
			console.error('Tiempio startup failed:', error)
			app.exit(1)
		})

	app.on('will-quit', () => {
		disposeIpc?.()
		disposeIpc = null
		disposeProtocol?.()
		disposeProtocol = null
		database?.close()
		database = null
		settingsApplication = null
		taskApplication = null
	})

	app.on('window-all-closed', () => {
		if (process.platform !== 'darwin') app.quit()
	})
}
