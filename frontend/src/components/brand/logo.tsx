import markOnDark from "@/assets/brand/mark-color-on-dark.svg";
import mark from "@/assets/brand/mark-color.svg";
import wordmarkOnDark from "@/assets/brand/wordmark-on-dark.svg";
import wordmark from "@/assets/brand/wordmark-ink.svg";
import { cn } from "@/lib/utils";

/** The Nudge calendar mark, switching to its dark-background colors in dark mode. */
export function LogoMark({ className }: { className?: string }) {
  return (
    <>
      <img src={mark} alt="" className={cn("dark:hidden", className)} />
      <img src={markOnDark} alt="" className={cn("hidden dark:block", className)} />
    </>
  );
}

/** Mark and wordmark side by side. */
export function Logo({ className }: { className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-2", className)}>
      <LogoMark className="size-8" />
      <img src={wordmark} alt="Nudge" className="h-6 dark:hidden" />
      <img src={wordmarkOnDark} alt="Nudge" className="hidden h-6 dark:block" />
    </span>
  );
}
