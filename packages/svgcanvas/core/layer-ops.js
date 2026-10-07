/**
 * Layer operations (create/clone/delete/rename/reorder/visibility/lock/merge,
 * move-to-layer, all-layers mode), split out of draw.js. Created per SvgCanvas
 * instance and attached to the canvas; draw.js's `init()` calls this first, so
 * `draw.init(canvas)` still provides every method it did before.
 * @module layer-ops
 * @license MIT
 */

import HistoryRecordingService from './historyrecording.js'
import { toXml } from './encoding-utils.js'
import { warn } from '../common/logger.js'

/**
 * Get a HistoryRecordingService.
 * @param {module:svgcanvas.SvgCanvas} svgCanvas
 * @param {module:history.HistoryRecordingService} [hrService] - if exists, return it instead of creating a new service.
 * @returns {module:history.HistoryRecordingService}
 */
const historyRecordingService = (svgCanvas, hrService) => {
  return hrService || new HistoryRecordingService(svgCanvas.undoMgr)
}

export const init = canvas => {
  const svgCanvas = canvas

  /**
 * Updates layer system.
 * @function module:draw.identifyLayers
 * @returns {void}
 */
  const identifyLayers = () => {
    svgCanvas.leaveContext()
    svgCanvas.getCurrentDrawing().identifyLayers()
  }

  /**
 * get current index
 * @function module:draw.identifyLayers
 * @returns {void}
 */
  const indexCurrentLayer = () => {
    return svgCanvas.getCurrentDrawing().indexCurrentLayer()
  }

  /**
 * Creates a new top-level layer in the drawing with the given name, sets the current layer
 * to it, and then clears the selection. This function then calls the 'changed' handler.
 * This is an undoable action.
 * @function module:draw.createLayer
 * @param {string} name - The given name
 * @param {module:history.HistoryRecordingService} hrService
 * @fires module:svgcanvas.SvgCanvas#event:changed
 * @returns {void}
 */
  const createLayer = (name, hrService) => {
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
 * @function module:draw.cloneLayer
 * @param {string} name - The given name. If the layer name exists, a new name will be generated.
 * @param {module:history.HistoryRecordingService} hrService - History recording service
 * @fires module:svgcanvas.SvgCanvas#event:changed
 * @returns {void}
 */
  const cloneLayer = (name, hrService) => {
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
 * @function module:draw.deleteCurrentLayer
 * @fires module:svgcanvas.SvgCanvas#event:changed
 * @returns {boolean} `true` if an old layer group was found to delete
 */
  const deleteCurrentLayer = () => {
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
 * @function module:draw.setCurrentLayer
 * @param {string} name - The name of the layer you want to switch to.
 * @returns {boolean} true if the current layer was switched, otherwise false
 */
  const setCurrentLayer = name => {
    const result = svgCanvas.getCurrentDrawing().setCurrentLayer(toXml(name))
    if (result) {
      svgCanvas.clearSelection()
    }
    return result
  }

  /**
 * Renames the current layer. If the layer name is not valid (i.e. unique), then this function
 * does nothing and returns `false`, otherwise it returns `true`. This is an undo-able action.
 * @function module:draw.renameCurrentLayer
 * @param {string} newName - the new name you want to give the current layer. This name must
 * be unique among all layer names.
 * @fires module:svgcanvas.SvgCanvas#event:changed
 * @returns {boolean} Whether the rename succeeded
 */
  const renameCurrentLayer = newName => {
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
 * @function module:draw.setCurrentLayerPosition
 * @param {Integer} newPos - The zero-based index of the new position of the layer. This should be between
 * 0 and (number of layers - 1)
 * @returns {boolean} `true` if the current layer position was changed, `false` otherwise.
 */
  const setCurrentLayerPosition = newPos => {
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
 * @function module:draw.setLayerVisibility
 * @param {string} layerName - The name of the layer to change the visibility
 * @param {boolean} bVisible - Whether the layer should be visible
 * @returns {boolean} true if the layer's visibility was set, false otherwise
 */
  const setLayerVisibility = (layerName, bVisible) => {
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
 * @function module:draw.setLayerLocked
 * @param {string} layerName - The name of the layer to lock/unlock
 * @param {boolean} bLocked - Whether the layer should be locked
 * @returns {boolean} true if the layer's locked state was set, false otherwise
 */
  const setLayerLocked = (layerName, bLocked) => {
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
 * @function module:draw.getLayerLocked
 * @param {string} layerName - The name of the layer to query
 * @returns {boolean} true if the layer is locked
 */
  const getLayerLocked = (layerName) => {
    return svgCanvas.getCurrentDrawing().getLayerLocked(layerName)
  }

  /**
 * Sets the comment-layer state of the layer. Returns `true` if applied. Not
 * undo-able.
 * @function module:draw.setLayerComment
 * @param {string} layerName - The name of the layer to mark/unmark
 * @param {boolean} bComment - Whether the layer should be a comment layer
 * @returns {boolean} true if the layer's comment-layer state was set, false otherwise
 */
  const setLayerComment = (layerName, bComment) => {
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
 * @function module:draw.getLayerComment
 * @param {string} layerName - The name of the layer to query
 * @returns {boolean} true if the layer is a comment layer
 */
  const getLayerComment = (layerName) => {
    return svgCanvas.getCurrentDrawing().getLayerComment(layerName)
  }

  /**
 * Sets whether every layer is simultaneously selectable ("All Layers" mode)
 * instead of just the current layer. Does not change which layer new/pasted
 * content lands on. Not undo-able (a transient view/selection state).
 * @function module:draw.setAllLayersMode
 * @param {boolean} bAllLayers
 * @returns {void}
 */
  const setAllLayersMode = (bAllLayers) => {
    svgCanvas.getCurrentDrawing().setAllLayersMode(bAllLayers)
  }

  /**
 * Returns whether "All Layers" selection mode is on.
 * @function module:draw.getAllLayersMode
 * @returns {boolean}
 */
  const getAllLayersMode = () => {
    return svgCanvas.getCurrentDrawing().getAllLayersMode()
  }

  /**
 * Moves the selected elements to layerName. If the name is not a valid layer name, then `false`
 * is returned. Otherwise it returns `true`. This is an undo-able action.
 * @function module:draw.moveSelectedToLayer
 * @param {string} layerName - The name of the layer you want to which you want to move the selected elements
 * @returns {boolean} Whether the selected elements were moved to the layer.
 */
  const moveSelectedToLayer = layerName => {
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

  /**
 * @function module:draw.mergeLayer
 * @param {module:history.HistoryRecordingService} hrService
 * @returns {void}
 */
  const mergeLayer = hrService => {
    svgCanvas.getCurrentDrawing().mergeLayer(historyRecordingService(svgCanvas, hrService))
    svgCanvas.clearSelection()
    svgCanvas.leaveContext()
    svgCanvas.changeSvgContent()
  }

  /**
 * @function module:draw.mergeAllLayers
 * @param {module:history.HistoryRecordingService} hrService
 * @returns {void}
 */
  const mergeAllLayers = hrService => {
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
  svgCanvas.setLayerComment = setLayerComment
  svgCanvas.getLayerComment = getLayerComment
  svgCanvas.setAllLayersMode = setAllLayersMode
  svgCanvas.getAllLayersMode = getAllLayersMode
  svgCanvas.moveSelectedToLayer = moveSelectedToLayer
  svgCanvas.mergeLayer = mergeLayer
  svgCanvas.mergeAllLayers = mergeAllLayers
}
