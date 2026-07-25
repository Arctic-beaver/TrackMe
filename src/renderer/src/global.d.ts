import type { TiempioApi } from '../../shared/contracts'

declare global {
	interface Window {
		readonly tiempio: TiempioApi
	}
}

export {}
