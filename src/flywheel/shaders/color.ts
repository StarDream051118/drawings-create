export const vertexSource = `
  attribute vec4 vertPos;
  attribute vec3 vertColor;

  attribute vec4 iModelRow0;
  attribute vec4 iModelRow1;
  attribute vec4 iModelRow2;
  attribute vec4 iModelRow3;

  uniform mat4 mView;
  uniform mat4 mProj;

  varying highp vec3 vColor;

  void main(void) {
    mat4 modelMatrix = mat4(iModelRow0, iModelRow1, iModelRow2, iModelRow3);
    vec4 worldPos = modelMatrix * vertPos;
    gl_Position = mProj * mView * worldPos;
    vColor = vertColor;
  }
`;

export const fragmentSource = `
  precision highp float;
  varying highp vec3 vColor;
  uniform highp float uAlpha;

  void main(void) {
    gl_FragColor = vec4(vColor, uAlpha);
  }
`;
