const maximumCodeUnitsPerGrapheme = 16

const graphemeSegmenter = new Intl.Segmenter(undefined, {
	granularity: 'grapheme'
})

export function normalizeUserText(value: string): string {
	return value.trim().normalize('NFC')
}

export function countGraphemes(value: string): number {
	let count = 0
	for (const { segment } of graphemeSegmenter.segment(value)) {
		if (segment.length > 0) count += 1
	}
	return count
}

export function isWithinGraphemeLimit(value: string, maximumGraphemes: number): boolean {
	if (!Number.isSafeInteger(maximumGraphemes) || maximumGraphemes < 0) return false
	if (value.length > maximumGraphemes * maximumCodeUnitsPerGrapheme) return false

	let count = 0
	for (const { segment } of graphemeSegmenter.segment(value)) {
		if (segment.length > 0) count += 1
		if (count > maximumGraphemes) return false
	}
	return true
}
