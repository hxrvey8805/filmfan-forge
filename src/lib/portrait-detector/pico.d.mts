type Classifier = (row: number, col: number, size: number, pixels: Uint8Array, stride: number) => number;
type Detection = [row: number, col: number, size: number, confidence: number];
declare const pico: {
  unpack_cascade(bytes: Int8Array): Classifier;
  run_cascade(
    image: { pixels: Uint8Array; nrows: number; ncols: number; ldim: number },
    classify: Classifier,
    scan: { shiftfactor: number; minsize: number; maxsize: number; scalefactor: number },
  ): Detection[];
  cluster_detections(hits: Detection[], overlap: number): Detection[];
};
export default pico;
