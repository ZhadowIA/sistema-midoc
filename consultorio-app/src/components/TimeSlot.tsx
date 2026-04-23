"use client";
import { motion } from "motion/react";

interface TimeSlotProps {
  time: string;
  available?: boolean;
  selected?: boolean;
  onClick?: () => void;
  testId?: string;
}

export const TimeSlot = ({ time, available = true, selected = false, onClick, testId }: TimeSlotProps) => {
  const getClasses = () => {
    if (!available) {
      return "bg-muted text-muted-foreground cursor-not-allowed opacity-50";
    }
    if (selected) {
      return "bg-primary text-primary-foreground shadow-md border-primary";
    }
    return "bg-card text-foreground border-border hover:border-primary hover:shadow-md cursor-pointer";
  };

  return (
    <motion.button
      data-testid={testId}
      whileHover={available && !selected ? { scale: 1.05 } : {}}
      whileTap={available && !selected ? { scale: 0.95 } : {}}
      onClick={available ? onClick : undefined}
      disabled={!available}
      className={`px-4 py-3 rounded-xl border-2 transition-all font-medium text-sm ${getClasses()}`}
    >
      {time}
    </motion.button>
  );
};
