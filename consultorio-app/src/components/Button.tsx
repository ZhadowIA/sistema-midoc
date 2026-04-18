"use client";
import { motion } from "motion/react";
import React, { forwardRef, type ComponentPropsWithoutRef } from "react";

type MotionButtonProps = ComponentPropsWithoutRef<typeof motion.button>;

interface ButtonProps extends MotionButtonProps {
  variant?: "primary" | "secondary" | "tertiary" | "destructive";
  size?: "sm" | "md" | "lg";
  fullWidth?: boolean;
  loading?: boolean;
  children?: React.ReactNode;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = "primary", size = "md", fullWidth = false, loading = false, className = "", children, disabled, ...props }: ButtonProps, ref) => {
    const baseClasses = "inline-flex items-center justify-center gap-2 rounded-xl transition-all duration-200 font-medium touch-manipulation";

    const sizeClasses: Record<string, string> = {
      sm: "min-h-[44px] px-4 py-2 text-sm",
      md: "min-h-[48px] px-6 py-3 text-base",
      lg: "min-h-[56px] px-8 py-4 text-lg"
    };

    const variantClasses: Record<string, string> = {
      primary: "bg-primary text-primary-foreground hover:bg-primary-hover shadow-sm",
      secondary: "bg-secondary text-secondary-foreground hover:bg-muted border border-border",
      tertiary: "text-foreground hover:bg-secondary border border-transparent hover:border-border",
      destructive: "bg-destructive text-destructive-foreground hover:opacity-90 shadow-sm"
    };

    const isInteractionDisabled = disabled || loading;
    const disabledClasses = isInteractionDisabled ? "opacity-70 cursor-not-allowed" : "cursor-pointer";
    const widthClasses = fullWidth ? "w-full" : "";

    return (
      <motion.button
        ref={ref}
        whileHover={!isInteractionDisabled ? { scale: 1.02 } : {}}
        whileTap={!isInteractionDisabled ? { scale: 0.98 } : {}}
        className={`${baseClasses} ${sizeClasses[size]} ${variantClasses[variant]} ${disabledClasses} ${widthClasses} ${className}`}
        disabled={isInteractionDisabled}
        {...props}
      >
        {loading && (
          <svg className="animate-spin -ml-1 mr-3 h-4 w-4 text-current" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
          </svg>
        )}
        {children}
      </motion.button>
    );
  }
);

Button.displayName = "Button";
