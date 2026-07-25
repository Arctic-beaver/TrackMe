import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
	createIpcFailure,
	createIpcRequest,
	createIpcSuccess,
	IpcContractError,
	IpcRemoteError,
	parseAppearance,
	parseApplicationSettings,
	parseArchivedTaskPage,
	parseChangeTaskStatusCommand,
	parseInterfaceLocale,
	parseIpcRequest,
	parseIpcResponse,
	parseListArchivedTasksQuery,
	parseNull,
	parseProject,
	parseProjectDraft,
	parseStartupState,
	parseTag,
	parseTask,
	parseTaskBoardSnapshot,
	parseTaskDraft,
	parseTaskId,
	parseTaskRevisionCommand,
	parseUpdateProjectCommand,
	parseUpdateTaskCommand,
	parseWindowState
} from './ipcProtocol'

const tag = {
	id: 'tag-1',
	name: 'Focus',
	createdAt: '2026-07-23T10:00:00.000Z'
}
const task = {
	id: 'task-1',
	title: 'Review IPC',
	description: '',
	status: 'todo',
	estimateDays: 2,
	dueDate: '2026-07-25',
	preferredStartDate: '2026-07-24',
	startMode: 'auto',
	plannedForDate: null,
	projectId: null,
	tags: [tag],
	archivedAt: null,
	completedAt: null,
	revision: 1,
	createdAt: '2026-07-23T10:00:00.000Z',
	updatedAt: '2026-07-23T10:00:00.000Z'
} as const
const project = {
	id: 'project-1',
	name: 'Tiempio',
	description: '',
	revision: 1,
	createdAt: '2026-07-23T10:00:00.000Z',
	updatedAt: '2026-07-23T10:00:00.000Z',
	completedTaskCount: 0,
	totalTaskCount: 1
}
const draft = {
	title: task.title,
	description: task.description,
	status: task.status,
	estimateDays: task.estimateDays,
	dueDate: task.dueDate,
	startMode: task.startMode,
	preferredStartDate: null,
	projectId: null,
	tagNames: ['Focus']
} as const

describe('IPC protocol', () => {
	it('round-trips versioned requests and success or failure responses', () => {
		assert.deepEqual(parseIpcRequest(createIpcRequest(null), parseNull), null)
		assert.deepEqual(parseIpcResponse(createIpcSuccess(task), parseTask), task)
		assert.throws(
			() =>
				parseIpcResponse(
					createIpcFailure({ code: 'STORAGE_BUSY', message: 'Busy' }),
					parseTask
				),
			(error: unknown) =>
				error instanceof IpcRemoteError &&
				error.code === 'STORAGE_BUSY' &&
				error.message === 'Busy'
		)
		assert.throws(
			() => parseIpcRequest({ version: 99, payload: null }, parseNull),
			IpcContractError
		)
	})

	it('validates settings and startup payloads', () => {
		const settings = {
			version: 1,
			appearance: { family: 'graphite-navy', scheme: 'system' },
			language: { interfaceLocale: 'ru' }
		}
		assert.deepEqual(parseAppearance(settings.appearance), settings.appearance)
		assert.equal(parseInterfaceLocale('es'), 'es')
		assert.deepEqual(parseApplicationSettings(settings), settings)
		assert.deepEqual(parseWindowState({ maximized: true }), { maximized: true })
		assert.deepEqual(
			parseStartupState({
				settings,
				platform: 'win32',
				windowMaximized: false,
				schemaVersion: 1
			}),
			{ settings, platform: 'win32', windowMaximized: false, schemaVersion: 1 }
		)
		assert.throws(() => parseInterfaceLocale('fr'), IpcContractError)
	})

	it('validates every task and project command', () => {
		assert.deepEqual(parseTaskDraft(draft), draft)
		assert.deepEqual(parseUpdateTaskCommand({ ...draft, id: task.id, expectedRevision: 1 }), {
			...draft,
			id: task.id,
			expectedRevision: 1
		})
		assert.deepEqual(
			parseChangeTaskStatusCommand({
				id: task.id,
				expectedRevision: 1,
				status: 'done'
			}),
			{ id: task.id, expectedRevision: 1, status: 'done' }
		)
		assert.deepEqual(parseTaskRevisionCommand({ id: task.id, expectedRevision: 1 }), {
			id: task.id,
			expectedRevision: 1
		})
		assert.deepEqual(parseProjectDraft(project), {
			name: project.name,
			description: project.description
		})
		assert.deepEqual(
			parseUpdateProjectCommand({
				id: project.id,
				expectedRevision: project.revision,
				name: project.name,
				description: project.description
			}),
			{
				id: project.id,
				expectedRevision: project.revision,
				name: project.name,
				description: project.description
			}
		)
		assert.equal(parseTaskId(task.id), task.id)
		assert.deepEqual(parseListArchivedTasksQuery({ offset: 30, limit: 20 }), {
			offset: 30,
			limit: 20
		})
		assert.throws(() => parseListArchivedTasksQuery({ offset: 0, limit: 51 }), IpcContractError)
	})

	it('preserves composed emoji and limits user-visible graphemes', () => {
		const emojiDraft = {
			...draft,
			title: 'Plan release 🚀',
			description: 'Pair with the platform team 👩🏽‍💻',
			tagNames: ['Focus 🎯']
		}
		assert.deepEqual(parseTaskDraft(emojiDraft), emojiDraft)
		assert.doesNotThrow(() => parseTaskDraft({ ...emojiDraft, title: '👨‍👩‍👧‍👦'.repeat(240) }))
		assert.throws(
			() => parseTaskDraft({ ...emojiDraft, title: '🚀'.repeat(241) }),
			IpcContractError
		)
	})

	it('validates task, project and paginated board results', () => {
		assert.deepEqual(parseTag(tag), tag)
		assert.deepEqual(parseTask(task), task)
		assert.deepEqual(parseProject(project), project)
		assert.deepEqual(
			parseTaskBoardSnapshot({
				tasks: [task],
				archivedTaskCount: 1,
				projects: [project],
				tags: [tag]
			}),
			{
				tasks: [task],
				archivedTaskCount: 1,
				projects: [project],
				tags: [tag]
			}
		)
		assert.deepEqual(
			parseArchivedTaskPage({
				tasks: [{ ...task, archivedAt: '2026-07-23T11:00:00.000Z' }],
				total: 2,
				offset: 0,
				hasMore: true
			}),
			{
				tasks: [{ ...task, archivedAt: '2026-07-23T11:00:00.000Z' }],
				total: 2,
				offset: 0,
				hasMore: true
			}
		)
		assert.throws(
			() =>
				parseTaskBoardSnapshot({
					tasks: [],
					archivedTaskCount: -1,
					projects: [],
					tags: []
				}),
			IpcContractError
		)
	})
})
