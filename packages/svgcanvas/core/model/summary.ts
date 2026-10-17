/**
 * Document model, layer 3: a compact structural summary of a drawing, for tools that read a drawing without an editor (the
 * headless CLI, an LLM that wants the shape of a file before it opens it).
 *
 * `summarizeDrawing(drawing)` counts what the typed view finds: size, ruler guides, layers (name, state, objects by kind), the
 * `se:` attributes in use and the typed features that do not parse. It runs in plain Node, like the rest of the model.
 * @module model/summary
 * @license MIT
 */
import { walkItems } from './drawing.ts'
import type { Drawing, Item, LayerView } from './drawing.ts'

export interface LayerSummary {
  name: string
  id?: string
  hidden: boolean
  locked: boolean
  template: boolean
  /** every object in the layer, nested ones included (repeat copies not counted), by kind */
  objects: Record<string, number>
}

export interface DrawingSummary {
  size: Drawing['size']
  guides: { v: number, h: number }
  layers: LayerSummary[]
  /** objects outside any layer (the editor gathers them into a new layer on load) */
  orphans: number
  defs: Record<string, number>
  /** every `se:*` attribute name in the file, with how many elements carry it */
  features: Record<string, number>
  /** typed features that do not parse, as `tag#id attribute` (the editor's `se-attr-parse` finding) */
  invalid: string[]
  /** every object's id, in document order, for a caller to address them by */
  ids: string[]
}

const bump = (counts: Record<string, number>, key: string): void => { counts[key] = (counts[key] ?? 0) + 1 }

/** Summarize a drawing read with `readDrawing`. */
export const summarizeDrawing = (drawing: Drawing): DrawingSummary => {
  const features: Record<string, number> = {}
  const invalid: string[] = []
  const ids: string[] = []
  const note = (item: { tag: string, id?: string, se: Readonly<Record<string, string>>, features: { invalid: string[] } }): void => {
    for (const attr of Object.keys(item.se)) bump(features, attr)
    for (const attr of item.features.invalid) invalid.push(`${item.tag}${item.id ? '#' + item.id : ''} ${attr}`)
  }

  const layers: LayerSummary[] = drawing.layers.map((layer: LayerView) => ({
    name: layer.name,
    ...(layer.id ? { id: layer.id } : {}),
    hidden: layer.hidden,
    locked: layer.locked,
    template: layer.template,
    objects: {}
  }))
  walkItems(drawing, (item: Item, layer: LayerView | null) => {
    note(item)
    if (item.id) ids.push(item.id)
    const home = layer ? layers[drawing.layers.indexOf(layer)] : null
    if (home && !item.generated) bump(home.objects, item.kind === 'group' ? `group:${item.role}` : item.kind)
  })
  const defs: Record<string, number> = {}
  for (const def of drawing.defs) { note(def); bump(defs, def.tag) }
  for (const attr of Object.keys(drawing.se)) bump(features, attr)

  return {
    size: drawing.size,
    guides: { v: drawing.guides.v.length, h: drawing.guides.h.length },
    layers,
    orphans: drawing.orphans.length,
    defs,
    features,
    invalid,
    ids
  }
}
