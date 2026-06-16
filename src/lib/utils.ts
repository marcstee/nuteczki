import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Format a drill-session accuracy as a human-readable percentage string. */
export function formatScore(correct: number, total: number): string {
  if (total === 0) return "–";
  return `${Math.round((correct / total) * 100)}%`;
}
