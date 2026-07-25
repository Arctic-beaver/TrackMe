import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Check, ChevronDown } from 'lucide-react'

export interface CustomSelectOption<Value extends string> {
	readonly value: Value
	readonly label: string
}

interface MenuPosition {
	readonly left: number
	readonly top: number
	readonly width: number
	readonly maxHeight: number
	readonly placement: 'above' | 'below'
}

const viewportPadding = 8
const menuGap = 6
const preferredMenuHeight = 240

export function CustomSelect<Value extends string>({
	value,
	options,
	ariaLabel,
	onChange,
	className = '',
	disabled = false
}: {
	readonly value: Value
	readonly options: readonly CustomSelectOption<Value>[]
	readonly ariaLabel: string
	readonly onChange: (value: Value) => void
	readonly className?: string
	readonly disabled?: boolean
}): React.JSX.Element {
	const listboxId = useId()
	const root = useRef<HTMLDivElement>(null)
	const trigger = useRef<HTMLButtonElement>(null)
	const menu = useRef<HTMLUListElement>(null)
	const search = useRef('')
	const searchTimer = useRef<number | null>(null)
	const positionFrame = useRef<number | null>(null)
	const selectedIndex = options.findIndex((option) => option.value === value)
	const selectedOption = options[selectedIndex] ?? options[0]
	const [open, setOpen] = useState(false)
	const [activeIndex, setActiveIndex] = useState(Math.max(0, selectedIndex))
	const safeActiveIndex = Math.min(Math.max(0, activeIndex), Math.max(0, options.length - 1))
	const [position, setPosition] = useState<MenuPosition>({
		left: viewportPadding,
		top: viewportPadding,
		width: 160,
		maxHeight: preferredMenuHeight,
		placement: 'below'
	})

	const optionId = useCallback(
		(index: number): string => `${listboxId}-option-${String(index)}`,
		[listboxId]
	)

	const updatePosition = useCallback((): void => {
		const anchor = trigger.current
		if (anchor === null) return
		const bounds = anchor.getBoundingClientRect()
		const availableBelow = Math.max(
			0,
			window.innerHeight - bounds.bottom - menuGap - viewportPadding
		)
		const availableAbove = Math.max(0, bounds.top - menuGap - viewportPadding)
		const placement =
			availableBelow < 160 && availableAbove > availableBelow ? 'above' : 'below'
		const availableHeight = placement === 'above' ? availableAbove : availableBelow
		const width = Math.min(
			Math.max(bounds.width, 160),
			Math.max(160, window.innerWidth - viewportPadding * 2)
		)
		const left = Math.min(
			Math.max(viewportPadding, bounds.left),
			Math.max(viewportPadding, window.innerWidth - width - viewportPadding)
		)
		const nextPosition = {
			left,
			top: placement === 'above' ? bounds.top - menuGap : bounds.bottom + menuGap,
			width,
			maxHeight: Math.max(96, Math.min(preferredMenuHeight, availableHeight)),
			placement
		} as const
		setPosition((current) =>
			current.left === nextPosition.left &&
			current.top === nextPosition.top &&
			current.width === nextPosition.width &&
			current.maxHeight === nextPosition.maxHeight &&
			current.placement === nextPosition.placement
				? current
				: nextPosition
		)
	}, [])

	const schedulePositionUpdate = useCallback((): void => {
		if (positionFrame.current !== null) return
		positionFrame.current = window.requestAnimationFrame(() => {
			positionFrame.current = null
			updatePosition()
		})
	}, [updatePosition])

	const closeMenu = useCallback((): void => {
		setOpen(false)
		search.current = ''
		if (searchTimer.current !== null) {
			window.clearTimeout(searchTimer.current)
			searchTimer.current = null
		}
	}, [])

	const openMenu = useCallback(
		(index = selectedIndex): void => {
			if (disabled || options.length === 0) return
			setActiveIndex(Math.max(0, index))
			setOpen(true)
		},
		[disabled, options.length, selectedIndex]
	)

	const choose = useCallback(
		(index: number): void => {
			const option = options[index]
			if (option === undefined) return
			onChange(option.value)
			closeMenu()
			trigger.current?.focus()
		},
		[closeMenu, onChange, options]
	)

	const moveActive = useCallback(
		(delta: number): void => {
			if (options.length === 0) return
			setActiveIndex((current) => (current + delta + options.length) % options.length)
		},
		[options.length]
	)

	const typeAhead = useCallback(
		(key: string): void => {
			search.current += key.toLocaleLowerCase()
			if (searchTimer.current !== null) window.clearTimeout(searchTimer.current)
			searchTimer.current = window.setTimeout(() => {
				search.current = ''
				searchTimer.current = null
			}, 650)
			const start = open ? safeActiveIndex + 1 : Math.max(0, selectedIndex + 1)
			for (let offset = 0; offset < options.length; offset += 1) {
				const index = (start + offset) % options.length
				if (options[index]?.label.toLocaleLowerCase().startsWith(search.current)) {
					setActiveIndex(index)
					setOpen(true)
					return
				}
			}
		},
		[open, options, safeActiveIndex, selectedIndex]
	)

	const onTriggerKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>): void => {
		if (event.key === 'ArrowDown') {
			event.preventDefault()
			if (open) moveActive(1)
			else openMenu(selectedIndex >= 0 ? selectedIndex : 0)
			return
		}
		if (event.key === 'ArrowUp') {
			event.preventDefault()
			if (open) moveActive(-1)
			else openMenu(selectedIndex >= 0 ? selectedIndex : options.length - 1)
			return
		}
		if (event.key === 'Home' && open) {
			event.preventDefault()
			setActiveIndex(0)
			return
		}
		if (event.key === 'End' && open) {
			event.preventDefault()
			setActiveIndex(Math.max(0, options.length - 1))
			return
		}
		if (event.key === 'Enter' || event.key === ' ') {
			event.preventDefault()
			if (open) choose(safeActiveIndex)
			else openMenu()
			return
		}
		if (event.key === 'Escape' && open) {
			event.preventDefault()
			closeMenu()
			return
		}
		if (event.key === 'Tab' && open) {
			closeMenu()
			return
		}
		if (event.key.length === 1 && !event.altKey && !event.ctrlKey && !event.metaKey) {
			event.preventDefault()
			typeAhead(event.key)
		}
	}

	useLayoutEffect(() => {
		if (!open) return
		updatePosition()
		const activeMenu = menu.current
		activeMenu?.showPopover()
		const onViewportChange = (): void => schedulePositionUpdate()
		window.addEventListener('resize', onViewportChange)
		window.addEventListener('scroll', onViewportChange, true)
		return () => {
			window.removeEventListener('resize', onViewportChange)
			window.removeEventListener('scroll', onViewportChange, true)
			if (positionFrame.current !== null) {
				window.cancelAnimationFrame(positionFrame.current)
				positionFrame.current = null
			}
			if (activeMenu?.matches(':popover-open')) activeMenu.hidePopover()
		}
	}, [open, schedulePositionUpdate, updatePosition])

	useEffect(() => {
		if (!open) return
		const activeOption = document.getElementById(optionId(safeActiveIndex))
		activeOption?.scrollIntoView({ block: 'nearest' })
	}, [open, optionId, safeActiveIndex])

	useEffect(() => {
		if (!open) return
		const onPointerDown = (event: PointerEvent): void => {
			const target = event.target
			if (!(target instanceof Node)) return
			if (root.current?.contains(target) || menu.current?.contains(target)) return
			closeMenu()
		}
		document.addEventListener('pointerdown', onPointerDown)
		return () => document.removeEventListener('pointerdown', onPointerDown)
	}, [closeMenu, open])

	useEffect(
		() => () => {
			if (searchTimer.current !== null) window.clearTimeout(searchTimer.current)
		},
		[]
	)

	return (
		<div
			ref={root}
			className={`custom-select ${className}`.trim()}
			data-state={open ? 'open' : 'closed'}
			onBlur={(event) => {
				const nextTarget = event.relatedTarget
				if (nextTarget instanceof Node && event.currentTarget.contains(nextTarget)) return
				closeMenu()
			}}
		>
			<button
				ref={trigger}
				type="button"
				className="custom-select-trigger"
				role="combobox"
				disabled={disabled}
				aria-label={ariaLabel}
				aria-haspopup="listbox"
				aria-expanded={open}
				aria-controls={open ? listboxId : undefined}
				aria-activedescendant={open ? optionId(safeActiveIndex) : undefined}
				onClick={() => {
					if (open) closeMenu()
					else openMenu()
				}}
				onKeyDown={onTriggerKeyDown}
			>
				<span className="custom-select-value">{selectedOption?.label ?? ''}</span>
				<ChevronDown className="custom-select-chevron" aria-hidden="true" />
			</button>
			{open
				? createPortal(
						<ul
							ref={menu}
							id={listboxId}
							className="custom-select-menu"
							popover="manual"
							role="listbox"
							aria-label={ariaLabel}
							data-placement={position.placement}
							style={{
								left: position.left,
								top: position.top,
								width: position.width,
								maxHeight: position.maxHeight
							}}
						>
							{options.map((option, index) => (
								<li
									id={optionId(index)}
									key={option.value}
									className="custom-select-option"
									role="option"
									aria-selected={option.value === value}
									data-active={safeActiveIndex === index}
									onPointerMove={() => setActiveIndex(index)}
									onPointerDown={(event) => {
										event.preventDefault()
										choose(index)
									}}
								>
									<span>{option.label}</span>
									{option.value === value ? <Check aria-hidden="true" /> : null}
								</li>
							))}
						</ul>,
						document.body
					)
				: null}
		</div>
	)
}
