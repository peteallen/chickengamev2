export class AssetLoader {
  constructor(manifest) {
    this.manifest = manifest;
    this.images = new Map();
  }

  async loadAll() {
    const entries = Object.entries(this.manifest);
    await Promise.all(
      entries.map(async ([key, src]) => {
        const image = await this.loadImage(src);
        this.images.set(key, image);
      }),
    );
  }

  get(key) {
    const image = this.images.get(key);
    if (!image) {
      throw new Error(`Missing asset: ${key}`);
    }
    return image;
  }

  loadImage(src) {
    return new Promise((resolve, reject) => {
      const image = new Image();
      image.decoding = "async";
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error(`Failed to load image: ${src}`));
      image.src = src;
    });
  }
}
