/**
 * Z-index scale. The same numbers exist as `z-*` utilities in globals.css; keep both in sync.
 * `popper` is not in the design scale: menus, selects and tooltips must sit above dialogs
 * (modal) that open them, so they get a layer between modal and toast.
 */
export const LAYERS = {
  base: 0,
  sticky: 10,
  sidebar: 20,
  topbar: 30,
  dropdown: 40,
  overlay: 50,
  modal: 60,
  popper: 65,
  toast: 70,
} as const

export type Layer = keyof typeof LAYERS
