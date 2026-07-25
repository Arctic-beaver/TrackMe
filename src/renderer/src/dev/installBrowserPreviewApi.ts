import {
	createDefaultApplicationSettings,
	type ApplicationSettings,
	type Project,
	type Tag,
	type Task,
	type TaskBoardSnapshot,
	type TrackMeApi
} from '../../../shared/contracts'
import {
	addLocalDateDays,
	normalizeEntityName,
	prepareTaskDraft,
	todayLocalDate
} from '../../../shared/taskDomain'

let settings = createDefaultApplicationSettings()
let nextId = 0
let tasks: Task[] = []
let projects: Project[] = []
let tags: Tag[] = []

function id(prefix: string): string {
	nextId += 1
	return `${prefix}-${String(nextId)}`
}

function now(): string {
	return new Date().toISOString()
}

function projectWithProgress(project: Project): Project {
	const projectTasks = tasks.filter(
		(task) => task.archivedAt === null && task.projectId === project.id
	)
	return {
		...project,
		totalTaskCount: projectTasks.length,
		completedTaskCount: projectTasks.filter((task) => task.status === 'done').length
	}
}

function board(): TaskBoardSnapshot {
	return {
		tasks: tasks.filter((task) => task.archivedAt === null),
		archivedTaskCount: tasks.filter((task) => task.archivedAt !== null).length,
		projects: projects.map(projectWithProgress),
		tags
	}
}

function resolveTags(names: readonly string[]): readonly Tag[] {
	return names.map((name) => {
		const normalized = normalizeEntityName(name)
		const existing = tags.find((tag) => normalizeEntityName(tag.name) === normalized)
		if (existing !== undefined) return existing
		const created = { id: id('tag'), name: name.trim(), createdAt: now() }
		tags = [...tags, created]
		return created
	})
}

function updateTask(idValue: string, operation: (current: Task) => Task): Task {
	const current = tasks.find((task) => task.id === idValue)
	if (current === undefined) throw new Error('Task not found.')
	const updated = operation(current)
	tasks = tasks.map((task) => (task.id === idValue ? updated : task))
	return updated
}

function installPreviewSeed(): void {
	if (tasks.length > 0) return
	const localDate = todayLocalDate()
	const createdAt = now()
	const project: Project = {
		id: id('project'),
		name: 'TrackMe',
		description: 'A calm local-first planner',
		revision: 1,
		createdAt,
		updatedAt: createdAt,
		completedTaskCount: 0,
		totalTaskCount: 0
	}
	projects = [project]
	const focusTag: Tag = { id: id('tag'), name: 'Focus', createdAt }
	tags = [focusTag]
	const samples: Array<Pick<Task, 'title' | 'status' | 'estimateDays' | 'dueDate'>> = [
		{ title: 'Review the Today flow', status: 'todo', estimateDays: 1, dueDate: localDate },
		{
			title: 'Polish keyboard controls',
			status: 'planned',
			estimateDays: 3,
			dueDate: addLocalDateDays(localDate, 1)
		},
		{
			title: 'Verify local persistence',
			status: 'in_progress',
			estimateDays: 1,
			dueDate: addLocalDateDays(localDate, 4)
		},
		{
			title: 'Secure the Electron bridge',
			status: 'done',
			estimateDays: 1,
			dueDate: addLocalDateDays(localDate, -1)
		}
	]
	tasks = samples.map((sample, index) => ({
		id: id('task'),
		title: sample.title,
		description: '',
		status: sample.status,
		estimateDays: sample.estimateDays,
		dueDate: sample.dueDate,
		preferredStartDate: addLocalDateDays(sample.dueDate, 1 - sample.estimateDays),
		startMode: 'auto',
		plannedForDate: sample.status === 'planned' ? addLocalDateDays(localDate, -1) : null,
		projectId: project.id,
		tags: index < 2 ? [focusTag] : [],
		archivedAt: null,
		completedAt: sample.status === 'done' ? createdAt : null,
		revision: 1,
		createdAt,
		updatedAt: createdAt
	}))
}

function updateSettings(next: ApplicationSettings): Promise<ApplicationSettings> {
	settings = next
	return Promise.resolve(settings)
}

