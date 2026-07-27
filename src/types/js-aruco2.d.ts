declare module "js-aruco2" {
  export namespace AR {
    interface Corner {
      x: number;
      y: number;
    }

    interface Marker {
      id: number;
      corners: Corner[];
      hammingDistance: number;
    }

    class Detector {
      constructor(options?: {
        dictionaryName?: string;
        maxHammingDistance?: number;
      });
      detect(image: ImageData): Marker[];
    }

    class Dictionary {
      constructor(dictionaryName: string);
      generateSVG(id: number): string;
    }
  }
}
