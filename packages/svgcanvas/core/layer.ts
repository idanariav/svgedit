/**
 * Provides tools for the layer concept.
 * @module layer
 * @license MIT
 *
 * @copyright 2011 Jeff Schiller, 2016 Flint O'Brien
 */

import { NS } from './namespaces.ts'
import { toXml } from './encoding-utils.ts'
import { walkTree } from './dom-utils.ts'

/**
 * This class encapsulates the concept of a layer in the drawing. It can be constructed with
 * an existing group element or, with three parameters, will create a new layer group element.
 *
 * @example
 * const l1 = new Layer('name', group); // Use the existing group for this layer.
 * const l2 = new Layer('name', group, svgElem); // Create a new group and add it to the DOM after group.
 * const l3 = new Layer('name', null, svgElem); // Create a new group and add it to the DOM as the last layer.
 * @memberof module:layer
 */
class Layer {
  /** class attribute assigned to all layer groups. */
  static CLASS_NAME = 'layer'
  /** Used to test presence of class `Layer.CLASS_NAME`. */
  static CLASS_REGEX = new RegExp(`(\\s|^)${Layer.CLASS_NAME}(\\s|$)`)

  name_: string
  group_: SVGGElement

  /**
   * @param name - Layer name
   * @param group - An existing SVG group element or null.
   *     If group and no svgElem, use group for this layer.
   *     If group and svgElem, create a new group element and insert it in the DOM after group.
   *     If no group and svgElem, create a new group element and insert it in the DOM as the last layer.
   * @param svgElem - The SVG DOM element. If defined, use this to add
   *     a new layer to the document.
   */
  constructor (name: string, group: SVGGElement | null, svgElem?: SVGGElement) {
    this.name_ = name
    // (null only until the branch below creates the group)
    this.group_ = (svgElem ? null : group) as SVGGElement

    if (svgElem) {
      // Create a group element with title and add it to the DOM.
      const svgdoc = svgElem.ownerDocument
      this.group_ = svgdoc.createElementNS(NS.SVG, 'g') as SVGGElement
      const layerTitle = svgdoc.createElementNS(NS.SVG, 'title')
      layerTitle.textContent = name
      this.group_.append(layerTitle)

      group ? group.insertAdjacentElement('afterend', this.group_) : svgElem.append(this.group_)
    }

    addLayerClass(this.group_)
    walkTree(this.group_, function (e) {
      e.style.pointerEvents = 'inherit'
    })

    this.group_.style.pointerEvents = svgElem ? 'all' : 'none'
  }

  /** Get the layer's name. */
  getName (): string {
    return this.name_
  }

  /** Get the group element for this layer. */
  getGroup (): SVGGElement {
    return this.group_
  }

  /** Active this layer so it takes pointer events. */
  activate (): void {
    this.group_.style.pointerEvents = 'all'
  }

  /** Deactive this layer so it does NOT take pointer events. */
  deactivate (): void {
    this.group_.style.pointerEvents = 'none'
  }

  /**
   * Set this layer visible or hidden based on 'visible' parameter.
   * @param visible - If true, make visible; otherwise, hide it.
   */
  setVisible (visible: boolean): void {
    const expected = (visible === undefined || visible) ? 'inline' : 'none'
    const oldDisplay = this.group_.getAttribute('display')
    if (oldDisplay !== expected) {
      this.group_.setAttribute('display', expected)
    }
  }

  /** Is this layer visible? */
  isVisible (): boolean {
    return this.group_.getAttribute('display') !== 'none'
  }

  /**
   * Lock or unlock this layer. A locked layer keeps its existing contents but
   * does not receive newly drawn/pasted objects (they go to the next unlocked
   * layer). Persisted as the namespaced `se:locked` attribute so it survives
   * save/load.
   * @param locked - If true, lock the layer; otherwise unlock it.
   */
  setLocked (locked: boolean): void {
    if (locked) {
      this.group_.setAttributeNS(NS.SE, 'se:locked', 'true')
    } else {
      this.group_.removeAttributeNS(NS.SE, 'locked')
    }
  }

  /** Is this layer locked? */
  isLocked (): boolean {
    return this.group_.getAttributeNS(NS.SE, 'locked') === 'true'
  }

