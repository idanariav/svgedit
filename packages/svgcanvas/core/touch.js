// http://ross.posterous.com/2008/08/19/iphone-touch-events-in-javascript/

// Pinch-to-zoom (tablet mode) state. One canvas is active at a time, so
// module-level state is sufficient.
let pinching = false
let pinchStartDist = 0
let pinchStartZoom = 1
let pinchRaf = 0

/**
 * Distance between two Touch points in screen pixels.
 * @param {Touch} a
 * @param {Touch} b
 * @returns {number}
 */
const touchDist = (a, b) => Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY)

/**
 * @param {SvgCanvas} svgCanvas
 * @returns {boolean} whether the editor is currently in tablet mode
 */
const isTabletMode = (svgCanvas) =>
  Boolean(svgCanvas.svgroot.closest('.svg_editor')?.classList.contains('ui-tablet'))

export const init = (svgCanvas) => {
  /**
   * @param {Event} ev
   * @returns {void}
   */
  const touchHandler = (ev) => {
    // Two-finger pinch-to-zoom — tablet mode only.
    if (ev.touches?.length === 2 && (pinching || isTabletMode(svgCanvas))) {
      ev.preventDefault()
      const [t0, t1] = ev.touches
      if (ev.type === 'touchstart') {
        pinching = true
        pinchStartDist = touchDist(t0, t1)
        pinchStartZoom = svgCanvas.getZoom()
        // Abort any draw the first finger may have started.
        t0.target.dispatchEvent(new MouseEvent('mouseup', {
          bubbles: true, cancelable: true, view: window, button: 0
        }))
      } else if (ev.type === 'touchmove' && pinching && pinchStartDist > 0) {
        const factor = touchDist(t0, t1) / pinchStartDist
        const target = pinchStartZoom * factor
        const midX = (t0.clientX + t1.clientX) / 2
        const midY = (t0.clientY + t1.clientY) / 2
        // Throttle the heavy updateCanvas to one call per frame.
        if (!pinchRaf) {
          pinchRaf = requestAnimationFrame(() => {
            pinchRaf = 0
            svgCanvas.zoomAtPoint(target, midX, midY)
          })
        }
      }
      return
    }

    // Pinch ended (lifted a finger): stop pinching, swallow the residual event.
    if (pinching) {
      if (!ev.touches || ev.touches.length < 2) {
        pinching = false
        pinchStartDist = 0
      }
      ev.preventDefault()
      return
    }

    ev.preventDefault()
    const { changedTouches } = ev
    const first = changedTouches[0]

    let type = ''
    switch (ev.type) {
      case 'touchstart': type = 'mousedown'; break
      case 'touchmove': type = 'mousemove'; break
      case 'touchend': type = 'mouseup'; break
      default: return
    }

    const { screenX, screenY, clientX, clientY } = first
    const simulatedEvent = new MouseEvent(type, {
      // Event interface
      bubbles: true,
      cancelable: true,
      // UIEvent interface
      view: window,
      detail: 1, // click count
      // MouseEvent interface (customized)
      screenX,
      screenY,
      clientX,
      clientY,
      // MouseEvent interface (defaults) - these could be removed
      ctrlKey: false,
      altKey: false,
      shiftKey: false,
      metaKey: false,
      button: 0, // main button (usually left)
      relatedTarget: null
    })
    if (changedTouches.length < 2) {
      first.target.dispatchEvent(simulatedEvent)
    }
  }

  svgCanvas.svgroot.addEventListener('touchstart', touchHandler, { passive: false })
  svgCanvas.svgroot.addEventListener('touchmove', touchHandler, { passive: false })
  svgCanvas.svgroot.addEventListener('touchend', touchHandler)
  svgCanvas.svgroot.addEventListener('touchcancel', touchHandler)
}
