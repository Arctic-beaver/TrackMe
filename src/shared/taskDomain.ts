import type { ProjectDraft, Task, TaskDraft, TaskStartMode, TaskUrgency } from './contracts'
import { isWithinGraphemeLimit, normalizeUserText } from './userText'

const localDatePattern = /^(\d{4})-(\d{2})-(\d{2})$/
const daysBeforeMonth = Object.freeze([0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334])

export type TaskValidationField =
	| 'title'
	| 'description'
	| 'dueDate'
	| 'estimateDays'
	| 'preferredStartDate'
	| 'projectId'
	| 'tagNames'
	| 'localDate'
	| 'projectName'

export class DomainValidationError extends Error {
	readonly field: TaskValidationField

	constructor(field: TaskValidationField, message: string) {
		super(message)
		this.name = 'DomainValidationError'
		this.field = field
	}
}

export class RevisionConflictError extends Error {
	readonly entityId: string

	constructor(entityId: string) {
		super('The item changed after it was opened.')
		this.name = 'RevisionConflictError'
		this.entityId = entityId
	}
}

interface LocalDateParts {
	readonly year: number
	readonly month: number
	readonly day: number
}

export interface PreparedTaskDraft {
	readonly title: string
	readonly description: string
	readonly status: TaskDraft['status']
	readonly estimateDays: number
	readonly dueDate: string
	readonly startMode: TaskStartMode
	readonly preferredStartDate: string
	readonly projectId: string | null
	readonly tagNames: readonly string[]
}

export interface PreparedProjectDraft extends ProjectDraft {
	readonly normalizedName: string
}

function isLeapYear(year: number): boolean {
	return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0)
}

function daysInMonth(year: number, month: number): number {
	if (month === 2) return isLeapYear(year) ? 29 : 28
	return [4, 6, 9, 11].includes(month) ? 30 : 31
}

function parseLocalDateParts(value: string): LocalDateParts | null {
	const match = localDatePattern.exec(value)
	if (match === null) return null
	const year = Number(match[1])
	const month = Number(match[2])
	const day = Number(match[3])
	if (
		year < 1 ||
		year > 9999 ||
		month < 1 ||
		month > 12 ||
		day < 1 ||
		day > daysInMonth(year, month)
	) {
		return null
	}
	return { year, month, day }
}

function daysBeforeYear(year: number): number {
	const previousYear = year - 1
	return (
		previousYear * 365 +
		Math.floor(previousYear / 4) -
		Math.floor(previousYear / 100) +
		Math.floor(previousYear / 400)
	)
}

function toOrdinal(parts: LocalDateParts): number {
	return (
		daysBeforeYear(parts.year) +
		(daysBeforeMonth[parts.month - 1] ?? 0) +
		(parts.month > 2 && isLeapYear(parts.year) ? 1 : 0) +
		parts.day
	)
}

function fromOrdinal(ordinal: number): LocalDateParts {
	let low = 1
	let high = 9999
	while (low <= high) {
		const middle = Math.floor((low + high) / 2)
		if (daysBeforeYear(middle + 1) < ordinal) low = middle + 1
		else if (daysBeforeYear(middle) >= ordinal) high = middle - 1
		else {
			const dayOfYear = ordinal - daysBeforeYear(middle)
			let month = 1
			let remaining = dayOfYear
			while (remaining > daysInMonth(middle, month)) {
				remaining -= daysInMonth(middle, month)
				month += 1
			}
			return { year: middle, month, day: remaining }
		}
	}
	throw new DomainValidationError('dueDate', 'The calculated date is out of range.')
}

function formatParts(parts: LocalDateParts): string {
	return `${String(parts.year).padStart(4, '0')}-${String(parts.month).padStart(2, '0')}-${String(parts.day).padStart(2, '0')}`
}

export function isLocalDate(value: unknown): value is string {
	return typeof value === 'string' && parseLocalDateParts(value) !== null
}

export function assertLocalDate(
	value: string,
	field: 'dueDate' | 'preferredStartDate' | 'localDate'
): string {
	if (!isLocalDate(value))
		throw new DomainValidationError(field, 'A valid local date is required.')
	return value
}

export function addLocalDateDays(value: string, days: number): string {
	const parts = parseLocalDateParts(value)
	if (parts === null || !Number.isSafeInteger(days)) {
		throw new DomainValidationError('dueDate', 'The date calculation is invalid.')
	}
	return formatParts(fromOrdinal(toOrdinal(parts) + days))
}

export function differenceInLocalDays(from: string, to: string): number {
	const fromParts = parseLocalDateParts(from)
	const toParts = parseLocalDateParts(to)
	if (fromParts === null || toParts === null) {
		throw new DomainValidationError('dueDate', 'The date comparison is invalid.')
	}
	return toOrdinal(toParts) - toOrdinal(fromParts)
}

