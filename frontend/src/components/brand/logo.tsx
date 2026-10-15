import lockupOnDark from "@/assets/brand/lockup-horizontal-color-on-dark.svg";
import lockup from "@/assets/brand/lockup-horizontal-color.svg";
import markOnDark from "@/assets/brand/mark-color-on-dark.svg";
import mark from "@/assets/brand/mark-color.svg";
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

/** Mark and wordmark side by side, as the brand's horizontal lockup. */
export function Logo({ className }: { className?: string }) {
  return (
    <span className={cn("inline-flex", className)}>
      <img src={lockup} alt="Nudge" className="h-9 dark:hidden" />
      <img src={lockupOnDark} alt="Nudge" className="hidden h-9 dark:block" />
    </span>
  );
}
