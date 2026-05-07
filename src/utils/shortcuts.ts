// Shortcut configuration types and defaults.

export interface ShortcutConfig {
  createNew:  string  // open create modal on current page
  closeModal: string  // close any open modal / dialog
  prevMonth:  string  // go to previous month (Dashboard, Budgets, Reports)
  nextMonth:  string  // go to next month
  goImport:   string  // navigate to Import page
}

export const DEFAULT_SHORTCUTS: ShortcutConfig = {
  createNew:  'n',
  closeModal: 'Escape',
  prevMonth:  'ArrowLeft',
  nextMonth:  'ArrowRight',
  goImport:   'i',
}

export const SHORTCUT_LABELS: Record<keyof ShortcutConfig, string> = {
  createNew:  'Create new',
  closeModal: 'Close modal',
  prevMonth:  'Previous month',
  nextMonth:  'Next month',
  goImport:   'Go to Import',
}

export function formatKey(key: string): string {
  const map: Record<string, string> = {
    Escape: 'Esc',
    ArrowLeft: '←',
    ArrowRight: '→',
    ArrowUp: '↑',
    ArrowDown: '↓',
    ' ': 'Space',
  }
  return map[key] ?? key.toUpperCase()
}
