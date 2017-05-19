const mat4 = require('gl-mat4')
const NUM_FLAMES = 8

module.exports = function initParticles ({
  regl,
  numPoints,
  histogram
}) {
  const projection = new Float32Array(16)
  const view = new Float32Array(16)

  const FLAME_UNIFORMS = {
    projection: ({viewportWidth, viewportHeight}) =>
      mat4.perspective(projection,
        Math.PI / 4,
        viewportWidth / viewportHeight,
        0.001,
        1000.0),
    view: (_, {cameraEye, cameraCenter}) =>
      mat4.lookAt(view,
        cameraEye,
        cameraCenter,
        [0, 1, 0]),
    mixRate: regl.prop('mixRate'),
    globalSeed: () => Math.random()
  }

  for (let i = 0; i < NUM_FLAMES; ++i) {
    FLAME_UNIFORMS['colors[' + i + ']'] = regl.prop('colors[' + i + ']')
    FLAME_UNIFORMS['transform[' + i + ']'] = regl.prop('transforms[' + i + ']')
    FLAME_UNIFORMS['weight[' + i + ']'] = ((i) => (_, {weights}) => {
      var wtotal = 0
      var wpartial = 0
      for (var j = 0; j < NUM_FLAMES; ++j) {
        if (j <= i) {
          wpartial += weights[j]
        }
        wtotal += weights[j]
      }
      return wpartial / wtotal
    })(i)
  }

  const draw = regl({
    framebuffer: histogram.fbo,

    frag: `
    precision highp float;
    varying vec3 vcolor;
    void main () {
      gl_FragColor = vec4(vcolor, 1);
    }
    `,

    vert: `
    precision highp float;

    #define N ${NUM_FLAMES}
    #define TAU ${2.0 * Math.PI}
    #define PI ${Math.PI}

    attribute float initSeed;

    uniform mat4 projection, view, transform[N];
    uniform float globalSeed, mixRate, weight[N - 1];
    uniform vec3 colors[N];

    varying vec3 vcolor;

    vec3 flame0 (vec3 p) {
      return sin(p);
    }

    vec3 flame1 (vec3 p) {
      return 0.73 * normalize(p);
    }

    vec3 flame2 (vec3 p) {
      float theta = atan(p.z, p.y);
      float r = length(p.yz);
      theta += PI * r * abs(p.x);
      return vec3(p.x, r * cos(theta), r * sin(theta));
    }

    vec3 flame3 (vec3 p) {
      float theta = atan(p.y, p.x);
      float r = length(p.xy);
      return vec3(cos(theta) + sin(r), sin(theta) - cos(r), r * r * p.z) / r;
    }

    vec3 flame4 (vec3 p) {
      return p.zxy / (length(p) + 1.);
    }

    vec3 flame5 (vec3 p) {
      return p;
    }

    vec3 flame6 (vec3 p) {
      float theta = atan(p.z, p.x);
      float r = length(p.xz);
      theta += 10.0 * p.y;
      return vec3(r * cos(theta), p.y, r * sin(theta));
    }

    vec3 flame7 (vec3 p) {
      return p / dot(p, p);
    }

    /*
    vec3 flame0 (vec3 p) {
      return p;
    }
    vec3 flame1 (vec3 p) {
      return p;
    }
    vec3 flame2 (vec3 p) {
      return p;
    }
    vec3 flame3 (vec3 p) {
      return p;
    }
    vec3 flame4 (vec3 p) {
      return p;
    }
    vec3 flame5 (vec3 p) {
      return p;
    }
    vec3 flame6 (vec3 p) {
      return p;
    }
    vec3 flame7 (vec3 p) {
      return p;
    }
    */

    vec3 flameFinal (vec3 p) {
      float l = 0.25 * dot(p, p);
      float b = step(l, 1.0);
      return mix(p / l, p, b);
    }

    struct FlameState {
      vec3 position;
      vec3 color;
    };

    void flameStep (inout FlameState state, float seed) {
      float s0 = step(seed, weight[0]);
      float s1 = step(seed, weight[1]);
      float s2 = step(seed, weight[2]);
      float s3 = step(seed, weight[3]);
      float s4 = step(seed, weight[4]);
      float s5 = step(seed, weight[5]);
      float s6 = step(seed, weight[6]);

      float w0 = s0;
      float w1 = s1 - s0;
      float w2 = s2 - s1;
      float w3 = s3 - s2;
      float w4 = s4 - s3;
      float w5 = s5 - s4;
      float w6 = s6 - s5;
      float w7 = 1.0 - s6;

      vec3 po = state.position;
      vec3 c = state.color;

      vec4 pc = (
        w0 * transform[0] +
        w1 * transform[1] +
        w2 * transform[2] +
        w3 * transform[3] +
        w4 * transform[4] +
        w5 * transform[5] +
        w6 * transform[6] +
        w7 * transform[7]) * vec4(po, 1);

      vec3 p = pc.xyz / pc.w;

      state.position = flameFinal(
        w0 * flame0(p) +
        w1 * flame1(p) +
        w2 * flame2(p) +
        w3 * flame3(p) +
        w4 * flame4(p) +
        w5 * flame5(p) +
        w6 * flame6(p) +
        w7 * flame7(p));

      state.color = mix(c,
        w0 * colors[0] +
        w1 * colors[1] +
        w2 * colors[2] +
        w3 * colors[3] +
        w4 * colors[4] +
        w5 * colors[5] +
        w6 * colors[6] +
        w7 * colors[7],
        mixRate);
    }


    float hash2 (float x, float y){
      vec4 dx =
        fract(x * vec4(1., 64., 4096., 262144.)) +
        vec4(0.1, 0.3357, 0.4871, 0.231);
      vec4 dy =
        fract(y * vec4(1., 64., 4096., 262144.)) +
        vec4(0.3, 0.05, 0.24758, 0.11911);

      return fract(dot(vec4(1), 1. / dx + 1. / dy));
    }

    float hash1 (float x) {
      vec4 dx =
        fract(x * vec4(1., 64., 4096., 262144.)) +
        vec4(0.1, 0.3357, 0.4871, 0.231);
      return fract(dot(vec4(1), 1. / dx));
    }

    void main () {
      float seed0 = hash2(initSeed, globalSeed);
      float seed1 = hash1(seed0);
      float seed2 = hash1(seed1);

      FlameState state;
      state.position = 2. * vec3(seed0, seed1, seed2) - 1.;
      state.color = vec3(1, 1, 1);

      float seed = seed2;
      for (int i = 0; i < 20; ++i) {
        seed = hash2(seed, globalSeed);
        flameStep(state, seed);
      }

      vcolor = state.color;
      vec4 pclip = projection * view * vec4(state.position, 1);
      gl_PointSize = 1.;
      gl_Position = pclip;
    }
    `,

    uniforms: FLAME_UNIFORMS,

    blend: {
      enable: true,
      func: {
        src: '1',
        dst: '1'
      },
      equation: 'add'
    },

    depth: {
      enable: false,
      mask: false
    },

    attributes: {
      initSeed: (() => {
        const data = new Float32Array(numPoints)
        for (let i = 0; i < numPoints; ++i) {
          data[i] = Math.random()
        }
        return data
      })()
    },
    count: numPoints,
    primitive: 'points',
    elements: null
  })

  return {
    draw
  }
}
