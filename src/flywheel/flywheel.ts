import type { mat4 } from 'gl-matrix';
import { Mesh } from 'deepslate/render';
import { ShaderProgram } from 'deepslate/render';
import type { Instance } from './api/instance/instance';
import type { Instancer } from './api/instance/instancer';
import type { InstanceType } from './api/instance/instanceType';
import type { InstancerProvider } from './api/visualization/visualizationContext';
import { InstancerImpl } from './backend/instancing/instancerImpl';

interface ExtendedMesh extends Mesh {
  colorOnly?: boolean;
  colorAlpha?: number;
  lineWidth?: number;
}

const VS_TRANSFORMED = `
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
    // Transpose if needed? GLSL is col-major. gl-matrix is col-major. 
    // If we write floats directly, we write cols.
    // But attributes approach typically loads rows if using 4 vec4s?
    // Actually, it depends on how we set vertexAttribPointer.
    // Let's assume standard column-vectors.
    
    vec4 worldPos = modelMatrix * vertPos;
    gl_Position = mProj * mView * worldPos;
    vTexCoord = texCoord;
    
    vec3 worldNormal = mat3(modelMatrix) * normal; // Simplified
    vLighting = worldNormal.y * 0.2 + abs(worldNormal.z) * 0.1 + 0.8;
  }
`;

const FS_TRANSFORMED = `
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

const VS_LINES = `
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

const FS_LINES = `
  precision highp float;
  varying highp vec3 vColor;

  void main(void) {
    gl_FragColor = vec4(vColor, 1.0);
  }
`;

const VS_COLOR = `
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

const FS_COLOR = `
  precision highp float;
  varying highp vec3 vColor;
  uniform highp float uAlpha;

  void main(void) {
    gl_FragColor = vec4(vColor, uAlpha);
  }
`;

const VS_BELT_SCROLL = `
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

const FS_BELT_SCROLL = `
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

const FS_BELT_DIAGONAL_SCROLL = `
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

export class Flywheel implements InstancerProvider {
  private readonly instancers: Map<string, InstancerImpl<Instance>> = new Map();
  private readonly shader: ShaderProgram;
  private readonly lineShader: ShaderProgram;
  private readonly colorShader: ShaderProgram;
  private readonly beltScrollShader: ShaderProgram;
  private readonly beltDiagonalScrollShader: ShaderProgram;
  private texture: WebGLTexture | null = null;
  private beltTexture: WebGLTexture | null = null;
  private beltDiagonalTexture: WebGLTexture | null = null;
  private beltTexLimit: [number, number, number, number] = [0, 0, 1, 1];
  private beltDiagonalTexLimit: [number, number, number, number] = [0, 0, 1, 1];
  private beltDiagonalTexLimitBase: [number, number, number, number] = [0, 0, 1, 1];
  private beltBottomTexture: WebGLTexture | null = null;
  private beltBottomTexLimit: [number, number, number, number] = [0, 0, 1, 1];
  private beltBottomTexLimitBase: [number, number, number, number] = [0, 0, 1, 1];

  constructor (private readonly gl: WebGL2RenderingContext) {
    this.shader = new ShaderProgram(gl, VS_TRANSFORMED, FS_TRANSFORMED);
    this.lineShader = new ShaderProgram(gl, VS_LINES, FS_LINES);
    this.colorShader = new ShaderProgram(gl, VS_COLOR, FS_COLOR);
    this.beltScrollShader = new ShaderProgram(gl, VS_BELT_SCROLL, FS_BELT_SCROLL);
    this.beltDiagonalScrollShader = new ShaderProgram(gl, VS_BELT_SCROLL, FS_BELT_DIAGONAL_SCROLL);
  }

  setTexture (texture: WebGLTexture) {
    this.texture = texture;
  }

  setBeltTexture (texture: WebGLTexture) {
    this.beltTexture = texture;
  }

  setBeltDiagonalTexture (texture: WebGLTexture) {
    this.beltDiagonalTexture = texture;
  }

  setBeltBottomTexture (texture: WebGLTexture) {
    this.beltBottomTexture = texture;
  }

  setBeltTexLimit (u0: number, v0: number, u1: number, v1: number) {
    this.beltTexLimit = [u0, v0, u1, v1];
  }

  setBeltDiagonalTexLimit (u0: number, v0: number, u1: number, v1: number) {
    this.beltDiagonalTexLimit = [u0, v0, u1, v1];
  }

  /** 设置 create:block/belt_diagonal_scroll 在图集中的基准包围盒（只调用一次） */
  setBeltDiagonalTexLimitBase (u0: number, v0: number, u1: number, v1: number) {
    this.beltDiagonalTexLimitBase = [u0, v0, u1, v1];
    this.beltDiagonalTexLimit = [u0, v0, u1, v1];
  }

