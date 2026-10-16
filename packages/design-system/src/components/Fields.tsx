import { forwardRef, type ReactNode } from 'react'
import {
  Button as AriaButton,
  Checkbox as AriaCheckbox,
  CheckboxGroup as AriaCheckboxGroup,
  ComboBox as AriaComboBox,
  FieldError,
  Input,
  Label,
  ListBox,
  ListBoxItem,
  SearchField as AriaSearchField,
  Select as AriaSelect,
  SelectValue,
  Text,
  TextArea,
  TextField as AriaTextField,
  type CheckboxGroupProps,
  type CheckboxProps,
  type ComboBoxProps,
  type Key,
  type ListBoxItemProps,
  type SearchFieldProps,
  type TextFieldProps as AriaTextFieldProps,
} from 'react-aria-components'
import { cx } from './cx'
import { Icon } from '../icons/AppIcon'
import type { IconName } from '../icons/names'
import { Popover } from './Overlays'

/*
 * Form fields. Labels are always visible (or given as aria-label for compact
 * toolbar use), descriptions and errors are linked to the input, and inputs use
 * 16 px text on touch screens so phones don't zoom on focus.
 */

const label = 'text-ui-xs font-medium text-fg-2'
const description = 'text-ui-xs text-fg-3'
const error = 'text-ui-xs text-error'
const fieldBox =
  'w-full min-h-touch rounded-field border border-line-strong bg-surface px-2.5 text-ui-sm text-fg outline-none placeholder:text-fg-3 ' +
  'transition-[border-color,box-shadow] duration-[var(--ws-motion-short)] ease-standard ' +
  'data-[hovered]:border-fg-2 data-[focused]:border-accent data-[focused]:shadow-[inset_0_0_0_1px_var(--ws-accent)] ' +
  'data-[invalid]:border-error data-[disabled]:opacity-50 pointer-coarse:text-[16px]'

export interface TextFieldProps extends Omit<AriaTextFieldProps, 'className' | 'children'> {
  label?: ReactNode
  description?: ReactNode
  errorMessage?: string
  multiline?: boolean
  rows?: number
  placeholder?: string
  className?: string
  inputClassName?: string
  /** Visible unit after the input, e.g. "kN". */
  unit?: string
  autoFocus?: boolean
  onKeyDown?: React.KeyboardEventHandler<HTMLInputElement | HTMLTextAreaElement>
}

export const TextField = forwardRef<HTMLInputElement & HTMLTextAreaElement, TextFieldProps>(function TextField(
  { label: text, description: help, errorMessage, multiline, rows = 3, placeholder, className, inputClassName, unit, onKeyDown, ...props },
  ref,
) {
  return (
    <AriaTextField {...props} isInvalid={props.isInvalid ?? !!errorMessage} className={cx('flex min-w-0 flex-col gap-1', className)}>
      {text && <Label className={label}>{text}</Label>}
      <div className="flex items-center gap-2">
        {multiline ? (
          <TextArea ref={ref} rows={rows} placeholder={placeholder} onKeyDown={onKeyDown} className={cx(fieldBox, 'resize-y py-2', inputClassName)} />
        ) : (
          <Input ref={ref} placeholder={placeholder} onKeyDown={onKeyDown} className={cx(fieldBox, 'h-ctl', inputClassName)} />
        )}
        {unit && <span className="text-ui-sm text-fg-2">{unit}</span>}
      </div>
      {help && <Text slot="description" className={description}>{help}</Text>}
      <FieldError className={error}>{errorMessage}</FieldError>
    </AriaTextField>
  )
})

export function SearchField({ label: text, placeholder, className, ...props }: Omit<SearchFieldProps, 'className'> & { label: string; placeholder?: string; className?: string }) {
  return (
    <AriaSearchField aria-label={text} {...props} className={cx('relative flex items-center', className)}>
      <Icon name="search" size={16} className="pointer-events-none absolute left-2.5 text-fg-3" />
      <Input placeholder={placeholder} className={cx(fieldBox, 'h-ctl pl-8 [&::-webkit-search-cancel-button]:hidden')} />
      <AriaButton aria-label="Clear search" className="absolute right-1 grid size-ctl-sm cursor-pointer place-items-center rounded-full text-fg-3 outline-none data-[hovered]:bg-hover data-[focus-visible]:outline-2 data-[focus-visible]:outline-focus [[data-empty]_&]:hidden">
        <Icon name="close" size={16} />
      </AriaButton>
    </AriaSearchField>
  )
}

