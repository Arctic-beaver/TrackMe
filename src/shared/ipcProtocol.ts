import {
	isColorScheme,
	isInterfaceLocale,
	isTaskStartMode,
	isTaskStatus,
	isThemeFamily,
	type Appearance,
	type ApplicationSettings,
	type ArchivedTaskPage,
	type ChangeTaskStatusCommand,
	type DesktopPlatform,
	type InterfaceLocale,
	type ListArchivedTasksQuery,
	type Project,
	type ProjectDraft,
	type StartupState,
	type Tag,
	type Task,
	type TaskBoardSnapshot,
	type TaskDraft,
	type TaskRevisionCommand,
	type UpdateProjectCommand,
	type UpdateTaskCommand,
	type WindowState
} from './contracts'
import { isLocalDate } from './taskDomain'

export const ipcProtocolVersion = 1 as const

export type IpcErrorCode =
	| 'INTERNAL_ERROR'
	| 'INVALID_REQUEST'
	| 'STORAGE_BUSY'
	| 'STORAGE_CORRUPT'
	| 'MIGRATION_FAILED'
	| 'REVISION_CONFLICT'
	| 'UNTRUSTED_SENDER'
	| 'WINDOW_UNAVAILABLE'

export interface IpcError {
	readonly code: IpcErrorCode
	readonly message: string
}

export interface IpcRequest<T> {
	readonly version: typeof ipcProtocolVersion
	readonly payload: T
}

export type IpcResponse<T> =
	| {
			readonly version: typeof ipcProtocolVersion
			readonly ok: true
			readonly data: T
	  }
	| {
			readonly version: typeof ipcProtocolVersion
			readonly ok: false
			readonly error: IpcError
	  }

export type RuntimeParser<T> = (value: unknown) => T

const errorCodes = new Set<IpcErrorCode>([
	'INTERNAL_ERROR',
	'INVALID_REQUEST',
	'STORAGE_BUSY',
	'STORAGE_CORRUPT',
	'MIGRATION_FAILED',
	'REVISION_CONFLICT',
	'UNTRUSTED_SENDER',
	'WINDOW_UNAVAILABLE'
])

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function protocolRecord(value: unknown, label: string): Record<string, unknown> {
	if (!isRecord(value) || value.version !== ipcProtocolVersion) {
		throw new IpcContractError(`${label} does not match IPC protocol v${ipcProtocolVersion}.`)
	}
	return value
}

function parseDesktopPlatform(value: unknown): DesktopPlatform {
	if (value !== 'win32' && value !== 'darwin' && value !== 'linux') {
		throw new IpcContractError('Desktop platform is invalid.')
	}
	return value
}

function parseSafeInteger(value: unknown, label: string): number {
	if (!Number.isSafeInteger(value) || Number(value) < 0) {
		throw new IpcContractError(`${label} is invalid.`)
	}
	return Number(value)
}

function parseBoolean(value: unknown, label: string): boolean {
	if (typeof value !== 'boolean') {
		throw new IpcContractError(`${label} is invalid.`)
	}
	return value
}

function parseString(value: unknown, label: string, maximumLength = 20_000): string {
	if (typeof value !== 'string' || value.length > maximumLength) {
		throw new IpcContractError(`${label} is invalid.`)
	}
	return value
}

function parseId(value: unknown, label = 'Identifier'): string {
	const id = parseString(value, label, 128)
	if (id.length === 0) throw new IpcContractError(`${label} is invalid.`)
	return id
}

function parseNullableString(value: unknown, label: string): string | null {
	return value === null ? null : parseString(value, label)
}

function parsePositiveInteger(value: unknown, label: string): number {
	const parsed = parseSafeInteger(value, label)
	if (parsed < 1) throw new IpcContractError(`${label} is invalid.`)
	return parsed
}

function parseLocalDate(value: unknown, label: string): string {
	if (!isLocalDate(value)) throw new IpcContractError(`${label} is invalid.`)
	return value
}

function parseStringArray(value: unknown, label: string): readonly string[] {
	if (!Array.isArray(value) || value.length > 200) {
		throw new IpcContractError(`${label} is invalid.`)
	}
	return Object.freeze(value.map((item) => parseString(item, label, 80)))
}

export class IpcContractError extends Error {
	constructor(message: string) {
		super(message)
		this.name = 'IpcContractError'
	}
}

export class IpcRemoteError extends Error {
	readonly code: IpcErrorCode

	constructor(error: IpcError) {
		super(error.message)
		this.name = 'IpcRemoteError'
		this.code = error.code
	}
}

export function createIpcRequest<T>(payload: T): IpcRequest<T> {
	return { version: ipcProtocolVersion, payload }
}

export function parseIpcRequest<T>(value: unknown, parsePayload: RuntimeParser<T>): T {
	return parsePayload(protocolRecord(value, 'Request').payload)
}

