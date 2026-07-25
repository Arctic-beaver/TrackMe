import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

const themeFamilies = ['graphite-navy', 'linen-blue', 'pebble-steel', 'fog-indigo']
const schemes = ['light', 'dark']
const requiredTokens = [
	'app-background',
	'glass-chrome',
	'glass-strong',
	'column-tray',
	'task-card',
	'task-card-strong',
	'text',
	'soft',
	'muted',
	'border',
	'accent',
	'accent-strong',
	'on-accent',
	'danger',
	'warning',
	'success',
	'atmosphere-a',
	'atmosphere-b',
	'focus'
]

function parseHex(value) {
	if (!/^#[0-9a-f]{6}$/iu.test(value)) throw new Error(`Invalid color ${value}.`)
	return [1, 3, 5].map((index) => Number.parseInt(value.slice(index, index + 2), 16) / 255)
}

function linearChannel(channel) {
	return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4
}

function luminance(value) {
	const [red, green, blue] = parseHex(value).map(linearChannel)
	return 0.2126 * red + 0.7152 * green + 0.0722 * blue
}

export function contrastRatio(foreground, background) {
	const first = luminance(foreground)
	const second = luminance(background)
	return (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05)
}

export function parseThemeSchemes(css) {
	const parsed = new Map()
	const blocks =
		/:root\[data-theme=["']([^"']+)["']\]\[data-resolved-scheme=["'](light|dark)["']\]\s*\{([\s\S]*?)\}/gu
	for (const match of css.matchAll(blocks)) {
		const tokens = {}
		for (const property of match[3].matchAll(/--([a-z0-9-]+):\s*(#[0-9a-f]{6})\s*;/giu)) {
			tokens[property[1]] = property[2].toLowerCase()
		}
		parsed.set(`${match[1]}/${match[2]}`, tokens)
	}
	return parsed
}

export function auditProductionThemes(css) {
	const parsed = parseThemeSchemes(css)
	const failures = []
	for (const family of themeFamilies) {
		for (const scheme of schemes) {
			const key = `${family}/${scheme}`
			const tokens = parsed.get(key)
			if (tokens === undefined) {
				failures.push(`${key}: scheme is missing`)
				continue
			}
			for (const token of requiredTokens) {
				if (tokens[token] === undefined) failures.push(`${key}: --${token} is missing`)
			}
			if (requiredTokens.some((token) => tokens[token] === undefined)) continue
			if (tokens['column-tray'] === tokens['task-card']) {
				failures.push(`${key}: column tray and task card must remain visually distinct`)
			}
			for (const background of ['task-card', 'task-card-strong']) {
				const ratio = contrastRatio(tokens.text, tokens[background])
				if (ratio < 4.5) {
					failures.push(`${key}: --text on --${background} is ${ratio.toFixed(2)}:1`)
				}
			}
			if (contrastRatio(tokens.focus, tokens['task-card-strong']) < 3) {
				failures.push(`${key}: focus indicator contrast is below 3:1`)
			}
		}
	}
	for (const key of parsed.keys()) {
		if (!themeFamilies.some((family) => key.startsWith(`${family}/`))) {
			failures.push(`${key}: unexpected theme family`)
		}
	}
	if (!/backdrop-filter:\s*blur\(/u.test(css)) {
		failures.push('Liquid Glass blur is missing')
	}
	if (!/\.task-column[\s\S]*?var\(--column-tray\)/u.test(css)) {
		failures.push('task columns must use --column-tray')
	}
	if (!/\.empty-card[\s\S]*?var\(--task-card/u.test(css)) {
		failures.push('task cards must use --task-card')
	}
	return { failures, schemes: parsed }
}

export function auditScrollbarSystem(entryCss, scrollbarCss) {
	const failures = []
	const imports = entryCss.match(/@import\s+['"]\.\/scrollbars\.css['"]\s*;/gu) ?? []
	const requiredTokens = [
		'scrollbar-size',
		'scrollbar-track',
		'scrollbar-thumb',
		'scrollbar-thumb-hover',
		'scrollbar-thumb-active',
		'scrollbar-corner'
	]
	const requiredRules = [
		['global Firefox width', /\*\s*\{[\s\S]*?scrollbar-width:/u],
		['global Firefox colors', /\*\s*\{[\s\S]*?scrollbar-color:/u],
		[
			'Chromium standard-property reset',
			/@supports\s+selector\(::-webkit-scrollbar\)\s*\{[\s\S]*?scrollbar-width:\s*auto;[\s\S]*?scrollbar-color:\s*auto;/u
		],
		['global WebKit scrollbar', /\*::-webkit-scrollbar\s*\{/u],
		['global WebKit track', /\*::-webkit-scrollbar-track\s*\{/u],
		['global WebKit thumb', /\*::-webkit-scrollbar-thumb\s*\{/u],
		['WebKit thumb hover state', /\*::-webkit-scrollbar-thumb:hover\s*\{/u],
		['WebKit thumb active state', /\*::-webkit-scrollbar-thumb:active\s*\{/u],
		['WebKit corner', /\*::-webkit-scrollbar-corner\s*\{/u],
		['forced colors fallback', /@media\s*\(forced-colors:\s*active\)/u]
	]

	if (imports.length !== 1) {
		failures.push('main.css must import scrollbars.css exactly once')
	}
	if (!entryCss.trimStart().startsWith("@import './scrollbars.css';")) {
		failures.push('scrollbars.css must be the first main.css import')
	}
	if (/::-webkit-scrollbar|scrollbar-(?:color|width)\s*:/u.test(entryCss)) {
		failures.push('scrollbar implementation must remain in scrollbars.css')
	}
	for (const token of requiredTokens) {
		if (!new RegExp(`--${token}:`, 'u').test(scrollbarCss)) {
			failures.push(`scrollbars.css: --${token} is missing`)
		}
	}
	for (const [name, rule] of requiredRules) {
		if (!rule.test(scrollbarCss)) failures.push(`scrollbars.css: ${name} is missing`)
	}

	return { failures }
}

const invokedPath = process.argv[1]
if (invokedPath !== undefined && fileURLToPath(import.meta.url) === invokedPath) {
	const cssPath =
		process.argv[2] ??
		fileURLToPath(new URL('../src/renderer/src/styles/main.css', import.meta.url))
	const scrollbarPath = fileURLToPath(
		new URL('../src/renderer/src/styles/scrollbars.css', import.meta.url)
	)
	const [entryCss, scrollbarCss] = await Promise.all([
		readFile(cssPath, 'utf8'),
		readFile(scrollbarPath, 'utf8')
	])
	const failures = [
		...auditProductionThemes(entryCss).failures,
		...auditScrollbarSystem(entryCss, scrollbarCss).failures
	]
	if (failures.length > 0) {
		for (const failure of failures) console.error(`FAIL ${failure}`)
		process.exitCode = 1
	} else {
		console.log(
			'PASS four complete light/dark themes, contrast, Liquid Glass and global scrollbar policy'
		)
	}
}
