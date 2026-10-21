import { useState, type InputHTMLAttributes } from "react";
import { Icon } from "./Icon";

/** Campo de contraseña con el botón del ojo para mostrarla u ocultarla. */
export function PasswordInput(props: Omit<InputHTMLAttributes<HTMLInputElement>, "type">) {
  const [visible, setVisible] = useState(false);
  return (
    <div className="password">
      <input {...props} type={visible ? "text" : "password"} />
      <button
        type="button"
        className="password__toggle"
        aria-label={visible ? "Ocultar contraseña" : "Mostrar contraseña"}
        aria-pressed={visible}
        onClick={() => setVisible((v) => !v)}
      >
        <Icon name={visible ? "ojoOculto" : "ojo"} size={20} />
      </button>
    </div>
  );
}
