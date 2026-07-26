import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { cleanInstallArguments, evaluateDependencyAudits } from './dependency-gate.mjs'

function report({ high = 0, critical = 0, source, severity = 'high' } = {}) {
	return {
		metadata: { vulnerabilities: { high, critical } },
		vulnerabilities:
			source === undefined
				? {}
				: {
						fixture: {
							via: [
								{
									source,
									severity,
									title: 'Fixture advisory',
									url: 'https://example.test/advisory'
								}
							]
						}
					}
	}
}

describe('dependency gate', () => {
	it('uses an isolated deterministic npm ci without lifecycle scripts or implicit audit', () => {
		assert.deepEqual(cleanInstallArguments, [
			'ci',
			'--ignore-scripts',
			'--prefer-offline',
			'--no-audit',
			'--no-fund'
		])
	})

	it('accepts a clean production tree and the reviewed tooling advisory', () => {
		const result = evaluateDependencyAudits(report(), report({ high: 20, source: 1124334 }))
		assert.deepEqual(result.failures, [])
		assert.equal(result.acknowledged.length, 1)
	})

	it('rejects production vulnerabilities and unreviewed tooling advisories', () => {
		const result = evaluateDependencyAudits(
			report({ high: 1, source: 999 }),
			report({ high: 1, source: 999 })
		)
		assert.equal(result.failures.length, 2)
		assert.match(result.failures.join('\n'), /Production dependency audit/)
		assert.match(result.failures.join('\n'), /Unreviewed high tooling advisory/)
	})

	it('rejects critical tooling findings even when advisory metadata is incomplete', () => {
		const result = evaluateDependencyAudits(report(), report({ critical: 1 }))
		assert.equal(result.failures.length, 2)
		assert.match(result.failures.join('\n'), /critical vulnerabilities/)
		assert.match(result.failures.join('\n'), /without advisory data/)
	})
})
