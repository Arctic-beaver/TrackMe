import { contextBridge, ipcRenderer } from 'electron'
import { ipcChannels, type TrackMeApi } from '../shared/contracts'
import {
	createIpcRequest,
	parseApplicationSettings,
	parseAppearance,
	parseInterfaceLocale,
	parseIpcResponse,
	parseNull,
	parseStartupState,
	parseWindowState,
	type RuntimeParser
} from '../shared/ipcProtocol'

async function invokeValidated<Payload, Result>(
	channel: string,
	payload: Payload,
	parseResult: RuntimeParser<Result>
): Promise<Result> {
	const response: unknown = await ipcRenderer.invoke(channel, createIpcRequest(payload))
	return parseIpcResponse(response, parseResult)
}

async function invokeEmpty(channel: string): Promise<void> {
	await invokeValidated(channel, null, parseNull)
}

const trackMeApi: TrackMeApi = {
	app: {
		getStartupState: () =>
			invokeValidated(ipcChannels.getStartupState, null, parseStartupState),
		ready: () => invokeEmpty(ipcChannels.rendererReady)
	},
	settings: {
		get: () => invokeValidated(ipcChannels.getSettings, null, parseApplicationSettings),
		setAppearance: (appearance) =>
			invokeValidated(
				ipcChannels.setAppearance,
				parseAppearance(appearance),
				parseApplicationSettings
			),
		setInterfaceLocale: (locale) =>
			invokeValidated(
				ipcChannels.setInterfaceLocale,
				parseInterfaceLocale(locale),
				parseApplicationSettings
			)
	},
	window: {
		minimize: () => invokeEmpty(ipcChannels.minimizeWindow),
		toggleMaximize: () =>
			invokeValidated(ipcChannels.toggleMaximizeWindow, null, parseWindowState),
		close: () => invokeEmpty(ipcChannels.closeWindow),
		getState: () => invokeValidated(ipcChannels.getWindowState, null, parseWindowState)
	}
}

if (!process.contextIsolated) throw new Error('TrackMe requires Electron context isolation.')
contextBridge.exposeInMainWorld('trackme', trackMeApi)