export function Checkbox({ children, className, ...props }: Omit<CheckboxProps, 'className' | 'children'> & { children: ReactNode; className?: string }) {
  return (
    <AriaCheckbox
      {...props}
      className={cx('group inline-flex min-h-touch cursor-pointer items-center gap-2 text-ui outline-none data-[disabled]:opacity-50', className)}
    >
      {({ isSelected, isIndeterminate }) => (
        <>
          <span
            className={cx(
              'grid size-[18px] flex-none place-items-center rounded-xs border-2 transition-colors duration-[var(--ws-motion-short)] ease-standard',
              isSelected || isIndeterminate ? 'border-accent bg-accent text-on-accent' : 'border-fg-2 bg-transparent',
              'group-data-[focus-visible]:outline-2 group-data-[focus-visible]:outline-offset-2 group-data-[focus-visible]:outline-focus',
            )}
          >
            {isSelected && <Icon name="check" size={14} />}
            {isIndeterminate && <Icon name="minus" size={14} />}
          </span>
          <span className="min-w-0">{children}</span>
        </>
      )}
    </AriaCheckbox>
  )
}

export function CheckboxGroup({ label: text, children, className, orientation = 'horizontal', ...props }: Omit<CheckboxGroupProps, 'className' | 'children'> & { label: ReactNode; children: ReactNode; className?: string; orientation?: 'horizontal' | 'vertical' }) {
  return (
    <AriaCheckboxGroup {...props} className={cx('flex min-w-0 flex-col gap-1', className)}>
      <Label className={label}>{text}</Label>
      <div className={cx('flex', orientation === 'horizontal' ? 'flex-wrap gap-x-4' : 'flex-col')}>{children}</div>
    </AriaCheckboxGroup>
  )
}

// ---- Select (choose a value) ----------------------------------------------------------------

export interface SelectOption {
  id: string
  label: ReactNode
  textValue?: string
  description?: ReactNode
  icon?: IconName
  isDisabled?: boolean
}

export function Select({
  label: text,
  ariaLabel,
  options,
  value,
  onChange,
  isDisabled,
  className,
  size = 'md',
  placeholder,
  description: help,
}: {
  label?: ReactNode
  /** Required when there is no visible label. */
  ariaLabel?: string
  description?: ReactNode
  options: SelectOption[]
  value: string | null
  onChange: (value: string) => void
  isDisabled?: boolean
  className?: string
  size?: 'md' | 'sm'
  placeholder?: string
}) {
  return (
    <AriaSelect
      aria-label={ariaLabel}
      selectedKey={value}
      onSelectionChange={(key: Key | null) => key !== null && onChange(String(key))}
      isDisabled={isDisabled}
      disabledKeys={options.filter((o) => o.isDisabled).map((o) => o.id)}
      placeholder={placeholder}
      className={cx('flex min-w-0 flex-col gap-1', className)}
    >
      {text && <Label className={label}>{text}</Label>}
      <AriaButton
        className={cx(
          fieldBox,
          'flex cursor-pointer items-center gap-2 pr-1.5 text-left',
          size === 'md' ? 'h-ctl' : 'h-ctl-sm text-ui-sm',
          'data-[pressed]:bg-surface-2 data-[focus-visible]:border-accent data-[focus-visible]:shadow-[inset_0_0_0_1px_var(--ws-accent)]',
        )}
      >
        <SelectValue className="min-w-0 flex-1 truncate data-[placeholder]:text-fg-3" />
        <Icon name="chevron-down" size={20} className="text-fg-2" />
      </AriaButton>
      {help && <Text slot="description" className={description}>{help}</Text>}
      <Popover className="min-w-[var(--trigger-width)] overflow-auto p-1">
        <ListBox className="outline-none" items={options}>
          {(o) => (
            <Option id={o.id} textValue={o.textValue ?? (typeof o.label === 'string' ? o.label : o.id)}>
              {o.label}
              {o.description && <span className="block text-ui-xs text-fg-3">{o.description}</span>}
            </Option>
          )}
        </ListBox>
      </Popover>
    </AriaSelect>
  )
}

