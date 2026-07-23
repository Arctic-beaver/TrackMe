import { useMemo, useState } from 'react'
import { CheckCircle2, CircleDot, Inbox, Play, Plus } from 'lucide-react'
import type { Project, Task, TaskStatus } from '../../../shared/contracts'
import type { LocalizationKey } from '../../../shared/localization'
import { compareTasksForToday } from '../../../shared/taskDomain'
import { useLocalization } from '../localization/useLocalization'
import { TaskCard } from './TaskCard'

const columns: ReadonlyArray<{
	readonly id: TaskStatus
	readonly compactId: 'todo' | 'planned' | 'inProgress' | 'done'
	readonly titleKey: LocalizationKey
	readonly noteKey: LocalizationKey
	readonly icon: typeof Inbox
}> = [
	{
		id: 'todo',
		compactId: 'todo',
		titleKey: 'task.status.todo',
		noteKey: 'column.todo.note',
		icon: Inbox
	},
	{
		id: 'planned',
		compactId: 'planned',
		titleKey: 'task.status.planned',
		noteKey: 'column.planned.note',
		icon: CircleDot
	},
	{
		id: 'in_progress',
		compactId: 'inProgress',
		titleKey: 'task.status.inProgress',
		noteKey: 'column.inProgress.note',
		icon: Play
	},
	{
		id: 'done',
		compactId: 'done',
		titleKey: 'task.status.done',
		noteKey: 'column.done.note',
		icon: CheckCircle2
	}
]

function isRecentCompletion(task: Task): boolean {
	if (task.completedAt === null) return true
	const age = Date.now() - new Date(task.completedAt).getTime()
	return age <= 7 * 24 * 60 * 60 * 1_000
}

export function TodayBoard({
	tasks,
	projects,
	localDate,
	hasActiveFilters,
	onCreate,
	onEdit,
	onChangeStatus
}: {
	readonly tasks: readonly Task[]
	readonly projects: readonly Project[]
	readonly localDate: string
	readonly hasActiveFilters: boolean
	readonly onCreate: () => void
	readonly onEdit: (task: Task) => void
	readonly onChangeStatus: (task: Task, status: TaskStatus) => void
}): React.JSX.Element {
	const { locale, t } = useLocalization()
	const [compactStatus, setCompactStatus] = useState(columns[0].compactId)
	const [showOlderCompleted, setShowOlderCompleted] = useState(false)
	const [draggingTask, setDraggingTask] = useState<Task | null>(null)
	const byStatus = useMemo(() => {
		const result = new Map<TaskStatus, readonly Task[]>()
		for (const column of columns) {
			result.set(
				column.id,
				tasks
					.filter((task) => task.status === column.id)
					.sort((left, right) => compareTasksForToday(left, right, localDate))
			)
		}
		return result
	}, [localDate, tasks])
	const hiddenCompleted =
		byStatus.get('done')?.filter((task) => !isRecentCompletion(task)).length ?? 0

	return (
		<>
			{hasActiveFilters && tasks.length === 0 ? (
				<div className="board-state">{t('board.filteredEmpty')}</div>
			) : null}
			<div className="compact-status-switcher" role="tablist" aria-label={t('board.label')}>
				{columns.map((column) => (
					<button
						type="button"
						role="tab"
						key={column.id}
						aria-selected={compactStatus === column.compactId}
						onClick={() => setCompactStatus(column.compactId)}
					>
						{t(column.titleKey)}
					</button>
				))}
			</div>

			<div className="board" aria-label={t('board.label')}>
				{columns.map((column) => {
					const Icon = column.icon
					const allColumnTasks = byStatus.get(column.id) ?? []
					const columnTasks =
						column.id === 'done' && !showOlderCompleted
							? allColumnTasks.filter(isRecentCompletion)
							: allColumnTasks
					return (
						<section
							className="task-column"
							data-compact-active={compactStatus === column.compactId}
							data-drag-over={
								draggingTask !== null && draggingTask.status !== column.id
							}
							key={column.id}
							onDragOver={(event) => {
								if (draggingTask !== null && draggingTask.status !== column.id) {
									event.preventDefault()
									event.dataTransfer.dropEffect = 'move'
								}
							}}
							onDrop={(event) => {
								event.preventDefault()
								if (draggingTask !== null && draggingTask.status !== column.id) {
									onChangeStatus(draggingTask, column.id)
								}
								setDraggingTask(null)
							}}
							onDragEnd={() => setDraggingTask(null)}
						>
							<header className="column-header">
								<div>
									<span className="column-title">
										<Icon aria-hidden="true" />
										<strong>{t(column.titleKey)}</strong>
									</span>
									<small>{t(column.noteKey)}</small>
								</div>
								<span className="column-count">{allColumnTasks.length}</span>
							</header>
							<div className="task-list">
								{columnTasks.map((task) => (
									<TaskCard
										key={task.id}
										task={task}
										project={
											projects.find(
												(project) => project.id === task.projectId
											) ?? null
										}
										localDate={localDate}
										locale={locale}
										t={t}
										onEdit={onEdit}
										onChangeStatus={onChangeStatus}
										onDragStart={setDraggingTask}
									/>
								))}
								{columnTasks.length === 0 ? (
									<button
										type="button"
										className="empty-card"
										onClick={column.id === 'todo' ? onCreate : undefined}
										disabled={column.id !== 'todo'}
									>
										<span>
											{draggingTask !== null &&
											draggingTask.status !== column.id
												? t('board.dropHint')
												: t('column.empty')}
										</span>
									</button>
								) : null}
							</div>
							{column.id === 'todo' ? (
								<button
									type="button"
									className="new-task-button"
									onClick={onCreate}
								>
									<Plus aria-hidden="true" />
									<span>{t('task.new')}</span>
								</button>
							) : null}
							{column.id === 'done' && hiddenCompleted > 0 ? (
								<button
									type="button"
									className="show-completed-button"
									onClick={() => setShowOlderCompleted((value) => !value)}
								>
									{showOlderCompleted
										? t('actions.showRecent')
										: `${t('actions.showAll')} · ${t('board.hiddenCompleted', {
												count: hiddenCompleted
											})}`}
								</button>
							) : null}
						</section>
					)
				})}
			</div>
		</>
	)
}
