"use client";

import React from "react";
import { cn } from "@/lib/utils";
import "./start-now-button.css";

interface StartNowButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  text?: string;
}

// Dot-matrix icon patterns: 25 dots render as a 5x5 grid (rest state),
// 9 dots render as a 3x3 grid (arrow state shown on hover).
const firstIconDots = [
  0, 2, 2, 1, 2, 0, 1, 1, 2, 2, 0, 1, 0, 2, 2, 1, 0, 2, 2, 2, 2, 0, 1, 0, 2,
];
const secondIconDots = [0, 2, 2, 1, 2, 0, 1, 1, 2];

export const StartNowButton = React.forwardRef<
  HTMLButtonElement,
  StartNowButtonProps
>(function StartNowButton(
  { text = "START NOW", className, type, ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type ?? "button"}
      {...props}
      className={cn("button04 w-inline-block", className)}
    >
      <span className="button04_bg" aria-hidden="true" />
      <span data-text={text} className="button04_inner">
        <span className="button04_text">{text}</span>
        <span className="button04_icon-wrap" aria-hidden="true">
          <span
            style={{ "--index-parent": 0 } as React.CSSProperties}
            className="button04_icon"
          >
            {firstIconDots.map((index, i) => (
              <span
                key={`first-dot-${i}`}
                style={{ "--index": index } as React.CSSProperties}
                className="button04_dot"
              />
            ))}
          </span>
          <span
            style={{ "--index-parent": 1 } as React.CSSProperties}
            className="button04_icon is-arrow"
          >
            {secondIconDots.map((index, i) => (
              <span
                key={`second-dot-${i}`}
                style={{ "--index": index } as React.CSSProperties}
                className="button04_dot"
              />
            ))}
          </span>
        </span>
      </span>
    </button>
  );
});

export default StartNowButton;
