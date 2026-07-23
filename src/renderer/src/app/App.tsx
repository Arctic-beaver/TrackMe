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
import { todayLocalDate } from '../../../shared/taskDomain'
import { useLocalization } from '../localization/useLocalization'
import { ArchivedTasksDialog } from './ArchivedTasksDialog'
import { AppearanceDialog } from './AppearanceDialog'
import { TaskEditor } from './TaskEditor'
import { TitleBar } from './TitleBar'
import { TodayBoard } from './TodayBoard'

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
	const [appearanceOpen, setAppearanceOpen] = useState(false)
	const [editorOpen, setEditorOpen] = useState(false)
	const [editingTask, setEditingTask] = useState<Task | null>(null)
	const [archivedOpen, setArchivedOpen] = useState(false)
	const [snapshot, setSnapshot] = useState<TaskBoardSnapshot | null>(null)
	const [loading, setLoading] = useState(true)
	const [operationError, setOperationError] = useState<
		'task.validation.storageBusy' | 'board.loadError' | null
	>(null)
	const [operationBusy, setOperationBusy] = useState(false)
	const [projectFilter, setProjectFilter] = useState('')
	const [tagFilter, setTagFilter] = useState('')
	const [localDate] = useState(() => todayLocalDate())
	const readinessReported = useRef(false)
	const placeholder = activeView(section)
	const refreshBoard = useCallback(async () => {
		try {
			const next = await window.trackme.tasks.getBoard(localDate)
			setSnapshot(next)
			setOperationError(null)
		} catch (error) {
			setOperationError(
				error instanceof IpcRemoteError && error.code === 'STORAGE_BUSY'
					? 'task.validation.storageBusy'
					: 'board.loadError'
			)
		} finally {
			setLoading(false)
		}
	}, [localDate])

	useEffect(() => {
		if (readinessReported.current) return
		readinessReported.current = true
		void window.trackme.app.ready()
	}, [])

	useEffect(() => {
		let disposed = false
		void window.trackme.tasks
			.getBoard(localDate)
			.then((next) => {
				if (!disposed) {
					setSnapshot(next)
					setOperationError(null)
				}
			})
			.catch((error: unknown) => {
				if (!disposed) {
					setOperationError(
						error instanceof IpcRemoteError && error.code === 'STORAGE_BUSY'
							? 'task.validation.storageBusy'
							: 'board.loadError'
					)
				}
			})
			.finally(() => {
				if (!disposed) setLoading(false)
			})
		return () => {
			disposed = true
		}
	}, [localDate])

	const openCreate = (): void => {
		setEditingTask(null)
		setEditorOpen(true)
	}

	const openEdit = (task: Task): void => {
		setEditingTask(task)
		setEditorOpen(true)
	}

	const changedTask = (task: Task): void => {
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
						archivedTasks:
							task.archivedAt === null
								? current.archivedTasks.filter(
										(candidate) => candidate.id !== task.id
									)
								: [
										...current.archivedTasks.filter(
											(candidate) => candidate.id !== task.id
										),
										task
									]
					}
		)
	}

	const changeStatus = async (task: Task, status: TaskStatus): Promise<void> => {
		if (task.status === status || operationBusy) return
		setOperationBusy(true)
		setOperationError(null)
		try {
			const updated = await window.trackme.tasks.changeStatus({
				id: task.id,
				expectedRevision: task.revision,
				status,
				localDate
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

	return (
		<div className="app-shell">
			<div className="ambient ambient-one" />
			<div className="ambient ambient-two" />
			<div className="glass-chrome">
				<TitleBar
					platform={startup.platform}
					initialMaximized={startup.windowMaximized}
					onOpenAppearance={() => setAppearanceOpen(true)}
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
					<label className="filter-chip">
						<FolderKanban aria-hidden="true" />
						<span className="visually-hidden">{t('filters.projectLabel')}</span>
						<select
							value={projectFilter}
							onChange={(event) => setProjectFilter(event.target.value)}
						>
							<option value="">{t('filters.projects')}</option>
							{snapshot?.projects.map((project) => (
								<option key={project.id} value={project.id}>
									{project.name}
								</option>
							))}
						</select>
					</label>
					<label className="filter-chip">
						<Tag aria-hidden="true" />
						<span className="visually-hidden">{t('filters.tagLabel')}</span>
						<select
							value={tagFilter}
							onChange={(event) => setTagFilter(event.target.value)}
						>
							<option value="">{t('filters.tags')}</option>
							{snapshot?.tags.map((tag) => (
								<option key={tag.id} value={tag.id}>
									{tag.name}
								</option>
							))}
						</select>
					</label>
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
						onClick={() => setArchivedOpen(true)}
					>
						<Archive aria-hidden="true" />
						<span>
							{t('actions.archived')}
							{snapshot === null ? '' : ` · ${String(snapshot.archivedTasks.length)}`}
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

			{appearanceOpen ? <AppearanceDialog onClose={() => setAppearanceOpen(false)} /> : null}
			{editorOpen && snapshot !== null ? (
				<TaskEditor
					task={editingTask}
					projects={snapshot.projects}
					tags={snapshot.tags}
					localDate={localDate}
					onSaved={(task) => {
						changedTask(task)
						setEditorOpen(false)
						void refreshBoard()
					}}
					onArchived={(task) => {
						changedTask(task)
						setEditorOpen(false)
						void refreshBoard()
					}}
					onProjectSaved={saveProject}
					onClose={() => setEditorOpen(false)}
				/>
			) : null}
			{archivedOpen && snapshot !== null ? (
				<ArchivedTasksDialog
					tasks={snapshot.archivedTasks}
					busy={operationBusy}
					onRestore={(task) => {
						setOperationBusy(true)
						void window.trackme.tasks
							.restore({
								id: task.id,
								expectedRevision: task.revision,
								localDate
							})
							.then((restored) => {
								changedTask(restored)
								return refreshBoard()
							})
							.catch(() => setOperationError('board.loadError'))
							.finally(() => setOperationBusy(false))
					}}
					onClose={() => setArchivedOpen(false)}
				/>
			) : null}
		</div>
	)
}
