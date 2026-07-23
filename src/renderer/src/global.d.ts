import type { TrackMeApi } from '../../shared/contracts'

declare global {
	interface Window {
		readonly trackme: TrackMeApi
	}
}

export {}
