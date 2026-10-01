import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";

export interface FloatingMenuItem {
  readonly label: string;
  readonly href?: string;
  readonly external?: boolean;
  readonly onClick?: () => void;
}

export interface LiquidMorphFloatingMenuProps {
  readonly items: readonly FloatingMenuItem[];
  readonly activeHref?: string | null;
  readonly openWidth?: number;
  readonly openHeight?: number;
}

const EASE: [number, number, number, number] = [0.22, 1, 0.36, 1];
const PILL = "#FFE862";
const PANEL = "#11110f";
const CREAM = "#f7f3ea";
const INK = "#11110f";
const CLOSED_WIDTH = 150;
const CLOSED_HEIGHT = 48;
const CLOSED_RADIUS = 72;
const OPEN_RADIUS = 32;
const PANEL_ID = "notinn-floating-panel";
const ITEM_FONT = "'Trobika', 'Bebas Neue', sans-serif";

function RollingLabel({ text }: { readonly text: string }): React.ReactElement {
  const [hovering, setHovering] = useState(false);
  const timer = useRef<number | undefined>(undefined);
  const reduceMotion = useReducedMotion();
  const chars = Array.from(text);

  useEffect(() => {
    return () => {
      window.clearTimeout(timer.current);
    };
  }, []);

  const start = () => {
    window.clearTimeout(timer.current);
    setHovering(true);
  };
  const stop = () => {
    // Keep the wave running to the last letter before settling back.
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      setHovering(false);
    }, 30 * chars.length + 300);
  };

  return (
    <span
      onMouseEnter={start}
      onMouseLeave={stop}
      onFocus={start}
      onBlur={stop}
      style={{ display: "inline-block" }}
    >
      {chars.map((char, i) => (
        <span
          key={`${i}-${char}`}
          style={{ display: "inline-block", overflow: "hidden", verticalAlign: "top", height: "24px" }}
        >
          <motion.span
            initial={false}
            animate={{ y: hovering ? "-50%" : "0%" }}
            transition={{
              duration: reduceMotion ? 0 : 0.8,
              ease: EASE,
              delay: reduceMotion ? 0 : 0.03 * i,
            }}
            style={{ display: "flex", flexDirection: "column", lineHeight: "24px" }}
          >
            <span>{char === " " ? " " : char}</span>
            <span aria-hidden="true">{char === " " ? " " : char}</span>
          </motion.span>
        </span>
      ))}
    </span>
  );
}

interface MenuRowProps {
  readonly item: FloatingMenuItem;
  readonly index: number;
  readonly active: boolean;
  readonly onActivate: () => void;
}

function MenuRow({ item, index, active, onActivate }: MenuRowProps): React.ReactElement {
  const reduceMotion = useReducedMotion();
  const duration = reduceMotion ? 0 : 0.45;
  const delay = reduceMotion ? 0 : 0.4 + 0.08 * index;
  const style: React.CSSProperties = {
    color: CREAM,
    fontFamily: ITEM_FONT,
    fontSize: "20px",
    lineHeight: "24px",
    textDecoration: active ? "underline" : "none",
    textUnderlineOffset: "6px",
    background: "transparent",
    border: "none",
    padding: 0,
    cursor: "pointer",
    display: "inline-block",
  };
  const row = (
    <motion.li
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration, ease: EASE, delay }}
      style={{ listStyle: "none", margin: 0, padding: 0 }}
    >
      {item.href ? (
        <motion.a
          href={item.href}
          rel={item.external ? "noopener noreferrer" : undefined}
          aria-label={item.label}
          aria-current={active ? "location" : undefined}
          onClick={() => {
            item.onClick?.();
            onActivate();
          }}
          style={style}
        >
          <RollingLabel text={item.label} />
        </motion.a>
      ) : (
        <motion.button
          type="button"
          aria-label={item.label}
          aria-current={active ? "location" : undefined}
          onClick={() => {
            item.onClick?.();
            onActivate();
          }}
          style={style}
        >
          <RollingLabel text={item.label} />
        </motion.button>
      )}
    </motion.li>
  );
  return row;
}

