module.exports = function initHistogram ({
  regl,
  res,
  bigTriangle,
  noiseTexture
}) {
  let _current = 0
  const histograms = [0, 0].map(() => regl.framebuffer({
    color: regl.texture({
      radius: res,
      type: 'float',
      wrap: 'clamp',
      min: 'linear',
      mag: 'linear'
    }),
    depthStencil: false
  }))

  function currentHistogram () {
    return histograms[_current]
  }

  const drawHistogram = regl(Object.assign({
    frag: `
    precision highp float;
    varying vec2 uv;
    uniform sampler2D flameHistogram;
    uniform float brightness;
    uniform vec2 resolution;
    void main () {
      vec4 color =  texture2D(flameHistogram, uv);
      float alpha = 0.25 * color.a + 1.;
      float scale = pow(brightness * log(alpha), 1. / 2.2);
      gl_FragColor = vec4(
        scale * color.rgb / max(color.a, 1.0),
        1.);
    }
    `,

    uniforms: {
      brightness: regl.prop('brightness'),
      flameHistogram: ({viewportWidth, viewportHeight}) =>
        histograms[_current].resize(viewportWidth, viewportHeight),
      resolution: ({viewportWidth, viewportHeight}) =>
        [viewportWidth, viewportHeight]
    }
  }, bigTriangle))

  const filterHistogram = regl(Object.assign({
    framebuffer: currentHistogram,

    frag: `
    precision highp float;
    #define RADIUS    2
    #define DIAMETER  (2 * RADIUS + 1)
    #define N         (DIAMETER * DIAMETER)
    varying vec2 uv;
    uniform sampler2D histogram;
    uniform vec2 resolution;
    uniform float decay;
    void main () {
      vec4 table[N];
      for (int i = 0; i < DIAMETER; ++i) {
        for (int j = 0; j < DIAMETER; ++j) {
          int dx = i - RADIUS;
          int dy = j - RADIUS;
          table[DIAMETER * i + j] = texture2D(histogram, uv + vec2(dx, dy) / resolution);
        }
      }

      float nsamples = 0.0;
      for (int i = 0; i < N; ++i) {
        nsamples += table[i].a;
      }

      float k = 0.1 * sqrt(nsamples);

      vec4 result = vec4(0);
      float w = 0.0;
      for (int i = 0; i < DIAMETER; ++i) {
        for (int j = 0; j < DIAMETER; ++j) {
          int dx = i - RADIUS;
          int dy = j - RADIUS;
          float r = float(dx * dx + dy * dy);
          float wr = exp(-k * r);
          result += wr * table[DIAMETER * i + j];
          w += wr;
        }
      }

      gl_FragColor = (decay / w) * result;
    }
    `,

    uniforms: {
      decay: regl.prop('decay'),
      histogram: () => histograms[_current ^ 1],
      resolution: ({viewportWidth, viewportHeight}) =>
        [viewportWidth, viewportHeight]
    }
  }, bigTriangle))

  return {
    fbo: currentHistogram,
    draw: drawHistogram,
    filter: function (props) {
      _current ^= 1
      filterHistogram(props)
    }
  }
}
