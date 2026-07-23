import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { openTrackMeDatabase } from './database'
import { TaskRepository } from './taskRepository'

function ids(): () => string {
	let value = 0
	return () => `id-${String(++value)}`
}

describe('task repository', () => {
	it('creates and edits a task transactionally with normalized tags and activity', async () => {
		const database = await openTrackMeDatabase(':memory:')
		try {
			const repository = new TaskRepository(database, {
				createId: ids(),
				now: () => '2026-07-23T10:00:00.000Z'
			})
			const project = repository.createProject({
				name: 'TrackMe',
				description: 'https://example.test'
			})
			const created = repository.create({
				title: 'Ship Today board',
				description: '',
				status: 'planned',
				estimateDays: 3,
				dueDate: '2026-07-25',
				startMode: 'auto',
				preferredStartDate: null,
				projectId: project.id,
				tagNames: ['Работа', ' работа ', 'Desktop'],
				localDate: '2026-07-23'
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
				tagNames: ['desktop'],
				localDate: '2026-07-23'
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
		const database = await openTrackMeDatabase(':memory:')
		try {
			const repository = new TaskRepository(database, {
				createId: ids(),
				now: () => '2026-07-23T10:00:00.000Z'
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
				tagNames: ['Safe'],
				localDate: '2026-07-23'
			})
			assert.throws(
				() =>
					repository.changeStatus({
						id: task.id,
						expectedRevision: 99,
						status: 'done',
						localDate: '2026-07-23'
					}),
				/The item changed/
			)
			const archived = repository.archive({
				id: task.id,
				expectedRevision: task.revision,
				localDate: '2026-07-23'
			})
			assert.equal(repository.getBoard('2026-07-23').tasks.length, 0)
			assert.equal(repository.getBoard('2026-07-23').archivedTasks.length, 1)
			const restored = repository.restore({
				id: task.id,
				expectedRevision: archived.revision,
				localDate: '2026-07-23'
			})
			assert.equal(restored.description, 'Still here')
			assert.equal(restored.tags[0]?.name, 'Safe')
		} finally {
			database.close()
		}
	})
})
