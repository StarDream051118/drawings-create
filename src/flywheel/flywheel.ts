import type { mat4 } from 'gl-matrix';
import { ShaderProgram } from 'deepslate/render';
import type { Instance } from './api/instance/instance';
import type { Instancer } from './api/instance/instancer';
import type { InstanceType } from './api/instance/instanceType';
import type { InstancerProvider } from './api/visualization/visualizationContext';
import type { ExtendedMesh } from '../types/assets';
import { InstancerImpl } from './backend/instancing/instancerImpl';
import * as TransformedShaders from './shaders/transformed';
import * as LinesShaders from './shaders/lines';
import * as ColorShaders from './shaders/color';
import * as BeltScrollShaders from './shaders/beltScroll';
import { BeltTextureManager } from './beltTextureManager';

export class Flywheel implements InstancerProvider {
  private readonly instancers: Map<string, InstancerImpl<Instance>> = new Map();
  private readonly shader: ShaderProgram;
  private readonly lineShader: ShaderProgram;
  private readonly colorShader: ShaderProgram;
  private readonly beltScrollShader: ShaderProgram;
  private readonly beltDiagonalScrollShader: ShaderProgram;
  private texture: WebGLTexture | null = null;
  /** Belt 纹理管理器 — 各 belt 变体的纹理和 UV 截取统一管理 */
  readonly beltManager = new BeltTextureManager();

  constructor (private readonly gl: WebGL2RenderingContext) {
    this.shader = new ShaderProgram(gl, TransformedShaders.vertexSource, TransformedShaders.fragmentSource);
    this.lineShader = new ShaderProgram(gl, LinesShaders.vertexSource, LinesShaders.fragmentSource);
    this.colorShader = new ShaderProgram(gl, ColorShaders.vertexSource, ColorShaders.fragmentSource);
    this.beltScrollShader = new ShaderProgram(gl, BeltScrollShaders.vertexSource, BeltScrollShaders.fragmentSource);
    this.beltDiagonalScrollShader = new ShaderProgram(gl, BeltScrollShaders.vertexSource, BeltScrollShaders.fragmentSourceDiagonal);
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
    const gl = this.gl;
    gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);
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

      if (!isScrollFormat && model.colorOnly && model.quadVertices() > 0 && model.posBuffer && model.colorBuffer && model.indexBuffer) {
        this.renderColorQuads(instancer, model, viewMatrix, projMatrix, bindInstanceAttrs, unbindInstanceAttrs);
      } else if (isScrollFormat && model.quadVertices() > 0 && model.posBuffer && model.textureBuffer && model.normalBuffer && model.indexBuffer) {
        this.renderScrollQuads(instancer, model, viewMatrix, projMatrix, bindInstanceAttrs, unbindInstanceAttrs);
      } else if (model.quadVertices() > 0 && model.posBuffer && model.textureBuffer && model.normalBuffer && model.indexBuffer) {
        this.renderTexturedQuads(instancer, model, viewMatrix, projMatrix, bindInstanceAttrs, unbindInstanceAttrs);
      }