  /**
   * 按 belt_diagonal_scroll.png 自身的 [0,1] 纹理 UV 来设置截取范围
   * @example
   *   flywheel.setBeltDiagonalUV(0, 0, 1, 1);        // 整张纹理
   *   flywheel.setBeltDiagonalUV(0.25, 0.25, 0.75, 0.75); // 中心 50%
   */
  setBeltDiagonalUV (u0: number, v0: number, u1: number, v1: number) {
    const [bx0, by0, bx1, by1] = this.beltDiagonalTexLimitBase;
    const sx = bx1 - bx0;
    const sy = by1 - by0;
    this.beltDiagonalTexLimit = [
      bx0 + sx * u0,
      by0 + sy * v0,
      bx0 + sx * u1,
      by0 + sy * v1,
    ];
  }

  setBeltBottomTexLimitBase (u0: number, v0: number, u1: number, v1: number) {
    this.beltBottomTexLimitBase = [u0, v0, u1, v1];
    this.beltBottomTexLimit = [u0, v0, u1, v1];
  }

  setBeltBottomUV (u0: number, v0: number, u1: number, v1: number) {
    const [bx0, by0, bx1, by1] = this.beltBottomTexLimitBase;
    const sx = bx1 - bx0;
    const sy = by1 - by0;
    this.beltBottomTexLimit = [
      bx0 + sx * u0,
      by0 + sy * v0,
      bx0 + sx * u1,
      by0 + sy * v1,
    ];
  }

  instancer<D extends Instance>(type: InstanceType<D>, model: unknown): Instancer<D> {
    const key = this.getKey(type, model);
    let instancer = this.instancers.get(key);
    if (!instancer) {
      instancer = new InstancerImpl(type, this.gl);
      instancer._model = model;
      this.instancers.set(key, (instancer as unknown) as InstancerImpl<Instance>);
    }
    return instancer as unknown as Instancer<D>;
  }

  private getKey (type: InstanceType<Instance>, model: unknown): string {
    // TODO: Better key
    return `${type.format()}_${(model as { id?: string }).id || 'unknown'}`;
  }