export function createIpcSuccess<T>(data: T): IpcResponse<T> {
	return { version: ipcProtocolVersion, ok: true, data }
}

export function createIpcFailure(error: IpcError): IpcResponse<never> {
	return { version: ipcProtocolVersion, ok: false, error }
}

export function parseIpcResponse<T>(value: unknown, parseData: RuntimeParser<T>): T {
	const response = protocolRecord(value, 'Response')
	if (response.ok === true) return parseData(response.data)
	if (response.ok !== false || !isRecord(response.error)) {
		throw new IpcContractError('Response has an invalid result shape.')
	}
	const { code, message } = response.error
	if (
		typeof code !== 'string' ||
		!errorCodes.has(code as IpcErrorCode) ||
		typeof message !== 'string' ||
		message.length === 0 ||
		message.length > 2_048
	) {
		throw new IpcContractError('Response has an invalid error shape.')
	}
	throw new IpcRemoteError({ code: code as IpcErrorCode, message })
}

export function parseNull(value: unknown): null {
	if (value !== null) throw new IpcContractError('Expected an empty payload.')
	return null
}

export function parseAppearance(value: unknown): Appearance {
	if (!isRecord(value) || !isThemeFamily(value.family) || !isColorScheme(value.scheme)) {
		throw new IpcContractError('Appearance settings are invalid.')
	}
	return Object.freeze({ family: value.family, scheme: value.scheme })
}

export function parseInterfaceLocale(value: unknown): InterfaceLocale {
	if (!isInterfaceLocale(value)) {
		throw new IpcContractError('Interface locale is invalid.')
	}
	return value
}

export function parseApplicationSettings(value: unknown): ApplicationSettings {
	if (!isRecord(value) || value.version !== 1 || !isRecord(value.language)) {
		throw new IpcContractError('Application settings do not match version 1.')
	}
	return Object.freeze({
		version: 1,
		appearance: parseAppearance(value.appearance),
		language: Object.freeze({
			interfaceLocale: parseInterfaceLocale(value.language.interfaceLocale)
		})
	})
}

export function parseWindowState(value: unknown): WindowState {
	if (!isRecord(value) || typeof value.maximized !== 'boolean') {
		throw new IpcContractError('Window state is invalid.')
	}
	return { maximized: value.maximized }
}

export function parseStartupState(value: unknown): StartupState {
	if (!isRecord(value)) throw new IpcContractError('Startup state is invalid.')
	return Object.freeze({
		settings: parseApplicationSettings(value.settings),
		platform: parseDesktopPlatform(value.platform),
		windowMaximized: parseBoolean(value.windowMaximized, 'Window state'),
		schemaVersion: parseSafeInteger(value.schemaVersion, 'Schema version')
	})
}

export function parseTaskDraft(value: unknown): TaskDraft {
	if (!isRecord(value) || !isTaskStatus(value.status) || !isTaskStartMode(value.startMode)) {
		throw new IpcContractError('Task draft is invalid.')
	}
	return Object.freeze({
		title: parseString(value.title, 'Task title', 240),
		description: parseString(value.description, 'Task description'),
		status: value.status,
		estimateDays: parsePositiveInteger(value.estimateDays, 'Task estimate'),
		dueDate: parseLocalDate(value.dueDate, 'Task deadline'),
		startMode: value.startMode,
		preferredStartDate:
			value.preferredStartDate === null
				? null
				: parseLocalDate(value.preferredStartDate, 'Task preferred start'),
		projectId: value.projectId === null ? null : parseId(value.projectId, 'Project identifier'),
		tagNames: parseStringArray(value.tagNames, 'Task tags')
	})
}

export function parseUpdateTaskCommand(value: unknown): UpdateTaskCommand {
	if (!isRecord(value)) throw new IpcContractError('Task update is invalid.')
	return Object.freeze({
		...parseTaskDraft(value),
		id: parseId(value.id, 'Task identifier'),
		expectedRevision: parsePositiveInteger(value.expectedRevision, 'Task revision')
	})
}

export function parseChangeTaskStatusCommand(value: unknown): ChangeTaskStatusCommand {
	if (!isRecord(value) || !isTaskStatus(value.status)) {
		throw new IpcContractError('Task status change is invalid.')
	}
	return Object.freeze({
		id: parseId(value.id, 'Task identifier'),
		expectedRevision: parsePositiveInteger(value.expectedRevision, 'Task revision'),
		status: value.status
	})
}

export function parseTaskRevisionCommand(value: unknown): TaskRevisionCommand {
	if (!isRecord(value)) throw new IpcContractError('Task revision command is invalid.')
	return Object.freeze({
		id: parseId(value.id, 'Task identifier'),
		expectedRevision: parsePositiveInteger(value.expectedRevision, 'Task revision')
	})
}

