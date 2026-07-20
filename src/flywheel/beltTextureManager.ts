export interface BeltVariant {
  texture: WebGLTexture | null
  texLimitBase: [number, number, number, number]
  /** 裁剪范围 [u0, v0, u1, v1] */
  uvOverride: [number, number, number, number]
  /** 滚动范围比例 (Create: 对角 3/8, 水平 1/2) */
  scrollMult: number
}

export class BeltTextureManager {
  private readonly variants = new Map<string, BeltVariant>()

  register (name: string, texture: WebGLTexture, texLimitBase: [number, number, number, number], scrollMult: number = 0.5) {
    this.variants.set(name, {
      texture,
      texLimitBase: [...texLimitBase],
      uvOverride: [0, 0, 1, 1],
      scrollMult,
    })
  }

  has (name: string): boolean {
    return this.variants.has(name)
  }

  get (name: string): BeltVariant | undefined {
    const v = this.variants.get(name)
    if (!v) return undefined
    return v
  }

  setUV (name: string, u0: number, v0: number, u1: number, v1: number) {
    const v = this.variants.get(name)
    if (!v) return
    v.uvOverride = [u0, v0, u1, v1]
  }
}
