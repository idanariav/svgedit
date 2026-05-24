/**
 * @file ext-theme-toggle.js
 *
 * Adds a theme-toggle button to the top panel (#theme_panel) that lets users
 * quickly switch between light and dark themes.
 *
 * Icon convention:
 *   - theme is dark  → show light_theme.svg  (clicking switches TO light)
 *   - theme is light → show dark_theme.svg   (clicking switches TO dark)
 *
 * @license MIT
 */

import { applyTheme } from '../../themeUtil.js'

const name = 'theme_toggle'

export default {
  name,
  async init (_S) {
    const svgEditor = this
    const { svgCanvas } = svgEditor
    const { $id, $click } = svgCanvas

    const getTheme = () => svgEditor.configObj.pref('theme') || 'light'

    const iconFor = (theme) => theme === 'dark' ? 'light_theme.svg' : 'dark_theme.svg'
    const titleFor = (theme) => theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'

    const updateButton = () => {
      const btn = $id('tool_theme_toggle')
      if (!btn) return
      const theme = getTheme()
      btn.setAttribute('src', iconFor(theme))
      btn.setAttribute('title', titleFor(theme))
    }

    const clickThemeToggle = () => {
      const current = getTheme()
      const next = current === 'dark' ? 'light' : 'dark'
      svgEditor.configObj.pref('theme', next)
      applyTheme(next, svgEditor.$svgEditor)
      updateButton()
    }

    return {
      name,
      callback () {
        const buttonTemplate = document.createElement('template')
        const theme = getTheme()
        buttonTemplate.innerHTML = `
          <se-button id="tool_theme_toggle" title="${titleFor(theme)}" src="${iconFor(theme)}"></se-button>`
        $id('theme_panel').append(buttonTemplate.content.cloneNode(true))
        $click($id('tool_theme_toggle'), clickThemeToggle)
      }
    }
  }
}
