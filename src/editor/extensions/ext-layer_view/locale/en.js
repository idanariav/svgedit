export default {
  name: 'layerview',
  buttons: [
    {
      title: 'Layer Focus — isolate, dim & lock other layers',
      key: 'Ctrl+Shift+L'
    }
  ],
  focus: {
    badge: 'Layer: {{name}}'
  },
  all: {
    badge: 'All Layers',
    switchCurrent: 'Layer',
    switchCurrentTitle: 'Layer Focus — only the current layer is selectable',
    switchAll: 'All',
    switchAllTitle: 'All Layers — select elements from any layer'
  }
}
