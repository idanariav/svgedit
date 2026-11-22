import { describe, it, expect, beforeEach } from 'vitest'
import { setUserDataAdapter } from '../../../../src/editor/userDataAdapter.ts'
import {
  addUserShape, getUserShapesForCategory, getAllUserShapeLabels, getUserCategoryForLabel,
  setUserShapeAliases, getAllUserShapeAliases, renameUserShape, moveUserShape, loadUserShapes
} from '../../../../src/editor/extensions/ext-shapes/userShapes.ts'

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

  describe('getUserCategoryForLabel', () => {
    const bbox = { x: 0, y: 0, width: 1, height: 1 }

    it('returns the category a label is saved in', () => {
      addUserShape({ category: 'People', label: 'person', svgContent: '<rect/>', bbox })
      expect(getUserCategoryForLabel('person')).toBe('people')
    })

    it('returns the first category when the label is reused', () => {
      addUserShape({ category: 'people', label: 'person', svgContent: '<rect/>', bbox })
      addUserShape({ category: 'icons', label: 'person', svgContent: '<rect/>', bbox })
      expect(getUserCategoryForLabel('person')).toBe('people')
    })

    it('returns null for an unknown label', () => {
      expect(getUserCategoryForLabel('nobody')).toBeNull()
    })
  })

  describe('aliases', () => {
    const bbox = { x: 0, y: 0, width: 1, height: 1 }
    const add = (extra = {}) => addUserShape({ category: 'nature', label: 'stone', svgContent: '<rect/>', bbox, ...extra })

    it('saves cleaned aliases: trimmed, no blanks, deduped case-insensitively, never the label itself', () => {
      add({ aliases: [' rock ', '', 'Boulder', 'boulder', 'STONE', 'rock'] })
      expect(getUserShapesForCategory('nature').stone.aliases).toEqual(['rock', 'Boulder'])
    })

    it('omits the aliases field when none are given', () => {
      add()
      add({ category: 'more', aliases: [' ', ''] })
      expect(getUserShapesForCategory('nature').stone).not.toHaveProperty('aliases')
      expect(getUserShapesForCategory('more').stone).not.toHaveProperty('aliases')
    })

    it('setUserShapeAliases replaces the aliases, and an empty list removes them', () => {
      add({ aliases: ['rock'] })
      setUserShapeAliases({ category: 'nature', label: 'stone', aliases: ['pebble', ' boulder '] })
      expect(getUserShapesForCategory('nature').stone.aliases).toEqual(['pebble', 'boulder'])
      setUserShapeAliases({ category: 'nature', label: 'stone', aliases: [''] })
      expect(getUserShapesForCategory('nature').stone).not.toHaveProperty('aliases')
    })

    it('setUserShapeAliases is a no-op for a missing shape', () => {
      setUserShapeAliases({ category: 'nature', label: 'nothing', aliases: ['x'] })
      expect(loadUserShapes().categories).toEqual([])
    })

    it('keeps aliases when a shape is renamed or moved', () => {
      add({ aliases: ['rock'] })
      renameUserShape({ category: 'nature', oldLabel: 'stone', newLabel: 'pebble' })
      moveUserShape({ category: 'nature', label: 'pebble', toCategory: 'garden' })
      expect(getUserShapesForCategory('garden').pebble.aliases).toEqual(['rock'])
    })

    it('getAllUserShapeAliases maps each label to its aliases, merged across categories', () => {
      add({ aliases: ['rock'] })
      add({ category: 'garden', aliases: ['Rock', 'boulder'] })
      addUserShape({ category: 'garden', label: 'tree', svgContent: '<rect/>', bbox })
      expect(getAllUserShapeAliases()).toEqual({ stone: ['rock', 'boulder'], tree: [] })
    })

    it('drops malformed aliases from stored data on load', () => {
      localStorage.setItem('svg-edit-user-shapes', JSON.stringify({
        categories: ['nature'],
        shapes: {
          nature: {
            stone: { svgContent: '<rect/>', bbox, aliases: ['rock', 7, null, ' rock '] },
            tree: { svgContent: '<rect/>', bbox, aliases: 'oak' }
          }
        }
      }))
      const { nature } = loadUserShapes().shapes
      expect(nature.stone.aliases).toEqual(['rock'])
      expect(nature.tree).not.toHaveProperty('aliases')
    })
  })
})
