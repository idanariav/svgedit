export default {
  name: 'Line segment shapes',
  buttons: [
    { title: 'Spiral Tool' },
    { title: 'Arc Tool' },
    { title: 'Rectangular Grid Tool' },
    { title: 'Polar Grid Tool' }
  ],
  popoverTitle: {
    spiral: 'Spiral',
    arc: 'Arc',
    rectgrid: 'Rectangular Grid',
    polargrid: 'Polar Grid'
  },
  fields: {
    radius: 'Radius',
    decay: 'Decay %',
    segments: 'Segments',
    clockwise: 'Clockwise',
    width: 'Width',
    height: 'Height',
    slope: 'Slope %',
    closed: 'Closed (pie slice)',
    rows: 'Horizontal dividers',
    columns: 'Vertical dividers',
    frame: 'Frame',
    concentric: 'Concentric dividers',
    radial: 'Radial dividers'
  },
  create: 'Create',
  cancel: 'Cancel'
}
