const hsl2rgb = require('float-hsl2rgb')

const FLAME_HISTOGRAM_RES = 512
const NUM_POINTS = 1e6
const FRAME_STEPS = 1

const regl = require('regl')({
  pixelRatio: 0.5,
  extensions: [
    'OES_texture_float',
    'OES_texture_float_linear',
    'WEBGL_draw_buffers'
  ]
})

const bigTriangle = require('./big-triangle')({
  regl
})
const histogram = require('./histogram')({
  regl,
  res: FLAME_HISTOGRAM_RES,
  bigTriangle
})
const chaos = require('./chaos')({
  regl,
  numPoints: NUM_POINTS,
  histogram
})

const state = {
  cameraEye: [3, 0, 0],
  cameraCenter: [0, 0, 0],
  mixRate: 0.8,
  brightness: 1,
  decay: 0.9,
  hueBase: Math.random(),
  hueOffset: Math.random(),
  saturation: [
    Math.random(),
    Math.random(),
    Math.random(),
    Math.random(),
    Math.random(),
    Math.random(),
    Math.random(),
    Math.random()
  ],
  colors: new Array(8),
  transforms: (() => {
    const result = new Array(8)
    for (var i = 0; i < 8; ++i) {
      result[i] = new Float32Array(16)
      for (var j = 0; j < 16; ++j) {
        result[i][j] += 4 * (Math.random() - 0.5)
      }
    }
    return result
  })(),
  weights: (() => {
    const result = new Array(8)
    for (var i = 0; i < 8; ++i) {
      result[i] = 1
    }
    return result
  })()
}

var target = randomizeTarget()

function randomizeTarget () {
  return {
    mixRate:
      (Math.random() > 0.5)
      ? state.mixRate
      : 0.5 + 0.5 * Math.random(),
    brightness:
      (Math.random() > 0.5)
      ? state.brightness
      : 0.75 + 0.25 * Math.random(),
    decay:
      (Math.random() > 0.5)
      ? state.decay
      : 0.8 + 0.2 * Math.random(),
    hueBase:
      (Math.random() > 0.5)
      ? state.hueBase
      : Math.random(),
    hueOffset:
      (Math.random() > 0.25)
      ? state.hueOffset
      : 0.5 * Math.random(),
    saturation: (() => {
      const result = state.saturation.slice()
      for (var i = 0; i < 8; ++i) {
        if (Math.random() > 0.5) {
          result[i] = Math.random()
        }
      }
      return result
    })(),
    transforms: (() => {
      const result = new Array(8)
      for (var i = 0; i < 8; ++i) {
        const t = new Float32Array(16)
        for (var j = 0; j < 16; ++j) {
          if (Math.random() > 0.5) {
            t[j] = 4.0 * (Math.random() - 0.5)
          } else {
            t[j] = state.transforms[i][j]
          }
        }
        result[i] = t
      }
      return result
    })(),
    weights: (() => {
      const result = new Array(8)
      for (var i = 0; i < 8; ++i) {
        if (Math.random() > 0.5) {
          result[i] = state.weights[i]
        } else {
          result[i] = Math.random() * Math.random()
        }
      }
      return result
    })()
  }
}

const SCALAR_PROPS = [
  'mixRate',
  'brightness',
  'decay',
  'hueBase',
  'hueOffset'
]

const VECTOR_PROPS = [
  'weights',
  'saturation'
]

const MATRIX_PROPS = [
  'transforms'
]

function stepRate (s, t, r) {
  const ri = 1 - r
  return ri * s + r * t

  if (s < t) {
    return Math.min(t, s + r)
  } else {
    return Math.max(t, s - r)
  }
}

function interpolateStep (r) {
  var i, j, k
  var d = 0.0

  for (i = 0; i < SCALAR_PROPS.length; ++i) {
    const prop = SCALAR_PROPS[i]
    const s = state[prop]
    const t = target[prop]
    state[prop] = stepRate(s, t, r)
    d = Math.max(Math.abs(s - t), 0.25 * d)
  }

  for (i = 0; i < VECTOR_PROPS.length; ++i) {
    const prop = VECTOR_PROPS[i]
    const sv = state[prop]
    const tv = target[prop]
    for (j = 0; j < sv.length; ++j) {
      const s = sv[j]
      const t = tv[j]
      sv[j] = stepRate(s, t, r)
      d = Math.max(d, Math.abs(s - t))
    }
  }

  for (i = 0; i < MATRIX_PROPS.length; ++i) {
    const prop = MATRIX_PROPS[i]
    const sm = state[prop]
    const tm = target[prop]
    for (j = 0; j < sm.length; ++j) {
      const sv = sm[j]
      const tv = tm[j]
      for (k = 0; k < sv.length; ++k) {
        const s = sv[k]
        const t = tv[k]
        sv[k] = stepRate(s, t, r)
        d = Math.max(d, Math.abs(s - t))
      }
    }
  }

  return d
}

function updateColors () {
  const colors = state.colors
  const hueBase = state.hueBase
  const hueOffset = state.hueOffset
  const saturation = state.saturation
  for (var i = 0; i < 8; ++i) {
    colors[i] = hsl2rgb([(hueBase + hueOffset * i) % 1, saturation[i], 0.5])
  }
}

function cameraPath (t) {
  const r = 1 + Math.abs(Math.sin(2 * t))
  return [
    r * Math.cos(t),
    2 * Math.sin(0.25 * t + 1),
    r * Math.sin(t)
  ]
}

regl.frame(({tick}) => {
  const t = 0.005 * tick

  state.cameraEye = cameraPath(t)
  state.cameraCenter = cameraPath(t + 1.0)
  const s = 0.25 * Math.pow(Math.sin(0.1 * t), 2)
  for (var k = 0; k < 3; ++k) {
    state.cameraCenter[k] *= s
  }

  const d = interpolateStep(0.01)
  if (d < 0.01) {
    target = randomizeTarget()
  }
  updateColors()
  for (var i = 0; i < FRAME_STEPS; ++i) {
    chaos.draw(state)
  }
  histogram.filter(state)
  histogram.draw(state)
})