export function LiquidMorphFloatingMenu({
  items,
  activeHref,
  openWidth = 280,
  openHeight = 260,
}: LiquidMorphFloatingMenuProps): React.ReactElement {
  const [isOpen, setIsOpen] = useState(false);
  const reduceMotion = useReducedMotion();
  const containerRef = useRef<HTMLElement>(null);
  const toggleRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    const onPointerDown = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsOpen(false);
        toggleRef.current?.focus();
      }
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [isOpen]);

  const duration = reduceMotion ? 0 : 0.6;
  const lineColor = isOpen ? CREAM : INK;

  return (
    <motion.nav
      ref={containerRef}
      aria-label="Main navigation"
      initial={false}
      animate={{
        width: isOpen ? openWidth : CLOSED_WIDTH,
        height: isOpen ? openHeight : CLOSED_HEIGHT,
        borderRadius: isOpen ? OPEN_RADIUS : CLOSED_RADIUS,
        backgroundColor: isOpen ? PANEL : PILL,
      }}
      transition={{ duration, ease: EASE }}
      style={{
        position: "fixed",
        left: "50%",
        top: "calc(1.75rem + env(safe-area-inset-top, 0px))",
        x: "-50%",
        zIndex: 50,
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
      }}
    >
      <motion.span
        aria-hidden="true"
        initial={false}
        animate={{ scale: isOpen ? 1 : 0, opacity: isOpen ? 1 : 0 }}
        transition={{ duration: reduceMotion ? 0 : 0.7, ease: EASE }}
        style={{
          position: "absolute",
          left: "50%",
          top: "-260px",
          width: "520px",
          height: "520px",
          x: "-50%",
          borderRadius: "50%",
          backgroundColor: PANEL,
          pointerEvents: "none",
        }}
      />
      <AnimatePresence initial={false}>
        {isOpen && (
          <motion.ul
            key="panel"
            id={PANEL_ID}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: reduceMotion ? 0 : 0.2, ease: EASE }}
            style={{
              position: "relative",
              zIndex: 1,
              flex: 1,
              display: "flex",
              flexDirection: "column",
              justifyContent: "center",
              gap: "20px",
              margin: 0,
              padding: "0 24px",
            }}
          >
            {items.map((item, index) => (
              <MenuRow
                key={item.label}
                item={item}
                index={index}
                active={item.href != null && item.href === activeHref}
                onActivate={() => {
                  setIsOpen(false);
                }}
              />
            ))}
          </motion.ul>
        )}
      </AnimatePresence>
      <button
        ref={toggleRef}
        type="button"
        aria-expanded={isOpen}
        aria-controls={PANEL_ID}
        aria-label={isOpen ? "Close menu" : "Open menu"}
        onClick={() => {
          setIsOpen((previous) => !previous);
        }}
        style={{
          position: "relative",
          zIndex: 1,
          height: `${CLOSED_HEIGHT}px`,
          flexShrink: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "transparent",
          border: "none",
          cursor: "pointer",
          padding: 0,
        }}
      >
        <span
          aria-hidden="true"
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: "5px",
            fontFamily: "'Aeonik TRIAL', 'Inter', sans-serif",
          }}
        >
          <motion.span
            initial={false}
            animate={isOpen ? { rotate: 45, y: 3.5 } : { rotate: 0, y: 0 }}
            transition={{ duration: reduceMotion ? 0 : 0.4, ease: EASE }}
            style={{ display: "block", width: "20px", height: "2px", backgroundColor: lineColor }}
          />
          <motion.span
            initial={false}
            animate={isOpen ? { rotate: -45, y: -3.5 } : { rotate: 0, y: 0 }}
            transition={{ duration: reduceMotion ? 0 : 0.4, ease: EASE }}
            style={{ display: "block", width: "20px", height: "2px", backgroundColor: lineColor }}
          />
        </span>
      </button>
    </motion.nav>
  );
}
