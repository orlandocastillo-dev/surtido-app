import { useEffect, useRef, type ReactNode } from "react";
import { Icon } from "./Icon";

interface ModalProps {
  title: string;
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
}

/** Usa <dialog> nativo: trae foco atrapado, cierre con Escape y fondo inerte sin librerías. */
export function Modal({ title, open, onClose, children, footer }: ModalProps) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      className="modal"
      onClose={onClose}
      onClick={(e) => {
        // Clic en el fondo oscuro (fuera de la tarjeta) cierra el diálogo.
        if (e.target === ref.current) onClose();
      }}
      aria-labelledby="modal-title"
    >
      {open && (
        <div className="modal__card">
          <header className="modal__head">
            <h2 id="modal-title">{title}</h2>
            <button type="button" className="icon-btn" onClick={onClose} aria-label="Cerrar">
              <Icon name="cerrar" />
            </button>
          </header>
          <div className="modal__body">{children}</div>
          {footer && <footer className="modal__foot">{footer}</footer>}
        </div>
      )}
    </dialog>
  );
}
