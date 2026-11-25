/**
 * Listening to a `<dialog>`'s native `close` event without the stale-event race.
 *
 * The browser fires `close` as a queued task, after `dialog.close()` returns. When the dialog is reopened before that
 * task runs (a script, a test, a host reopening right after OK or Save), the event lands on the new session: a handler
 * that treats it as Cancel then cancels and closes the dialog that was just opened. A `close` that arrives while the
 * dialog is open is always such a leftover, so it is dropped here.
 */
export const onNativeClose = (dialog: HTMLDialogElement, handler: () => void): void => {
  dialog.addEventListener('close', () => {
    if (!dialog.open) handler()
  })
}