  render (viewMatrix: mat4, projMatrix: mat4) {
    const gl = this.gl;
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

    const bindInstanceAttrs = (program: WebGLProgram, stride: number = 64) => {
      const loc0 = gl.getAttribLocation(program, 'iModelRow0');
      const loc1 = gl.getAttribLocation(program, 'iModelRow1');
      const loc2 = gl.getAttribLocation(program, 'iModelRow2');
      const loc3 = gl.getAttribLocation(program, 'iModelRow3');

      gl.enableVertexAttribArray(loc0);
      gl.enableVertexAttribArray(loc1);
      gl.enableVertexAttribArray(loc2);
      gl.enableVertexAttribArray(loc3);

      gl.vertexAttribPointer(loc0, 4, gl.FLOAT, false, stride, 0);
      gl.vertexAttribPointer(loc1, 4, gl.FLOAT, false, stride, 16);
      gl.vertexAttribPointer(loc2, 4, gl.FLOAT, false, stride, 32);
      gl.vertexAttribPointer(loc3, 4, gl.FLOAT, false, stride, 48);

      gl.vertexAttribDivisor(loc0, 1);
      gl.vertexAttribDivisor(loc1, 1);
      gl.vertexAttribDivisor(loc2, 1);
      gl.vertexAttribDivisor(loc3, 1);

      return [loc0, loc1, loc2, loc3];
    };

    const unbindInstanceAttrs = (locs: number[]) => {
      locs.forEach(loc => gl.vertexAttribDivisor(loc, 0));
    };

    for (const instancer of this.instancers.values()) {
      if (instancer.instanceCount === 0) {
        continue;
      }

      instancer.update();
      const model = instancer._model as ExtendedMesh;
      if (!model) {
        continue;
      }

      const isScrollFormat = instancer.type.format() === 18;

      // Draw colored quads (overlays) — skip for scroll format
      if (!isScrollFormat && model.colorOnly && model.quadVertices() > 0 && model.posBuffer && model.colorBuffer && model.indexBuffer) {
        const program = this.colorShader.getProgram();
        gl.useProgram(program);
        const locView = gl.getUniformLocation(program, 'mView');
        const locProj = gl.getUniformLocation(program, 'mProj');
        const locAlpha = gl.getUniformLocation(program, 'uAlpha');
        gl.uniformMatrix4fv(locView, false, viewMatrix);
        gl.uniformMatrix4fv(locProj, false, projMatrix);
        gl.uniform1f(locAlpha, model.colorAlpha ?? 0.3);

        const locVert = gl.getAttribLocation(program, 'vertPos');
        const locColor = gl.getAttribLocation(program, 'vertColor');

        gl.bindBuffer(gl.ARRAY_BUFFER, model.posBuffer);
        gl.vertexAttribPointer(locVert, 3, gl.FLOAT, false, 0, 0);
        gl.enableVertexAttribArray(locVert);

        gl.bindBuffer(gl.ARRAY_BUFFER, model.colorBuffer);
        gl.vertexAttribPointer(locColor, 3, gl.FLOAT, false, 0, 0);
        gl.enableVertexAttribArray(locColor);

        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, model.indexBuffer);

        instancer.glBuffer.bind(gl.ARRAY_BUFFER);
        const locs = bindInstanceAttrs(program);
        gl.drawElementsInstanced(
          gl.TRIANGLES,
          model.quadIndices(),
          gl.UNSIGNED_SHORT,
          0,
          instancer.instanceCount
        );
        unbindInstanceAttrs(locs);
      } else if (isScrollFormat && model.quadVertices() > 0 && model.posBuffer && model.textureBuffer && model.normalBuffer && model.indexBuffer) {
        // Draw textured quads with belt_scroll texture (GL_REPEAT)
        const modelId = (model as { id?: string }).id ?? '';
        const isDiagonal = modelId.includes('diagonal');
        const isBottom = !isDiagonal && modelId.includes('_bottom');

        const program = (isDiagonal ? this.beltDiagonalScrollShader : this.beltScrollShader).getProgram();
        gl.useProgram(program);
        const locView = gl.getUniformLocation(program, 'mView');
        const locProj = gl.getUniformLocation(program, 'mProj');
        gl.uniformMatrix4fv(locView, false, viewMatrix);
        gl.uniformMatrix4fv(locProj, false, projMatrix);

        if (isDiagonal) {
          if (this.beltDiagonalTexture) {
            gl.activeTexture(gl.TEXTURE2);
            gl.bindTexture(gl.TEXTURE_2D, this.beltDiagonalTexture);
            const locSampler = gl.getUniformLocation(program, 'beltDiagonalSampler');
            gl.uniform1i(locSampler, 2);
          }
          {
            const locTL = gl.getUniformLocation(program, 'beltDiagonalTexLimit');
            if (locTL) gl.uniform4f(locTL, this.beltDiagonalTexLimit[0], this.beltDiagonalTexLimit[1], this.beltDiagonalTexLimit[2], this.beltDiagonalTexLimit[3]);
          }
        } else if (isBottom) {
          if (this.beltBottomTexture) {
            gl.activeTexture(gl.TEXTURE1);
            gl.bindTexture(gl.TEXTURE_2D, this.beltBottomTexture);
            const locBeltSampler = gl.getUniformLocation(program, 'beltSampler');
            gl.uniform1i(locBeltSampler, 1);
          }
          {
            const locTL = gl.getUniformLocation(program, 'beltTexLimit');
            if (locTL) gl.uniform4f(locTL, this.beltBottomTexLimit[0], this.beltBottomTexLimit[1], this.beltBottomTexLimit[2], this.beltBottomTexLimit[3]);
          }
        } else {
          if (this.beltTexture) {
            gl.activeTexture(gl.TEXTURE1);
            gl.bindTexture(gl.TEXTURE_2D, this.beltTexture);
            const locBeltSampler = gl.getUniformLocation(program, 'beltSampler');
            gl.uniform1i(locBeltSampler, 1);
          }
          {
            const locBeltTL = gl.getUniformLocation(program, 'beltTexLimit');
            if (locBeltTL) gl.uniform4f(locBeltTL, this.beltTexLimit[0], this.beltTexLimit[1], this.beltTexLimit[2], this.beltTexLimit[3]);
          }
        }

        const locVert = gl.getAttribLocation(program, 'vertPos');
        const locTex = gl.getAttribLocation(program, 'texCoord');
        const locNorm = gl.getAttribLocation(program, 'normal');

        gl.bindBuffer(gl.ARRAY_BUFFER, model.posBuffer);
        gl.vertexAttribPointer(locVert, 3, gl.FLOAT, false, 0, 0);
        gl.enableVertexAttribArray(locVert);

        gl.bindBuffer(gl.ARRAY_BUFFER, model.textureBuffer);
        gl.vertexAttribPointer(locTex, 2, gl.FLOAT, false, 0, 0);
        gl.enableVertexAttribArray(locTex);

        gl.bindBuffer(gl.ARRAY_BUFFER, model.normalBuffer);
        gl.vertexAttribPointer(locNorm, 3, gl.FLOAT, false, 0, 0);
        gl.enableVertexAttribArray(locNorm);

        if (model.textureLimitBuffer) {
          const locTexLimit = gl.getAttribLocation(program, 'texLimit');
          gl.bindBuffer(gl.ARRAY_BUFFER, model.textureLimitBuffer);
          gl.vertexAttribPointer(locTexLimit, 4, gl.FLOAT, false, 0, 0);
          gl.enableVertexAttribArray(locTexLimit);
        }

        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, model.indexBuffer);

        instancer.glBuffer.bind(gl.ARRAY_BUFFER);
        const scrollLocs = bindInstanceAttrs(program, 72);
        const locScroll = gl.getAttribLocation(program, 'iScrollOffset');
        gl.enableVertexAttribArray(locScroll);
        gl.vertexAttribPointer(locScroll, 2, gl.FLOAT, false, 72, 64);
        gl.vertexAttribDivisor(locScroll, 1);

        gl.drawElementsInstanced(
          gl.TRIANGLES,
          model.quadIndices(),
          gl.UNSIGNED_SHORT,
          0,
          instancer.instanceCount
        );

        gl.vertexAttribDivisor(locScroll, 0);
        unbindInstanceAttrs(scrollLocs);
      } else if (model.quadVertices() > 0 && model.posBuffer && model.textureBuffer && model.normalBuffer && model.indexBuffer) {
        // Draw textured quads
        const program = this.shader.getProgram();
        gl.useProgram(program);
        const locView = gl.getUniformLocation(program, 'mView');
        const locProj = gl.getUniformLocation(program, 'mProj');
        gl.uniformMatrix4fv(locView, false, viewMatrix);
        gl.uniformMatrix4fv(locProj, false, projMatrix);

        if (this.texture) {
          gl.activeTexture(gl.TEXTURE0);
          gl.bindTexture(gl.TEXTURE_2D, this.texture);
          const locSampler = gl.getUniformLocation(program, 'sampler');
          gl.uniform1i(locSampler, 0);
        }

        const locVert = gl.getAttribLocation(program, 'vertPos');
        const locTex = gl.getAttribLocation(program, 'texCoord');
        const locNorm = gl.getAttribLocation(program, 'normal');

        gl.bindBuffer(gl.ARRAY_BUFFER, model.posBuffer);
        gl.vertexAttribPointer(locVert, 3, gl.FLOAT, false, 0, 0);
        gl.enableVertexAttribArray(locVert);

        gl.bindBuffer(gl.ARRAY_BUFFER, model.textureBuffer);
        gl.vertexAttribPointer(locTex, 2, gl.FLOAT, false, 0, 0);
        gl.enableVertexAttribArray(locTex);

        gl.bindBuffer(gl.ARRAY_BUFFER, model.normalBuffer);
        gl.vertexAttribPointer(locNorm, 3, gl.FLOAT, false, 0, 0);
        gl.enableVertexAttribArray(locNorm);

        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, model.indexBuffer);

