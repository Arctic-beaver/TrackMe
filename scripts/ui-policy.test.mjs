import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { auditUiPolicy } from './ui-policy.mjs'

const validSources = [
	[
		'TaskEditor.tsx',
		'const dialog = useModalDialog(); return <dialog ref={dialog} aria-labelledby="title" />'
	],
	[
		'CustomSelect.tsx',
		'const menu = ref; menu.current.showPopover(); return <ul popover="manual" />'
	],
	['App.tsx', 'const localDate = useLocalDate()']
]

describe('renderer UI policy', () => {
	it('accepts modal, top-layer overlay and live-date infrastructure', () => {
		assert.deepEqual(auditUiPolicy(validSources).failures, [])
	})

	it('rejects non-modal dialogs and body-layer selects', () => {
		const invalid = [
			['TaskEditor.tsx', 'return <dialog open />'],
			['CustomSelect.tsx', 'return <ul role="listbox" />'],
			['App.tsx', 'const localDate = todayLocalDate()']
		]
		assert.equal(auditUiPolicy(invalid).failures.length, 4)
	})
})