export function parseProjectDraft(value: unknown): ProjectDraft {
	if (!isRecord(value)) throw new IpcContractError('Project draft is invalid.')
	return Object.freeze({
		name: parseString(value.name, 'Project name', 160),
		description: parseString(value.description, 'Project description')
	})
}

export function parseUpdateProjectCommand(value: unknown): UpdateProjectCommand {
	if (!isRecord(value)) throw new IpcContractError('Project update is invalid.')
	return Object.freeze({
		...parseProjectDraft(value),
		id: parseId(value.id, 'Project identifier'),
		expectedRevision: parsePositiveInteger(value.expectedRevision, 'Project revision')
	})
}

export function parseTaskId(value: unknown): string {
	return parseId(value, 'Task identifier')
}

export function parseListArchivedTasksQuery(value: unknown): ListArchivedTasksQuery {
	if (!isRecord(value)) throw new IpcContractError('Archived task query is invalid.')
	const offset = parseSafeInteger(value.offset, 'Archived task offset')
	const limit = parsePositiveInteger(value.limit, 'Archived task limit')
	if (limit > 50) throw new IpcContractError('Archived task limit is invalid.')
	return Object.freeze({ offset, limit })
}

export function parseTag(value: unknown): Tag {
	if (!isRecord(value)) throw new IpcContractError('Tag is invalid.')
	return Object.freeze({
		id: parseId(value.id, 'Tag identifier'),
		name: parseString(value.name, 'Tag name', 80),
		createdAt: parseString(value.createdAt, 'Tag creation time', 64)
	})
}

export function parseProject(value: unknown): Project {
	if (!isRecord(value)) throw new IpcContractError('Project is invalid.')
	return Object.freeze({
		id: parseId(value.id, 'Project identifier'),
		name: parseString(value.name, 'Project name', 160),
		description: parseString(value.description, 'Project description'),
		revision: parsePositiveInteger(value.revision, 'Project revision'),
		createdAt: parseString(value.createdAt, 'Project creation time', 64),
		updatedAt: parseString(value.updatedAt, 'Project update time', 64),
		completedTaskCount: parseSafeInteger(value.completedTaskCount, 'Completed task count'),
		totalTaskCount: parseSafeInteger(value.totalTaskCount, 'Total task count')
	})
}

export function parseTask(value: unknown): Task {
	if (
		!isRecord(value) ||
		!isTaskStatus(value.status) ||
		!isTaskStartMode(value.startMode) ||
		!Array.isArray(value.tags)
	) {
		throw new IpcContractError('Task is invalid.')
	}
	return Object.freeze({
		id: parseId(value.id, 'Task identifier'),
		title: parseString(value.title, 'Task title', 240),
		description: parseString(value.description, 'Task description'),
		status: value.status,
		estimateDays: parsePositiveInteger(value.estimateDays, 'Task estimate'),
		dueDate: parseLocalDate(value.dueDate, 'Task deadline'),
		preferredStartDate: parseLocalDate(value.preferredStartDate, 'Task preferred start'),
		startMode: value.startMode,
		plannedForDate:
			value.plannedForDate === null
				? null
				: parseLocalDate(value.plannedForDate, 'Task planned date'),
		projectId: value.projectId === null ? null : parseId(value.projectId, 'Project identifier'),
		tags: Object.freeze(value.tags.map(parseTag)),
		archivedAt: parseNullableString(value.archivedAt, 'Task archive time'),
		completedAt: parseNullableString(value.completedAt, 'Task completion time'),
		revision: parsePositiveInteger(value.revision, 'Task revision'),
		createdAt: parseString(value.createdAt, 'Task creation time', 64),
		updatedAt: parseString(value.updatedAt, 'Task update time', 64)
	})
}

export function parseTaskBoardSnapshot(value: unknown): TaskBoardSnapshot {
	if (
		!isRecord(value) ||
		!Array.isArray(value.tasks) ||
		!Array.isArray(value.projects) ||
		!Array.isArray(value.tags)
	) {
		throw new IpcContractError('Task board is invalid.')
	}
	return Object.freeze({
		tasks: Object.freeze(value.tasks.map(parseTask)),
		archivedTaskCount: parseSafeInteger(value.archivedTaskCount, 'Archived task count'),
		projects: Object.freeze(value.projects.map(parseProject)),
		tags: Object.freeze(value.tags.map(parseTag))
	})
}

export function parseArchivedTaskPage(value: unknown): ArchivedTaskPage {
	if (!isRecord(value) || !Array.isArray(value.tasks)) {
		throw new IpcContractError('Archived task page is invalid.')
	}
	return Object.freeze({
		tasks: Object.freeze(value.tasks.map(parseTask)),
		total: parseSafeInteger(value.total, 'Archived task count'),
		offset: parseSafeInteger(value.offset, 'Archived task offset'),
		hasMore: parseBoolean(value.hasMore, 'Archived task continuation')
	})
}
