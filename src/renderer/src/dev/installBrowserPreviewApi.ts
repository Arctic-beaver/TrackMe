import {
	createDefaultApplicationSettings,
	type ApplicationSettings,
	type TrackMeApi
} from '../../../shared/contracts'

let settings = createDefaultApplicationSettings()

function updateSettings(next: ApplicationSettings): Promise<ApplicationSettings> {
	settings = next
	return Promise.resolve(settings)
}

export function installBrowserPreviewApi(): void {
	const api: TrackMeApi = {
		app: {
			getStartupState: () =>
				Promise.resolve({
					settings,
					platform: 'win32',
					windowMaximized: false,
					schemaVersion: 1
				}),
			ready: () => Promise.resolve()
		},
		settings: {
			get: () => Promise.resolve(settings),
			setAppearance: (appearance) => updateSettings({ ...settings, appearance }),
			setInterfaceLocale: (interfaceLocale) =>
				updateSettings({
					...settings,
					language: { interfaceLocale }
				})
		},
		window: {
			minimize: () => Promise.resolve(),
			toggleMaximize: () => Promise.resolve({ maximized: false }),
			close: () => Promise.resolve(),
			getState: () => Promise.resolve({ maximized: false })
		}
	}
	Object.defineProperty(window, 'trackme', {
		value: Object.freeze(api),
		configurable: true
	})
}