export function calculatePreferredStart(dueDate: string, estimateDays: number): string {
	assertLocalDate(dueDate, 'dueDate')
	if (!Number.isSafeInteger(estimateDays) || estimateDays < 1 || estimateDays > 36_500) {
		throw new DomainValidationError(
			'estimateDays',
			'Estimate must be a positive number of days.'
		)
	}
	return addLocalDateDays(dueDate, 1 - estimateDays)
}

export function todayLocalDate(now = new Date()): string {
	return formatParts({
		year: now.getFullYear(),
		month: now.getMonth() + 1,
		day: now.getDate()
	})
}

function cleanedTagNames(tagNames: readonly string[]): readonly string[] {
	const byNormalizedName = new Map<string, string>()
	for (const name of tagNames) {
		const trimmed = normalizeUserText(name)
		if (trimmed.length === 0) continue
		if (!isWithinGraphemeLimit(trimmed, 80)) {
			throw new DomainValidationError('tagNames', 'Tag names cannot exceed 80 characters.')
		}
		const normalized = trimmed.toLowerCase()
		if (!byNormalizedName.has(normalized)) byNormalizedName.set(normalized, trimmed)
	}
	return Object.freeze([...byNormalizedName.values()])
}

export function normalizeEntityName(value: string): string {
	return normalizeUserText(value).toLowerCase()
}

export function prepareProjectDraft(draft: ProjectDraft): PreparedProjectDraft {
	const name = normalizeUserText(draft.name)
	const description = normalizeUserText(draft.description)
	if (name.length === 0 || !isWithinGraphemeLimit(name, 160)) {
		throw new DomainValidationError(
			'projectName',
			'Project name is required and cannot exceed 160 characters.'
		)
	}
	if (!isWithinGraphemeLimit(description, 20_000)) {
		throw new DomainValidationError('description', 'Project description is too long.')
	}
	return { name, description, normalizedName: normalizeEntityName(name) }
}

export function prepareTaskDraft(draft: TaskDraft): PreparedTaskDraft {
	const title = normalizeUserText(draft.title)
	const description = normalizeUserText(draft.description)
	if (title.length === 0 || !isWithinGraphemeLimit(title, 240)) {
		throw new DomainValidationError(
			'title',
			'Task title is required and cannot exceed 240 characters.'
		)
	}
	if (!isWithinGraphemeLimit(description, 20_000)) {
		throw new DomainValidationError('description', 'Task description is too long.')
	}
	const dueDate = assertLocalDate(draft.dueDate, 'dueDate')
	const automaticStart = calculatePreferredStart(dueDate, draft.estimateDays)
	let preferredStartDate = automaticStart
	if (draft.startMode === 'manual') {
		if (draft.preferredStartDate === null) {
			throw new DomainValidationError(
				'preferredStartDate',
				'A manual start date is required.'
			)
		}
		preferredStartDate = assertLocalDate(draft.preferredStartDate, 'preferredStartDate')
		if (preferredStartDate > dueDate) {
			throw new DomainValidationError(
				'preferredStartDate',
				'The preferred start cannot be after the deadline.'
			)
		}
	}
	return Object.freeze({
		title,
		description,
		status: draft.status,
		estimateDays: draft.estimateDays,
		dueDate,
		startMode: draft.startMode,
		preferredStartDate,
		projectId: draft.projectId,
		tagNames: cleanedTagNames(draft.tagNames)
	})
}

export function classifyTaskUrgency(task: Task, localDate: string): TaskUrgency {
	assertLocalDate(localDate, 'localDate')
	if (task.status === 'done') return 'completed'
	if (task.dueDate === localDate) return 'due_today'
	if (task.dueDate < localDate) return 'overdue'
	const latestSafeStart = calculatePreferredStart(task.dueDate, task.estimateDays)
	return localDate >= latestSafeStart ? 'at_risk' : 'upcoming'
}

const urgencyRank: Readonly<Record<TaskUrgency, number>> = Object.freeze({
	due_today: 0,
	overdue: 1,
	at_risk: 2,
	upcoming: 3,
	completed: 4
})

export function compareTasksForToday(left: Task, right: Task, localDate: string): number {
	if (left.status === 'done' || right.status === 'done') {
		return (
			(right.completedAt ?? '').localeCompare(left.completedAt ?? '') ||
			left.id.localeCompare(right.id)
		)
	}
	const urgencyDifference =
		urgencyRank[classifyTaskUrgency(left, localDate)] -
		urgencyRank[classifyTaskUrgency(right, localDate)]
	return (
		urgencyDifference ||
		left.dueDate.localeCompare(right.dueDate) ||
		left.createdAt.localeCompare(right.createdAt) ||
		left.id.localeCompare(right.id)
	)
}
