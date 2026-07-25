import { contextBridge, ipcRenderer } from 'electron'
import { ipcChannels, type TiempioApi } from '../shared/contracts'
import {
	createIpcRequest,
	parseArchivedTaskPage,
	parseApplicationSettings,
	parseAppearance,
	parseChangeTaskStatusCommand,
	parseInterfaceLocale,
	parseIpcResponse,
	parseListArchivedTasksQuery,
	parseNull,
	parseProject,
	parseProjectDraft,
	parseStartupState,
	parseTask,
	parseTaskBoardSnapshot,
	parseTaskDraft,
	parseTaskId,
	parseTaskRevisionCommand,
	parseUpdateProjectCommand,
	parseUpdateTaskCommand,
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

const tiempioApi: TiempioApi = {
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
	tasks: {
		getBoard: () => invokeValidated(ipcChannels.getTaskBoard, null, parseTaskBoardSnapshot),
		listArchived: (query) =>
			invokeValidated(
				ipcChannels.listArchivedTasks,
				parseListArchivedTasksQuery(query),
				parseArchivedTaskPage
			),
		get: (id) => invokeValidated(ipcChannels.getTask, parseTaskId(id), parseTask),
		create: (draft) =>
			invokeValidated(ipcChannels.createTask, parseTaskDraft(draft), parseTask),
		update: (command) =>
			invokeValidated(ipcChannels.updateTask, parseUpdateTaskCommand(command), parseTask),
		changeStatus: (command) =>
			invokeValidated(
				ipcChannels.changeTaskStatus,
				parseChangeTaskStatusCommand(command),
				parseTask
			),
		archive: (command) =>
			invokeValidated(ipcChannels.archiveTask, parseTaskRevisionCommand(command), parseTask),
		restore: (command) =>
			invokeValidated(ipcChannels.restoreTask, parseTaskRevisionCommand(command), parseTask)
	},
	projects: {
		create: (draft) =>
			invokeValidated(ipcChannels.createProject, parseProjectDraft(draft), parseProject),
		update: (command) =>
			invokeValidated(
				ipcChannels.updateProject,
				parseUpdateProjectCommand(command),
				parseProject
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

if (!process.contextIsolated) throw new Error('Tiempio requires Electron context isolation.')
contextBridge.exposeInMainWorld('tiempio', tiempioApi)
