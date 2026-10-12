export default {
  name: 'Layout tools',
  panelTitle: 'Layout',
  each: {
    button: 'Transform each: scale, move, rotate or reflect every selected object about its own point',
    caption: 'Transform each',
    selectFirst: 'Select something to transform first',
    undo: 'Transform each',
    dialog: {
      title: 'Transform Each',
      scaleH: 'Scale horizontal (%)',
      scaleV: 'Scale vertical (%)',
      moveH: 'Move horizontal',
      moveV: 'Move vertical',
      rotate: 'Rotate (°)',
      origin: 'Reference point of each object',
      reflectX: 'Reflect horizontally',
      reflectY: 'Reflect vertically',
      random: 'Random (each amount from none up to the one entered)',
      copy: 'Copy (transform duplicates, keep the originals)',
      cancel: 'Cancel',
      ok: 'Transform'
    }
  },
  grid: {
    button: 'Split into grid: replace a shape with rows × columns of rectangles',
    caption: 'Split into grid',
    selectFirst: 'Select one shape to split first',
    undo: 'Split into grid',
    dialog: {
      title: 'Split Into Grid',
      rows: 'Rows',
      cols: 'Columns',
      gutter: 'Gutter',
      cancel: 'Cancel',
      ok: 'Split'
    }
  }
}