function Option({ children, ...props }: Omit<ListBoxItemProps, 'className' | 'children'> & { children: ReactNode }) {
  return (
    <ListBoxItem
      {...props}
      className={cx(
        'flex min-h-[max(var(--ws-control-h),var(--ws-touch-target))] cursor-pointer items-center gap-2 rounded-sm px-3 py-1 text-ui-sm text-fg outline-none',
        'data-[hovered]:bg-hover data-[focused]:bg-hover data-[selected]:bg-selected data-[selected]:text-selected-fg data-[disabled]:opacity-40',
        'data-[focus-visible]:outline-2 data-[focus-visible]:-outline-offset-2 data-[focus-visible]:outline-focus',
      )}
    >
      {({ isSelected }) => (
        <>
          <Icon name="check" size={16} className={isSelected ? '' : 'invisible'} />
          <span className="min-w-0 flex-1">{children}</span>
        </>
      )}
    </ListBoxItem>
  )
}

// ---- ComboBox (search options) -----------------------------------------------------------------

export interface ComboOption {
  id: string
  label: string
  description?: string
  icon?: IconName
  group?: string
}

/** Searchable option list: type to filter, arrow keys to move, Enter to choose. */
export function ComboBox({
  label: text,
  ariaLabel,
  options,
  onSelect,
  placeholder,
  className,
  inputClassName,
  inputValue,
  onInputChange,
  autoFocus,
  ...props
}: Omit<ComboBoxProps<ComboOption>, 'children' | 'className' | 'items'> & {
  label?: ReactNode
  ariaLabel?: string
  options: ComboOption[]
  onSelect: (option: ComboOption) => void
  placeholder?: string
  className?: string
  inputClassName?: string
  autoFocus?: boolean
}) {
  return (
    <AriaComboBox
      aria-label={ariaLabel}
      items={options}
      inputValue={inputValue}
      onInputChange={onInputChange}
      onSelectionChange={(key: Key | null) => {
        const option = options.find((o) => o.id === key)
        if (option) onSelect(option)
      }}
      menuTrigger="input"
      allowsEmptyCollection
      {...props}
      className={cx('flex min-w-0 flex-col gap-1', className)}
    >
      {text && <Label className={label}>{text}</Label>}
      <div className="relative flex items-center">
        <Icon name="search" size={16} className="pointer-events-none absolute left-2.5 text-fg-3" />
        <Input autoFocus={autoFocus} placeholder={placeholder} className={cx(fieldBox, 'h-ctl pl-8', inputClassName)} />
      </div>
      <Popover className="w-[max(var(--trigger-width),320px)] max-w-[calc(100vw-16px)] overflow-auto p-1">
        <ListBox<ComboOption>
          className="outline-none"
          renderEmptyState={() => <div className="px-3 py-2 text-ui-sm text-fg-3">No matches</div>}
        >
          {(o) => (
            <ListBoxItem
              id={o.id}
              textValue={o.label}
              className={cx(
                'flex min-h-[max(var(--ws-control-h),var(--ws-touch-target))] cursor-pointer items-center gap-3 rounded-sm px-3 py-1 text-ui-sm text-fg outline-none',
                'data-[hovered]:bg-hover data-[focused]:bg-hover data-[focus-visible]:outline-2 data-[focus-visible]:-outline-offset-2 data-[focus-visible]:outline-focus',
              )}
            >
              {o.icon && <Icon name={o.icon} size={16} className="text-fg-2" />}
              <span className="min-w-0 flex-1 truncate">{o.label}</span>
              {o.description && <span className="truncate text-ui-xs text-fg-3">{o.description}</span>}
            </ListBoxItem>
          )}
        </ListBox>
      </Popover>
    </AriaComboBox>
  )
}
