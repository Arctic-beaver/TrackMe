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
	['App.tsx', 'const localDate = useLocalDate()'],
	['TitleBar.tsx', 'return <TiempioMark />'],
	[
		'TiempioMark.tsx',
		'const pulse = "M24 128H50L65 78L95 194L138 38L169 168L184 128H221"; const arrow = "M208 116L221 128L208 140"'
	]
]

describe('renderer UI policy', () => {
	it('accepts modal, top-layer overlay, live-date and product-mark infrastructure', () => {
		assert.deepEqual(auditUiPolicy(validSources).failures, [])
	})

	it('rejects non-modal dialogs, body-layer selects and the legacy product mark', () => {
		const invalid = [
			['TaskEditor.tsx', 'return <dialog open />'],
			['CustomSelect.tsx', 'return <ul role="listbox" />'],
			['App.tsx', 'const localDate = todayLocalDate()'],
			['TitleBar.tsx', 'return <Sparkles />'],
			['TiempioMark.tsx', 'return <svg />']
		]
		assert.equal(auditUiPolicy(invalid).failures.length, 6)
	})
})
