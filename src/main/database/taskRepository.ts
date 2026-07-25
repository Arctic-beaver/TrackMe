import { randomUUID } from 'node:crypto'
import type { TaskRepositoryPort } from '../../shared/application/ports'
import type {
	ArchivedTaskPage,
	ChangeTaskStatusCommand,
	ListArchivedTasksQuery,
	Project,
	ProjectDraft,
	Tag,
	Task,
	TaskBoardSnapshot,
	TaskDraft,
	TaskRevisionCommand,
	UpdateProjectCommand,
	UpdateTaskCommand
} from '../../shared/contracts'
import {
	DomainValidationError,
	normalizeEntityName,
	prepareProjectDraft,
	prepareTaskDraft,
	RevisionConflictError,
	todayLocalDate
} from '../../shared/taskDomain'
import type { TiempioDatabase } from './database'

interface TaskRow {
	readonly id: string
	readonly title: string
	readonly description: string
	readonly status: Task['status']
	readonly estimate_days: number
	readonly due_date: string
	readonly preferred_start_date: string
	readonly start_mode: Task['startMode']
	readonly planned_for_date: string | null
	readonly project_id: string | null
	readonly archived_at: string | null
	readonly completed_at: string | null
	readonly revision: number
	readonly created_at: string
	readonly updated_at: string
}

interface ProjectRow {
	readonly id: string
	readonly name: string
	readonly description: string
	readonly revision: number
	readonly created_at: string
	readonly updated_at: string
	readonly completed_task_count: number
	readonly total_task_count: number
}

interface TagRow {
	readonly id: string
	readonly name: string
	readonly created_at: string
}

export interface TaskRepositoryOptions {
	readonly createId?: () => string
	readonly now?: () => string
	readonly currentLocalDate?: () => string
}

function immutableTag(row: TagRow): Tag {
	return Object.freeze({
		id: row.id,
		name: row.name,
		createdAt: row.created_at
	})
}

function immutableProject(row: ProjectRow): Project {
	return Object.freeze({
		id: row.id,
		name: row.name,
		description: row.description,
		revision: row.revision,
		createdAt: row.created_at,
		updatedAt: row.updated_at,
		completedTaskCount: row.completed_task_count,
		totalTaskCount: row.total_task_count
	})
}

const taskColumns = `
	id, title, description, status, estimate_days, due_date, preferred_start_date,
	start_mode, planned_for_date, project_id, archived_at, completed_at, revision,
	created_at, updated_at
`

export class SqliteTaskRepository implements TaskRepositoryPort {
	readonly #database: TiempioDatabase
	readonly #createId: () => string
	readonly #now: () => string
	readonly #currentLocalDate: () => string

	constructor(database: TiempioDatabase, options: TaskRepositoryOptions = {}) {
		this.#database = database
		this.#createId = options.createId ?? randomUUID
		this.#now = options.now ?? (() => new Date().toISOString())
		this.#currentLocalDate = options.currentLocalDate ?? (() => todayLocalDate())
	}

