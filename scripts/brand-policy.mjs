import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { extname } from 'node:path'
import { pathToFileURL } from 'node:url'

const previousBrand = ['track', 'me'].join('')
const binaryExtensions = new Set([
	'.7z',
	'.db',
	'.dll',
	'.exe',
	'.gif',
	'.icns',
	'.ico',
	'.jpeg',
	'.jpg',
	'.pdf',
	'.png',
	'.sqlite',
	'.sqlite3',
	'.ttf',
	'.webp',
	'.woff',
	'.woff2',
	'.zip'
])

export function findLegacyBrandViolations(entries) {
	const violations = []
	for (const entry of entries) {
		if (entry.path.toLowerCase().includes(previousBrand)) {
			violations.push(`${entry.path}: previous product name remains in the file path`)
		}
		for (const [index, line] of entry.content.split('\n').entries()) {
			if (line.toLowerCase().includes(previousBrand)) {
				violations.push(
					`${entry.path}:${String(index + 1)}: previous product name remains in text`
				)
			}
		}
	}
	return violations
}

function repositoryTextEntries() {
	const listedFiles = spawnSync(
		'git',
		['ls-files', '--cached', '--others', '--exclude-standard', '-z'],
		{ encoding: 'buffer' }
	)
	if (listedFiles.error) throw listedFiles.error
	if (listedFiles.status !== 0) {
		throw new Error(
			listedFiles.stderr.toString('utf8').trim() || 'Could not list repository files.'
		)
	}

	const decoder = new TextDecoder('utf-8', { fatal: true })
	return listedFiles.stdout
		.toString('utf8')
		.split('\0')
		.filter(Boolean)
		.flatMap((path) => {
			if (binaryExtensions.has(extname(path).toLowerCase())) return []
			const bytes = readFileSync(path)
			if (bytes.includes(0)) return []
			return [{ path, content: decoder.decode(bytes) }]
		})
}

function run() {
	const violations = findLegacyBrandViolations(repositoryTextEntries())
	if (violations.length > 0) {
		throw new Error(`Brand policy failed:\n- ${violations.join('\n- ')}`)
	}
	console.log('PASS Tiempio brand policy')
}

const isEntryPoint =
	process.argv[1] !== undefined && pathToFileURL(process.argv[1]).href === import.meta.url
if (isEntryPoint) run()