  /**
   * Mark or unmark this layer as a "comment" layer: a layer for
   * work-in-progress notes/annotations rather than drawing content. Callers
   * (e.g. export tooling) are expected to always exclude comment layers from
   * their output, regardless of the layer's own visibility state. Persisted
   * as the namespaced `se:comment` attribute so it survives save/load, and —
   * like locking — is a meta-action on the layer, not an undo-able edit.
   * @param isComment - If true, mark as a comment layer; otherwise unmark.
   */
  setCommentLayer (isComment: boolean): void {
    if (isComment) {
      this.group_.setAttributeNS(NS.SE, 'se:comment', 'true')
    } else {
      this.group_.removeAttributeNS(NS.SE, 'comment')
    }
  }

  /** Is this layer a comment layer? */
  isCommentLayer (): boolean {
    return this.group_.getAttributeNS(NS.SE, 'comment') === 'true'
  }

  /**
   * Mark or unmark this layer as a tracing template: a comment layer that sits
   * under the drawing as a reference. The editor dims it (a stylesheet rule on
   * `[se:template]`, so no saved opacity changes) and its objects cannot be
   * selected (`object-state.js`); it is never exported. Persisted as the
   * namespaced `se:template` attribute; a meta-action like locking.
   */
  setTemplate (isTemplate: boolean): void {
    if (isTemplate) {
      this.group_.setAttributeNS(NS.SE, 'se:template', 'true')
    } else {
      this.group_.removeAttributeNS(NS.SE, 'template')
    }
  }

  /** Is this layer a tracing template? */
  isTemplate (): boolean {
    return this.group_.getAttributeNS(NS.SE, 'template') === 'true'
  }

  /** Get layer opacity. */
  getOpacity (): number {
    const opacity = this.group_.getAttribute('opacity')
    return opacity ? Number.parseFloat(opacity) : 1
  }

  /**
   * Sets the opacity of this layer. If opacity is not a value between 0.0 and 1.0,
   * nothing happens.
   * @param opacity - A float value in the range 0.0-1.0
   */
  setOpacity (opacity: number): void {
    if (typeof opacity === 'number' && opacity >= 0.0 && opacity <= 1.0) {
      this.group_.setAttribute('opacity', String(opacity))
    }
  }

  /**
   * Append children to this layer.
   * @param children - The children to append to this layer.
   */
  appendChildren (children: Iterable<Node>): void {
    for (const child of children) {
      this.group_.append(child)
    }
  }

  getTitleElement (): SVGTitleElement | null {
    const len = this.group_.childNodes.length
    for (let i = 0; i < len; ++i) {
      const child = this.group_.childNodes.item(i) as Element | null
      if (child?.tagName === 'title') {
        return child as SVGTitleElement
      }
    }
    return null
  }

  /**
   * Set the name of this layer.
   * @param name - The new name.
   * @param hrService - History recording service
   * @returns The new name if changed; otherwise, null.
   */
  setName (name: string, hrService?: { changeElement: (elem: Element, attrs: Record<string, unknown>) => unknown }): string | null {
    const previousName = this.name_
    name = toXml(name)
    // now change the underlying title element contents
    const title = this.getTitleElement()
    if (title) {
      while (title.firstChild) { title.removeChild(title.firstChild) }
      title.textContent = name
      this.name_ = name
      if (hrService) {
        hrService.changeElement(title, { '#text': previousName })
      }
      return this.name_
    }
    return null
  }

  /**
   * Remove this layer's group from the DOM. No more functions on group can be called after this.
   * @returns The layer SVG group that was just removed.
   */
  removeGroup (): SVGGElement {
    const group = this.group_
    this.group_.remove()
    this.group_ = undefined as unknown as SVGGElement
    return group
  }

  /**
   * Test whether an element is a layer or not.
   * @param elem - The SVGGElement to test.
   * @returns True if the element is a layer
   */
  static isLayer (elem: Element | null | undefined): boolean {
    return !!elem && elem.tagName === 'g' && Layer.CLASS_REGEX.test(elem.getAttribute('class') ?? '')
  }
}
/**
 * Add class `Layer.CLASS_NAME` to the element (usually `class='layer'`).
 *
 * @param elem - The SVG element to update
 */
const addLayerClass = (elem: SVGGElement): void => {
  const classes = elem.getAttribute('class')
  if (!classes || !classes.length) {
    elem.setAttribute('class', Layer.CLASS_NAME)
  } else if (!Layer.CLASS_REGEX.test(classes)) {
    elem.setAttribute('class', `${classes} ${Layer.CLASS_NAME}`)
  }
}

export default Layer
