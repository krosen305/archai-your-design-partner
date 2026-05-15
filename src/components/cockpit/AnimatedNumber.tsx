import { useEffect, useState } from "react";
import { useMotionValue, useSpring, useMotionValueEvent } from "framer-motion";

type Props = {
  value: number;
  decimals?: number;
  suffix?: string;
  duration?: number;
};

/**
 * Spring-animeret tal-tæller. Falder elegant tilbage til static rendering
 * når reduced-motion er slået til.
 */
export function AnimatedNumber({ value, decimals = 0, suffix = "", duration = 0.6 }: Props) {
  const mv = useMotionValue(0);
  const spring = useSpring(mv, { stiffness: 60, damping: 18, duration });
  const [display, setDisplay] = useState(value);

  useEffect(() => {
    mv.set(value);
  }, [value, mv]);

  useMotionValueEvent(spring, "change", (v) => {
    setDisplay(v);
  });

  const formatted = decimals > 0 ? display.toFixed(decimals) : Math.round(display).toString();
  return (
    <span>
      {formatted}
      {suffix}
    </span>
  );
}
