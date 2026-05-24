/**
 * colorPicker/index.js — registers <se-color-dialog> custom element.
 */

import { SeColorDialog } from './ColorDialog.js'

export { SeColorDialog }

if (!customElements.get('se-color-dialog')) {
  customElements.define('se-color-dialog', SeColorDialog)
}
