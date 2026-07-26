import { spawnSync } from 'node:child_process'
import { copyFile, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

const acknowledgedToolingAdvisories = new Map([
	[
		1124334,
		{
			id: 'GHSA-mh99-v99m-4gvg',
			reason: 'Development-only brace expansion DoS inherited by lint and packaging tools; production audit is clean.'
		}
	]
])

export const cleanInstallArguments = Object.freeze([
	'ci',
	'--ignore-scripts',
	'--prefer-offline',
	'--no-audit',
	'--no-fund'
])

function vulnerabilityCounts(report) {
	const counts = report?.metadata?.vulnerabilities
	return {
		high: Number(counts?.high ?? 0),
		critical: Number(counts?.critical ?? 0)
	}
}

function highAndCriticalAdvisories(report) {
	const advisories = new Map()
	for (const vulnerability of Object.values(report?.vulnerabilities ?? {})) {
		for (const via of vulnerability.via ?? []) {
			if (
				typeof via === 'object' &&
				via !== null &&
				(via.severity === 'high' || via.severity === 'critical')
			) {
				advisories.set(Number(via.source), {
					severity: via.severity,
					title: String(via.title ?? 'Untitled advisory'),
					url: String(via.url ?? '')
				})
			}
		}
	}
	return advisories
}

export function evaluateDependencyAudits(productionReport, fullReport) {
	const failures = []
	const production = vulnerabilityCounts(productionReport)
	const full = vulnerabilityCounts(fullReport)
	const advisories = highAndCriticalAdvisories(fullReport)

	if (production.high > 0 || production.critical > 0) {
		failures.push(
			`Production dependency audit contains ${String(production.high)} high and ${String(production.critical)} critical vulnerabilities.`
		)
	}
	if (full.critical > 0) {
		failures.push(
			`Tooling dependency audit contains ${String(full.critical)} critical vulnerabilities.`
		)
	}
	if (full.high + full.critical > 0 && advisories.size === 0) {
		failures.push(
			'Tooling audit reported high or critical vulnerabilities without advisory data.'
		)
	}
	for (const [source, advisory] of advisories) {
		if (!acknowledgedToolingAdvisories.has(source)) {
			failures.push(
				`Unreviewed ${advisory.severity} tooling advisory ${String(source)}: ${advisory.title}${advisory.url === '' ? '' : ` (${advisory.url})`}`
			)
		}
	}

	return Object.freeze({
		failures: Object.freeze(failures),
		production: Object.freeze(production),
		full: Object.freeze(full),
		acknowledged: Object.freeze(
			[...advisories.keys()]
				.filter((source) => acknowledgedToolingAdvisories.has(source))
				.map((source) => acknowledgedToolingAdvisories.get(source))
		)
	})
}

function runNpm(arguments_, options = {}) {
	const npmCliPath = process.env['npm_execpath']
	const command = npmCliPath === undefined ? 'npm' : process.execPath
	const commandArguments = npmCliPath === undefined ? arguments_ : [npmCliPath, ...arguments_]
	const result = spawnSync(command, commandArguments, {
		encoding: 'utf8',
		...options
	})
	if (result.error) throw result.error
	return result
}

function parseAudit(arguments_) {
	const result = runNpm(arguments_)
	if (result.status !== 0 && result.status !== 1) {
		throw new Error(result.stderr.trim() || `npm ${arguments_.join(' ')} failed.`)
	}
	try {
		return JSON.parse(result.stdout)
	} catch {
		throw new Error(`npm ${arguments_.join(' ')} did not return valid JSON.`)
	}
}

async function verifyCleanInstall() {
	const directory = await mkdtemp(join(tmpdir(), 'tiempio-clean-install-'))
	try {
		await Promise.all([
			copyFile('package.json', join(directory, 'package.json')),
			copyFile('package-lock.json', join(directory, 'package-lock.json'))
		])
		const result = runNpm(cleanInstallArguments, {
			cwd: directory,
			stdio: 'inherit',
			encoding: undefined
		})
		if (result.status !== 0) throw new Error('Clean dependency installation failed.')
		console.log('PASS clean npm installation from package-lock.json')
	} finally {
		await rm(directory, { recursive: true, force: true })
	}
}

function verifyAudits() {
	const productionReport = parseAudit(['audit', '--omit=dev', '--json'])
	const fullReport = parseAudit(['audit', '--json'])
	const result = evaluateDependencyAudits(productionReport, fullReport)
	if (result.failures.length > 0) {
		throw new Error(`Dependency audit policy failed:\n- ${result.failures.join('\n- ')}`)
	}
	console.log(
		`PASS production dependency audit (${String(result.production.high)} high, ${String(result.production.critical)} critical)`
	)
	console.log(
		`PASS tooling dependency audit (${String(result.acknowledged.length)} acknowledged advisory, ${String(result.full.high)} affected high-severity nodes, no unreviewed high or critical)`
	)
}

async function run() {
	const command = process.argv[2]
	if (command === 'install') await verifyCleanInstall()
	else if (command === 'audit') verifyAudits()
	else throw new Error('Use dependency-gate.mjs with "install" or "audit".')
}

const isEntryPoint =
	process.argv[1] !== undefined && pathToFileURL(process.argv[1]).href === import.meta.url
if (isEntryPoint) await run()
