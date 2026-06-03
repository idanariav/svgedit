export default {
  name: 'Color Shift',
  panelTitle: 'Color Shift',
  hint: 'Select one or more shapes to shift colours.',
  inputs: {
    hue: { title: 'Hue shift (−180° to 180°) — rotates fill/stroke colour around the wheel' },
    saturation: { title: 'Saturation shift (±100 percentage points)' },
    lightness: { title: 'Lightness shift (±100 percentage points)' },
    transparency: { title: 'Transparency shift (±100 percentage points) — positive = more transparent' }
  },
  toggles: {
    fill: { label: 'Fill', title: 'Apply shifts to fill colour / fill opacity' },
    stroke: { label: 'Stroke', title: 'Apply shifts to stroke colour / stroke opacity' }
  },
  reset: { title: 'Revert to original colours and zero all inputs' }
}
