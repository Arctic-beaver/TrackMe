import { BrowserWindow, ipcMain, type IpcMainInvokeEvent } from 'electron'
import { ipcChannels, type ApplicationSettings, type StartupState } from '../shared/contracts'
import {
	createIpcFailure,
	createIpcSuccess,
	IpcContractError,
	parseAppearance,
	parseInterfaceLocale,
	parseIpcRequest,
	parseNull,
	type IpcError,
	type IpcErrorCode,
	type RuntimeParser
} from '../shared/ipcProtocol'
import type { SettingsRepository } from './database/settingsRepository'

export class IpcFault extends Error {
	readonly code: IpcErrorCode

	constructor(code: IpcErrorCode, message: string) {
		super(message)
		this.name = 'IpcFault'
		this.code = code
	}
}

function toIpcError(error: unknown): IpcError {
	if (error instanceof IpcFault) return { code: error.code, message: error.message }
	if (error instanceof IpcContractError) {
		return { code: 'INVALID_REQUEST', message: error.message }
	}
	console.error('Unhandled TrackMe IPC error:', error)
	return { code: 'INTERNAL_ERROR', message: 'The application could not complete the request.' }
}

function assertTrustedSender(event: IpcMainInvokeEvent, window: BrowserWindow): void {
	if (event.sender !== window.webContents || event.senderFrame !== window.webContents.mainFrame) {
		throw new IpcFault('UNTRUSTED_SENDER', 'The request sender is not trusted.')
	}
}

export interface IpcDependencies {
	readonly getWindow: () => BrowserWindow | null
	readonly getStartupState: (window: BrowserWindow) => StartupState
	readonly settings: SettingsRepository
	readonly onSettingsChanged: (settings: ApplicationSettings) => void
	readonly onRendererReady: (window: BrowserWindow) => void
}

export function registerIpcHandlers(dependencies: IpcDependencies): () => void {
	const registeredChannels: string[] = []
	const requireWindow = (event: IpcMainInvokeEvent): BrowserWindow => {
		const window = dependencies.getWindow()
		if (window === null || window.isDestroyed()) {
			throw new IpcFault('WINDOW_UNAVAILABLE', 'Application window is unavailable.')
		}
		assertTrustedSender(event, window)
		return window
	}
	const register = <Payload, Result>(
		channel: string,
		parsePayload: RuntimeParser<Payload>,
		operation: (window: BrowserWindow, payload: Payload) => Result | Promise<Result>
	): void => {
		ipcMain.handle(channel, async (event, request: unknown) => {
			try {
				const window = requireWindow(event)
				const payload = parseIpcRequest(request, parsePayload)
				return createIpcSuccess(await operation(window, payload))
			} catch (error) {
				return createIpcFailure(toIpcError(error))
			}
		})
		registeredChannels.push(channel)
	}

	register(ipcChannels.getStartupState, parseNull, (window) =>
		dependencies.getStartupState(window)
	)
	register(ipcChannels.rendererReady, parseNull, (window) => {
		dependencies.onRendererReady(window)
		return null
	})
	register(ipcChannels.getSettings, parseNull, () => dependencies.settings.get())
	register(ipcChannels.setAppearance, parseAppearance, (_window, appearance) => {
		const settings = dependencies.settings.setAppearance(appearance)
		dependencies.onSettingsChanged(settings)
		return settings
	})
	register(ipcChannels.setInterfaceLocale, parseInterfaceLocale, (_window, locale) => {
		const settings = dependencies.settings.setInterfaceLocale(locale)
		dependencies.onSettingsChanged(settings)
		return settings
	})
	register(ipcChannels.minimizeWindow, parseNull, (window) => {
		window.minimize()
		return null
	})
	register(ipcChannels.toggleMaximizeWindow, parseNull, (window) => {
		if (window.isMaximized()) window.unmaximize()
		else window.maximize()
		return { maximized: window.isMaximized() }
	})
	register(ipcChannels.closeWindow, parseNull, (window) => {
		window.close()
		return null
	})
	register(ipcChannels.getWindowState, parseNull, (window) => ({
		maximized: window.isMaximized()
	}))

	return () => {
		for (const channel of registeredChannels) ipcMain.removeHandler(channel)
	}
}
