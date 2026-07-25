import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { auditRendererBundles } from './bundle-policy.mjs'

describe('renderer bundle policy', () => {
	it('accepts bounded JavaScript and CSS assets', () => {
		assert.deepEqual(
			auditRendererBundles([
				{ path: 'assets/app.js', bytes: 250_000 },
				{ path: 'assets/app.css', bytes: 75_000 }
			]).failures,
			[]
		)
	})

	it('rejects an oversized renderer chunk', () => {
		assert.equal(
			auditRendererBundles([{ path: 'assets/app.js', bytes: 400_000 }]).failures.length,
			1
		)
	})
})
