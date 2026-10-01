import React, { useEffect, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import {
  Check,
  CheckCheck,
  Download,
  File,
  FileText,
  Image,
  MessageSquare,
  Mic,
  Search,
  Sparkles,
} from "lucide-react";

/**
 * Interactive micro-demo for Card 1: "Telegram is the inbox"
 * Displays clean, minimal animated Telegram message bubbles showing voice, text,
 * and the automated Notinn response.
 */
export function TelegramMessageBubbles(): React.ReactElement {
  const reduceMotion = useReducedMotion();
  const [step, setStep] = useState(0);

  useEffect(() => {
    if (reduceMotion) return;
    const interval = setInterval(() => {
      setStep((prev) => (prev + 1) % 5);
    }, 1800);
    return () => clearInterval(interval);
  }, [reduceMotion]);

  // If reduce motion is preferred, display all bubbles statically
  const currentStep = reduceMotion ? 3 : step;

  return (
    <div className="w-full max-w-[280px] h-[230px] flex flex-col justify-between font-sans select-none">
      {/* Mini Telegram chat header */}
      <div className="flex items-center justify-between px-1 pb-1 border-b border-border/40">
        <div className="flex items-center gap-1.5">
          <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
          <span className="text-[11px] font-mono font-medium text-muted-foreground uppercase tracking-wider">
            Telegram · Notinn
          </span>
        </div>
        <span className="text-[10px] font-mono text-muted-foreground/70">
          10:42 AM
        </span>
      </div>

      {/* Bubbles container */}
      <div className="flex flex-col gap-1.5 justify-end flex-1 pt-1">
        {/* Bubble 1: Text message */}
        <motion.div
          initial={reduceMotion ? false : { opacity: 0, y: 6, scale: 0.96 }}
          animate={{
            opacity: currentStep >= 0 ? 1 : 0,
            y: currentStep >= 0 ? 0 : 6,
            scale: currentStep >= 0 ? 1 : 0.96,
          }}
          transition={{ duration: 0.28, ease: "easeOut" }}
          className="self-end max-w-[90%] bg-neutral-200/90 dark:bg-neutral-800 text-foreground rounded-2xl rounded-tr-xs px-2.5 py-1.5 text-xs shadow-2xs"
        >
          <div className="flex items-center gap-1.5">
            <MessageSquare className="w-3 h-3 text-sky-600 dark:text-sky-400 shrink-0" />
            <p className="text-[11px] leading-tight truncate">
              Quick thoughts on pricing &amp; roadmap
            </p>
          </div>
          <div className="flex items-center justify-end gap-1 mt-0.5 text-[8.5px] font-mono text-muted-foreground">
            <span>10:41</span>
            <CheckCheck className="w-2.5 h-2.5 text-sky-500 dark:text-sky-400" />
          </div>
        </motion.div>

        {/* Bubble 2: Voice note */}
        <motion.div
          initial={reduceMotion ? false : { opacity: 0, y: 6, scale: 0.96 }}
          animate={{
            opacity: currentStep >= 1 ? 1 : 0,
            y: currentStep >= 1 ? 0 : 6,
            scale: currentStep >= 1 ? 1 : 0.96,
          }}
          transition={{ duration: 0.28, ease: "easeOut" }}
          className="self-end max-w-[85%] bg-neutral-200/90 dark:bg-neutral-800 text-foreground rounded-2xl rounded-tr-xs px-2.5 py-1.5 text-xs shadow-2xs flex items-center gap-2"
        >
          <div className="w-5 h-5 rounded-full bg-orange-500/15 text-orange-600 dark:text-orange-400 flex items-center justify-center shrink-0">
            <Mic className="w-2.5 h-2.5" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-0.5">
              {[40, 80, 50, 95, 60, 85, 45, 90, 35, 70].map((h, i) => (
                <motion.div
                  key={i}
                  className="w-1 bg-orange-500/60 dark:bg-orange-400/60 rounded-full"
                  style={{ height: `${h * 0.14}px` }}
                  animate={reduceMotion || currentStep < 1
                    ? undefined
                    : { scaleY: [0.7, 1.3, 0.8] }}
                  transition={{
                    duration: 0.9,
                    repeat: Infinity,
                    delay: i * 0.06,
                    ease: "easeInOut",
                  }}
                />
              ))}
            </div>
            <div className="flex items-center justify-between text-[8.5px] font-mono text-muted-foreground mt-0.5">
              <span>0:42</span>
              <div className="flex items-center gap-0.5">
                <span>10:42</span>
                <CheckCheck className="w-2.5 h-2.5 text-sky-500 dark:text-sky-400" />
              </div>
            </div>
          </div>
        </motion.div>

        {/* Bubble 3: Image / Photo */}
        <motion.div
          initial={reduceMotion ? false : { opacity: 0, y: 6, scale: 0.96 }}
          animate={{
            opacity: currentStep >= 2 ? 1 : 0,
            y: currentStep >= 2 ? 0 : 6,
            scale: currentStep >= 2 ? 1 : 0.96,
          }}
          transition={{ duration: 0.28, ease: "easeOut" }}
          className="self-end max-w-[85%] bg-neutral-200/90 dark:bg-neutral-800 text-foreground rounded-2xl rounded-tr-xs px-2.5 py-1.5 text-xs shadow-2xs"
        >
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-md bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0">
              <Image className="w-3 h-3" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[11px] font-medium text-foreground truncate">
                whiteboard_sketch.png
              </p>
              <span className="text-[8.5px] font-mono text-muted-foreground">
                Photo · 1.2 MB
              </span>
            </div>
          </div>
          <div className="flex items-center justify-end gap-1 mt-0.5 text-[8.5px] font-mono text-muted-foreground">
            <span>10:42</span>
            <CheckCheck className="w-2.5 h-2.5 text-sky-500 dark:text-sky-400" />
          </div>
        </motion.div>

        {/* Bubble 4: Automated Notinn response */}
        <motion.div
          initial={reduceMotion ? false : { opacity: 0, y: 6, scale: 0.96 }}
          animate={{
            opacity: currentStep >= 3 ? 1 : 0,
            y: currentStep >= 3 ? 0 : 6,
            scale: currentStep >= 3 ? 1 : 0.96,
          }}
          transition={{ duration: 0.28, ease: "easeOut" }}
          className="self-start max-w-[92%] bg-background/95 dark:bg-neutral-900 border border-border/80 text-foreground rounded-2xl rounded-tl-xs px-2.5 py-1.5 text-xs shadow-2xs"
        >
          <div className="flex items-center gap-1.5 mb-0.5">
            <Sparkles className="w-3 h-3 text-orange-500" />
            <span className="font-semibold text-[11px] text-foreground">
              Notinn Note
            </span>
            <span className="text-[8.5px] font-mono px-1 rounded bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 ml-auto">
              Saved
            </span>
          </div>
          <p className="text-[10.5px] text-muted-foreground leading-snug">
            Organized into{" "}
            <span className="font-medium text-foreground">
              Pricing &amp; Launch Sync
            </span>
          </p>
        </motion.div>
      </div>
    </div>
  );
}

/**
 * Interactive micro-demo for Card 2: "Notes that keep working"
 * Displays a Notion-style note card showing live action icons (Search, Ask, Export, Reformat)
 * with cycling micro-feedback.
 */
export function NoteCardWithActions(): React.ReactElement {
  const reduceMotion = useReducedMotion();
  const [step, setStep] = useState(0);

  const actions = [
    {
      id: "search",
      label: "Search",
      icon: Search,
      feedback: '/search "pricing" → 1 match',
      color: "text-purple-600 dark:text-purple-400",
    },
    {
      id: "export",
      label: "Export",
      icon: Download,
      feedback: "Exported: PDF & Markdown",
      color: "text-emerald-600 dark:text-emerald-400",
    },
    {
      id: "ask",
      label: "Ask",
      icon: Sparkles,
      feedback: '/ask "What was decided on launch?"',
      color: "text-blue-600 dark:text-blue-400",
    },
  ];

  useEffect(() => {
    if (reduceMotion) return;
    const interval = setInterval(() => {
      setStep((prev) => (prev + 1) % 4);
    }, 2000);
    return () => clearInterval(interval);
  }, [reduceMotion, actions.length]);

  const activeIdx = Math.min(step, actions.length - 1);
  const currentAction = actions[activeIdx];

  return (
    <div className="w-full max-w-[270px] flex flex-col gap-2 font-sans select-none">
      <div className="bg-background/95 dark:bg-neutral-900/95 border border-border/80 rounded-xl p-3 shadow-xs">
        {/* Document header */}
        <div className="flex items-center gap-2 mb-2">
          <FileText className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
          <span className="text-xs font-semibold text-foreground tracking-tight truncate">
            Q3 Roadmap &amp; Auth
          </span>
          <span className="ml-auto text-[9px] font-mono px-1.5 py-0.5 rounded bg-secondary text-muted-foreground">
            Saved
          </span>
        </div>

        {/* Note body lines */}
        <div className="space-y-1 py-1 text-[11px] text-muted-foreground border-b border-border/40 pb-2.5">
          <p className="line-clamp-1 text-foreground/90">
            • Review auth migration with engineering
          </p>
          <p className="line-clamp-1 text-muted-foreground">
            • Schedule beta rollout for Telegram bot
          </p>
        </div>

        {/* Action icons bar fading in sequentially */}
        <div className="pt-2">
          <p className="text-[10px] font-mono text-muted-foreground mb-1.5 uppercase tracking-wider">
            Actions
          </p>
          <div className="grid grid-cols-3 gap-1.5 p-1 bg-secondary/50 dark:bg-neutral-800/60 rounded-lg border border-border/40">
            {actions.map((action, idx) => {
              const Icon = action.icon;
              const isVisible = reduceMotion || step >= idx;
              const isActive = (step % actions.length) === idx;
              return (
                <motion.div
                  key={action.id}
                  initial={reduceMotion ? false : { opacity: 0, y: 4 }}
                  animate={{
                    opacity: isVisible ? 1 : 0.2,
                    y: isVisible ? 0 : 4,
                  }}
                  transition={{ duration: 0.35, ease: "easeOut" }}
                  className={`flex flex-col items-center justify-center py-1.5 rounded-md transition-colors ${
                    isActive
                      ? "bg-background dark:bg-neutral-700 shadow-2xs text-foreground font-medium border border-border/60"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <Icon
                    className={`w-3.5 h-3.5 ${isActive ? action.color : ""}`}
                  />
                  <span className="text-[9px] font-mono mt-0.5">
                    {action.label}
                  </span>
                </motion.div>
              );
            })}
          </div>
        </div>

        {/* Live action micro-feedback */}
        <motion.div
          key={currentAction.id}
          initial={reduceMotion ? false : { opacity: 0, y: 3 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.2 }}
          className="mt-2 text-[10px] font-mono text-muted-foreground bg-secondary/60 dark:bg-neutral-800/50 px-2 py-1 rounded flex items-center gap-1.5 truncate"
        >
          <currentAction.icon
            className={`w-3 h-3 shrink-0 ${currentAction.color}`}
          />
          <span className="truncate">{currentAction.feedback}</span>
        </motion.div>
      </div>
    </div>
  );
}

/**
 * Interactive micro-demo for Card 3: "Every format one result"
 * Displays file type icons (Voice, PDF, Screenshot, DOCX) converging into a single
 * clean, structured note icon.
 */
export function ConvergingFormats(): React.ReactElement {
  const reduceMotion = useReducedMotion();
  const [converged, setConverged] = useState(false);

  useEffect(() => {
    if (reduceMotion) return;
    const interval = setInterval(() => {
      setConverged((prev) => !prev);
    }, 2200);
    return () => clearInterval(interval);
  }, [reduceMotion]);

  const fileTypes = [
    {
      id: "mic",
      label: "Voice (30m)",
      icon: Mic,
      color: "text-orange-600 dark:text-orange-400",
      badge: "bg-orange-500/10 border-orange-500/20",
      x: -64,
      y: -36,
    },
    {
      id: "pdf",
      label: "PDF",
      icon: FileText,
      color: "text-rose-600 dark:text-rose-400",
      badge: "bg-rose-500/10 border-rose-500/20",
      x: 64,
      y: -36,
    },
    {
      id: "image",
      label: "Image",
      icon: Image,
      color: "text-emerald-600 dark:text-emerald-400",
      badge: "bg-emerald-500/10 border-emerald-500/20",
      x: -64,
      y: 36,
    },
    {
      id: "doc",
      label: "DOCX",
      icon: File,
      color: "text-blue-600 dark:text-blue-400",
      badge: "bg-blue-500/10 border-blue-500/20",
      x: 64,
      y: 36,
    },
  ];

  return (
    <div className="w-full max-w-[270px] h-[190px] relative flex items-center justify-center font-sans select-none overflow-hidden">
      {/* Converging file type badges */}
      {fileTypes.map((item) => {
        const Icon = item.icon;
        const targetX = reduceMotion ? item.x : converged ? 0 : item.x;
        const targetY = reduceMotion ? item.y : converged ? 0 : item.y;
        const targetScale = reduceMotion ? 1 : converged ? 0.3 : 1;
        const targetOpacity = reduceMotion ? 1 : converged ? 0 : 1;

        return (
          <motion.div
            key={item.id}
            className={`absolute z-0 flex items-center gap-1.5 px-2 py-1 rounded-md border text-[10px] font-mono shadow-2xs ${item.badge} ${item.color} bg-background/95 dark:bg-neutral-900/95`}
            animate={{
              x: targetX,
              y: targetY,
              scale: targetScale,
              opacity: targetOpacity,
            }}
            transition={{
              duration: 0.7,
              ease: [0.16, 1, 0.3, 1],
            }}
          >
            <Icon className="w-3 h-3 shrink-0" />
            <span className="font-medium whitespace-nowrap">{item.label}</span>
          </motion.div>
        );
      })}

      {/* Central structured note result */}
      <motion.div
        className="relative z-10 w-28 bg-background/95 dark:bg-neutral-900 border border-border/80 rounded-xl p-2.5 shadow-xs flex flex-col items-center justify-center text-center"
        animate={reduceMotion ? undefined : {
          scale: converged ? [1, 1.12, 1] : 1,
          borderColor: converged
            ? "rgba(59, 130, 246, 0.6)"
            : "var(--color-border)",
        }}
        transition={{ duration: 0.5 }}
      >
        <div className="w-7 h-7 rounded-lg bg-blue-500/10 text-blue-600 dark:text-blue-400 flex items-center justify-center mb-1">
          <FileText className="w-4 h-4" />
        </div>
        <span className="text-[11px] font-semibold text-foreground tracking-tight">
          Clean Note
        </span>
        <div className="flex items-center gap-1 mt-1 text-[9px] font-mono text-emerald-600 dark:text-emerald-400">
          <Check className="w-2.5 h-2.5" />
          <span>Structured</span>
        </div>
      </motion.div>
    </div>
  );
}

// Aliases for compatibility with legacy component names
export const TypeTester = TelegramMessageBubbles;
export const LayoutAnimation = NoteCardWithActions;
export const SpeedIndicator = ConvergingFormats;
export const TelegramInboxDemo = TelegramMessageBubbles;
export const StructuredOutputDemo = NoteCardWithActions;
export const InstantSearchDemo = ConvergingFormats;

export function FeaturesSection(): React.ReactElement {
  return (
    <section
      id="features"
      className="bg-background px-6 py-24"
      aria-labelledby="features-heading"
    >
      <div className="max-w-6xl mx-auto">
        <motion.p
          id="features-heading"
          className="text-muted-foreground text-sm uppercase tracking-widest mb-8"
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
        >
          Features
        </motion.p>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Card 1: Telegram is the inbox */}
          <motion.div
            className="bg-secondary rounded-xl p-8 min-h-[280px] flex flex-col"
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            whileHover={{ scale: 0.98 }}
            whileTap={{ scale: 0.96 }}
            transition={{ duration: 0.2 }}
            data-clickable
          >
            <div className="flex-1 flex items-center justify-center">
              <TelegramMessageBubbles />
            </div>
            <div className="mt-4">
              <h3 className="font-serif text-xl text-foreground">
                Telegram is the inbox
              </h3>
              <p className="text-muted-foreground text-sm mt-1">
                No new apps to install. Send text voice notes photos or
                documents straight from Telegram — where you already are.
              </p>
            </div>
          </motion.div>

          {/* Card 2: Notes that keep working */}
          <motion.div
            className="bg-secondary rounded-xl p-8 min-h-[280px] flex flex-col"
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.1 }}
            whileHover={{ scale: 0.98 }}
            whileTap={{ scale: 0.96 }}
            data-clickable
          >
            <div className="flex-1 flex items-center justify-center">
              <NoteCardWithActions />
            </div>
            <div className="mt-4">
              <h3 className="font-serif text-xl text-foreground">
                Notes that keep working
              </h3>
              <p className="text-muted-foreground text-sm mt-1">
                Search ask questions export and reformat your notes anytime. Not
                just an archive — a working knowledge base.
              </p>
            </div>
          </motion.div>

          {/* Card 3: Every format one result */}
          <motion.div
            className="bg-secondary rounded-xl p-8 min-h-[280px] flex flex-col"
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.2 }}
            whileHover={{ scale: 0.98 }}
            whileTap={{ scale: 0.96 }}
            data-clickable
          >
            <div className="flex-1 flex items-center justify-center">
              <ConvergingFormats />
            </div>
            <div className="mt-4">
              <h3 className="font-serif text-xl text-foreground">
                Every format one result
              </h3>
              <p className="text-muted-foreground text-sm mt-1">
                Voice up to 30 minutes PDFs screenshots DOCX — send anything get
                back a clean structured note.
              </p>
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  );
}

export default FeaturesSection;
