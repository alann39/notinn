import { useEffect, useRef } from "react";
import {
  motion,
  useAnimationFrame,
  useMotionValue,
  useTransform,
} from "framer-motion";
import { cn } from "@/lib/utils";

function wrap(min: number, max: number, value: number): number {
  const range = max - min;
  return ((((value - min) % range) + range) % range) + min;
}

interface ParallaxProps {
  readonly children: string;
  readonly baseVelocity: number;
  readonly className?: string;
  readonly delay?: number;
}

export default function ScrollBaseAnimation({
  children,
  baseVelocity = -5,
  className,
  delay = 0,
}: ParallaxProps): React.ReactElement {
  const baseX = useMotionValue(0);

  const x = useTransform(baseX, (v) => `${wrap(-20, -45, v)}%`);

  const hasStarted = useRef(false);

  useEffect(() => {
    const timer = setTimeout(() => {
      hasStarted.current = true;
    }, delay);

    return () => clearTimeout(timer);
  }, [delay]);

  useAnimationFrame((_t, delta) => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    if (!hasStarted.current) return;

    baseX.set(baseX.get() + baseVelocity * (delta / 1000));
  });

  return (
    <div className="overflow-hidden whitespace-nowrap flex flex-nowrap">
      <motion.div
        className="flex whitespace-nowrap flex-nowrap"
        style={{ x }}
      >
        <span className={cn(`block sm:text-[8vw] text-[11vw]`, className)}>
          {children}
        </span>
        <span className={cn(`block sm:text-[8vw] text-[11vw]`, className)}>
          {children}
        </span>
        <span className={cn(`block sm:text-[8vw] text-[11vw]`, className)}>
          {children}
        </span>
        <span className={cn(`block sm:text-[8vw] text-[11vw]`, className)}>
          {children}
        </span>
      </motion.div>
    </div>
  );
}
