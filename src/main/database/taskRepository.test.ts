import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, it } from 'node:test'
import { openTiempioDatabase } from './database'
import { SqliteTaskRepository } from './taskRepository'

function ids(): () => string {
	let value = 0
	return () => `id-${String(++value)}`
}

describe('task repository', () => {
	it('creates and edits a task transactionally with normalized tags and activity', async () => {
		const database = await openTiempioDatabase(':memory:')
		try {
			const repository = new SqliteTaskRepository(database, {
				createId: ids(),
				now: () => '2026-07-23T10:00:00.000Z',
				currentLocalDate: () => '2026-07-23'
			})
			const project = repository.createProject({
				name: 'Tiempio 🚀',
				description: 'https://example.test'
			})
			assert.equal(project.name, 'Tiempio 🚀')
			const created = repository.create({
				title: 'Ship Today board',
				description: '',
				status: 'planned',
				estimateDays: 3,
				dueDate: '2026-07-25',
				startMode: 'auto',
				preferredStartDate: null,
				projectId: project.id,
				tagNames: ['Работа', ' работа ', 'Desktop']
			})
			assert.equal(created.preferredStartDate, '2026-07-23')
			assert.equal(created.plannedForDate, '2026-07-23')
			assert.deepEqual(
				created.tags.map((tag) => tag.name),
				['Desktop', 'Работа']
			)

			const updated = repository.update({
				...created,
				expectedRevision: created.revision,
				status: 'done',
				tagNames: ['desktop']
			})
			assert.equal(updated.revision, 2)
			assert.equal(updated.completedAt, '2026-07-23T10:00:00.000Z')
			assert.equal(updated.plannedForDate, null)
			assert.equal(repository.listProjects()[0]?.completedTaskCount, 1)
			const activity = database.connection
				.prepare('SELECT event_type FROM task_activity ORDER BY rowid')
				.all() as Array<{ readonly event_type: string }>
			assert.deepEqual(
				activity.map((row) => row.event_type),
				['created', 'status_changed']
			)
		} finally {
			database.close()
		}
	})

	it('rejects stale revisions and archives without deleting content', async () => {
		const database = await openTiempioDatabase(':memory:')
		try {
			const repository = new SqliteTaskRepository(database, {
				createId: ids(),
				now: () => '2026-07-23T10:00:00.000Z',
				currentLocalDate: () => '2026-07-23'
			})
			const task = repository.create({
				title: 'Recover me',
				description: 'Still here',
				status: 'todo',
				estimateDays: 1,
				dueDate: '2026-07-24',
				startMode: 'auto',
				preferredStartDate: null,
				projectId: null,
				tagNames: ['Safe']
			})
			assert.throws(
				() =>
					repository.changeStatus({
						id: task.id,
						expectedRevision: 99,
						status: 'done'
					}),
				/The item changed/
			)
			const archived = repository.archive({
				id: task.id,
				expectedRevision: task.revision
			})
			assert.equal(repository.getBoard().tasks.length, 0)
			assert.equal(repository.getBoard().archivedTaskCount, 1)
			assert.equal(repository.listArchived({ offset: 0, limit: 10 }).tasks.length, 1)
			const restored = repository.restore({
				id: task.id,
				expectedRevision: archived.revision
			})
			assert.equal(restored.description, 'Still here')
			assert.equal(restored.tags[0]?.name, 'Safe')
		} finally {
			database.close()
		}
	})

	it('updates projects optimistically and preserves planned and completion invariants', async () => {
		const database = await openTiempioDatabase(':memory:')
		try {
			let localDate = '2026-07-23'
			const repository = new SqliteTaskRepository(database, {
				createId: ids(),
				now: () => '2026-07-23T10:00:00.000Z',
				currentLocalDate: () => localDate
			})
			const project = repository.createProject({ name: 'Launch', description: '' })
			const updatedProject = repository.updateProject({
				id: project.id,
				expectedRevision: project.revision,
				name: 'Launch plan',
				description: 'https://example.test/launch'
			})
			assert.equal(updatedProject.name, 'Launch plan')
			assert.equal(updatedProject.revision, 2)
			assert.throws(
				() =>
					repository.updateProject({
						id: project.id,
						expectedRevision: 1,
						name: 'Stale',
						description: ''
					}),
				/The item changed/
			)

			const created = repository.create({
				title: 'Move through statuses',
				description: '',
				status: 'todo',
				estimateDays: 1,
				dueDate: '2026-07-25',
				startMode: 'auto',
				preferredStartDate: null,
				projectId: project.id,
				tagNames: []
			})
			const planned = repository.changeStatus({
				id: created.id,
				expectedRevision: created.revision,
				status: 'planned'
			})
			assert.equal(planned.plannedForDate, '2026-07-23')
			localDate = '2026-07-24'
			const done = repository.changeStatus({
				id: planned.id,
				expectedRevision: planned.revision,
				status: 'done'
			})
			assert.equal(done.plannedForDate, null)
			assert.equal(done.completedAt, '2026-07-23T10:00:00.000Z')
			const reopened = repository.changeStatus({
				id: done.id,
				expectedRevision: done.revision,
				status: 'in_progress'
			})
			assert.equal(reopened.completedAt, null)
		} finally {
			database.close()
		}
	})

	it('uses focused status updates and keeps archive transitions idempotent', async () => {
		const database = await openTiempioDatabase(':memory:')
		try {
			const repository = new SqliteTaskRepository(database, {
				createId: ids(),
				now: () => '2026-07-23T10:00:00.000Z',
				currentLocalDate: () => '2026-07-23'
			})
			const created = repository.create({
				title: 'Preserve task relationships',
				description: '',
				status: 'todo',
				estimateDays: 1,
				dueDate: '2026-07-25',
				startMode: 'auto',
				preferredStartDate: null,
				projectId: null,
				tagNames: ['Stable']
			})
			const tagLinkBefore = database.connection
				.prepare('SELECT rowid FROM task_tags WHERE task_id = ?')
				.get(created.id) as { readonly rowid: number }
			const unchanged = repository.changeStatus({
				id: created.id,
				expectedRevision: created.revision,
				status: 'todo'
			})
			assert.equal(unchanged.revision, created.revision)

			const planned = repository.changeStatus({
				id: created.id,
				expectedRevision: unchanged.revision,
				status: 'planned'
			})
			const tagLinkAfter = database.connection
				.prepare('SELECT rowid FROM task_tags WHERE task_id = ?')
				.get(created.id) as { readonly rowid: number }
			assert.equal(tagLinkAfter.rowid, tagLinkBefore.rowid)

			const archived = repository.archive({
				id: planned.id,
				expectedRevision: planned.revision
			})
			const archiveAgain = repository.archive({
				id: archived.id,
				expectedRevision: archived.revision
			})
			assert.equal(archiveAgain.revision, archived.revision)
			const restored = repository.restore({
				id: archived.id,
				expectedRevision: archived.revision
			})
			const restoreAgain = repository.restore({
				id: restored.id,
				expectedRevision: restored.revision
			})
			assert.equal(restoreAgain.revision, restored.revision)

			const activity = database.connection
				.prepare('SELECT event_type FROM task_activity ORDER BY rowid')
				.all() as Array<{ readonly event_type: string }>
			assert.deepEqual(
				activity.map((row) => row.event_type),
				['created', 'status_changed', 'archived', 'restored']
			)
		} finally {
			database.close()
		}
	})

	it('returns archived tasks in bounded pages', async () => {
		const database = await openTiempioDatabase(':memory:')
		try {
			let timestamp = 0
			const repository = new SqliteTaskRepository(database, {
				createId: ids(),
				now: () => new Date(Date.UTC(2026, 6, 23, 10, 0, timestamp++)).toISOString(),
				currentLocalDate: () => '2026-07-23'
			})
			for (let index = 0; index < 35; index += 1) {
				const task = repository.create({
					title: `Archived ${String(index)}`,
					description: '',
					status: 'todo',
					estimateDays: 1,
					dueDate: '2026-07-25',
					startMode: 'auto',
					preferredStartDate: null,
					projectId: null,
					tagNames: ['Archive']
				})
				repository.archive({ id: task.id, expectedRevision: task.revision })
			}
			const first = repository.listArchived({ offset: 0, limit: 30 })
			const second = repository.listArchived({ offset: 30, limit: 30 })
			assert.equal(repository.getBoard().archivedTaskCount, 35)
			assert.equal(first.tasks.length, 30)
			assert.equal(first.hasMore, true)
			assert.equal(second.tasks.length, 5)
			assert.equal(second.hasMore, false)
			assert.equal(new Set([...first.tasks, ...second.tasks].map((task) => task.id)).size, 35)
		} finally {
			database.close()
		}
	})

	it('keeps created tasks after the database is closed and reopened', async () => {
		const directory = await mkdtemp(join(tmpdir(), 'tiempio-task-persistence-test-'))
		try {
			const path = join(directory, 'tiempio.sqlite3')
			const firstDatabase = await openTiempioDatabase(path)
			const firstRepository = new SqliteTaskRepository(firstDatabase, {
				createId: ids(),
				now: () => '2026-07-23T10:00:00.000Z',
				currentLocalDate: () => '2026-07-23'
			})
			firstRepository.create({
				title: 'Persist across launch 🚀',
				description: 'Stored locally for the team 👩🏽‍💻',
				status: 'todo',
				estimateDays: 2,
				dueDate: '2026-07-25',
				startMode: 'auto',
				preferredStartDate: null,
				projectId: null,
				tagNames: ['Durable 🛡️']
			})
			firstDatabase.close()

			const secondDatabase = await openTiempioDatabase(path)
			const restored = new SqliteTaskRepository(secondDatabase).getBoard().tasks
			assert.equal(restored.length, 1)
			assert.equal(restored[0]?.title, 'Persist across launch 🚀')
			assert.equal(restored[0]?.description, 'Stored locally for the team 👩🏽‍💻')
			assert.equal(restored[0]?.tags[0]?.name, 'Durable 🛡️')
			secondDatabase.close()
		} finally {
			await rm(directory, { recursive: true, force: true })
		}
	})
})