        instancer.glBuffer.bind(gl.ARRAY_BUFFER);
        const locs = bindInstanceAttrs(program);
        gl.drawElementsInstanced(
          gl.TRIANGLES,
          model.quadIndices(),
          gl.UNSIGNED_SHORT,
          0,
          instancer.instanceCount
        );
        unbindInstanceAttrs(locs);
      }

      // Draw line overlays (wireframes)
      if (model.lineVertices() > 0 && model.linePosBuffer && model.lineColorBuffer) {
        const program = this.lineShader.getProgram();
        gl.useProgram(program);
        const locView = gl.getUniformLocation(program, 'mView');
        const locProj = gl.getUniformLocation(program, 'mProj');
        gl.uniformMatrix4fv(locView, false, viewMatrix);
        gl.uniformMatrix4fv(locProj, false, projMatrix);

        const locVert = gl.getAttribLocation(program, 'vertPos');
        const locColor = gl.getAttribLocation(program, 'vertColor');

        gl.bindBuffer(gl.ARRAY_BUFFER, model.linePosBuffer);
        gl.vertexAttribPointer(locVert, 3, gl.FLOAT, false, 0, 0);
        gl.enableVertexAttribArray(locVert);

        gl.bindBuffer(gl.ARRAY_BUFFER, model.lineColorBuffer);
        gl.vertexAttribPointer(locColor, 3, gl.FLOAT, false, 0, 0);
        gl.enableVertexAttribArray(locColor);

        instancer.glBuffer.bind(gl.ARRAY_BUFFER);
        const locs = bindInstanceAttrs(program);
        const width = model.lineWidth ?? 1;
        gl.lineWidth(width);
        gl.drawArraysInstanced(
          gl.LINES,
          0,
          model.lineVertices(),
          instancer.instanceCount
        );
        unbindInstanceAttrs(locs);
      }
    }
  }
}
