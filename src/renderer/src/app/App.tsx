import { useEffect, useRef, useState } from 'react'
import {
	CalendarDays,
	CalendarRange,
	CheckCircle2,
	CircleDot,
	Database,
	FolderKanban,
	HeartHandshake,
	Inbox,
	Play,
	Plus,
	Tag
} from 'lucide-react'
import type { NavigationSection, StartupState } from '../../../shared/contracts'
import type { LocalizationKey } from '../../../shared/localization'
import { formatCalendarDate } from '../../../shared/localization'
import { useLocalization } from '../localization/useLocalization'
import { AppearanceDialog } from './AppearanceDialog'
import { TitleBar } from './TitleBar'

const navigation: ReadonlyArray<{
	readonly id: NavigationSection
	readonly labelKey: LocalizationKey
	readonly icon: typeof CalendarDays
}> = [
	{ id: 'today', labelKey: 'navigation.today', icon: CalendarDays },
	{ id: 'week', labelKey: 'navigation.week', icon: CalendarRange },
	{ id: 'month', labelKey: 'navigation.month', icon: CalendarRange },
	{ id: 'projects', labelKey: 'navigation.projects', icon: HeartHandshake }
]

const columns: ReadonlyArray<{
	readonly id: 'todo' | 'planned' | 'inProgress' | 'done'
	readonly titleKey: LocalizationKey
	readonly noteKey: LocalizationKey
	readonly icon: typeof Inbox
}> = [
	{
		id: 'todo',
		titleKey: 'task.status.todo',
		noteKey: 'column.todo.note',
		icon: Inbox
	},
	{
		id: 'planned',
		titleKey: 'task.status.planned',
		noteKey: 'column.planned.note',
		icon: CircleDot
	},
	{
		id: 'inProgress',
		titleKey: 'task.status.inProgress',
		noteKey: 'column.inProgress.note',
		icon: Play
	},
	{
		id: 'done',
		titleKey: 'task.status.done',
		noteKey: 'column.done.note',
		icon: CheckCircle2
	}
]

function TodayBoard(): React.JSX.Element {
	const { t } = useLocalization()
	const [compactStatus, setCompactStatus] = useState(columns[0].id)

	return (
		<>
			<div className="compact-status-switcher" role="tablist" aria-label={t('board.label')}>
				{columns.map((column) => (
					<button
						type="button"
						role="tab"
						key={column.id}
						aria-selected={compactStatus === column.id}
						onClick={() => setCompactStatus(column.id)}
					>
						{t(column.titleKey)}
					</button>
				))}
			</div>

			<div className="board" aria-label={t('board.label')}>
				{columns.map((column) => {
					const Icon = column.icon
					return (
						<section
							className="task-column"
							data-compact-active={compactStatus === column.id}
							key={column.id}
						>
							<header className="column-header">
								<div>
									<span className="column-title">
										<Icon aria-hidden="true" />
										<strong>{t(column.titleKey)}</strong>
									</span>
									<small>{t(column.noteKey)}</small>
								</div>
								<span className="column-count">0</span>
							</header>
							<div className="empty-card">
								<span>{t('column.empty')}</span>
							</div>
							{column.id === 'todo' ? (
								<button type="button" className="new-task-button" disabled>
									<Plus aria-hidden="true" />
									<span>{t('task.new')}</span>
								</button>
							) : null}
						</section>
					)
				})}
			</div>
		</>
	)
}

function PlaceholderView({
	titleKey,
	descriptionKey
}: {
	readonly titleKey: LocalizationKey
	readonly descriptionKey: LocalizationKey
}): React.JSX.Element {
	const { t } = useLocalization()
	return (
		<section className="placeholder-view">
			<FolderKanban aria-hidden="true" />
			<h2>{t(titleKey)}</h2>
			<p>{t(descriptionKey)}</p>
		</section>
	)
}

function activeView(section: NavigationSection): {
	readonly titleKey: LocalizationKey
	readonly descriptionKey: LocalizationKey
} | null {
	if (section === 'week') {
		return {
			titleKey: 'view.week.title',
			descriptionKey: 'view.week.description'
		}
	}
	if (section === 'month') {
		return {
			titleKey: 'view.month.title',
			descriptionKey: 'view.month.description'
		}
	}
	if (section === 'projects') {
		return {
			titleKey: 'view.projects.title',
			descriptionKey: 'view.projects.description'
		}
	}
	return null
}

export function App({ startup }: { readonly startup: StartupState }): React.JSX.Element {
	const { locale, t } = useLocalization()
	const [section, setSection] = useState<NavigationSection>('today')
	const [appearanceOpen, setAppearanceOpen] = useState(false)
	const readinessReported = useRef(false)
	const placeholder = activeView(section)

	useEffect(() => {
		if (readinessReported.current) return
		readinessReported.current = true
		void window.trackme.app.ready()
	}, [])

	return (
		<div className="app-shell">
			<div className="ambient ambient-one" />
			<div className="ambient ambient-two" />
			<div className="glass-chrome">
				<TitleBar
					platform={startup.platform}
					initialMaximized={startup.windowMaximized}
					onOpenAppearance={() => setAppearanceOpen(true)}
				/>
				<nav className="primary-navigation" aria-label={t('navigation.primary')}>
					{navigation.map((item) => {
						const Icon = item.icon
						return (
							<button
								type="button"
								key={item.id}
								aria-current={section === item.id ? 'page' : undefined}
								onClick={() => setSection(item.id)}
							>
								<Icon aria-hidden="true" />
								<span>{t(item.labelKey)}</span>
							</button>
						)
					})}
				</nav>
			</div>

			<main className="workspace">
				<section className="context-header">
					<div>
						<h1>{t('shell.greeting')}</h1>
						<p>{t('shell.focus')}</p>
					</div>
					<time>{formatCalendarDate(locale, new Date())}</time>
				</section>

				<div className="filter-row">
					<button type="button" className="filter-chip" disabled>
						<FolderKanban aria-hidden="true" />
						<span>{t('filters.projects')}</span>
					</button>
					<button type="button" className="filter-chip" disabled>
						<Tag aria-hidden="true" />
						<span>{t('filters.tags')}</span>
					</button>
				</div>

				{section === 'today' ? <TodayBoard /> : null}
				{placeholder === null ? null : (
					<PlaceholderView
						titleKey={placeholder.titleKey}
						descriptionKey={placeholder.descriptionKey}
					/>
				)}

				<section className="foundation-card">
					<Database aria-hidden="true" />
					<div>
						<strong>{t('foundation.badge')}</strong>
						<span>
							{t('foundation.storage', {
								version: startup.schemaVersion
							})}
						</span>
					</div>
					<p>{t('foundation.description')}</p>
				</section>
			</main>

			{appearanceOpen ? <AppearanceDialog onClose={() => setAppearanceOpen(false)} /> : null}
		</div>
	)
}
