// seAlertDialog.js — Alert dialog (OK only)
import SePlainAlertDialog from './SePlainAlertDialog.js'

/** @param {string} text */
const seAlert = (text) => {
  const dialog = new SePlainAlertDialog()
  dialog.textContent = text
  dialog.choices = ['Ok']
  dialog.open()
}

window.seAlert = seAlert
