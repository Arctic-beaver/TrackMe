import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { createDefaultApplicationSettings } from '../../shared/contracts'
import { App } from './app/App'
import { ApplicationSettingsProvider } from './app/ApplicationSettingsProvider'
import { LocalizationProvider } from './localization/LocalizationProvider'
import './styles/main.css'

async function bootstrap(): Promise<void> {
	if (import.meta.env.DEV && !('tiempio' in window)) {
		const { installBrowserPreviewApi } = await import('./dev/installBrowserPreviewApi')
		installBrowserPreviewApi()
	}

	const rootElement = document.getElementById('root')
	if (rootElement === null) throw new Error('Tiempio renderer root is missing.')
	const startup = await window.tiempio.app.getStartupState().catch(() => ({
		settings: createDefaultApplicationSettings(),
		platform: 'win32' as const,
		windowMaximized: false,
		schemaVersion: 0
	}))

	createRoot(rootElement).render(
		<StrictMode>
			<ApplicationSettingsProvider initialSettings={startup.settings}>
				<LocalizationProvider>
					<App startup={startup} />
				</LocalizationProvider>
			</ApplicationSettingsProvider>
		</StrictMode>
	)
}

void bootstrap()
