import { listPackage } from '@electron/asar'
import { statSync } from 'node:fs'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

export const maxPackagedArchiveBytes = 5 * 1024 * 1024

const requiredArtifacts = Object.freeze([
	{ name: 'main entry', pattern: /^out\/main\/index\.js$/u },
	{ name: 'preload entry', pattern: /^out\/preload\/index\.js$/u },
	{ name: 'renderer document', pattern: /^out\/renderer\/index\.html$/u }
])

const forbiddenArtifacts = Object.freeze([
	{ name: 'compiled tests', pattern: /^\.test-out(?:\/|$)/u },
	{ name: 'source tree', pattern: /^src(?:\/|$)/u },
	{ name: 'project documentation', pattern: /^docs(?:\/|$)/u },
	{ name: 'reference application', pattern: /^Yinkie(?:\/|$)/u }
])

function normalizeEntry(entry) {
	return entry.replaceAll('\\', '/').replace(/^\/+/u, '')
}

export function validatePackagedContent(entries, archiveBytes = 0) {
	const normalizedEntries = entries.map(normalizeEntry)
	const errors = []
	if (archiveBytes > maxPackagedArchiveBytes) {
		errors.push(
			`app.asar is ${(archiveBytes / 1024 / 1024).toFixed(2)} MiB; budget is ` +
				`${(maxPackagedArchiveBytes / 1024 / 1024).toFixed(2)} MiB`
		)
	}
	for (const requirement of requiredArtifacts) {
		if (!normalizedEntries.some((entry) => requirement.pattern.test(entry))) {
			errors.push(`missing ${requirement.name}`)
		}
	}
	for (const forbidden of forbiddenArtifacts) {
		const match = normalizedEntries.find((entry) => forbidden.pattern.test(entry))
		if (match !== undefined) errors.push(`contains ${forbidden.name}: ${match}`)
	}
	return errors
}

export function checkPackagedContent(archivePath) {
	const resolvedArchivePath = resolve(archivePath)
	const entries = listPackage(resolvedArchivePath)
	const archiveBytes = statSync(resolvedArchivePath).size
	const errors = validatePackagedContent(entries, archiveBytes)
	if (errors.length > 0) {
		throw new Error(`Packaged content policy failed:\n- ${errors.join('\n- ')}`)
	}
	console.log(
		`PASS packaged content (${String(entries.length)} entries, ` +
			`${(archiveBytes / 1024 / 1024).toFixed(2)} MiB)`
	)
}

const isEntryPoint =
	process.argv[1] !== undefined &&
	pathToFileURL(resolve(process.argv[1])).href === import.meta.url
if (isEntryPoint) {
	checkPackagedContent(process.argv[2] ?? 'dist/win-unpacked/resources/app.asar')
}
