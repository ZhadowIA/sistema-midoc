"use client";
import { ReactNode } from "react";

interface CardProps {
  children: ReactNode;
  className?: string;
  hover?: boolean;
  onClick?: () => void;
}

export const Card = ({ children, className = "", hover = false, onClick }: CardProps) => {
  const hoverClasses = hover ? "hover:shadow-md hover:border-primary/20 transition-all duration-200 cursor-pointer" : "";
  const clickableClasses = onClick ? "cursor-pointer" : "";

  return (
    <div
      className={`bg-card border border-border rounded-md shadow-sm p-6 ${hoverClasses} ${clickableClasses} ${className}`}
      onClick={onClick}
    >
      {children}
    </div>
  );
};

interface CardHeaderProps {
  children: ReactNode;
  className?: string;
}

export const CardHeader = ({ children, className = "" }: CardHeaderProps) => {
  return <div className={`mb-4 ${className}`}>{children}</div>;
};

interface CardTitleProps {
  children: ReactNode;
  className?: string;
}

export const CardTitle = ({ children, className = "" }: CardTitleProps) => {
  return <h3 className={`text-lg font-semibold text-foreground ${className}`}>{children}</h3>;
};

interface CardContentProps {
  children: ReactNode;
  className?: string;
}

export const CardContent = ({ children, className = "" }: CardContentProps) => {
  return <div className={className}>{children}</div>;
};
