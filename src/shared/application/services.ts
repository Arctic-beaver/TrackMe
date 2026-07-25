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
import type { SettingsRepositoryPort, TaskRepositoryPort } from './ports'

export interface SettingsApplication {
	get(): Promise<ApplicationSettings>
	setAppearance(appearance: Appearance): Promise<ApplicationSettings>
	setInterfaceLocale(interfaceLocale: InterfaceLocale): Promise<ApplicationSettings>
}

export interface TaskApplication {
	getBoard(): Promise<TaskBoardSnapshot>
	listArchived(query: ListArchivedTasksQuery): Promise<ArchivedTaskPage>
	get(id: string): Promise<Task>
	create(draft: TaskDraft): Promise<Task>
	update(command: UpdateTaskCommand): Promise<Task>
	changeStatus(command: ChangeTaskStatusCommand): Promise<Task>
	archive(command: TaskRevisionCommand): Promise<Task>
	restore(command: TaskRevisionCommand): Promise<Task>
	createProject(draft: ProjectDraft): Promise<Project>
	updateProject(command: UpdateProjectCommand): Promise<Project>
}

export class SettingsApplicationService implements SettingsApplication {
	readonly #repository: SettingsRepositoryPort

	constructor(repository: SettingsRepositoryPort) {
		this.#repository = repository
	}

	async get(): Promise<ApplicationSettings> {
		return await this.#repository.get()
	}

	async setAppearance(appearance: Appearance): Promise<ApplicationSettings> {
		return await this.#repository.setAppearance(appearance)
	}

	async setInterfaceLocale(interfaceLocale: InterfaceLocale): Promise<ApplicationSettings> {
		return await this.#repository.setInterfaceLocale(interfaceLocale)
	}
}

export class TaskApplicationService implements TaskApplication {
	readonly #repository: TaskRepositoryPort

	constructor(repository: TaskRepositoryPort) {
		this.#repository = repository
	}

	async getBoard(): Promise<TaskBoardSnapshot> {
		return await this.#repository.getBoard()
	}

	async listArchived(query: ListArchivedTasksQuery): Promise<ArchivedTaskPage> {
		return await this.#repository.listArchived(query)
	}

	async get(id: string): Promise<Task> {
		return await this.#repository.get(id)
	}

	async create(draft: TaskDraft): Promise<Task> {
		return await this.#repository.create(draft)
	}

	async update(command: UpdateTaskCommand): Promise<Task> {
		return await this.#repository.update(command)
	}

	async changeStatus(command: ChangeTaskStatusCommand): Promise<Task> {
		return await this.#repository.changeStatus(command)
	}

	async archive(command: TaskRevisionCommand): Promise<Task> {
		return await this.#repository.archive(command)
	}

	async restore(command: TaskRevisionCommand): Promise<Task> {
		return await this.#repository.restore(command)
	}

	async createProject(draft: ProjectDraft): Promise<Project> {
		return await this.#repository.createProject(draft)
	}

	async updateProject(command: UpdateProjectCommand): Promise<Project> {
		return await this.#repository.updateProject(command)
	}
}
