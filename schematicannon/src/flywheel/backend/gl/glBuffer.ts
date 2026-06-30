export class GlBuffer {
  public readonly buffer: WebGLBuffer;

  constructor (private gl: WebGLRenderingContext) {
    const buf = gl.createBuffer();
    if (!buf) {
      throw new Error('Failed to create WebGL buffer');
    }
    this.buffer = buf;
  }

  bind (target: number) {
    this.gl.bindBuffer(target, this.buffer);
  }

  data (target: number, data: BufferSource, usage: number) {
    this.gl.bufferData(target, data, usage);
  }

  subData (target: number, offset: number, data: BufferSource) {
    this.gl.bufferSubData(target, offset, data);
  }

  delete () {
    this.gl.deleteBuffer(this.buffer);
  }
}
