import * as React from "react";
import * as ProgressPrimitive from "@radix-ui/react-progress";
import { cn } from "@/lib/utils";

export interface GradientProgressProps
  extends React.ComponentPropsWithoutRef<typeof ProgressPrimitive.Root> {
  value?: number;
  gradientFrom?: string;
  gradientTo?: string;
}

const GradientProgress = React.forwardRef<
  React.ElementRef<typeof ProgressPrimitive.Root>,
  GradientProgressProps
>(({ className, value, gradientFrom = "from-blue-500", gradientTo = "to-purple-500", ...props }, ref) => {
  // Clamp value to [0, 100] to prevent UI breaking with invalid data
  const clampedValue = Math.min(Math.max(value || 0, 0), 100);
  
  return (
    <ProgressPrimitive.Root
      ref={ref}
      className={cn(
        "relative h-4 w-full overflow-hidden rounded-full bg-gradient-to-r from-gray-200 via-gray-100 to-gray-200 dark:from-gray-800 dark:via-gray-700 dark:to-gray-800",
        className
      )}
      {...props}
    >
      <ProgressPrimitive.Indicator
        className={cn(
          "h-full w-full flex-1 bg-gradient-to-r transition-all duration-500 ease-out relative",
          gradientFrom,
          gradientTo,
          "before:absolute before:inset-0 before:bg-white/20 before:animate-shimmer"
        )}
        style={{ transform: `translateX(-${100 - clampedValue}%)` }}
      />
    </ProgressPrimitive.Root>
  );
});
GradientProgress.displayName = "GradientProgress";

export { GradientProgress };
