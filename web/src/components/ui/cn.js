import clsx from "clsx";
import { twMerge } from "tailwind-merge";

/** Joins class names; on conflicting Tailwind utilities the later one wins, so callers can override defaults. */
export default function cn(...args) {
  return twMerge(clsx(...args));
}
