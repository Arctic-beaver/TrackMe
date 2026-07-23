import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { FuseState, FuseV1Options, FuseVersion } from '@electron/fuses'
import { expectedFuseStates, validateFuseWire } from './electron-fuse-policy.mjs'

describe('Electron fuse policy', () => {
	it('accepts the complete hardened production wire', () => {
		assert.deepEqual(validateFuseWire({ version: FuseVersion.V1, ...expectedFuseStates }), [])
	})

	it('rejects RunAsNode', () => {
		const wire = { version: FuseVersion.V1, ...expectedFuseStates }
		wire[FuseV1Options.RunAsNode] = FuseState.ENABLE
		assert.ok(validateFuseWire(wire).some((error) => error.includes('RunAsNode')))
	})
})
