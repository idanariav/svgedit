import SvgCanvas from '../../packages/svgcanvas/svgcanvas.js'
import { createFxComposer } from '../../src/editor/extensions/fx-filter.js'

describe('fx-filter glow', () => {
  let svgCanvas
  let fx

  beforeEach(() => {
    document.body.textContent = ''
    const host = document.createElement('div')
    host.id = 'svgcanvas'
    host.style.visibility = 'hidden'
    const workarea = document.createElement('div')
    workarea.id = 'workarea'
    workarea.append(host)
    const toolsLeft = document.createElement('div')
    toolsLeft.id = 'tools_left'
    document.body.append(workarea, toolsLeft)
    svgCanvas = new SvgCanvas(host, {
      canvas_expansion: 3,
      dimensions: [640, 480],
      initFill: { color: 'FF0000', opacity: 1 },
      initStroke: { width: 5, color: '000000', opacity: 1 },
      initOpacity: 1,
      imgPath: '../editor/images',
      langPath: 'locale/',
      extPath: 'extensions/',
      extensions: [],
      initTool: 'select',
      wireframe: false
    })
    fx = createFxComposer(svgCanvas)
  })

  afterEach(() => {
    document.body.textContent = ''
  })

  const addRect = (id) => svgCanvas.addSVGElementsFromJson({
    element: 'rect', attr: { id, x: 10, y: 10, width: 20, height: 20 }
  })
  const SHADOW = { dx: 4, dy: 4, blur: 2, color: '#000', opacity: 0.5 }
  const OUTLINE = { width: 3, color: '#fff', opacity: 1 }
  const OUTER = { blur: 8, color: '#ffff00', opacity: 0.75 }
  const INNER_EDGE = { blur: 6, color: '#ffffff', opacity: 0.5, source: 'edge' }
  const INNER_CENTRE = { ...INNER_EDGE, source: 'centre' }
  const write = (elem, spec) => fx.writeEffects(elem, spec, new svgCanvas.history.BatchCommand('fx'))
  const filterOf = (elem) => svgCanvas.getElement(/url\(#([^)]+)\)/.exec(elem.getAttribute('filter'))[1])
  const results = (filter) => [...filter.children].map((c) => c.tagName + (c.getAttribute('result') ? `:${c.getAttribute('result')}` : ''))

  describe('filters without glow are unchanged', () => {
    // Output of the composer before glow existed (same jsdom getBBox).
    const SHADOW_ONLY = '<feDropShadow dx="4" dy="4" stdDeviation="2" flood-color="#000" flood-opacity="0.5"></feDropShadow>'
    const OUTLINE_ONLY = '<feMorphology in="SourceAlpha" operator="dilate" radius="3" result="fx_dil"></feMorphology><feFlood flood-color="#fff" flood-opacity="1" result="fx_flood"></feFlood><feComposite in="fx_flood" in2="fx_dil" operator="in" result="fx_outline"></feComposite><feMerge result="fx_outlined"><feMergeNode in="fx_outline"></feMergeNode><feMergeNode in="SourceGraphic"></feMergeNode></feMerge>'
    const BOTH = OUTLINE_ONLY + '<feDropShadow dx="4" dy="4" stdDeviation="2" flood-color="#000" flood-opacity="0.5" in="fx_outlined"></feDropShadow>'

    for (const [name, spec, inner, region] of [
      ['shadow only', { outline: null, shadow: SHADOW }, SHADOW_ONLY, 'x="-2.1568542494923797" y="-2.1568542494923797" width="44.31370849898476" height="44.31370849898476"'],
      ['outline only', { outline: OUTLINE, shadow: null }, OUTLINE_ONLY, 'x="6.5" y="6.5" width="27" height="27"'],
      ['outline + shadow', { outline: OUTLINE, shadow: SHADOW }, BOTH, 'x="-2.1568542494923797" y="-2.1568542494923797" width="44.31370849898476" height="44.31370849898476"']
    ]) {
      it(name, () => {
        const rect = addRect('r')
        write(rect, spec)
        assert.equal(filterOf(rect).outerHTML,
          `<filter id="r_fx" data-fx="1" filterUnits="userSpaceOnUse" ${region}>${inner}</filter>`)
        assert.equal(filterOf(rect).hasAttribute('color-interpolation-filters'), false)
      })
    }

    it('a spec without a glow key still works', () => {
      const rect = addRect('r')
      write(rect, { outline: null, shadow: SHADOW })
      assert.deepEqual(fx.readEffects(rect).glow, { outer: null, inner: null })
    })
  })

  it('an outer glow blurs the silhouette, floods it and merges it under the shape', () => {
    const rect = addRect('r')
    write(rect, { outline: null, shadow: null, glow: { outer: OUTER, inner: null } })
    const filter = filterOf(rect)
    assert.deepEqual(results(filter), [
      'feGaussianBlur:fx_oglow_blur', 'feFlood:fx_oglow_flood', 'feComposite:fx_oglow', 'feMerge:fx_oglowed'
    ])
    assert.equal(filter.getAttribute('color-interpolation-filters'), 'sRGB')
    const blur = filter.children[0]
    assert.equal(blur.getAttribute('in'), 'SourceAlpha')
    assert.equal(blur.getAttribute('stdDeviation'), '4') // σ = blur / 2
    const merge = [...filter.children[3].children].map((n) => n.getAttribute('in'))
    assert.deepEqual(merge, ['fx_oglow', 'SourceGraphic']) // glow underneath
    assert.deepEqual(fx.readEffects(rect).glow, { outer: OUTER, inner: null })
  })

  it('an edge inner glow blurs the inverted alpha; a centre glow blurs the alpha; both clip to the shape', () => {
    const rect = addRect('r')
    write(rect, { outline: null, shadow: null, glow: { outer: null, inner: INNER_EDGE } })
    let filter = filterOf(rect)
    assert.deepEqual(results(filter), [
      'feComponentTransfer:fx_iglow_inv', 'feGaussianBlur:fx_iglow_blur', 'feFlood:fx_iglow_flood',
      'feComposite:fx_iglow_col', 'feComposite:fx_iglow', 'feMerge:fx_iglowed'
    ])
    const func = filter.children[0].firstElementChild
    assert.equal(func.tagName, 'feFuncA')
    assert.equal(func.getAttribute('type'), 'table')
    assert.equal(func.getAttribute('tableValues'), '1 0')
    assert.equal(filter.children[1].getAttribute('in'), 'fx_iglow_inv')
    assert.equal(filter.children[4].getAttribute('in2'), 'SourceAlpha')
    assert.deepEqual([...filter.children[5].children].map((n) => n.getAttribute('in')), ['SourceGraphic', 'fx_iglow']) // on top
    assert.deepEqual(fx.readEffects(rect).glow.inner, INNER_EDGE)

    write(rect, { outline: null, shadow: null, glow: { outer: null, inner: INNER_CENTRE } })
    filter = filterOf(rect)
    assert.equal(filter.querySelector('feComponentTransfer'), null)
    assert.equal(filter.children[0].getAttribute('in'), 'SourceAlpha')
    assert.deepEqual(fx.readEffects(rect).glow.inner, INNER_CENTRE)
  })

  it('outline + outer glow + inner glow + shadow all read back, in chain order', () => {
    const rect = addRect('r')
    const spec = { feather: null, outline: OUTLINE, shadow: SHADOW, glow: { outer: OUTER, inner: INNER_EDGE } }
    write(rect, spec)
    const filter = filterOf(rect)
    assert.deepEqual(fx.readEffects(rect), spec)
    // the outer glow is computed from the outlined alpha and merged under it
    assert.equal(byResult(filter, 'fx_oglow_blur').getAttribute('in'), 'fx_outlined')
    assert.deepEqual([...byResult(filter, 'fx_oglowed').children].map((n) => n.getAttribute('in')), ['fx_oglow', 'fx_outlined'])
    // the inner glow goes over that, and the shadow is cast by the whole stack
    assert.deepEqual([...byResult(filter, 'fx_iglowed').children].map((n) => n.getAttribute('in')), ['fx_oglowed', 'fx_iglow'])
    assert.equal(filter.querySelector('feDropShadow').getAttribute('in'), 'fx_iglowed')
    // the outline is not confused with a glow's flood, nor vice versa
    assert.equal(fx.readEffects(rect).outline.color, '#fff')
    assert.equal(fx.readEffects(rect).glow.outer.color, '#ffff00')
  })

  it('the outline is read from its own flood even when a glow flood comes first', () => {
    const rect = addRect('r')
    write(rect, { outline: OUTLINE, shadow: null, glow: { outer: OUTER, inner: null } })
    const filter = filterOf(rect)
    filter.prepend(filter.querySelector('[result=fx_oglow_flood]')) // a glow flood before the outline's
    assert.deepEqual(fx.readEffects(rect).outline, OUTLINE)
  })

  it('editing another effect keeps the glow (read, mutate one slice, write back)', () => {
    const rect = addRect('r')
    write(rect, { outline: null, shadow: null, glow: { outer: OUTER, inner: INNER_CENTRE } })
    const spec = fx.readEffects(rect)
    spec.shadow = SHADOW
    write(rect, spec)
    assert.deepEqual(fx.readEffects(rect), { feather: null, outline: null, shadow: SHADOW, glow: { outer: OUTER, inner: INNER_CENTRE } })
    const again = fx.readEffects(rect)
    again.shadow = null
    write(rect, again)
    assert.deepEqual(fx.readEffects(rect).glow, { outer: OUTER, inner: INNER_CENTRE })
  })

  it('removing every effect restores a foreign filter the element had', () => {
    const rect = addRect('r')
    const foreign = svgCanvas.addSVGElementsFromJson({ element: 'filter', attr: { id: 'foreign' } })
    svgCanvas.findDefs().append(foreign)
    rect.setAttribute('filter', 'url(#foreign)')
    write(rect, { outline: null, shadow: null, glow: { outer: OUTER, inner: null } })
    assert.equal(rect.getAttribute('filter'), 'url(#r_fx)')
    write(rect, { outline: null, shadow: null, glow: { outer: null, inner: null } })
    assert.equal(rect.getAttribute('filter'), 'url(#foreign)')
    assert.equal(svgCanvas.getElement('r_fx'), null)
  })

  describe('feather', () => {
    const FEATHER = { radius: 10 }

    it('fades the shape by its own blurred alpha, clipped to the shape', () => {
      const rect = addRect('r')
      write(rect, { feather: FEATHER, outline: null, shadow: null })
      const filter = filterOf(rect)
      assert.deepEqual(results(filter), [
        'feGaussianBlur:fx_feather_soft', 'feComposite:fx_feather_mul', 'feComposite:fx_feathered'
      ])
      assert.equal(filter.children[0].getAttribute('in'), 'SourceAlpha')
      assert.equal(filter.children[0].getAttribute('stdDeviation'), '5') // σ = radius / 2
      assert.equal(filter.children[1].getAttribute('in'), 'SourceGraphic')
      assert.equal(filter.children[1].getAttribute('in2'), 'fx_feather_soft')
      assert.equal(filter.children[2].getAttribute('in2'), 'SourceAlpha')
      assert.equal(filter.getAttribute('color-interpolation-filters'), 'sRGB')
      assert.deepEqual(fx.readEffects(rect).feather, FEATHER)
    })

    it('radius 0 or a missing feather is off', () => {
      const rect = addRect('r')
      write(rect, { feather: { radius: 0 }, outline: null, shadow: SHADOW })
      assert.equal(fx.readEffects(rect).feather, null)
      assert.equal(filterOf(rect).hasAttribute('color-interpolation-filters'), false)
    })

    it('the outline, glows and shadow follow the feathered shape', () => {
      const rect = addRect('r')
      const spec = { feather: FEATHER, outline: OUTLINE, shadow: SHADOW, glow: { outer: OUTER, inner: INNER_EDGE } }
      write(rect, spec)
      const filter = filterOf(rect)
      assert.deepEqual(fx.readEffects(rect), spec)
      assert.equal(filter.querySelector('feMorphology').getAttribute('in'), 'fx_feathered')
      assert.deepEqual([...byResult(filter, 'fx_outlined').children].map((n) => n.getAttribute('in')), ['fx_outline', 'fx_feathered'])
      assert.equal(byResult(filter, 'fx_iglow_inv').getAttribute('in'), 'fx_feathered')
      assert.equal(byResult(filter, 'fx_iglow').getAttribute('in2'), 'fx_feathered')
      assert.equal(filter.querySelector('feDropShadow').getAttribute('in'), 'fx_iglowed')
    })

    it('with glows only, the glow bases are the feathered shape', () => {
      const rect = addRect('r')
      write(rect, { feather: FEATHER, outline: null, shadow: null, glow: { outer: OUTER, inner: INNER_CENTRE } })
      const filter = filterOf(rect)
      assert.equal(byResult(filter, 'fx_oglow_blur').getAttribute('in'), 'fx_feathered')
      assert.deepEqual([...byResult(filter, 'fx_oglowed').children].map((n) => n.getAttribute('in')), ['fx_oglow', 'fx_feathered'])
      assert.equal(byResult(filter, 'fx_iglow_blur').getAttribute('in'), 'fx_feathered')
    })

    it('a lone feather and a shadow: the shadow is cast by the feathered shape', () => {
      const rect = addRect('r')
      write(rect, { feather: FEATHER, outline: null, shadow: SHADOW })
      assert.equal(filterOf(rect).querySelector('feDropShadow').getAttribute('in'), 'fx_feathered')
    })

    it('does not change the region, and survives save and reload', () => {
      const rect = addRect('r')
      rect.setAttribute('stroke-width', '0')
      write(rect, { feather: FEATHER, outline: null, shadow: null })
      assert.ok(Math.abs(rect.getBBox().x - Number(filterOf(rect).getAttribute('x'))) < 1e-9)
      assert.ok(svgCanvas.setSvgString(svgCanvas.getSvgString()))
      assert.deepEqual(fx.readEffects(svgCanvas.getElement('r')).feather, FEATHER)
    })
  })

  describe('region', () => {
    const pad = (rect) => {
      const filter = filterOf(rect)
      return rect.getBBox().x - Number(filter.getAttribute('x'))
    }

    it('an outer glow pads by 1.5 × blur (plus stroke)', () => {
      const rect = addRect('r')
      rect.setAttribute('stroke-width', '0')
      write(rect, { outline: null, shadow: null, glow: { outer: OUTER, inner: null } })
      assert.ok(Math.abs(pad(rect) - 12) < 1e-9)
    })

    it('an edge inner glow needs room outside to blur the inverted alpha; a centre glow needs none', () => {
      const rect = addRect('r')
      rect.setAttribute('stroke-width', '0')
      write(rect, { outline: null, shadow: null, glow: { outer: null, inner: INNER_EDGE } })
      assert.ok(Math.abs(pad(rect) - 9) < 1e-9)
      write(rect, { outline: null, shadow: null, glow: { outer: null, inner: INNER_CENTRE } })
      assert.ok(Math.abs(pad(rect)) < 1e-9)
    })

    it('the outer glow reaches past the outline and the shadow', () => {
      const rect = addRect('r')
      rect.setAttribute('stroke-width', '0')
      write(rect, { outline: OUTLINE, shadow: SHADOW, glow: { outer: OUTER, inner: null } })
      const shadowPad = Math.hypot(4, 4) + 2 * 3
      assert.ok(Math.abs(pad(rect) - Math.max(3 + 12, shadowPad + 12)) < 1e-9)
    })

    it('refreshRegion follows a moved element', () => {
      const rect = addRect('r')
      write(rect, { outline: null, shadow: null, glow: { outer: OUTER, inner: null } })
      rect.setAttribute('x', '100')
      fx.refreshRegion(rect)
      assert.ok(Number(filterOf(rect).getAttribute('x')) > 50)
    })
  })

  it('the Blur value of a glow-only element is 0', () => {
    const rect = addRect('r')
    write(rect, { outline: null, shadow: null, glow: { outer: OUTER, inner: INNER_EDGE } })
    assert.equal(svgCanvas.getBlur(rect), 0)
    // a real blur filter still reads back
    const blurred = addRect('b')
    svgCanvas.selectOnly([blurred], true)
    svgCanvas.setBlur(3, true)
    assert.equal(String(svgCanvas.getBlur(blurred)), '3')
  })

  it('undo restores the previous filter after a rebuild and after removal', () => {
    const rect = addRect('r')
    const apply = (spec) => {
      const batch = new svgCanvas.history.BatchCommand('fx')
      fx.writeEffects(rect, spec, batch)
      svgCanvas.addCommandToHistory(batch)
    }
    apply({ outline: null, shadow: SHADOW, glow: { outer: null, inner: null } })
    apply({ outline: null, shadow: SHADOW, glow: { outer: OUTER, inner: null } }) // replaces the filter
    assert.ok(fx.readEffects(rect).glow.outer)
    svgCanvas.undoMgr.undo()
    assert.deepEqual(fx.readEffects(rect), { feather: null, outline: null, shadow: SHADOW, glow: { outer: null, inner: null } })
    apply({ outline: null, shadow: null, glow: { outer: null, inner: null } }) // removes it
    assert.equal(rect.hasAttribute('filter'), false)
    svgCanvas.undoMgr.undo()
    assert.deepEqual(fx.readEffects(rect).shadow, SHADOW)
  })

  it('survives save and reload', () => {
    const text = svgCanvas.addSVGElementsFromJson({ element: 'text', attr: { id: 't', x: 10, y: 30 } })
    text.textContent = 'Neon'
    const rect = addRect('r')
    const spec = { feather: null, outline: OUTLINE, shadow: SHADOW, glow: { outer: OUTER, inner: INNER_EDGE } }
    write(rect, spec)
    write(text, { outline: null, shadow: null, glow: { outer: OUTER, inner: null } })
    const svg = svgCanvas.getSvgString()
    assert.ok(svgCanvas.setSvgString(svg))
    const reRect = svgCanvas.getElement('r')
    const reText = svgCanvas.getElement('t')
    assert.deepEqual(fx.readEffects(reRect), spec)
    assert.deepEqual(fx.readEffects(reText).glow, { outer: OUTER, inner: null })
    assert.equal(filterOf(reRect).getAttribute('color-interpolation-filters'), 'sRGB')
    assert.equal(filterOf(reRect).querySelector('feFuncA').getAttribute('tableValues'), '1 0')
  })

  function byResult (filter, result) {
    return filter.querySelector(`[result=${result}]`)
  }
})
