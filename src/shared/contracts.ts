export const ipcChannels = Object.freeze({
	getStartupState: 'app:get-startup-state',
	rendererReady: 'app:renderer-ready',
	getSettings: 'settings:get',
	setAppearance: 'settings:set-appearance',
	setInterfaceLocale: 'settings:set-interface-locale',
	getTaskBoard: 'tasks:get-board',
	getTask: 'tasks:get',
	createTask: 'tasks:create',
	updateTask: 'tasks:update',
	changeTaskStatus: 'tasks:change-status',
	archiveTask: 'tasks:archive',
	restoreTask: 'tasks:restore',
	createProject: 'projects:create',
	updateProject: 'projects:update',
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
export const taskStatuses = Object.freeze(['todo', 'planned', 'in_progress', 'done'] as const)
export const taskStartModes = Object.freeze(['auto', 'manual'] as const)
export const taskUrgencies = Object.freeze([
	'due_today',
	'overdue',
	'at_risk',
	'upcoming',
	'completed'
] as const)

export type ThemeFamily = (typeof themeFamilies)[number]
export type ColorScheme = (typeof colorSchemes)[number]
export type ResolvedColorScheme = Exclude<ColorScheme, 'system'>
export type InterfaceLocale = (typeof interfaceLocales)[number]
export type ResolvedInterfaceLocale = Exclude<InterfaceLocale, 'system'>
export type NavigationSection = (typeof navigationSections)[number]
export type TaskStatus = (typeof taskStatuses)[number]
export type TaskStartMode = (typeof taskStartModes)[number]
export type TaskUrgency = (typeof taskUrgencies)[number]
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

export function isTaskStatus(value: unknown): value is TaskStatus {
	return taskStatuses.some((status) => value === status)
}

export function isTaskStartMode(value: unknown): value is TaskStartMode {
	return taskStartModes.some((mode) => value === mode)
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

export interface Project {
	readonly id: string
	readonly name: string
	readonly description: string
	readonly revision: number
	readonly createdAt: string
	readonly updatedAt: string
	readonly completedTaskCount: number
	readonly totalTaskCount: number
}

export interface Tag {
	readonly id: string
	readonly name: string
	readonly createdAt: string
}

export interface Task {
	readonly id: string
	readonly title: string
	readonly description: string
	readonly status: TaskStatus
	readonly estimateDays: number
	readonly dueDate: string
	readonly preferredStartDate: string
	readonly startMode: TaskStartMode
	readonly plannedForDate: string | null
	readonly projectId: string | null
	readonly tags: readonly Tag[]
	readonly archivedAt: string | null
	readonly completedAt: string | null
	readonly revision: number
	readonly createdAt: string
	readonly updatedAt: string
}

export interface TaskBoardSnapshot {
	readonly tasks: readonly Task[]
	readonly archivedTasks: readonly Task[]
	readonly projects: readonly Project[]
	readonly tags: readonly Tag[]
}

export interface TaskDraft {
	readonly title: string
	readonly description: string
	readonly status: TaskStatus
	readonly estimateDays: number
	readonly dueDate: string
	readonly startMode: TaskStartMode
	readonly preferredStartDate: string | null
	readonly projectId: string | null
	readonly tagNames: readonly string[]
	readonly localDate: string
}

export interface UpdateTaskCommand extends TaskDraft {
	readonly id: string
	readonly expectedRevision: number
}

export interface ChangeTaskStatusCommand {
	readonly id: string
	readonly expectedRevision: number
	readonly status: TaskStatus
	readonly localDate: string
}

export interface TaskRevisionCommand {
	readonly id: string
	readonly expectedRevision: number
	readonly localDate: string
}

export interface ProjectDraft {
	readonly name: string
	readonly description: string
}

export interface UpdateProjectCommand extends ProjectDraft {
	readonly id: string
	readonly expectedRevision: number
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
	readonly tasks: {
		getBoard(localDate: string): Promise<TaskBoardSnapshot>
		get(id: string): Promise<Task>
		create(draft: TaskDraft): Promise<Task>
		update(command: UpdateTaskCommand): Promise<Task>
		changeStatus(command: ChangeTaskStatusCommand): Promise<Task>
		archive(command: TaskRevisionCommand): Promise<Task>
		restore(command: TaskRevisionCommand): Promise<Task>
	}
	readonly projects: {
		create(draft: ProjectDraft): Promise<Project>
		update(command: UpdateProjectCommand): Promise<Project>
	}
	readonly window: {
		minimize(): Promise<void>
		toggleMaximize(): Promise<WindowState>
		close(): Promise<void>
		getState(): Promise<WindowState>
	}
}
