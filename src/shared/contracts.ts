export const ipcChannels = Object.freeze({
	getStartupState: 'app:get-startup-state',
	rendererReady: 'app:renderer-ready',
	getSettings: 'settings:get',
	setAppearance: 'settings:set-appearance',
	setInterfaceLocale: 'settings:set-interface-locale',
	minimizeWindow: 'window:minimize',
	toggleMaximizeWindow: 'window:toggle-maximize',
	closeWindow: 'window:close',
	getWindowState: 'window:get-state'
})

export const themeFamilies = Object.freeze([
	'graphite-navy',
	'linen-blue',
	'pebble-steel',
	'fog-indigo'
] as const)
export const colorSchemes = Object.freeze(['system', 'light', 'dark'] as const)
export const interfaceLocales = Object.freeze(['system', 'en', 'ru', 'es'] as const)
export const navigationSections = Object.freeze(['today', 'week', 'month', 'projects'] as const)

export type ThemeFamily = (typeof themeFamilies)[number]
export type ColorScheme = (typeof colorSchemes)[number]
export type ResolvedColorScheme = Exclude<ColorScheme, 'system'>
export type InterfaceLocale = (typeof interfaceLocales)[number]
export type ResolvedInterfaceLocale = Exclude<InterfaceLocale, 'system'>
export type NavigationSection = (typeof navigationSections)[number]
export type DesktopPlatform = 'win32' | 'darwin' | 'linux'

export function isThemeFamily(value: unknown): value is ThemeFamily {
	return themeFamilies.some((family) => value === family)
}

export function isColorScheme(value: unknown): value is ColorScheme {
	return colorSchemes.some((scheme) => value === scheme)
}

export function isInterfaceLocale(value: unknown): value is InterfaceLocale {
	return interfaceLocales.some((locale) => value === locale)
}

export interface Appearance {
	readonly family: ThemeFamily
	readonly scheme: ColorScheme
}

export interface ApplicationSettings {
	readonly version: 1
	readonly appearance: Appearance
	readonly language: {
		readonly interfaceLocale: InterfaceLocale
	}
}

export interface WindowState {
	readonly maximized: boolean
}

export interface StartupState {
	readonly settings: ApplicationSettings
	readonly platform: DesktopPlatform
	readonly windowMaximized: boolean
	readonly schemaVersion: number
}

export const defaultAppearance: Appearance = Object.freeze({
	family: 'graphite-navy',
	scheme: 'system'
})

export function createDefaultApplicationSettings(): ApplicationSettings {
	return Object.freeze({
		version: 1,
		appearance: Object.freeze({ ...defaultAppearance }),
		language: Object.freeze({
			interfaceLocale: 'system'
		})
	})
}

export interface TrackMeApi {
	readonly app: {
		getStartupState(): Promise<StartupState>
		ready(): Promise<void>
	}
	readonly settings: {
		get(): Promise<ApplicationSettings>
		setAppearance(appearance: Appearance): Promise<ApplicationSettings>
		setInterfaceLocale(locale: InterfaceLocale): Promise<ApplicationSettings>
	}
	readonly window: {
		minimize(): Promise<void>
		toggleMaximize(): Promise<WindowState>
		close(): Promise<void>
		getState(): Promise<WindowState>
	}
}
