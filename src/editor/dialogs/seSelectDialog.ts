// seSelectDialog.ts — Multi-choice select dialog
import SePlainAlertDialog from './SePlainAlertDialog.ts'

const seSelect = async (text: string, choices: string[]): Promise<string | undefined> => {
  const dialog = new SePlainAlertDialog()
  dialog.textContent = text
  dialog.choices = choices
  dialog.open()
  const response = await dialog.whenClosed()
  return response.choice
}

window.seSelect = seSelect
