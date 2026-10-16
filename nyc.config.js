module.exports = {
  statements: 45,
  branches: 34,
  lines: 46,
  functions: 45,
  excludeNodeModules: true,
  extension: ['.js', '.ts'],
  include: [
    'src/**',
    'packages/svgcanvas/**'
  ],
  reporter: [
    'json-summary',
    'text',
    'html'
  ]
}
