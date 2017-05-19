module.exports = function initBigTriangle ({regl}) {
  return {
    vert: `
    precision highp float;
    attribute vec2 position;
    varying vec2 uv;
    void main () {
      uv = 0.5 * (1. + position);
      gl_Position = vec4(position, 0, 1);
    }
    `,
    attributes: {
      position: regl.buffer([
        -4, 0,
        4, 4,
        4, -4
      ])
    },
    elements: null,
    count: 3,
    primitive: 'triangles'
  }
}
