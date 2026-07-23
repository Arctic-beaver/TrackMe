import { readFile, readdir, stat } from 'node:fs/promises'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'

const userFacingAttributes = new Set([
	'alt',
	'aria-description',
	'aria-label',
	'aria-placeholder',
	'placeholder',
	'title'
])

function normalizedText(value) {
	return value.replace(/\s+/g, ' ').trim()
}

function isUserFacingText(value) {
	const normalized = normalizedText(value)
	return normalized.length > 0 && /\p{L}/u.test(normalized)
}

function location(sourceFile, node) {
	const position = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile))
	return `${String(position.line + 1)}:${String(position.character + 1)}`
}

export function auditLocalizationSource(source, fileName = 'fixture.tsx') {
	const sourceFile = ts.createSourceFile(
		fileName,
		source,
		ts.ScriptTarget.Latest,
		true,
		ts.ScriptKind.TSX
	)
	const violations = []
	const report = (node, kind, value) => {
		violations.push(
			`${fileName}:${location(sourceFile, node)} ${kind}: ${JSON.stringify(normalizedText(value))}`
		)
	}
	const visit = (node) => {
		if (ts.isJsxText(node) && isUserFacingText(node.text)) {
			report(node, 'unlocalized JSX text', node.text)
		}
		if (
			ts.isJsxAttribute(node) &&
			userFacingAttributes.has(node.name.getText(sourceFile)) &&
			node.initializer !== undefined
		) {
			const expression = ts.isJsxExpression(node.initializer)
				? node.initializer.expression
				: node.initializer
			if (
				expression !== undefined &&
				(ts.isStringLiteral(expression) ||
					ts.isNoSubstitutionTemplateLiteral(expression) ||
					ts.isTemplateExpression(expression)) &&
				isUserFacingText(expression.getText(sourceFile))
			) {
				report(
					node,
					`unlocalized ${node.name.getText(sourceFile)}`,
					expression.getText(sourceFile)
				)
			}
		}
		if (
			ts.isJsxExpression(node) &&
			node.expression !== undefined &&
			(ts.isStringLiteral(node.expression) ||
				ts.isNoSubstitutionTemplateLiteral(node.expression)) &&
			isUserFacingText(node.expression.text)
		) {
			report(node, 'unlocalized JSX expression', node.expression.text)
		}
		ts.forEachChild(node, visit)
	}
	visit(sourceFile)
	return violations
}

async function collectInterfaceFiles(inputPath) {
	const absolutePath = resolve(inputPath)
	const inputStat = await stat(absolutePath)
	if (inputStat.isFile()) {
		return inputPath.endsWith('.tsx') && !inputPath.endsWith('.test.tsx') ? [inputPath] : []
	}
	if (!inputStat.isDirectory()) return []
	const entries = await readdir(absolutePath, { withFileTypes: true })
	const nested = await Promise.all(
		entries.map((entry) => collectInterfaceFiles(resolve(inputPath, entry.name)))
	)
	return nested.flat()
}

export async function auditLocalizationFiles(inputPaths) {
	const fileNames = (await Promise.all(inputPaths.map(collectInterfaceFiles))).flat()
	const violations = []
	for (const fileName of fileNames) {
		violations.push(
			...auditLocalizationSource(await readFile(resolve(fileName), 'utf8'), fileName)
		)
	}
	return { fileNames, violations }
}

async function main() {
	const inputs = process.argv.slice(2)
	if (inputs.length === 0) {
		throw new Error('Pass the renderer TSX files that form the user interface.')
	}
	const { fileNames, violations } = await auditLocalizationFiles(inputs)
	if (violations.length > 0) {
		console.error(['Localization policy violations:', ...violations].join('\n'))
		process.exitCode = 1
		return
	}
	console.log(`PASS localization policy for ${String(fileNames.length)} interface files`)
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
	await main()
}
