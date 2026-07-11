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

export class Flywheel implements InstancerProvider {
  private readonly instancers: Map<string, InstancerImpl<Instance>> = new Map();
  private readonly shader: ShaderProgram;
  private readonly lineShader: ShaderProgram;
  private readonly colorShader: ShaderProgram;
  private readonly ext: ANGLE_instanced_arrays | null = null;
  private texture: WebGLTexture | null = null;

  constructor (private readonly gl: WebGLRenderingContext) {
    this.shader = new ShaderProgram(gl, VS_TRANSFORMED, FS_TRANSFORMED);
    this.lineShader = new ShaderProgram(gl, VS_LINES, FS_LINES);
    this.colorShader = new ShaderProgram(gl, VS_COLOR, FS_COLOR);
    this.ext = gl.getExtension('ANGLE_instanced_arrays');
  }

  setTexture (texture: WebGLTexture) {
    this.texture = texture;
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
    if (!this.ext) {
      return;
    }

    const gl = this.gl;
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

    const bindInstanceAttrs = (program: WebGLProgram) => {
      const stride = 64; // 16 floats * 4 bytes
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

      if (this.ext) {
        this.ext.vertexAttribDivisorANGLE(loc0, 1);
        this.ext.vertexAttribDivisorANGLE(loc1, 1);
        this.ext.vertexAttribDivisorANGLE(loc2, 1);
        this.ext.vertexAttribDivisorANGLE(loc3, 1);
      }

      return [loc0, loc1, loc2, loc3];
    };

    const unbindInstanceAttrs = (locs: number[]) => {
      locs.forEach(loc => this.ext!.vertexAttribDivisorANGLE(loc, 0));
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

      // Draw colored quads (overlays)
      if (model.colorOnly && model.quadVertices() > 0 && model.posBuffer && model.colorBuffer && model.indexBuffer) {
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
        this.ext.drawElementsInstancedANGLE(
          gl.TRIANGLES,
          model.quadIndices(),
          gl.UNSIGNED_SHORT,
          0,
          instancer.instanceCount
        );
        unbindInstanceAttrs(locs);
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
        this.ext.drawElementsInstancedANGLE(
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
        this.ext.drawArraysInstancedANGLE(
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
