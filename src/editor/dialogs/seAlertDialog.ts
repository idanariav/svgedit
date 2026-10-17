// seAlertDialog.ts — Alert dialog (OK only)
import SePlainAlertDialog from './SePlainAlertDialog.ts'

const seAlert = (text: string) => {
  const dialog = new SePlainAlertDialog()
  dialog.textContent = text
  dialog.choices = ['Ok']
  dialog.open()
}

window.seAlert = seAlert
