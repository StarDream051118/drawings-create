export interface BeltVariant {
  texture: WebGLTexture | null
  texLimit: [number, number, number, number]
  texLimitBase: [number, number, number, number]
  /** 滚动范围比例 (Create: 对角 3/8, 水平 1/2) */
  scrollMult: number
}

export class BeltTextureManager {
  private readonly variants = new Map<string, BeltVariant>()

  register (name: string, texture: WebGLTexture, texLimitBase: [number, number, number, number], scrollMult: number = 0.5) {
    this.variants.set(name, {
      texture,
      texLimit: [...texLimitBase],
      texLimitBase: [...texLimitBase],
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

  setTexLimit (name: string, u0: number, v0: number, u1: number, v1: number) {
    const v = this.variants.get(name)
    if (!v) return
    v.texLimit = [u0, v0, u1, v1]
  }
}
