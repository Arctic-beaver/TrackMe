import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { maxPackagedArchiveBytes, validatePackagedContent } from './packaged-content-policy.mjs'

const required = ['out/main/index.js', 'out/preload/index.js', 'out/renderer/index.html']

describe('packaged content policy', () => {
	it('accepts only compiled runtime entries', () => {
		assert.deepEqual(validatePackagedContent(required), [])
	})

	it('rejects source, tests, docs and the reference application', () => {
		const errors = validatePackagedContent([
			...required,
			'src/main/index.ts',
			'.test-out/main.test.js',
			'docs/QUALITY.md',
			'Yinkie/package.json'
		])
		assert.equal(errors.length, 4)
	})

	it('rejects a missing runtime entry and an oversized archive', () => {
		const errors = validatePackagedContent(
			required.filter((entry) => !entry.includes('preload')),
			maxPackagedArchiveBytes + 1
		)
		assert.ok(errors.some((error) => error.includes('preload')))
		assert.ok(errors.some((error) => error.includes('app.asar')))
	})
})
