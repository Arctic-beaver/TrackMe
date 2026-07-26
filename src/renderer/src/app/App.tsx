import { useCallback, useEffect, useRef, useState } from 'react'
import {
	Archive,
	CalendarDays,
	CalendarRange,
	FolderKanban,
	HeartHandshake,
	Tag,
	X
} from 'lucide-react'
import type {
	NavigationSection,
	Project,
	StartupState,
	Task,
	TaskBoardSnapshot,
	TaskStatus
} from '../../../shared/contracts'
import { IpcRemoteError } from '../../../shared/ipcProtocol'
import type { LocalizationKey } from '../../../shared/localization'
import { formatCalendarDate } from '../../../shared/localization'
import { useLocalization } from '../localization/useLocalization'
import { ArchivedTasksDialog } from './ArchivedTasksDialog'
import { AppearanceDialog } from './AppearanceDialog'
import { CustomSelect } from './CustomSelect'
import { LanguageDialog } from './LanguageDialog'
import { TaskEditor } from './TaskEditor'
import { TitleBar } from './TitleBar'
import { TodayBoard } from './TodayBoard'
import { useLocalDate } from './useLocalDate'

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
	const [overlay, setOverlay] = useState<
		'appearance' | 'language' | 'editor' | 'archived' | null
	>(null)
	const [editingTask, setEditingTask] = useState<Task | null>(null)
	const [snapshot, setSnapshot] = useState<TaskBoardSnapshot | null>(null)
	const [loading, setLoading] = useState(true)
	const [operationError, setOperationError] = useState<
		'task.validation.storageBusy' | 'board.loadError' | null
	>(null)
	const [operationBusy, setOperationBusy] = useState(false)
	const [projectFilter, setProjectFilter] = useState('')
	const [tagFilter, setTagFilter] = useState('')
	const localDate = useLocalDate()
	const readinessReported = useRef(false)
	const refreshSequence = useRef(0)
	const placeholder = activeView(section)
	const refreshBoard = useCallback(async () => {
		const sequence = refreshSequence.current + 1
		refreshSequence.current = sequence
		try {
			const next = await window.tiempio.tasks.getBoard()
			if (sequence !== refreshSequence.current) return
			setSnapshot(next)
			setOperationError(null)
		} catch (error) {
			if (sequence !== refreshSequence.current) return
			setOperationError(
				error instanceof IpcRemoteError && error.code === 'STORAGE_BUSY'
					? 'task.validation.storageBusy'
					: 'board.loadError'
			)
		} finally {
			if (sequence === refreshSequence.current) setLoading(false)
		}
	}, [])

	useEffect(() => {
		if (readinessReported.current) return
		readinessReported.current = true
		void window.tiempio.app.ready()
	}, [])

	useEffect(() => {
		const timer = window.setTimeout(() => void refreshBoard(), 0)
		return () => window.clearTimeout(timer)
	}, [localDate, refreshBoard])

	const openCreate = (): void => {
		setEditingTask(null)
		setOverlay('editor')
	}

	const openEdit = (task: Task): void => {
		setEditingTask(task)
		setOverlay('editor')
	}

	const changedTask = (task: Task, archiveDelta = 0): void => {
		setSnapshot((current) =>
			current === null
				? current
				: {
						...current,
						tasks:
							task.archivedAt === null
								? [
										...current.tasks.filter(
											(candidate) => candidate.id !== task.id
										),
										task
									]
								: current.tasks.filter((candidate) => candidate.id !== task.id),
						archivedTaskCount: Math.max(0, current.archivedTaskCount + archiveDelta)
					}
		)
	}

	const changeStatus = async (task: Task, status: TaskStatus): Promise<void> => {
		if (task.status === status || operationBusy) return
		setOperationBusy(true)
		setOperationError(null)
		try {
			const updated = await window.tiempio.tasks.changeStatus({
				id: task.id,
				expectedRevision: task.revision,
				status
			})
			changedTask(updated)
			void refreshBoard()
		} catch (error) {
			setOperationError(
				error instanceof IpcRemoteError && error.code === 'STORAGE_BUSY'
					? 'task.validation.storageBusy'
					: 'board.loadError'
			)
			void refreshBoard()
		} finally {
			setOperationBusy(false)
		}
	}

	const saveProject = (project: Project): void => {
		setSnapshot((current) =>
			current === null
				? current
				: {
						...current,
						projects: [
							...current.projects.filter((candidate) => candidate.id !== project.id),
							project
						].sort((left, right) => left.name.localeCompare(right.name))
					}
		)
	}

	const filteredTasks =
		snapshot?.tasks.filter(
			(task) =>
				(projectFilter.length === 0 || task.projectId === projectFilter) &&
				(tagFilter.length === 0 || task.tags.some((tag) => tag.id === tagFilter))
		) ?? []
	const hasActiveFilters = projectFilter.length > 0 || tagFilter.length > 0
	const projectFilterOptions = [
		{ value: '', label: t('filters.projects') },
		...(snapshot?.projects.map((project) => ({
			value: project.id,
			label: project.name
		})) ?? [])
	]
	const tagFilterOptions = [
		{ value: '', label: t('filters.tags') },
		...(snapshot?.tags.map((tag) => ({
			value: tag.id,
			label: tag.name
		})) ?? [])
	]

	return (
		<div className="app-shell">
			<div className="ambient ambient-one" />
			<div className="ambient ambient-two" />
			<div className="glass-chrome">
				<TitleBar
					platform={startup.platform}
					initialMaximized={startup.windowMaximized}
					onOpenAppearance={() => setOverlay('appearance')}
					onOpenLanguage={() => setOverlay('language')}
					onCreateTask={openCreate}
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
					<div className="filter-chip" data-active={projectFilter !== ''}>
						<FolderKanban aria-hidden="true" />
						<CustomSelect
							className="filter-select"
							ariaLabel={t('filters.projectLabel')}
							value={projectFilter}
							options={projectFilterOptions}
							onChange={setProjectFilter}
						/>
					</div>
					<div className="filter-chip" data-active={tagFilter !== ''}>
						<Tag aria-hidden="true" />
						<CustomSelect
							className="filter-select"
							ariaLabel={t('filters.tagLabel')}
							value={tagFilter}
							options={tagFilterOptions}
							onChange={setTagFilter}
						/>
					</div>
					{hasActiveFilters ? (
						<button
							type="button"
							className="filter-chip"
							onClick={() => {
								setProjectFilter('')
								setTagFilter('')
							}}
						>
							<X aria-hidden="true" />
							<span>{t('actions.clearFilters')}</span>
						</button>
					) : null}
					<button
						type="button"
						className="filter-chip"
						onClick={() => setOverlay('archived')}
					>
						<Archive aria-hidden="true" />
						<span>
							{t('actions.archived')}
							{snapshot === null ? '' : ` · ${String(snapshot.archivedTaskCount)}`}
						</span>
					</button>
				</div>

				{operationError === null ? null : (
					<div className="board-state board-error" role="alert">
						<span>{t(operationError)}</span>
						<button type="button" onClick={() => void refreshBoard()}>
							{t('actions.retry')}
						</button>
					</div>
				)}
				{section === 'today' && loading ? (
					<div className="board-state">{t('board.loading')}</div>
				) : null}
				{section === 'today' && !loading && snapshot !== null ? (
					<TodayBoard
						tasks={filteredTasks}
						projects={snapshot.projects}
						localDate={localDate}
						hasActiveFilters={hasActiveFilters}
						onCreate={openCreate}
						onEdit={openEdit}
						onChangeStatus={(task, status) => void changeStatus(task, status)}
					/>
				) : null}
				{placeholder === null ? null : (
					<PlaceholderView
						titleKey={placeholder.titleKey}
						descriptionKey={placeholder.descriptionKey}
					/>
				)}
			</main>

			{overlay === 'appearance' ? (
				<AppearanceDialog onClose={() => setOverlay(null)} />
			) : null}
			{overlay === 'language' ? <LanguageDialog onClose={() => setOverlay(null)} /> : null}
			{overlay === 'editor' && snapshot !== null ? (
				<TaskEditor
					task={editingTask}
					projects={snapshot.projects}
					tags={snapshot.tags}
					localDate={localDate}
					onSaved={(task) => {
						changedTask(task)
						setOverlay(null)
						void refreshBoard()
					}}
					onArchived={(task) => {
						changedTask(task, 1)
						setOverlay(null)
						void refreshBoard()
					}}
					onProjectSaved={saveProject}
					onClose={() => setOverlay(null)}
				/>
			) : null}
			{overlay === 'archived' && snapshot !== null ? (
				<ArchivedTasksDialog
					totalCount={snapshot.archivedTaskCount}
					onRestored={(task) => {
						changedTask(task, -1)
						void refreshBoard()
					}}
					onClose={() => setOverlay(null)}
				/>
			) : null}
		</div>
	)
}
