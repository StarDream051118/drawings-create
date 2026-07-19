export const vertexSource = `
  attribute vec4 vertPos;
  attribute vec2 texCoord;
  attribute vec3 normal;
  attribute vec4 texLimit;

  attribute vec4 iModelRow0;
  attribute vec4 iModelRow1;
  attribute vec4 iModelRow2;
  attribute vec4 iModelRow3;
  attribute vec2 iScrollOffset;

  uniform mat4 mView;
  uniform mat4 mProj;

  varying highp vec2 vTexCoord;
  varying highp vec2 vScrollOffset;
  varying highp vec4 vTexLimit;
  varying highp float vLighting;

  void main(void) {
    mat4 modelMatrix = mat4(iModelRow0, iModelRow1, iModelRow2, iModelRow3);
    vec4 worldPos = modelMatrix * vertPos;
    gl_Position = mProj * mView * worldPos;
    vTexCoord = texCoord;
    vScrollOffset = iScrollOffset;
    vTexLimit = texLimit;
    vec3 worldNormal = mat3(modelMatrix) * normal;
    vLighting = worldNormal.y * 0.2 + abs(worldNormal.z) * 0.1 + 0.8;
  }
`;

export const fragmentSource = `
  precision highp float;
  varying highp vec2 vTexCoord;
  varying highp vec2 vScrollOffset;
  varying highp float vLighting;

  uniform sampler2D beltSampler;
  uniform vec4 beltTexLimit;

  void main(void) {
    vec2 beltUV = (vTexCoord - beltTexLimit.xy) / (beltTexLimit.zw - beltTexLimit.xy) + vScrollOffset.xy;
    vec4 texColor = texture2D(beltSampler, beltUV);
    if (texColor.a < 0.1) discard;
    gl_FragColor = vec4(texColor.xyz * vLighting, texColor.a);
  }
`;

export const fragmentSourceDiagonal = `
  precision highp float;
  varying highp vec2 vTexCoord;
  varying highp vec2 vScrollOffset;
  varying highp float vLighting;

  uniform sampler2D beltDiagonalSampler;
  uniform vec4 beltDiagonalTexLimit;

  void main(void) {
    vec2 beltUV = (vTexCoord - beltDiagonalTexLimit.xy) / (beltDiagonalTexLimit.zw - beltDiagonalTexLimit.xy) + vScrollOffset.xy;
    vec4 texColor = texture2D(beltDiagonalSampler, beltUV);
    if (texColor.a < 0.1) discard;
    gl_FragColor = vec4(texColor.xyz * vLighting, texColor.a);
  }
`;
