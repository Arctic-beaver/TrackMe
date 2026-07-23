import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

const defaultExecutable =
	process.platform === 'darwin'
		? 'dist/mac/TrackMe.app/Contents/MacOS/TrackMe'
		: process.platform === 'linux'
			? 'dist/linux-unpacked/trackme'
			: 'dist/win-unpacked/TrackMe.exe'

const executablePath = resolve(process.argv[2] ?? defaultExecutable)
if (!existsSync(executablePath)) {
	throw new Error(`Packaged Electron executable is missing: ${executablePath}`)
}

const profilePath = await mkdtemp(join(tmpdir(), 'trackme-packaged-smoke-'))
const child = spawn(
	executablePath,
	[`--trackme-smoke-user-data=${profilePath}`, '--trackme-packaged-smoke-test'],
	{ windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'] }
)
let stderr = ''
child.stderr.setEncoding('utf8')
child.stderr.on('data', (chunk) => {
	if (stderr.length < 16_384) stderr += chunk
})

try {
	const exitCode = await new Promise((resolveExit, reject) => {
		const timeout = setTimeout(() => {
			child.kill()
			reject(new Error('Packaged application smoke test timed out after 45 seconds.'))
		}, 45_000)
		child.once('error', (error) => {
			clearTimeout(timeout)
			reject(error)
		})
		child.once('exit', (code, signal) => {
			clearTimeout(timeout)
			if (signal !== null) reject(new Error(`Packaged application exited with ${signal}.`))
			else resolveExit(code)
		})
	})
	if (exitCode !== 0) {
		throw new Error(
			`Packaged application exited with code ${String(exitCode)}.` +
				(stderr === '' ? '' : `\n${stderr}`)
		)
	}
	console.log('PASS packaged application loaded the trusted renderer and exited cleanly')
} finally {
	await rm(profilePath, { recursive: true, force: true })
}
