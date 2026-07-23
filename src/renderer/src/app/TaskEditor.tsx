import { useId, useState } from 'react'
import { Archive, FolderPlus, RefreshCw, Save, X } from 'lucide-react'
import type {
	Project,
	Tag,
	Task,
	TaskDraft,
	TaskStartMode,
	TaskStatus
} from '../../../shared/contracts'
import { IpcRemoteError } from '../../../shared/ipcProtocol'
import { formatLocalDate } from '../../../shared/localization'
import { calculatePreferredStart } from '../../../shared/taskDomain'
import { useLocalization } from '../localization/useLocalization'

interface EditorDraft {
	readonly title: string
	readonly description: string
	readonly status: TaskStatus
	readonly estimateDays: number
	readonly dueDate: string
	readonly startMode: TaskStartMode
	readonly preferredStartDate: string
	readonly projectId: string
	readonly tagNames: string
}

function draftFromTask(task: Task | null, localDate: string): EditorDraft {
	if (task === null) {
		return {
			title: '',
			description: '',
			status: 'todo',
			estimateDays: 1,
			dueDate: localDate,
			startMode: 'auto',
			preferredStartDate: localDate,
			projectId: '',
			tagNames: ''
		}
	}
	return {
		title: task.title,
		description: task.description,
		status: task.status,
		estimateDays: task.estimateDays,
		dueDate: task.dueDate,
		startMode: task.startMode,
		preferredStartDate: task.preferredStartDate,
		projectId: task.projectId ?? '',
		tagNames: task.tags.map((tag) => tag.name).join(', ')
	}
}

function taskErrorKey(
	error: unknown
): 'task.validation.conflict' | 'task.validation.storageBusy' | 'task.validation.generic' {
	if (error instanceof IpcRemoteError && error.code === 'REVISION_CONFLICT') {
		return 'task.validation.conflict'
	}
	if (error instanceof IpcRemoteError && error.code === 'STORAGE_BUSY') {
		return 'task.validation.storageBusy'
	}
	return 'task.validation.generic'
}

