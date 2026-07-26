import { readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

async function listSourceFiles(directory) {
	const entries = await readdir(directory, { withFileTypes: true })
	const nested = await Promise.all(
		entries.map((entry) => {
			const path = join(directory, entry.name)
			return entry.isDirectory()
				? listSourceFiles(path)
				: Promise.resolve(/\.[jt]sx?$/u.test(entry.name) ? [path] : [])
		})
	)
	return nested.flat()
}

export function auditUiPolicy(sources) {
	const failures = []
	for (const [path, source] of sources) {
		if (/<dialog\b[^>]*\bopen(?:\s|=|>)/u.test(source)) {
			failures.push(`${path}: dialogs must be opened through showModal()`)
		}
		if (/<dialog\b/u.test(source) && !/useModalDialog\s*\(/u.test(source)) {
			failures.push(`${path}: dialogs must use the shared modal lifecycle`)
		}
	}
	const customSelect = sources.find(([path]) => path.endsWith('CustomSelect.tsx'))?.[1] ?? ''
	if (!/popover="manual"/u.test(customSelect) || !/showPopover\s*\(/u.test(customSelect)) {
		failures.push('CustomSelect.tsx: the listbox must use the top-layer popover API')
	}
	const app = sources.find(([path]) => path.endsWith('App.tsx'))?.[1] ?? ''
	if (!/useLocalDate\s*\(/u.test(app)) {
		failures.push('App.tsx: the Today board must use the live local-date clock')
	}
	const titleBar = sources.find(([path]) => path.endsWith('TitleBar.tsx'))?.[1] ?? ''
	if (!/<TiempioMark\s*\/>/u.test(titleBar) || /\bSparkles\b/u.test(titleBar)) {
		failures.push('TitleBar.tsx: the product brand must use the Tiempio pulse-arrow mark')
	}
	const tiempioMark = sources.find(([path]) => path.endsWith('TiempioMark.tsx'))?.[1] ?? ''
	if (
		!/M24 128H50L65 78L95 194L138 38L169 168L184 128H221/u.test(tiempioMark) ||
		!/M208 116L221 128L208 140/u.test(tiempioMark)
	) {
		failures.push('TiempioMark.tsx: the product mark must preserve the approved geometry')
	}
	return { failures }
}

const invokedPath = process.argv[1]
if (invokedPath !== undefined && fileURLToPath(import.meta.url) === invokedPath) {
	const sourceRoot =
		process.argv[2] ?? fileURLToPath(new URL('../src/renderer/src', import.meta.url))
	const paths = await listSourceFiles(sourceRoot)
	const sources = await Promise.all(
		paths.map(async (path) => [path, await readFile(path, 'utf8')])
	)
	const { failures } = auditUiPolicy(sources)
	if (failures.length > 0) {
		for (const failure of failures) console.error(`FAIL ${failure}`)
		process.exitCode = 1
	} else {
		console.log('PASS modal, overlay, live-date and Tiempio brand-mark UI policy')
	}
}
