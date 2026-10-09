export default {
  name: 'Glow',
  outer: 'Outer glow',
  inner: 'Inner glow',
  feather: 'Feather',
  contextTools: {
    blur: { title: 'Glow blur (px) — 0 = no glow' },
    opacity: { title: 'Glow opacity (%)' },
    color: { title: 'Glow color' },
    feather: { title: 'Feather radius (px) — softens the edges inward; 0 = off' },
    source: { title: 'Inner glow source: from the edge inward, or from the centre outward' },
    edge: 'Edge',
    centre: 'Centre',
    remove: { title: 'Remove glow and feather' }
  }
}
