export default {
  name: 'Gradient tool',
  buttons: [
    {
      title: 'Gradient tool: edit the gradient of the selected shape'
    }
  ],
  mode: 'Gradient',
  kind: 'New',
  kindTitle: 'The kind of gradient a drag on a shape without one makes: a drag sets where it starts and ends (linear) or its centre and radius (radial)',
  linear: 'Linear',
  radial: 'Radial',
  paint: 'Paint',
  paintTitle: 'Which paint of the selected shape the handles edit',
  fill: 'Fill',
  stroke: 'Stroke'
}
