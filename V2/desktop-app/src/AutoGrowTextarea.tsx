import { useLayoutEffect, useRef } from "react";
import type { TextareaHTMLAttributes } from "react";

type Props = TextareaHTMLAttributes<HTMLTextAreaElement> & { value: string };

/// Textarea que ajusta su alto al contenido: el medico no scrollea dentro del
/// campo. Recalcula cuando cambia el valor (al escribir o al aplicar texto de la
/// IA) y al cambiar el ancho de la ventana (el reflujo de lineas cambia el alto).
export function AutoGrowTextarea({ value, className, ...rest }: Props) {
  const ref = useRef<HTMLTextAreaElement>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const resize = () => {
      // "auto" primero para que scrollHeight refleje el alto real del contenido
      // (si no, solo creceria y nunca encogeria al borrar lineas).
      el.style.height = "auto";
      el.style.height = `${el.scrollHeight}px`;
    };
    resize();
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, [value]);

  return (
    <textarea
      ref={ref}
      value={value}
      className={className ? `autogrow ${className}` : "autogrow"}
      {...rest}
    />
  );
}
