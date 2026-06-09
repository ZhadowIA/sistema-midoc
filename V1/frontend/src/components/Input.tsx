import React, { useId } from "react";

type InputProps = React.ComponentPropsWithoutRef<"input"> & {
  label?: string;
  error?: string;
};

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, className = "", id, ...props }, ref) => {
    const generatedId = useId();
    const inputId = id ?? generatedId;
    const errorId = `${inputId}-error`;
    const describedBy = [props["aria-describedby"], error ? errorId : null].filter(Boolean).join(" ") || undefined;

    return (
      <div className="flex flex-col gap-1.5">
        {label && (
          <label htmlFor={inputId} className="text-sm font-medium text-foreground">
            {label}
          </label>
        )}
        <input
          ref={ref}
          id={inputId}
          aria-invalid={Boolean(error)}
          aria-describedby={describedBy}
          {...props}
          className={`
            min-h-[44px] px-4 py-3 rounded-xl border border-border
            bg-white text-foreground placeholder:text-muted-foreground
            focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent
            transition-colors duration-200
            ${error ? "border-destructive focus:ring-destructive" : ""}
            ${className}
          `}
        />
        {error && (
          <span id={errorId} className="text-xs text-destructive">{error}</span>
        )}
      </div>
    );
  }
);

Input.displayName = "Input";
