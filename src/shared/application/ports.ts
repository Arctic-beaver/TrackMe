import type {
	Appearance,
	ApplicationSettings,
	ArchivedTaskPage,
	ChangeTaskStatusCommand,
	InterfaceLocale,
	ListArchivedTasksQuery,
	Project,
	ProjectDraft,
	Task,
	TaskBoardSnapshot,
	TaskDraft,
	TaskRevisionCommand,
	UpdateProjectCommand,
	UpdateTaskCommand
} from '../contracts'

export type Awaitable<Result> = Result | Promise<Result>

export interface SettingsRepositoryPort {
	get(): Awaitable<ApplicationSettings>
	setAppearance(appearance: Appearance): Awaitable<ApplicationSettings>
	setInterfaceLocale(interfaceLocale: InterfaceLocale): Awaitable<ApplicationSettings>
}

export interface TaskRepositoryPort {
	getBoard(): Awaitable<TaskBoardSnapshot>
	listArchived(query: ListArchivedTasksQuery): Awaitable<ArchivedTaskPage>
	get(id: string): Awaitable<Task>
	create(draft: TaskDraft): Awaitable<Task>
	update(command: UpdateTaskCommand): Awaitable<Task>
	changeStatus(command: ChangeTaskStatusCommand): Awaitable<Task>
	archive(command: TaskRevisionCommand): Awaitable<Task>
	restore(command: TaskRevisionCommand): Awaitable<Task>
	createProject(draft: ProjectDraft): Awaitable<Project>
	updateProject(command: UpdateProjectCommand): Awaitable<Project>
}
