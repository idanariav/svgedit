/**
 * Layer operations (create/clone/delete/rename/reorder/visibility/lock/merge,
 * move-to-layer, all-layers mode), split out of draw.js. Created per SvgCanvas
 * instance and attached to the canvas; draw.js's `init()` calls this first, so
 * `draw.init(canvas)` still provides every method it did before.
 * @module layer-ops
 * @license MIT
 */

import type SvgCanvas from '../svgcanvas.js'
import HistoryRecordingService from './historyrecording.js'
import { toXml } from './encoding-utils.ts'
import { warn } from '../common/logger.ts'

type HrService = InstanceType<typeof HistoryRecordingService>

/**
 * Get a HistoryRecordingService.
 * @param hrService - if exists, return it instead of creating a new service.
 */
const historyRecordingService = (svgCanvas: SvgCanvas, hrService?: HrService): HrService => {
  // (the canvas types describe its undo manager narrowly; the service wants the history module's class)
  return hrService || new HistoryRecordingService(svgCanvas.undoMgr as ConstructorParameters<typeof HistoryRecordingService>[0])
}

export const init = (canvas: SvgCanvas): void => {
  const svgCanvas = canvas

  /**
   * Updates layer system.
   */
  const identifyLayers = (): void => {
    svgCanvas.leaveContext()
    svgCanvas.getCurrentDrawing().identifyLayers()
  }

  /**
   * get current index
   */
  const indexCurrentLayer = (): number => {
    return svgCanvas.getCurrentDrawing().indexCurrentLayer()
  }

  /**
   * Creates a new top-level layer in the drawing with the given name, sets the current layer
   * to it, and then clears the selection. This function then calls the 'changed' handler.
   * This is an undoable action.
   */
  const createLayer = (name: string, hrService?: HrService): void => {
    const newLayer = svgCanvas
      .getCurrentDrawing()
      .createLayer(name, historyRecordingService(svgCanvas, hrService))
    svgCanvas.clearSelection()
    svgCanvas.call('changed', [newLayer])
  }

  /**
   * Creates a new top-level layer in the drawing with the given name, copies all the current layer's contents
   * to it, and then clears the selection. This function then calls the 'changed' handler.
   * This is an undoable action.
   */
  const cloneLayer = (name: string, hrService?: HrService): void => {
  // Clone the current layer and make the cloned layer the new current layer
    const newLayer = svgCanvas
      .getCurrentDrawing()
      .cloneLayer(name, historyRecordingService(svgCanvas, hrService))
    if (!newLayer) {
      warn('cloneLayer: no layer returned', null, 'draw')
      return
    }

    svgCanvas.clearSelection()
    svgCanvas.leaveContext()
    svgCanvas.call('changed', [newLayer])
  }

  /**
   * Deletes the current layer from the drawing and then clears the selection. This function
   * then calls the 'changed' handler. This is an undoable action.
   */
  const deleteCurrentLayer = (): boolean => {
    const { BatchCommand, RemoveElementCommand } = svgCanvas.history
    const currentLayer = svgCanvas.getCurrentDrawing().getCurrentLayer()
    if (!currentLayer) {
      warn('deleteCurrentLayer: no current layer', null, 'draw')
      return false
    }
    const { nextSibling } = currentLayer
    const parent = currentLayer.parentNode
    const removedLayer = svgCanvas.getCurrentDrawing().deleteCurrentLayer()
    if (removedLayer && parent) {
      const batchCmd = new BatchCommand('Delete Layer')
      // store in our Undo History
      batchCmd.addSubCommand(
        new RemoveElementCommand(removedLayer, nextSibling, parent)
      )
      svgCanvas.addCommandToHistory(batchCmd)
      svgCanvas.clearSelection()
      svgCanvas.call('changed', [parent])
      return true
    }
    return false
  }

  /**
   * Sets the current layer. If the name is not a valid layer name, then this function returns
   * false. Otherwise it returns true. This is not an undo-able action.
   */
  const setCurrentLayer = (name: string): boolean => {
    const result = svgCanvas.getCurrentDrawing().setCurrentLayer(toXml(name))
    if (result) {
      svgCanvas.clearSelection()
    }
    return result
  }

  /**
   * Renames the current layer. If the layer name is not valid (i.e. unique), then this function
   * does nothing and returns `false`, otherwise it returns `true`. This is an undo-able action.
   * be unique among all layer names.
   */
  const renameCurrentLayer = (newName: string): boolean => {
    const drawing = svgCanvas.getCurrentDrawing()
    const layer = drawing.getCurrentLayer()
    if (layer) {
      const result = drawing.setCurrentLayerName(
        newName,
        historyRecordingService(svgCanvas)
      )
      if (result) {
        svgCanvas.call('changed', [layer])
        return true
      }
    }
    return false
  }

  /**
   * Changes the position of the current layer to the new value. If the new index is not valid,
   * this function does nothing and returns false, otherwise it returns true. This is an
   * undo-able action.
   * 0 and (number of layers - 1)
   */
  const setCurrentLayerPosition = (newPos: number): boolean => {
    const { MoveElementCommand } = svgCanvas.history
    const drawing = svgCanvas.getCurrentDrawing()
    const result = drawing.setCurrentLayerPosition(newPos)
    if (result) {
      svgCanvas.addCommandToHistory(
        new MoveElementCommand(
          result.currentGroup,
          result.oldNextSibling,
          svgCanvas.getSvgContent()
        )
      )
      return true
    }
    return false
  }

  /**
   * Sets the visibility of the layer. If the layer name is not valid, this function return
   * `false`, otherwise it returns `true`. This is an undo-able action.
   */
  const setLayerVisibility = (layerName: string, bVisible: boolean): boolean => {
    const { ChangeElementCommand } = svgCanvas.history
    const drawing = svgCanvas.getCurrentDrawing()
    const layerGroup = drawing.getLayerByName(layerName)
    if (!layerGroup) {
      warn('setLayerVisibility: layer not found', layerName, 'draw')
      return false
    }
    const oldDisplay = layerGroup.getAttribute('display')
    const layer = drawing.setLayerVisibility(layerName, bVisible)
    if (!layer) {
      return false
    }
    svgCanvas.addCommandToHistory(
      new ChangeElementCommand(layer, { display: oldDisplay }, 'Layer Visibility')
    )

    if (layer === drawing.getCurrentLayer()) {
      svgCanvas.clearSelection()
      svgCanvas.pathActions.clear()
    }
    // call('changed', [selected]);
    return true
  }

  /**
   * Sets the locked state of the layer. A locked layer keeps its contents but does
   * not receive newly drawn/pasted objects. Returns `true` if applied. Not undo-able.
   */
  const setLayerLocked = (layerName: string, bLocked: boolean): boolean => {
    const drawing = svgCanvas.getCurrentDrawing()
    const layer = drawing.setLayerLocked(layerName, bLocked)
    if (!layer) {
      warn('setLayerLocked: layer not found', layerName, 'draw')
      return false
    }
    return true
  }

  /**
   * Returns whether the named layer is locked.
   */
  const getLayerLocked = (layerName: string): boolean => {
    return svgCanvas.getCurrentDrawing().getLayerLocked(layerName)
  }

  /**
   * Sets the comment-layer state of the layer. Returns `true` if applied. Not
   * undo-able.
   */
  const setLayerComment = (layerName: string, bComment: boolean): boolean => {
    const drawing = svgCanvas.getCurrentDrawing()
    const layer = drawing.setLayerComment(layerName, bComment)
    if (!layer) {
      warn('setLayerComment: layer not found', layerName, 'draw')
      return false
    }
    return true
  }

  /**
   * Returns whether the named layer is a comment layer.
   */
  const getLayerComment = (layerName: string): boolean => {
    return svgCanvas.getCurrentDrawing().getLayerComment(layerName)
  }

  /**
   * Sets the visibility of several layers as ONE undo step (an Alt-click on an
   * eye, a drag down the eye column). Layers already in the requested state are
   * skipped.
   */
  const setLayersVisibility = (states: Record<string, boolean>): boolean => {
    const drawing = svgCanvas.getCurrentDrawing()
    const todo = Object.entries(states).filter(([name, visible]) =>
      drawing.getLayerByName(name) && (drawing.getLayerByName(name).getAttribute('display') !== 'none') !== visible)
    if (!todo.length) return false
    if (todo.length === 1) return setLayerVisibility(todo[0][0], todo[0][1])
    svgCanvas.transact('Layer Visibility', () => {
      for (const [name, visible] of todo) setLayerVisibility(name, visible)
    })
    return true
  }

  /**
   * Locks or unlocks several layers as ONE undo step (a click on a padlock, an Alt-click, a drag down the
   * lock column). Layers already in the requested state are skipped. (`setLayerLocked` itself stays out of
   * the history: Focus mode and templates lock layers as a view state.)
   */
  const setLayersLocked = (states: Record<string, boolean>): boolean => {
    const drawing = svgCanvas.getCurrentDrawing()
    const todo = Object.entries(states).filter(([name, locked]) =>
      drawing.getLayerByName(name) && drawing.getLayerLocked(name) !== locked)
    if (!todo.length) return false
    svgCanvas.transact('Lock Layer', () => {
      for (const [name, locked] of todo) setLayerLocked(name, locked)
    })
    return true
  }

  /**
   * Makes a comment layer a tracing template (dimmed, locked, its objects cannot
   * be selected, never exported) or turns that off. Turning it on also shows the
   * layer (undo-able). Only comment layers can be templates.
   */
  const setLayerTemplate = (layerName: string, bTemplate: boolean): boolean => {
    const drawing = svgCanvas.getCurrentDrawing()
    if (!drawing.setLayerTemplate(layerName, bTemplate)) return false
    if (bTemplate && drawing.getLayerByName(layerName).getAttribute('display') === 'none') {
      setLayerVisibility(layerName, true)
    }
    return true
  }

  /**
   * Returns whether the named layer is a tracing template.
   */
  const getLayerTemplate = (layerName: string): boolean => svgCanvas.getCurrentDrawing().getLayerTemplate(layerName)

  /**
   * Sets whether every layer is simultaneously selectable ("All Layers" mode)
   * instead of just the current layer. Does not change which layer new/pasted
   * content lands on. Not undo-able (a transient view/selection state).
   */
  const setAllLayersMode = (bAllLayers: boolean): void => {
    svgCanvas.getCurrentDrawing().setAllLayersMode(bAllLayers)
  }

  /**
   * Returns whether "All Layers" selection mode is on.
   */
  const getAllLayersMode = (): boolean => {
    return svgCanvas.getCurrentDrawing().getAllLayersMode()
  }

  /**
   * Moves the selected elements to layerName. If the name is not a valid layer name, then `false`
   * is returned. Otherwise it returns `true`. This is an undo-able action.
   */
  const moveSelectedToLayer = (layerName: string): boolean => {
    const { BatchCommand, MoveElementCommand } = svgCanvas.history
    // find the layer
    const drawing = svgCanvas.getCurrentDrawing()
    const layer = drawing.getLayerByName(layerName)
    if (!layer) {
      return false
    }

    const batchCmd = new BatchCommand('Move Elements to Layer')

    // loop for each selected element and move it
    const selElems = svgCanvas.getSelectedElements()
    let i = selElems.length
    while (i--) {
      const elem = selElems[i]
      const oldLayer = elem?.parentNode
      if (!elem || !oldLayer || oldLayer === layer) {
        continue
      }
      const oldNextSibling = elem.nextSibling
      layer.append(elem)
      batchCmd.addSubCommand(
        new MoveElementCommand(elem, oldNextSibling, oldLayer)
      )
    }

    if (batchCmd.isEmpty()) {
      warn('moveSelectedToLayer: no elements moved', null, 'draw')
      return false
    }
    svgCanvas.addCommandToHistory(batchCmd)

    return true
  }

  const mergeLayer = (hrService?: HrService): void => {
    svgCanvas.getCurrentDrawing().mergeLayer(historyRecordingService(svgCanvas, hrService))
    svgCanvas.clearSelection()
    svgCanvas.leaveContext()
    svgCanvas.changeSvgContent()
  }

  const mergeAllLayers = (hrService?: HrService): void => {
    svgCanvas
      .getCurrentDrawing()
      .mergeAllLayers(historyRecordingService(svgCanvas, hrService))
    svgCanvas.clearSelection()
    svgCanvas.leaveContext()
    svgCanvas.changeSvgContent()
  }

  svgCanvas.identifyLayers = identifyLayers
  svgCanvas.indexCurrentLayer = indexCurrentLayer
  svgCanvas.createLayer = createLayer
  svgCanvas.cloneLayer = cloneLayer
  svgCanvas.deleteCurrentLayer = deleteCurrentLayer
  svgCanvas.setCurrentLayer = setCurrentLayer
  svgCanvas.renameCurrentLayer = renameCurrentLayer
  svgCanvas.setCurrentLayerPosition = setCurrentLayerPosition
  svgCanvas.setLayerVisibility = setLayerVisibility
  svgCanvas.setLayerLocked = setLayerLocked
  svgCanvas.getLayerLocked = getLayerLocked
  svgCanvas.setLayersVisibility = setLayersVisibility
  svgCanvas.setLayersLocked = setLayersLocked
  svgCanvas.setLayerTemplate = setLayerTemplate
  svgCanvas.getLayerTemplate = getLayerTemplate
  svgCanvas.setLayerComment = setLayerComment
  svgCanvas.getLayerComment = getLayerComment
  svgCanvas.setAllLayersMode = setAllLayersMode
  svgCanvas.getAllLayersMode = getAllLayersMode
  svgCanvas.moveSelectedToLayer = moveSelectedToLayer
  svgCanvas.mergeLayer = mergeLayer
  svgCanvas.mergeAllLayers = mergeAllLayers
}
