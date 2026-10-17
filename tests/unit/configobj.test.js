import ConfigObj, { regexEscape } from '../../src/editor/ConfigObj.ts'

describe('ConfigObj', () => {
  const stubEditor = () => ({
    storage: {
      map: new Map(),
      getItem (k) { return this.map.get(k) },
      setItem (k, v) { this.map.set(k, v) }
    },
    loadFromDataURI: vi.fn(),
    loadFromString: vi.fn(),
    loadFromURL: vi.fn()
  })

  it('escapes regex characters', () => {
    expect(regexEscape('a+b?')).toBe('a\\+b\\?')
  })

  it('seeds the pencil config from the stored preferences, clamped, and keeps defaults when none', () => {
    const cfg = new ConfigObj(stubEditor())
    cfg.setupCurConfig()
    cfg.seedPencilConfigFromPrefs()
    expect(cfg.curConfig.pencilStabilization).toBe(0.3)
    expect(cfg.curConfig.pencilFidelity).toBe(2)

    cfg.pref('pencil_stabilization', '55', true)
    cfg.pref('pencil_fidelity', '4.5', true)
    cfg.seedPencilConfigFromPrefs()
    expect(cfg.curConfig.pencilStabilization).toBe(0.55)
    expect(cfg.curConfig.pencilFidelity).toBe(4.5)

    cfg.pref('pencil_stabilization', '400', true)
    cfg.pref('pencil_fidelity', '0', true)
    cfg.seedPencilConfigFromPrefs()
    expect(cfg.curConfig.pencilStabilization).toBe(0.95)
    expect(cfg.curConfig.pencilFidelity).toBe(0.5)
  })

  describe('disabledFeatures', () => {
    it('leaves the named built-ins out of the defaults, with or without the ext- prefix', () => {
      const cfg = new ConfigObj(stubEditor())
      cfg.setConfig({ disabledFeatures: ['opensave', 'ext-grid'] })
      cfg.setupCurConfig()
      expect(cfg.curConfig.extensions).not.toContain('ext-opensave')
      expect(cfg.curConfig.extensions).not.toContain('ext-grid')
      expect(cfg.curConfig.extensions).toContain('ext-connector')
      expect(cfg.curConfig.extensions.length).toBe(cfg.defaultExtensions.length - 2)
    })

    it('keeps every default when nothing is disabled, and ignores names that are not built in', () => {
      const cfg = new ConfigObj(stubEditor())
      cfg.setupCurConfig()
      expect(cfg.curConfig.extensions).toEqual(cfg.defaultExtensions)
      const other = new ConfigObj(stubEditor())
      other.setConfig({ disabledFeatures: ['nope'] })
      other.setupCurConfig()
      expect(other.curConfig.extensions).toEqual(other.defaultExtensions)
    })

    it('also removes the names from an explicit extensions list', () => {
      const cfg = new ConfigObj(stubEditor())
      cfg.setConfig({ noDefaultExtensions: true, extensions: ['ext-grid', 'ext-shapes'], disabledFeatures: ['shapes'] })
      cfg.setupCurConfig()
      expect(cfg.curConfig.extensions).toEqual(['ext-grid'])
    })
  })

  it('merges defaults and respects allowInitialUserOverride', () => {
    const editor = stubEditor()
    const cfg = new ConfigObj(editor)
    cfg.setConfig({ gridSnapping: true, userExtensions: ['custom'] })
    cfg.setupCurConfig()

    expect(cfg.curConfig.gridSnapping).toBe(true)
    expect(cfg.curConfig.extensions).toContain('ext-grid')
    expect(cfg.curConfig.extensions.includes('custom') || cfg.curConfig.userExtensions.includes('custom')).toBe(true)

    cfg.setConfig({ lang: 'fr' }, { allowInitialUserOverride: true })
    expect(cfg.defaultPrefs.lang).toBe('fr')
  })

  it('does not read configuration or content from the page URL', () => {
    const editor = stubEditor()
    const cfg = new ConfigObj(editor)
    const before = window.location.href
    window.history.replaceState({}, '', '/?extensions=ext-x&dimensions=1,2&bkgd_color=ff0000&source=%3Csvg%2F%3E&url=a.svg')
    try {
      cfg.load()
    } finally {
      window.history.replaceState({}, '', before)
    }
    expect(cfg.curConfig.extensions).not.toContain('ext-x')
    expect(cfg.curConfig.dimensions).toEqual([640, 480])
    expect(cfg.pref('bkgd_color')).not.toBe('#ff0000')
    expect(editor.loadFromString).not.toHaveBeenCalled()
    expect(editor.loadFromDataURI).not.toHaveBeenCalled()
    expect(editor.loadFromURL).not.toHaveBeenCalled()
  })

  it('ignores the retired URL-fencing options', () => {
    const cfg = new ConfigObj(stubEditor())
    cfg.setConfig({ preventAllURLConfig: true, lockExtensions: true, allowedOrigins: ['*'] })
    expect(cfg.curConfig).not.toHaveProperty('preventAllURLConfig')
    expect(cfg.curConfig).not.toHaveProperty('lockExtensions')
    expect(cfg.curConfig).not.toHaveProperty('allowedOrigins')
  })
})
