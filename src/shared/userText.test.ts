import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { countGraphemes, isWithinGraphemeLimit, normalizeUserText } from './userText'

describe('user text', () => {
	it('counts composed emoji as user-visible graphemes', () => {
		assert.equal(countGraphemes('🚀'), 1)
		assert.equal(countGraphemes('👩🏽‍💻'), 1)
		assert.equal(countGraphemes('👨‍👩‍👧‍👦'), 1)
		assert.equal(countGraphemes('Tiempio 🚀'), 9)
	})

	it('normalizes canonical text without changing emoji sequences', () => {
		assert.equal(normalizeUserText('  Cafe\u0301 👩🏽‍💻  '), 'Café 👩🏽‍💻')
	})

	it('enforces limits by grapheme and rejects pathological raw payloads', () => {
		assert.equal(isWithinGraphemeLimit('👨‍👩‍👧‍👦'.repeat(240), 240), true)
		assert.equal(isWithinGraphemeLimit('🚀'.repeat(241), 240), false)
		assert.equal(isWithinGraphemeLimit(`a${'\u0301'.repeat(32)}`, 1), false)
	})
})
