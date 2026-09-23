import React from "react";
import { cn } from "@/lib/utils";

export interface NotinnLogoProps {
  className?: string;
  imageClassName?: string;
  size?: "xs" | "sm" | "md" | "lg" | "xl";
  withContainer?: boolean;
}

const sizeConfig = {
  xs: {
    container: "size-5 rounded-md",
    image: "size-3.5",
  },
  sm: {
    container: "size-7 rounded-lg",
    image: "size-5",
  },
  md: {
    container: "size-8 rounded-lg",
    image: "size-6",
  },
  lg: {
    container: "size-10 rounded-xl",
    image: "size-7.5",
  },
  xl: {
    container: "size-14 rounded-2xl",
    image: "size-10",
  },
};

export function NotinnLogo({
  className,
  imageClassName,
  size = "md",
  withContainer = true,
}: NotinnLogoProps): React.ReactElement {
  const config = sizeConfig[size] || sizeConfig.md;

  if (!withContainer) {
    return (
      <img
        src="/notinn-logo.png"
        alt="Notinn Logo"
        className={cn(
          "object-contain select-none invert dark:invert-0 transition-[filter]",
          config.image,
          imageClassName,
          className,
        )}
        draggable={false}
      />
    );
  }

  return (
    <div
      className={cn(
        "flex shrink-0 items-center justify-center bg-neutral-950 dark:bg-neutral-900 border border-neutral-800/80 shadow-xs overflow-hidden transition-all",
        config.container,
        className,
      )}
    >
      <img
        src="/notinn-logo.png"
        alt="Notinn Logo"
        className={cn(
          "object-contain select-none drop-shadow-xs",
          config.image,
          imageClassName,
        )}
        draggable={false}
      />
    </div>
  );
}
