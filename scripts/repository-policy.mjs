import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { extname } from 'node:path'

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
const fileNames = listedFiles.stdout.toString('utf8').split('\0').filter(Boolean)
const violations = []
let checkedTextFiles = 0

for (const fileName of fileNames) {
	if (binaryExtensions.has(extname(fileName).toLowerCase())) continue

	const bytes = readFileSync(fileName)
	if (bytes.includes(0)) continue

	let text
	try {
		text = decoder.decode(bytes)
	} catch {
		violations.push(`${fileName}: text file is not valid UTF-8`)
		continue
	}

	checkedTextFiles += 1

	if (bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
		violations.push(`${fileName}: UTF-8 BOM is not allowed`)
	}
	if (text.includes('\r')) {
		violations.push(`${fileName}: CR or CRLF line ending found; use LF`)
	}
	if (bytes.length > 0 && bytes.at(-1) !== 0x0a) {
		violations.push(`${fileName}: final LF newline is required`)
	}

	const isMarkdown = ['.md', '.mdx'].includes(extname(fileName).toLowerCase())
	for (const [index, line] of text.split('\n').entries()) {
		const trailingWhitespace = line.match(/[ \t]+$/u)?.[0]
		if (trailingWhitespace === undefined) continue
		if (isMarkdown && trailingWhitespace === '  ') continue
		violations.push(`${fileName}:${String(index + 1)}: trailing whitespace is not allowed`)
	}
}

if (violations.length > 0) {
	console.error(['Repository text policy violations:', ...violations].join('\n'))
	process.exitCode = 1
} else {
	console.log(`Repository text policy passed for ${String(checkedTextFiles)} text files.`)
}
