import { describe, it, expect, beforeEach } from 'vitest'
import { setUserDataAdapter } from '../../../../src/editor/userDataAdapter.js'
import {
  addUserShape, getUserShapesForCategory, getAllUserShapeLabels
} from '../../../../src/editor/extensions/ext-shapes/userShapes.js'

describe('userShapes', () => {
  beforeEach(() => {
    localStorage.clear()
    setUserDataAdapter(null)
  })

  describe('addUserShape', () => {
    it('normalizes the category to lowercase/trimmed but keeps the label as-is', () => {
      addUserShape({
        category: '  My Cats  ',
        label: 'circle heart',
        svgContent: '<rect/>',
        bbox: { x: 0, y: 0, width: 10, height: 10 }
      })
      expect(getUserShapesForCategory('my cats')).toHaveProperty('circle heart')
    })

    it('overwrites an existing shape with the same category + label', () => {
      const opts = { category: 'cats', label: 'circle heart', bbox: { x: 0, y: 0, width: 10, height: 10 } }
      addUserShape({ ...opts, svgContent: '<rect/>' })
      addUserShape({ ...opts, svgContent: '<circle/>' })
      const shapes = getUserShapesForCategory('cats')
      expect(Object.keys(shapes)).toHaveLength(1)
      expect(shapes['circle heart'].svgContent).toBe('<circle/>')
    })
  })

  describe('getAllUserShapeLabels', () => {
    it('returns an empty array when nothing is saved', () => {
      expect(getAllUserShapeLabels()).toEqual([])
    })

    it('collects deduplicated labels across every category', () => {
      addUserShape({ category: 'cats', label: 'circle heart', svgContent: '<rect/>', bbox: { x: 0, y: 0, width: 1, height: 1 } })
      addUserShape({ category: 'balloons', label: 'circle balloon', svgContent: '<rect/>', bbox: { x: 0, y: 0, width: 1, height: 1 } })
      // Same label reused in a different category — should appear only once.
      addUserShape({ category: 'balloons', label: 'circle heart', svgContent: '<rect/>', bbox: { x: 0, y: 0, width: 1, height: 1 } })

      const labels = getAllUserShapeLabels()
      expect(labels.sort()).toEqual(['circle balloon', 'circle heart'])
    })
  })
})
