import { readdir, readFile } from 'node:fs/promises'
import { extname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const limits = Object.freeze({
	'.js': 350 * 1024,
	'.css': 120 * 1024
})

async function listFiles(directory) {
	const entries = await readdir(directory, { withFileTypes: true })
	const nested = await Promise.all(
		entries.map((entry) => {
			const path = join(directory, entry.name)
			return entry.isDirectory() ? listFiles(path) : Promise.resolve([path])
		})
	)
	return nested.flat()
}

export function auditRendererBundles(assets) {
	const failures = []
	for (const asset of assets) {
		const limit = limits[extname(asset.path)]
		if (limit !== undefined && asset.bytes > limit) {
			failures.push(
				`${asset.path}: ${String(asset.bytes)} bytes exceeds the ${String(limit)} byte budget`
			)
		}
	}
	return { failures }
}

const invokedPath = process.argv[1]
if (invokedPath !== undefined && fileURLToPath(import.meta.url) === invokedPath) {
	const rendererRoot =
		process.argv[2] ?? fileURLToPath(new URL('../out/renderer', import.meta.url))
	const paths = await listFiles(rendererRoot)
	const assets = await Promise.all(
		paths.map(async (path) => ({
			path: relative(rendererRoot, path),
			bytes: (await readFile(path)).byteLength
		}))
	)
	const { failures } = auditRendererBundles(assets)
	if (failures.length > 0) {
		for (const failure of failures) console.error(`FAIL ${failure}`)
		process.exitCode = 1
	} else {
		console.log('PASS production renderer bundle budgets')
	}
}