export function installBrowserPreviewApi(): void {
	installPreviewSeed()
	const api: TrackMeApi = {
		app: {
			getStartupState: () =>
				Promise.resolve({
					settings,
					platform: 'win32',
					windowMaximized: false,
					schemaVersion: 1
				}),
			ready: () => Promise.resolve()
		},
		settings: {
			get: () => Promise.resolve(settings),
			setAppearance: (appearance) => updateSettings({ ...settings, appearance }),
			setInterfaceLocale: (interfaceLocale) =>
				updateSettings({
					...settings,
					language: { interfaceLocale }
				})
		},
		tasks: {
			getBoard: () => Promise.resolve(board()),
			listArchived: ({ offset, limit }) => {
				const archivedTasks = tasks
					.filter((task) => task.archivedAt !== null)
					.sort((left, right) =>
						(right.archivedAt ?? '').localeCompare(left.archivedAt ?? '')
					)
				const pageTasks = archivedTasks.slice(offset, offset + limit)
				return Promise.resolve({
					tasks: pageTasks,
					total: archivedTasks.length,
					offset,
					hasMore: offset + pageTasks.length < archivedTasks.length
				})
			},
			get: (taskId) => {
				const task = tasks.find((candidate) => candidate.id === taskId)
				if (task === undefined) return Promise.reject(new Error('Task not found.'))
				return Promise.resolve(task)
			},
			create: (draft) => {
				const prepared = prepareTaskDraft(draft)
				const timestamp = now()
				const task: Task = {
					id: id('task'),
					title: prepared.title,
					description: prepared.description,
					status: prepared.status,
					estimateDays: prepared.estimateDays,
					dueDate: prepared.dueDate,
					preferredStartDate: prepared.preferredStartDate,
					startMode: prepared.startMode,
					plannedForDate: prepared.status === 'planned' ? todayLocalDate() : null,
					projectId: prepared.projectId,
					tags: resolveTags(prepared.tagNames),
					archivedAt: null,
					completedAt: prepared.status === 'done' ? timestamp : null,
					revision: 1,
					createdAt: timestamp,
					updatedAt: timestamp
				}
				tasks = [...tasks, task]
				return Promise.resolve(task)
			},
			update: (command) => {
				const prepared = prepareTaskDraft(command)
				return Promise.resolve(
					updateTask(command.id, (current) => {
						if (current.revision !== command.expectedRevision) {
							throw new Error('Revision conflict.')
						}
						const timestamp = now()
						return {
							...current,
							...prepared,
							tags: resolveTags(prepared.tagNames),
							plannedForDate:
								prepared.status === 'planned'
									? current.status === 'planned'
										? current.plannedForDate
										: todayLocalDate()
									: null,
							completedAt:
								prepared.status === 'done'
									? (current.completedAt ?? timestamp)
									: null,
							revision: current.revision + 1,
							updatedAt: timestamp
						}
					})
				)
			},
			changeStatus: (command) =>
				Promise.resolve(
					updateTask(command.id, (current) => {
						if (current.revision !== command.expectedRevision) {
							throw new Error('Revision conflict.')
						}
						const timestamp = now()
						return {
							...current,
							status: command.status,
							plannedForDate:
								command.status === 'planned'
									? current.status === 'planned'
										? current.plannedForDate
										: todayLocalDate()
									: null,
							completedAt:
								command.status === 'done'
									? (current.completedAt ?? timestamp)
									: null,
							revision: current.revision + 1,
							updatedAt: timestamp
						}
					})
				),
			archive: (command) =>
				Promise.resolve(
					updateTask(command.id, (current) => ({
						...current,
						archivedAt: now(),
						revision: current.revision + 1,
						updatedAt: now()
					}))
				),
			restore: (command) =>
				Promise.resolve(
					updateTask(command.id, (current) => ({
						...current,
						archivedAt: null,
						revision: current.revision + 1,
						updatedAt: now()
					}))
				)
		},
		projects: {
			create: (draft) => {
				const timestamp = now()
				const project: Project = {
					id: id('project'),
					name: draft.name.trim(),
					description: draft.description.trim(),
					revision: 1,
					createdAt: timestamp,
					updatedAt: timestamp,
					completedTaskCount: 0,
					totalTaskCount: 0
				}
				projects = [...projects, project]
				return Promise.resolve(project)
			},
			update: (command) => {
				const current = projects.find((project) => project.id === command.id)
				if (current === undefined) return Promise.reject(new Error('Project not found.'))
				const updated = {
					...current,
					name: command.name.trim(),
					description: command.description.trim(),
					revision: current.revision + 1,
					updatedAt: now()
				}
				projects = projects.map((project) =>
					project.id === command.id ? updated : project
				)
				return Promise.resolve(updated)
			}
		},
		window: {
			minimize: () => Promise.resolve(),
			toggleMaximize: () => Promise.resolve({ maximized: false }),
			close: () => Promise.resolve(),
			getState: () => Promise.resolve({ maximized: false })
		}
	}
	Object.defineProperty(window, 'trackme', {
		value: Object.freeze(api),
		configurable: true
	})
}
