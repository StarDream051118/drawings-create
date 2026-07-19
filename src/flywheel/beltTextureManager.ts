export interface BeltVariant {
  texture: WebGLTexture | null
  texLimit: [number, number, number, number]
  texLimitBase: [number, number, number, number]
}

export class BeltTextureManager {
  private readonly variants = new Map<string, BeltVariant>()

  register (name: string, texture: WebGLTexture, texLimitBase: [number, number, number, number]) {
    this.variants.set(name, {
      texture,
      texLimit: [...texLimitBase],
      texLimitBase: [...texLimitBase],
    })
  }

  has (name: string): boolean {
    return this.variants.has(name)
  }

  get (name: string): { texture: WebGLTexture | null, texLimit: [number, number, number, number] } | undefined {
    const v = this.variants.get(name)
    if (!v) return undefined
    return { texture: v.texture, texLimit: v.texLimit }
  }

  /**
   * 按纹理自身的 [0,1] 纹理 UV 来设置截取范围
   * @example
   *   beltManager.setUV('diagonal', 0, 0, 1, 1);        // 整张纹理
   *   beltManager.setUV('diagonal', 0.25, 0.25, 0.75, 0.75); // 中心 50%
   */
  setUV (name: string, u0: number, v0: number, u1: number, v1: number) {
    const v = this.variants.get(name)
    if (!v) return
    const [bx0, by0, bx1, by1] = v.texLimitBase
    const sx = bx1 - bx0
    const sy = by1 - by0
    v.texLimit = [
      bx0 + sx * u0,
      by0 + sy * v0,
      bx0 + sx * u1,
      by0 + sy * v1,
    ]
  }

  /** 直接设置 texLimit（图集空间 UV 包围盒） */
  setTexLimit (name: string, u0: number, v0: number, u1: number, v1: number) {
    const v = this.variants.get(name)
    if (!v) return
    v.texLimit = [u0, v0, u1, v1]
  }
}
