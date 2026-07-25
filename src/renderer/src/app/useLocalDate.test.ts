import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { millisecondsUntilNextLocalDay } from './useLocalDate'

describe('local date clock', () => {
	it('schedules the next refresh at local midnight', () => {
		const now = new Date(2026, 6, 23, 23, 59, 30, 0)
		assert.equal(millisecondsUntilNextLocalDay(now), 30_000)
	})

	it('uses the calendar boundary so daylight-saving changes remain correct', () => {
		const noon = new Date(2026, 6, 23, 12, 0, 0, 0)
		const nextMidnight = new Date(2026, 6, 24, 0, 0, 0, 0)
		assert.equal(millisecondsUntilNextLocalDay(noon), nextMidnight.getTime() - noon.getTime())
	})
})
