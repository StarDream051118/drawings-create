export interface ResourceProvider {
  getTexture(path: string): Promise<HTMLImageElement>;
  getJson(path: string): Promise<unknown>;
  getText(path: string): Promise<string>;
  getArrayBuffer(path: string): Promise<ArrayBuffer>;
  getBasePath(): string;
}

export class FetchResourceProvider implements ResourceProvider {
  constructor (private baseUrl: string) {
    if (!this.baseUrl.endsWith('/')) {
      this.baseUrl += '/';
    }
  }

  async getTexture (path: string): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error(`Failed to load texture: ${path}`));
      img.src = `${this.baseUrl}${path}`;
    });
  }

  async getJson (path: string): Promise<unknown> {
    const res = await fetch(`${this.baseUrl}${path}`);
    if (!res.ok) {
      throw new Error(`Failed to load JSON: ${path}`);
    }
    return res.json();
  }

  async getText (path: string): Promise<string> {
    const res = await fetch(`${this.baseUrl}${path}`);
    if (!res.ok) {
      throw new Error(`Failed to load text: ${path}`);
    }
    return res.text();
  }

  async getArrayBuffer (path: string): Promise<ArrayBuffer> {
    const res = await fetch(`${this.baseUrl}${path}`);
    if (!res.ok) {
      throw new Error(`Failed to load binary: ${path}`);
    }
    return res.arrayBuffer();
  }

  getBasePath (): string {
    return this.baseUrl;
  }
}
