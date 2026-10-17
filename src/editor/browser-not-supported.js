// browser-not-supported.js — Redirects to `browser-not-supported.html` when the browser has no SVG support
const supportsSvg = function () {
  return Boolean(document.createElementNS && document.createElementNS('http://www.w3.org/2000/svg', 'svg').createSVGRect)
}

if (!supportsSvg()) {
  window.location.href = './browser-not-supported.html'
}
export {}