export function TaskEditor({
	task,
	projects,
	tags,
	localDate,
	onSaved,
	onArchived,
	onProjectSaved,
	onClose
}: {
	readonly task: Task | null
	readonly projects: readonly Project[]
	readonly tags: readonly Tag[]
	readonly localDate: string
	readonly onSaved: (task: Task) => void
	readonly onArchived: (task: Task) => void
	readonly onProjectSaved: (project: Project) => void
	readonly onClose: () => void
}): React.JSX.Element {
	const { locale, t } = useLocalization()
	const tagSuggestionsId = useId()
	const [sourceTask, setSourceTask] = useState(task)
	const initialDraft = draftFromTask(task, localDate)
	const [draft, setDraft] = useState(initialDraft)
	const [baseline, setBaseline] = useState(JSON.stringify(initialDraft))
	const [errorKey, setErrorKey] = useState<
		| 'task.validation.title'
		| 'task.validation.dueDate'
		| 'task.validation.manualStart'
		| 'task.validation.conflict'
		| 'task.validation.storageBusy'
		| 'task.validation.generic'
		| null
	>(null)
	const [busy, setBusy] = useState(false)
	const [projectMode, setProjectMode] = useState<'create' | 'edit' | null>(null)
	const [projectName, setProjectName] = useState('')
	const [projectDescription, setProjectDescription] = useState('')
	const [projectError, setProjectError] = useState(false)
	const selectedProject = projects.find((project) => project.id === draft.projectId) ?? null
	const automaticStart = (() => {
		try {
			return calculatePreferredStart(draft.dueDate, Math.max(1, draft.estimateDays))
		} catch {
			return draft.dueDate
		}
	})()
	const dirty = JSON.stringify(draft) !== baseline

	const close = (): void => {
		if (!dirty || window.confirm(t('task.editor.discardConfirm'))) onClose()
	}

	const submit = async (): Promise<void> => {
		if (draft.title.trim().length === 0) {
			setErrorKey('task.validation.title')
			return
		}
		if (draft.dueDate.length === 0) {
			setErrorKey('task.validation.dueDate')
			return
		}
		if (
			draft.startMode === 'manual' &&
			(draft.preferredStartDate.length === 0 || draft.preferredStartDate > draft.dueDate)
		) {
			setErrorKey('task.validation.manualStart')
			return
		}
		const taskDraft: TaskDraft = {
			title: draft.title,
			description: draft.description,
			status: draft.status,
			estimateDays: draft.estimateDays,
			dueDate: draft.dueDate,
			startMode: draft.startMode,
			preferredStartDate: draft.startMode === 'manual' ? draft.preferredStartDate : null,
			projectId: draft.projectId.length === 0 ? null : draft.projectId,
			tagNames: draft.tagNames.split(','),
			localDate
		}
		setBusy(true)
		setErrorKey(null)
		try {
			const saved =
				sourceTask === null
					? await window.trackme.tasks.create(taskDraft)
					: await window.trackme.tasks.update({
							...taskDraft,
							id: sourceTask.id,
							expectedRevision: sourceTask.revision
						})
			onSaved(saved)
		} catch (error) {
			setErrorKey(taskErrorKey(error))
		} finally {
			setBusy(false)
		}
	}

	const reloadLatest = async (): Promise<void> => {
		if (sourceTask === null) return
		setBusy(true)
		try {
			const latest = await window.trackme.tasks.get(sourceTask.id)
			const latestDraft = draftFromTask(latest, localDate)
			setSourceTask(latest)
			setDraft(latestDraft)
			setBaseline(JSON.stringify(latestDraft))
			setErrorKey(null)
		} catch {
			setErrorKey('task.validation.generic')
		} finally {
			setBusy(false)
		}
	}

	const archiveTask = async (): Promise<void> => {
		if (sourceTask === null) return
		setBusy(true)
		try {
			const archived = await window.trackme.tasks.archive({
				id: sourceTask.id,
				expectedRevision: sourceTask.revision,
				localDate
			})
			onArchived(archived)
		} catch (error) {
			setErrorKey(taskErrorKey(error))
		} finally {
			setBusy(false)
		}
	}

	const beginProject = (mode: 'create' | 'edit'): void => {
		setProjectMode(mode)
		setProjectError(false)
		setProjectName(mode === 'edit' ? (selectedProject?.name ?? '') : '')
		setProjectDescription(mode === 'edit' ? (selectedProject?.description ?? '') : '')
	}

	const saveProject = async (): Promise<void> => {
		if (projectName.trim().length === 0) {
			setProjectError(true)
			return
		}
		setBusy(true)
		setProjectError(false)
		try {
			const saved =
				projectMode === 'edit' && selectedProject !== null
					? await window.trackme.projects.update({
							id: selectedProject.id,
							expectedRevision: selectedProject.revision,
							name: projectName,
							description: projectDescription
						})
					: await window.trackme.projects.create({
							name: projectName,
							description: projectDescription
						})
			onProjectSaved(saved)
			setDraft((current) => ({ ...current, projectId: saved.id }))
			setProjectMode(null)
		} catch {
			setProjectError(true)
		} finally {
			setBusy(false)
		}
	}

	return (
		<dialog open className="task-dialog" onCancel={close}>
			<div className="dialog-panel">
				<header className="dialog-header">
					<div>
						<h2>
							{sourceTask === null
								? t('task.editor.createTitle')
								: t('task.editor.editTitle')}
						</h2>
						<p>{t('task.editor.description')}</p>
					</div>
					<button
						type="button"
						className="icon-button"
						onClick={close}
						aria-label={t('actions.close')}
					>
						<X aria-hidden="true" />
					</button>
				</header>

				<form
					className="task-form"
					onSubmit={(event) => {
						event.preventDefault()
						void submit()
					}}
				>
					<label className="field field-wide">
						<span>{t('task.field.title')}</span>
						<input
							autoFocus
							value={draft.title}
							placeholder={t('task.placeholder.title')}
							onChange={(event) =>
								setDraft((current) => ({ ...current, title: event.target.value }))
							}
						/>
					</label>
					<label className="field field-wide">
						<span>{t('task.field.description')}</span>
						<textarea
							rows={3}
							value={draft.description}
							placeholder={t('task.placeholder.description')}
							onChange={(event) =>
								setDraft((current) => ({
									...current,
									description: event.target.value
								}))
							}
						/>
					</label>
					<label className="field">
						<span>{t('task.field.status')}</span>
						<select
							value={draft.status}
							onChange={(event) =>
								setDraft((current) => ({
									...current,
									status: event.target.value as TaskStatus
								}))
							}
						>
							<option value="todo">{t('task.status.todo')}</option>
							<option value="planned">{t('task.status.planned')}</option>
							<option value="in_progress">{t('task.status.inProgress')}</option>
							<option value="done">{t('task.status.done')}</option>
						</select>
					</label>
					<label className="field">
						<span>{t('task.field.estimate')}</span>
						<input
							type="number"
							min={1}
							value={draft.estimateDays}
							onChange={(event) =>
								setDraft((current) => ({
									...current,
									estimateDays: Math.max(1, Number(event.target.value))
								}))
							}
						/>
					</label>
					<label className="field">
						<span>{t('task.field.dueDate')}</span>
						<input
							type="date"
							value={draft.dueDate}
							onChange={(event) =>
								setDraft((current) => ({ ...current, dueDate: event.target.value }))
							}
						/>
					</label>
					<div className="field">
						<span>{t('task.field.startMode')}</span>
						<div className="segmented-control">
							{(['auto', 'manual'] as const).map((mode) => (
								<button
									type="button"
									key={mode}
									aria-pressed={draft.startMode === mode}
									onClick={() =>
										setDraft((current) => ({
											...current,
											startMode: mode,
											preferredStartDate:
												mode === 'manual'
													? current.preferredStartDate || automaticStart
													: automaticStart
										}))
									}
								>
									{t(`task.startMode.${mode}`)}
								</button>
							))}
						</div>
					</div>
					{draft.startMode === 'manual' ? (
						<label className="field">
							<span>{t('task.field.preferredStart')}</span>
							<input
								type="date"
								max={draft.dueDate}
								value={draft.preferredStartDate}
								onChange={(event) =>
									setDraft((current) => ({
										...current,
										preferredStartDate: event.target.value
									}))
								}
							/>
						</label>
					) : (
						<div className="field field-readonly">
							<span>{t('task.field.preferredStart')}</span>
							<strong>
								{t('task.autoStartHelp', {
									date: formatLocalDate(locale, automaticStart)
								})}
							</strong>
						</div>
					)}
					<div className="field project-field">
						<span>{t('task.field.project')}</span>
						<div className="field-actions">
							<select
								aria-label={t('task.field.project')}
								value={draft.projectId}
								onChange={(event) =>
									setDraft((current) => ({
										...current,
										projectId: event.target.value
									}))
								}
							>
								<option value="">{t('task.project.none')}</option>
								{projects.map((project) => (
									<option key={project.id} value={project.id}>
										{project.name}
									</option>
								))}
							</select>
							<button type="button" onClick={() => beginProject('create')}>
								<FolderPlus aria-hidden="true" />
								{t('actions.newProject')}
							</button>
							<button
								type="button"
								disabled={selectedProject === null}
								onClick={() => beginProject('edit')}
							>
								{t('actions.editProject')}
							</button>
						</div>
					</div>
					{projectMode === null ? null : (
						<section className="inline-project-editor field-wide">
							<h3>
								{projectMode === 'create'
									? t('project.editor.createTitle')
									: t('project.editor.editTitle')}
							</h3>
							<label className="field">
								<span>{t('project.field.name')}</span>
								<input
									value={projectName}
									onChange={(event) => setProjectName(event.target.value)}
								/>
							</label>
							<label className="field">
								<span>{t('project.field.description')}</span>
								<textarea
									rows={2}
									value={projectDescription}
									onChange={(event) => setProjectDescription(event.target.value)}
								/>
							</label>
							{projectError ? (
								<p className="form-error" role="alert">
									{projectName.trim().length === 0
										? t('project.validation.name')
										: t('project.validation.generic')}
								</p>
							) : null}
							<div className="inline-actions">
								<button type="button" onClick={() => setProjectMode(null)}>
									{t('actions.cancel')}
								</button>
								<button
									type="button"
									disabled={busy}
									onClick={() => void saveProject()}
								>
									{t('actions.saveProject')}
								</button>
							</div>
						</section>
					)}
					<label className="field field-wide">
						<span>{t('task.field.tags')}</span>
						<input
							list={tagSuggestionsId}
							value={draft.tagNames}
							placeholder={t('task.placeholder.tags')}
							onChange={(event) =>
								setDraft((current) => ({
									...current,
									tagNames: event.target.value
								}))
							}
						/>
						<small>{t('task.tagsHelp')}</small>
						<datalist id={tagSuggestionsId}>
							{tags.map((tag) => (
								<option key={tag.id} value={tag.name} />
							))}
						</datalist>
					</label>
					{errorKey === null ? null : (
						<div className="form-error field-wide" role="alert">
							<span>{t(errorKey)}</span>
							{errorKey === 'task.validation.conflict' ? (
								<button
									type="button"
									disabled={busy}
									onClick={() => void reloadLatest()}
								>
									<RefreshCw aria-hidden="true" />
									{t('actions.retry')}
								</button>
							) : null}
						</div>
					)}
					<footer className="dialog-actions field-wide">
						{sourceTask === null ? (
							<span />
						) : (
							<button
								type="button"
								className="danger-button"
								disabled={busy}
								onClick={() => void archiveTask()}
							>
								<Archive aria-hidden="true" />
								{t('actions.archive')}
							</button>
						)}
						<div>
							<button type="button" onClick={close}>
								{t('actions.cancel')}
							</button>
							<button type="submit" className="primary-button" disabled={busy}>
								<Save aria-hidden="true" />
								{t('actions.save')}
							</button>
						</div>
					</footer>
				</form>
			</div>
		</dialog>
	)
}
