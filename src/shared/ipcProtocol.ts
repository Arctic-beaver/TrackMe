import {
	isColorScheme,
	isInterfaceLocale,
	isThemeFamily,
	type Appearance,
	type ApplicationSettings,
	type DesktopPlatform,
	type InterfaceLocale,
	type StartupState,
	type WindowState
} from './contracts'

export const ipcProtocolVersion = 1 as const

export type IpcErrorCode =
	| 'INTERNAL_ERROR'
	| 'INVALID_REQUEST'
	| 'STORAGE_BUSY'
	| 'STORAGE_CORRUPT'
	| 'MIGRATION_FAILED'
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
