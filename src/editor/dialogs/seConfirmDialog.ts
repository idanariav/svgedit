// seConfirmDialog.ts — Confirm dialog (OK / Cancel)
import SePlainAlertDialog from './SePlainAlertDialog.ts'

const seConfirm = async (text: string, choices?: string[]): Promise<string | undefined> => {
  const dialog = new SePlainAlertDialog()
  dialog.textContent = text
  dialog.choices = (choices === undefined) ? ['Ok', 'Cancel'] : choices
  dialog.open()
  const response = await dialog.whenClosed()
  return dialog.keyChoice ?? response.choice
}

window.seConfirm = seConfirm
