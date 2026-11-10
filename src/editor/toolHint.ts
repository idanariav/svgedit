// toolHint.ts — The pill pinned to the top of the canvas that says how to use the current tool, with a live count and a Done button.

export interface ToolHint {
  /** Show the pill with this usage text and an optional status (a count such as "2 picked"). */
  show (text: string, status?: string): void
  hide (): void
}

/**
 * A tool's hint pill, created on first show in the editor root (`#<id>.tool_hint`, styled in `svgedit.css`).
 * Done leaves the tool for Select, like Escape does.
 * @param editor the owning editor
 * @param id the pill's element id
 */
export const createToolHint = (editor: EditorInstance, id: string): ToolHint => {
  let el: HTMLDivElement | null = null
  const ensure = (): HTMLDivElement => {
    if (el) return el
    el = document.createElement('div')
    el.id = id
    el.className = 'tool_hint'
    el.innerHTML = '<span class="tool-hint-text"></span><span class="tool-hint-status"></span><button type="button" class="tool-hint-done"></button>'
    const done = el.querySelector('.tool-hint-done') as HTMLButtonElement
    done.textContent = editor.i18next.t('common.done')
    done.addEventListener('click', () => editor.leftPanel.clickSelect())
    editor.$svgEditor.append(el)
    return el
  }
  return {
    show (text, status = '') {
      const pill = ensure()
      ;(pill.querySelector('.tool-hint-text') as HTMLElement).textContent = text
      ;(pill.querySelector('.tool-hint-status') as HTMLElement).textContent = status
      pill.classList.add('visible')
    },
    hide () { el?.classList.remove('visible') }
  }
}
