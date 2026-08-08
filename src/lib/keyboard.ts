/**
 * Put the on-screen keyboard away.
 *
 * iOS keeps the keyboard up when focus moves from an input to a control that
 * opens a sheet, so the sheet lands behind it. Blurring on *pointerdown* —
 * before the sheet mounts and steals focus — dismisses it in time.
 */
export function dismissKeyboard(): void {
  const el = document.activeElement;
  if (el instanceof HTMLElement && typeof el.blur === "function") el.blur();
}
