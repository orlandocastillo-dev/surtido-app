/** La API BarcodeDetector existe en Chrome para Android y algunos navegadores de escritorio. */
export const scannerSupported = () => typeof window !== "undefined" && "BarcodeDetector" in window;