	getBoard(): TaskBoardSnapshot {
		const archivedTaskCount = this.#database.connection
			.prepare('SELECT COUNT(*) AS count FROM tasks WHERE archived_at IS NOT NULL')
			.get() as unknown as { readonly count: number }
		return Object.freeze({
			tasks: Object.freeze(this.#listTasks('archived_at IS NULL')),
			archivedTaskCount: archivedTaskCount.count,
			projects: Object.freeze(this.listProjects()),
			tags: Object.freeze(this.listTags())
		})
	}

	listArchived(query: ListArchivedTasksQuery): ArchivedTaskPage {
		const totalRow = this.#database.connection
			.prepare('SELECT COUNT(*) AS count FROM tasks WHERE archived_at IS NOT NULL')
			.get() as unknown as { readonly count: number }
		const rows = this.#database.connection
			.prepare(
				`
					SELECT ${taskColumns} FROM tasks
					WHERE archived_at IS NOT NULL
					ORDER BY archived_at DESC, updated_at DESC
					LIMIT ? OFFSET ?
				`
			)
			.all(query.limit, query.offset) as unknown as TaskRow[]
		const tasks = this.#tasksFromRows(rows)
		return Object.freeze({
			tasks: Object.freeze(tasks),
			total: totalRow.count,
			offset: query.offset,
			hasMore: query.offset + tasks.length < totalRow.count
		})
	}

	get(id: string): Task {
		const row = this.#database.connection
			.prepare(`SELECT ${taskColumns} FROM tasks WHERE id = ?`)
			.get(id) as unknown as TaskRow | undefined
		if (row === undefined) throw new DomainValidationError('title', 'Task was not found.')
		return this.#taskFromRow(row)
	}

	listProjects(): readonly Project[] {
		const rows = this.#database.connection
			.prepare(
				`
					SELECT
						p.id,
						p.name,
						p.description,
						p.revision,
						p.created_at,
						p.updated_at,
						COUNT(t.id) AS total_task_count,
						COALESCE(SUM(CASE WHEN t.status = 'done' THEN 1 ELSE 0 END), 0)
							AS completed_task_count
					FROM projects p
					LEFT JOIN tasks t ON t.project_id = p.id AND t.archived_at IS NULL
					WHERE p.archived_at IS NULL
					GROUP BY p.id
					ORDER BY p.normalized_name, p.id
				`
			)
			.all() as unknown as ProjectRow[]
		return rows.map(immutableProject)
	}

	listTags(): readonly Tag[] {
		const rows = this.#database.connection
			.prepare('SELECT id, name, created_at FROM tags ORDER BY normalized_name, id')
			.all() as unknown as TagRow[]
		return rows.map(immutableTag)
	}

	createProject(draft: ProjectDraft): Project {
		const prepared = prepareProjectDraft(draft)
		return this.#database.transaction(() => {
			this.#assertProjectNameAvailable(prepared.normalizedName)
			const id = this.#createId()
			const now = this.#now()
			this.#database.connection
				.prepare(
					`
						INSERT INTO projects(
							id, name, normalized_name, description, revision, created_at, updated_at
						) VALUES (?, ?, ?, ?, 1, ?, ?)
					`
				)
				.run(id, prepared.name, prepared.normalizedName, prepared.description, now, now)
			return this.#getProject(id)
		})
	}

	updateProject(command: UpdateProjectCommand): Project {
		const prepared = prepareProjectDraft(command)
		return this.#database.transaction(() => {
			this.#assertProjectNameAvailable(prepared.normalizedName, command.id)
			const result = this.#database.connection
				.prepare(
					`
						UPDATE projects
						SET name = ?, normalized_name = ?, description = ?,
							revision = revision + 1, updated_at = ?
						WHERE id = ? AND revision = ? AND archived_at IS NULL
					`
				)
				.run(
					prepared.name,
					prepared.normalizedName,
					prepared.description,
					this.#now(),
					command.id,
					command.expectedRevision
				)
			if (Number(result.changes) !== 1) throw new RevisionConflictError(command.id)
			return this.#getProject(command.id)
		})
	}

	create(draft: TaskDraft): Task {
		const prepared = prepareTaskDraft(draft)
		return this.#database.transaction(() => {
			this.#assertActiveProject(prepared.projectId)
			const id = this.#createId()
			const now = this.#now()
			const localDate = this.#currentLocalDate()
			const completedAt = prepared.status === 'done' ? now : null
			const plannedForDate = prepared.status === 'planned' ? localDate : null
			this.#database.connection
				.prepare(
					`
						INSERT INTO tasks(
							id, title, description, status, estimate_days, due_date,
							preferred_start_date, start_mode, planned_for_date, project_id,
							completed_at, revision, created_at, updated_at
						) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
					`
				)
				.run(
					id,
					prepared.title,
					prepared.description,
					prepared.status,
					prepared.estimateDays,
					prepared.dueDate,
					prepared.preferredStartDate,
					prepared.startMode,
					plannedForDate,
					prepared.projectId,
					completedAt,
					now,
					now
				)
			this.#replaceTaskTags(id, prepared.tagNames)
			this.#recordActivity(id, 'created', localDate, { version: 1 })
			return this.get(id)
		})
	}

	update(command: UpdateTaskCommand): Task {
		const prepared = prepareTaskDraft(command)
		return this.#database.transaction(() => {
			const current = this.get(command.id)
			if (current.revision !== command.expectedRevision) {
				throw new RevisionConflictError(command.id)
			}
			this.#assertActiveProject(prepared.projectId)
			const now = this.#now()
			const localDate = this.#currentLocalDate()
			const plannedForDate =
				prepared.status === 'planned'
					? current.status === 'planned'
						? current.plannedForDate
						: localDate
					: null
			const completedAt =
				prepared.status === 'done'
					? current.status === 'done'
						? current.completedAt
						: now
					: null
			const result = this.#database.connection
				.prepare(
					`
						UPDATE tasks SET
							title = ?, description = ?, status = ?, estimate_days = ?, due_date = ?,
							preferred_start_date = ?, start_mode = ?, planned_for_date = ?,
							project_id = ?, completed_at = ?, revision = revision + 1, updated_at = ?
						WHERE id = ? AND revision = ?
					`
				)
				.run(
					prepared.title,
					prepared.description,
					prepared.status,
					prepared.estimateDays,
					prepared.dueDate,
					prepared.preferredStartDate,
					prepared.startMode,
					plannedForDate,
					prepared.projectId,
					completedAt,
					now,
					command.id,
					command.expectedRevision
				)
			if (Number(result.changes) !== 1) throw new RevisionConflictError(command.id)
			this.#replaceTaskTags(command.id, prepared.tagNames)
			if (current.status !== prepared.status) {
				this.#recordActivity(command.id, 'status_changed', localDate, {
					version: 1,
					from: current.status,
					to: prepared.status
				})
			}
			if (
				current.dueDate !== prepared.dueDate ||
				current.estimateDays !== prepared.estimateDays ||
				current.preferredStartDate !== prepared.preferredStartDate
			) {
				this.#recordActivity(command.id, 'dates_changed', localDate, {
					version: 1
				})
			}
			if (current.projectId !== prepared.projectId) {
				this.#recordActivity(command.id, 'project_changed', localDate, {
					version: 1,
					projectId: prepared.projectId
				})
			}
			return this.get(command.id)
		})
	}

	changeStatus(command: ChangeTaskStatusCommand): Task {
		return this.#database.transaction(() => {
			const current = this.get(command.id)
			if (current.revision !== command.expectedRevision) {
				throw new RevisionConflictError(command.id)
			}
			if (current.status === command.status) return current
			const now = this.#now()
			const localDate = this.#currentLocalDate()
			const plannedForDate =
				command.status === 'planned'
					? current.status === 'planned'
						? current.plannedForDate
						: localDate
					: null
			const completedAt =
				command.status === 'done'
					? current.status === 'done'
						? current.completedAt
						: now
					: null
			const result = this.#database.connection
				.prepare(
					`
						UPDATE tasks
						SET status = ?, planned_for_date = ?, completed_at = ?,
							revision = revision + 1, updated_at = ?
						WHERE id = ? AND revision = ? AND archived_at IS NULL
					`
				)
				.run(
					command.status,
					plannedForDate,
					completedAt,
					now,
					command.id,
					command.expectedRevision
				)
			if (Number(result.changes) !== 1) throw new RevisionConflictError(command.id)
			this.#recordActivity(command.id, 'status_changed', localDate, {
				version: 1,
				from: current.status,
				to: command.status
			})
			return this.get(command.id)
		})
	}

	archive(command: TaskRevisionCommand): Task {
		return this.#setArchived(command, true)
	}

	restore(command: TaskRevisionCommand): Task {
		return this.#setArchived(command, false)
	}

	#setArchived(command: TaskRevisionCommand, archived: boolean): Task {
		return this.#database.transaction(() => {
			const current = this.get(command.id)
			if (current.revision !== command.expectedRevision) {
				throw new RevisionConflictError(command.id)
			}
			if ((current.archivedAt !== null) === archived) return current
			const now = this.#now()
			const result = this.#database.connection
				.prepare(
					`
						UPDATE tasks
						SET archived_at = ?, revision = revision + 1, updated_at = ?
						WHERE id = ? AND revision = ?
							AND ${archived ? 'archived_at IS NULL' : 'archived_at IS NOT NULL'}
					`
				)
				.run(archived ? now : null, now, command.id, command.expectedRevision)
			if (Number(result.changes) !== 1) throw new RevisionConflictError(command.id)
			this.#recordActivity(
				command.id,
				archived ? 'archived' : 'restored',
				this.#currentLocalDate(),
				{ version: 1 }
			)
			return this.get(command.id)
		})
	}

	#listTasks(where: string, order = 'status, due_date, created_at, id'): Task[] {
		const rows = this.#database.connection
			.prepare(`SELECT ${taskColumns} FROM tasks WHERE ${where} ORDER BY ${order}`)
			.all() as unknown as TaskRow[]
		return this.#tasksFromRows(rows)
	}

	#taskFromRow(row: TaskRow): Task {
		const tagRows = this.#database.connection
			.prepare(
				`
					SELECT tags.id, tags.name, tags.created_at
					FROM tags
					INNER JOIN task_tags ON task_tags.tag_id = tags.id
					WHERE task_tags.task_id = ?
					ORDER BY tags.normalized_name, tags.id
				`
			)
			.all(row.id) as unknown as TagRow[]
		return this.#immutableTask(row, tagRows)
	}

	#tasksFromRows(rows: readonly TaskRow[]): Task[] {
		if (rows.length === 0) return []
		const tagsByTaskId = new Map<string, TagRow[]>()
		const chunkSize = 500
		for (let offset = 0; offset < rows.length; offset += chunkSize) {
			const taskIds = rows.slice(offset, offset + chunkSize).map((row) => row.id)
			const placeholders = taskIds.map(() => '?').join(', ')
			const tagRows = this.#database.connection
				.prepare(
					`
						SELECT
							task_tags.task_id,
							tags.id,
							tags.name,
							tags.created_at
						FROM task_tags
						INNER JOIN tags ON tags.id = task_tags.tag_id
						WHERE task_tags.task_id IN (${placeholders})
						ORDER BY task_tags.task_id, tags.normalized_name, tags.id
					`
				)
				.all(...taskIds) as unknown as Array<TagRow & { readonly task_id: string }>
			for (const tagRow of tagRows) {
				const taskTags = tagsByTaskId.get(tagRow.task_id) ?? []
				taskTags.push(tagRow)
				tagsByTaskId.set(tagRow.task_id, taskTags)
			}
		}
		return rows.map((row) => this.#immutableTask(row, tagsByTaskId.get(row.id) ?? []))
	}

	#immutableTask(row: TaskRow, tagRows: readonly TagRow[]): Task {
		return Object.freeze({
			id: row.id,
			title: row.title,
			description: row.description,
			status: row.status,
			estimateDays: row.estimate_days,
			dueDate: row.due_date,
			preferredStartDate: row.preferred_start_date,
			startMode: row.start_mode,
			plannedForDate: row.planned_for_date,
			projectId: row.project_id,
			tags: Object.freeze(tagRows.map(immutableTag)),
			archivedAt: row.archived_at,
			completedAt: row.completed_at,
			revision: row.revision,
			createdAt: row.created_at,
			updatedAt: row.updated_at
		})
	}

	#replaceTaskTags(taskId: string, names: readonly string[]): void {
		const tags = names.map((name) => this.#findOrCreateTag(name))
		this.#database.connection.prepare('DELETE FROM task_tags WHERE task_id = ?').run(taskId)
		const insert = this.#database.connection.prepare(
			'INSERT INTO task_tags(task_id, tag_id) VALUES (?, ?)'
		)
		for (const tag of tags) insert.run(taskId, tag.id)
	}

	#findOrCreateTag(name: string): Tag {
		const normalizedName = normalizeEntityName(name)
		const existing = this.#database.connection
			.prepare('SELECT id, name, created_at FROM tags WHERE normalized_name = ?')
			.get(normalizedName) as unknown as TagRow | undefined
		if (existing !== undefined) return immutableTag(existing)
		const row: TagRow = {
			id: this.#createId(),
			name,
			created_at: this.#now()
		}
		this.#database.connection
			.prepare('INSERT INTO tags(id, name, normalized_name, created_at) VALUES (?, ?, ?, ?)')
			.run(row.id, row.name, normalizedName, row.created_at)
		return immutableTag(row)
	}

	#recordActivity(
		taskId: string,
		eventType: string,
		localDate: string,
		payload: Readonly<Record<string, unknown>>
	): void {
		this.#database.connection
			.prepare(
				`
					INSERT INTO task_activity(
						id, task_id, event_type, payload_json, occurred_at, local_date
					) VALUES (?, ?, ?, ?, ?, ?)
				`
			)
			.run(
				this.#createId(),
				taskId,
				eventType,
				JSON.stringify(payload),
				this.#now(),
				localDate
			)
	}

	#assertActiveProject(projectId: string | null): void {
		if (projectId === null) return
		const row = this.#database.connection
			.prepare('SELECT id FROM projects WHERE id = ? AND archived_at IS NULL')
			.get(projectId)
		if (row === undefined) {
			throw new DomainValidationError('projectId', 'The selected project is unavailable.')
		}
	}

	#assertProjectNameAvailable(normalizedName: string, exceptId?: string): void {
		const row = this.#database.connection
			.prepare(
				`
					SELECT id FROM projects
					WHERE normalized_name = ? AND archived_at IS NULL AND id <> ?
				`
			)
			.get(normalizedName, exceptId ?? '')
		if (row !== undefined) {
			throw new DomainValidationError(
				'projectName',
				'An active project already uses this name.'
			)
		}
	}

	#getProject(id: string): Project {
		const row = this.#database.connection
			.prepare(
				`
					SELECT
						p.id, p.name, p.description, p.revision, p.created_at, p.updated_at,
						COUNT(t.id) AS total_task_count,
						COALESCE(SUM(CASE WHEN t.status = 'done' THEN 1 ELSE 0 END), 0)
							AS completed_task_count
					FROM projects p
					LEFT JOIN tasks t ON t.project_id = p.id AND t.archived_at IS NULL
					WHERE p.id = ?
					GROUP BY p.id
				`
			)
			.get(id) as unknown as ProjectRow | undefined
		if (row === undefined) {
			throw new DomainValidationError('projectId', 'Project was not found.')
		}
		return immutableProject(row)
	}
}
