export default {
  name: 'eyedropper',
  buttons: [
    {
      title: 'Eye Dropper Tool',
      key: 'I'
    }
  ],
  menu: {
    fill: 'Set as fill color',
    stroke: 'Set as outline color',
    background: 'Set as background color',
    palette: 'Generate matching palette'
  },
  palette: {
    title: 'Matching Palette',
    purpose: 'Purpose',
    purposes: {
      icons: 'Icons',
      text: 'Text',
      charts: 'Charts',
      illustrations: 'Illustrations',
      buttons: 'Buttons',
      notifications: 'Notifications'
    },
    minContrast: 'Min. contrast',
    format: 'Format',
    formatHex: 'Hex',
    formatOklch: 'OKLCH',
    copy: 'Copy'
  }
}
