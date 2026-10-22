import { useEffect, useRef, useState } from "react";
import { Modal } from "./Modal";

interface DetectedBarcode {
  rawValue: string;
}
interface BarcodeDetectorLike {
  detect(source: HTMLVideoElement): Promise<DetectedBarcode[]>;
}
declare global {
  interface Window {
    BarcodeDetector?: new (options?: { formats: string[] }) => BarcodeDetectorLike;
  }
}

// Lector de códigos con la cámara del celular usando la API nativa BarcodeDetector (Chrome en Android)
export function Scanner({ open, onClose, onDetected }: { open: boolean; onClose: () => void; onDetected: (code: string) => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !window.BarcodeDetector) return;
    let stream: MediaStream | undefined;
    let frame = 0;
    let stopped = false;
    const detector = new window.BarcodeDetector({ formats: ["ean_13", "ean_8", "upc_a", "code_128"] });

    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
        const video = videoRef.current;
        if (!video || stopped) return;
        video.srcObject = stream;
        await video.play();
        const tick = async () => {
          if (stopped) return;
          const codes = await detector.detect(video).catch(() => []);
          if (codes[0]) {
            navigator.vibrate?.(60);
            onDetected(codes[0].rawValue);
            return;
          }
          frame = requestAnimationFrame(tick);
        };
        tick();
      } catch {
        setError("No se pudo usar la cámara. Revisa el permiso del navegador.");
      }
    })();

    return () => {
      stopped = true;
      cancelAnimationFrame(frame);
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, [open, onDetected]);

  return (
    <Modal title="Escanear código" open={open} onClose={onClose}>
      {error ? (
        <p className="form-error">{error}</p>
      ) : (
        <div className="scanner">
          <video ref={videoRef} muted playsInline />
          <span className="scanner__line" aria-hidden="true" />
        </div>
      )}
      <p className="muted small">Apunta la cámara al código de barras del producto.</p>
    </Modal>
  );
}
