import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import type { Task } from './contracts'
import {
	addLocalDateDays,
	calculatePreferredStart,
	classifyTaskUrgency,
	compareTasksForToday,
	differenceInLocalDays,
	prepareTaskDraft
} from './taskDomain'

function task(overrides: Partial<Task>): Task {
	return {
		id: 'task-1',
		title: 'Prepare release',
		description: '',
		status: 'todo',
		estimateDays: 1,
		dueDate: '2026-07-25',
		preferredStartDate: '2026-07-25',
		startMode: 'auto',
		plannedForDate: null,
		projectId: null,
		tags: [],
		archivedAt: null,
		completedAt: null,
		revision: 1,
		createdAt: '2026-07-20T08:00:00.000Z',
		updatedAt: '2026-07-20T08:00:00.000Z',
		...overrides
	}
}

describe('task domain', () => {
	it('calculates inclusive starts across months and leap days', () => {
		assert.equal(calculatePreferredStart('2026-07-25', 3), '2026-07-23')
		assert.equal(calculatePreferredStart('2026-03-01', 2), '2026-02-28')
		assert.equal(addLocalDateDays('2024-02-28', 1), '2024-02-29')
		assert.equal(addLocalDateDays('2024-02-29', 1), '2024-03-01')
		assert.equal(differenceInLocalDays('2024-02-28', '2024-03-01'), 2)
	})

	it('keeps a manual start and rejects one after the deadline', () => {
		const prepared = prepareTaskDraft({
			title: '  Keep chosen start  ',
			description: '',
			status: 'todo',
			estimateDays: 3,
			dueDate: '2026-07-25',
			startMode: 'manual',
			preferredStartDate: '2026-07-20',
			projectId: null,
			tagNames: [],
			localDate: '2026-07-23'
		})
		assert.equal(prepared.preferredStartDate, '2026-07-20')
		assert.throws(
			() =>
				prepareTaskDraft({
					...prepared,
					preferredStartDate: '2026-07-26'
				}),
			/preferred start/
		)
	})

	it('classifies and sorts every active urgency category', () => {
		const localDate = '2026-07-23'
		const dueToday = task({ id: 'today', dueDate: localDate })
		const overdue = task({ id: 'overdue', dueDate: '2026-07-22' })
		const atRisk = task({ id: 'risk', dueDate: '2026-07-24', estimateDays: 3 })
		const upcoming = task({ id: 'future', dueDate: '2026-08-01' })
		assert.equal(classifyTaskUrgency(dueToday, localDate), 'due_today')
		assert.equal(classifyTaskUrgency(overdue, localDate), 'overdue')
		assert.equal(classifyTaskUrgency(atRisk, localDate), 'at_risk')
		assert.equal(classifyTaskUrgency(upcoming, localDate), 'upcoming')
		assert.deepEqual(
			[upcoming, atRisk, overdue, dueToday]
				.sort((left, right) => compareTasksForToday(left, right, localDate))
				.map((item) => item.id),
			['today', 'overdue', 'risk', 'future']
		)
	})
})
