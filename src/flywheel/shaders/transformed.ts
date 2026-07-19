export const vertexSource = `
  attribute vec4 vertPos;
  attribute vec2 texCoord;
  attribute vec3 normal;

  // Instance attributes (16 floats for mat4)
  attribute vec4 iModelRow0;
  attribute vec4 iModelRow1;
  attribute vec4 iModelRow2;
  attribute vec4 iModelRow3;

  uniform mat4 mView;
  uniform mat4 mProj;

  varying highp vec2 vTexCoord;
  varying highp float vLighting;

  void main(void) {
    mat4 modelMatrix = mat4(iModelRow0, iModelRow1, iModelRow2, iModelRow3);
    vec4 worldPos = modelMatrix * vertPos;
    gl_Position = mProj * mView * worldPos;
    vTexCoord = texCoord;

    vec3 worldNormal = mat3(modelMatrix) * normal;
    vLighting = worldNormal.y * 0.2 + abs(worldNormal.z) * 0.1 + 0.8;
  }
`;

export const fragmentSource = `
  precision highp float;
  varying highp vec2 vTexCoord;
  varying highp float vLighting;

  uniform sampler2D sampler;

  void main(void) {
    vec4 texColor = texture2D(sampler, vTexCoord);
    if(texColor.a < 0.1) discard;
    gl_FragColor = vec4(texColor.xyz * vLighting, texColor.a);
  }
`;
