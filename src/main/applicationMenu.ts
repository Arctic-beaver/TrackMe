import type { MenuItemConstructorOptions } from 'electron'
import type { ResolvedInterfaceLocale } from '../shared/contracts'
import { createTranslator } from '../shared/localization'

export function createApplicationMenuTemplate(
	platform: NodeJS.Platform,
	locale: ResolvedInterfaceLocale
): MenuItemConstructorOptions[] {
	const t = createTranslator(locale)
	const fileMenu: MenuItemConstructorOptions = {
		label: t('menu.file'),
		submenu:
			platform === 'darwin'
				? [{ label: t('menu.close'), role: 'close' }]
				: [
						{ label: t('menu.close'), role: 'close' },
						{ type: 'separator' },
						{ label: t('menu.quit'), role: 'quit' }
					]
	}
	const template: MenuItemConstructorOptions[] = [
		fileMenu,
		{
			label: t('menu.view'),
			submenu: [{ label: t('menu.reload'), role: 'reload' }]
		},
		{
			label: t('menu.window'),
			submenu: [{ label: t('menu.minimize'), role: 'minimize' }]
		}
	]
	if (platform === 'darwin') {
		template.unshift({
			label: t('product.name'),
			submenu: [
				{ role: 'about' },
				{ type: 'separator' },
				{ label: t('menu.quit'), role: 'quit' }
			]
		})
	}
	return template
}
