// seConfirmDialog.js — Confirm dialog (OK / Cancel)
import SePlainAlertDialog from './SePlainAlertDialog.js'

/**
 * @param {string} text
 * @param {string[]} [choices]
 * @returns {Promise<string|undefined>}
 */
const seConfirm = async (text, choices) => {
  const dialog = new SePlainAlertDialog()
  dialog.textContent = text
  dialog.choices = (choices === undefined) ? ['Ok', 'Cancel'] : choices
  dialog.open()
  const response = await dialog.whenClosed()
  return dialog.keyChoice ?? response.choice
}

window.seConfirm = seConfirm
