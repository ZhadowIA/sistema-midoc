"use client";
import * as RadixRadio from "@radix-ui/react-radio-group";

interface RadioOption {
  value: string;
  label: string;
  description?: string;
}

interface RadioGroupProps {
  label?: string;
  options: RadioOption[];
  value?: string;
  onValueChange?: (value: string) => void;
  error?: string;
}

export const RadioGroup = ({ label, options, value, onValueChange, error }: RadioGroupProps) => {
  return (
    <div className="w-full">
      {label && (
        <label className="block text-sm font-medium text-foreground mb-3">
          {label}
        </label>
      )}
      <RadixRadio.Root
        className="flex flex-col gap-3"
        value={value}
        onValueChange={onValueChange}
      >
        {options.map((option) => (
          <label
            key={option.value}
            className={`flex items-start gap-3 p-4 rounded-md border-2 cursor-pointer transition-all ${
              value === option.value
                ? "border-primary bg-primary/5"
                : "border-border hover:border-primary/50 bg-card"
            }`}
          >
            <RadixRadio.Item
              value={option.value}
              className="mt-0.5 w-5 h-5 rounded-full border-2 border-primary flex items-center justify-center focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2"
            >
              <RadixRadio.Indicator className="w-2.5 h-2.5 rounded-full bg-primary" />
            </RadixRadio.Item>
            <div className="flex-1">
              <div className="font-medium text-foreground">{option.label}</div>
              {option.description && (
                <div className="text-sm text-muted-foreground mt-1">{option.description}</div>
              )}
            </div>
          </label>
        ))}
      </RadixRadio.Root>
      {error && (
        <p className="mt-2 text-sm text-destructive">{error}</p>
      )}
    </div>
  );
};