      if (model.lineVertices() > 0 && model.linePosBuffer && model.lineColorBuffer) {
        this.renderLines(instancer, model, viewMatrix, projMatrix, bindInstanceAttrs, unbindInstanceAttrs);
      }
    }
  }

  private renderColorQuads (instancer: InstancerImpl<Instance>, model: ExtendedMesh, viewMatrix: mat4, projMatrix: mat4, bindInstanceAttrs: (p: WebGLProgram, s?: number) => number[], unbindInstanceAttrs: (locs: number[]) => void) {
    const gl = this.gl;
    const program = this.colorShader.getProgram();
    gl.useProgram(program);
    gl.uniformMatrix4fv(gl.getUniformLocation(program, 'mView'), false, viewMatrix);
    gl.uniformMatrix4fv(gl.getUniformLocation(program, 'mProj'), false, projMatrix);
    gl.uniform1f(gl.getUniformLocation(program, 'uAlpha'), model.colorAlpha ?? 0.3);

    const locVert = gl.getAttribLocation(program, 'vertPos');
    const locColor = gl.getAttribLocation(program, 'vertColor');

    gl.bindBuffer(gl.ARRAY_BUFFER, model.posBuffer!);
    gl.vertexAttribPointer(locVert, 3, gl.FLOAT, false, 0, 0);
    gl.enableVertexAttribArray(locVert);

    gl.bindBuffer(gl.ARRAY_BUFFER, model.colorBuffer!);
    gl.vertexAttribPointer(locColor, 3, gl.FLOAT, false, 0, 0);
    gl.enableVertexAttribArray(locColor);

    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, model.indexBuffer!);

    instancer.glBuffer.bind(gl.ARRAY_BUFFER);
    const locs = bindInstanceAttrs(program);
    gl.drawElementsInstanced(gl.TRIANGLES, model.quadIndices(), gl.UNSIGNED_SHORT, 0, instancer.instanceCount);
    unbindInstanceAttrs(locs);
  }

  private renderScrollQuads (instancer: InstancerImpl<Instance>, model: ExtendedMesh, viewMatrix: mat4, projMatrix: mat4, bindInstanceAttrs: (p: WebGLProgram, s?: number) => number[], unbindInstanceAttrs: (locs: number[]) => void) {
    const gl = this.gl;
    const modelId = (model as { id?: string }).id ?? '';
    const isDiagonal = modelId.includes('diagonal');
    const beltVariant = isDiagonal ? 'diagonal' : modelId.includes('_bottom') ? 'bottom' : 'top';
    const beltData = this.beltManager.get(beltVariant);

    const program = (isDiagonal ? this.beltDiagonalScrollShader : this.beltScrollShader).getProgram();
    gl.useProgram(program);
    gl.uniformMatrix4fv(gl.getUniformLocation(program, 'mView'), false, viewMatrix);
    gl.uniformMatrix4fv(gl.getUniformLocation(program, 'mProj'), false, projMatrix);

    if (beltData?.texture) {
      const texUnit = isDiagonal ? gl.TEXTURE2 : gl.TEXTURE1;
      gl.activeTexture(texUnit);
      gl.bindTexture(gl.TEXTURE_2D, beltData.texture);
      gl.uniform1i(gl.getUniformLocation(program, isDiagonal ? 'beltDiagonalSampler' : 'beltSampler'), texUnit - gl.TEXTURE0);
    }
    const limitName = isDiagonal ? 'beltDiagonalTexLimit' : 'beltTexLimit';
    const locTL = gl.getUniformLocation(program, limitName);
    if (locTL && beltData) gl.uniform4f(locTL, beltData.texLimitBase[0], beltData.texLimitBase[1], beltData.texLimitBase[2], beltData.texLimitBase[3]);
    const uvOverrideName = isDiagonal ? 'beltDiagonalUVOverride' : 'beltUVOverride';
    const locUVO = gl.getUniformLocation(program, uvOverrideName);
    if (locUVO && beltData) gl.uniform4f(locUVO, beltData.uvOverride[0], beltData.uvOverride[1], beltData.uvOverride[2], beltData.uvOverride[3]);
    const smName = isDiagonal ? 'beltDiagonalScrollMult' : 'beltScrollMult';
    const locSM = gl.getUniformLocation(program, smName);
    if (locSM && beltData) gl.uniform1f(locSM, beltData.scrollMult);

    const locVert = gl.getAttribLocation(program, 'vertPos');
    const locTex = gl.getAttribLocation(program, 'texCoord');
    const locNorm = gl.getAttribLocation(program, 'normal');

    gl.bindBuffer(gl.ARRAY_BUFFER, model.posBuffer!);
    gl.vertexAttribPointer(locVert, 3, gl.FLOAT, false, 0, 0);
    gl.enableVertexAttribArray(locVert);

    gl.bindBuffer(gl.ARRAY_BUFFER, model.textureBuffer!);
    gl.vertexAttribPointer(locTex, 2, gl.FLOAT, false, 0, 0);
    gl.enableVertexAttribArray(locTex);

    gl.bindBuffer(gl.ARRAY_BUFFER, model.normalBuffer!);
    gl.vertexAttribPointer(locNorm, 3, gl.FLOAT, false, 0, 0);
    gl.enableVertexAttribArray(locNorm);

    if (model.textureLimitBuffer) {
      const locTexLimit = gl.getAttribLocation(program, 'texLimit');
      gl.bindBuffer(gl.ARRAY_BUFFER, model.textureLimitBuffer);
      gl.vertexAttribPointer(locTexLimit, 4, gl.FLOAT, false, 0, 0);
      gl.enableVertexAttribArray(locTexLimit);
    }

    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, model.indexBuffer!);

    instancer.glBuffer.bind(gl.ARRAY_BUFFER);
    const scrollLocs = bindInstanceAttrs(program, 72);
    const locScroll = gl.getAttribLocation(program, 'iScrollOffset');
    gl.enableVertexAttribArray(locScroll);
    gl.vertexAttribPointer(locScroll, 2, gl.FLOAT, false, 72, 64);
    gl.vertexAttribDivisor(locScroll, 1);

    gl.drawElementsInstanced(gl.TRIANGLES, model.quadIndices(), gl.UNSIGNED_SHORT, 0, instancer.instanceCount);

    gl.vertexAttribDivisor(locScroll, 0);
    unbindInstanceAttrs(scrollLocs);
  }

  private renderTexturedQuads (instancer: InstancerImpl<Instance>, model: ExtendedMesh, viewMatrix: mat4, projMatrix: mat4, bindInstanceAttrs: (p: WebGLProgram, s?: number) => number[], unbindInstanceAttrs: (locs: number[]) => void) {
    const gl = this.gl;
    const program = this.shader.getProgram();
    gl.useProgram(program);
    gl.uniformMatrix4fv(gl.getUniformLocation(program, 'mView'), false, viewMatrix);
    gl.uniformMatrix4fv(gl.getUniformLocation(program, 'mProj'), false, projMatrix);

    if (this.texture) {
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, this.texture);
      gl.uniform1i(gl.getUniformLocation(program, 'sampler'), 0);
    }

    const locVert = gl.getAttribLocation(program, 'vertPos');
    const locTex = gl.getAttribLocation(program, 'texCoord');
    const locNorm = gl.getAttribLocation(program, 'normal');

    gl.bindBuffer(gl.ARRAY_BUFFER, model.posBuffer!);
    gl.vertexAttribPointer(locVert, 3, gl.FLOAT, false, 0, 0);
    gl.enableVertexAttribArray(locVert);

    gl.bindBuffer(gl.ARRAY_BUFFER, model.textureBuffer!);
    gl.vertexAttribPointer(locTex, 2, gl.FLOAT, false, 0, 0);
    gl.enableVertexAttribArray(locTex);

    gl.bindBuffer(gl.ARRAY_BUFFER, model.normalBuffer!);
    gl.vertexAttribPointer(locNorm, 3, gl.FLOAT, false, 0, 0);
    gl.enableVertexAttribArray(locNorm);

    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, model.indexBuffer!);

    instancer.glBuffer.bind(gl.ARRAY_BUFFER);
    const locs = bindInstanceAttrs(program);
    gl.drawElementsInstanced(gl.TRIANGLES, model.quadIndices(), gl.UNSIGNED_SHORT, 0, instancer.instanceCount);
    unbindInstanceAttrs(locs);
  }

  private renderLines (instancer: InstancerImpl<Instance>, model: ExtendedMesh, viewMatrix: mat4, projMatrix: mat4, bindInstanceAttrs: (p: WebGLProgram, s?: number) => number[], unbindInstanceAttrs: (locs: number[]) => void) {
    const gl = this.gl;
    const program = this.lineShader.getProgram();
    gl.useProgram(program);
    gl.uniformMatrix4fv(gl.getUniformLocation(program, 'mView'), false, viewMatrix);
    gl.uniformMatrix4fv(gl.getUniformLocation(program, 'mProj'), false, projMatrix);

    const locVert = gl.getAttribLocation(program, 'vertPos');
    const locColor = gl.getAttribLocation(program, 'vertColor');

    gl.bindBuffer(gl.ARRAY_BUFFER, model.linePosBuffer!);
    gl.vertexAttribPointer(locVert, 3, gl.FLOAT, false, 0, 0);
    gl.enableVertexAttribArray(locVert);

    gl.bindBuffer(gl.ARRAY_BUFFER, model.lineColorBuffer!);
    gl.vertexAttribPointer(locColor, 3, gl.FLOAT, false, 0, 0);
    gl.enableVertexAttribArray(locColor);

    instancer.glBuffer.bind(gl.ARRAY_BUFFER);
    const locs = bindInstanceAttrs(program);
    gl.lineWidth(model.lineWidth ?? 1);
    gl.drawArraysInstanced(gl.LINES, 0, model.lineVertices(), instancer.instanceCount);
    unbindInstanceAttrs(locs);
  }
}
