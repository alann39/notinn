import React from "react";
import {
  ArrowRight,
  Check,
  CircleAlert,
  CircleCheck,
  Minus,
} from "lucide-react";
import { Button } from "@/components/ui/button";

const BEFORE = [
  "Notes and voice memos stay buried in chat history",
  "Action items and key takeaways are easy to miss",
  "Files, images, and context end up scattered",
  "Finding something later means scrolling back or manual searching",
] as const;

const AFTER = [
  "Send voice, text, images, or documents directly in Telegram",
  "Receive a structured note with summaries and clear action items",
  "Keep everything searchable and askable via chat or the dashboard",
  "Export clean notes or reformat them with templates when needed",
] as const;

const OUTCOMES = [
  "Telegram-first capture",
  "Structured by default",
  "Useful after saving",
] as const;

export function Comparison03(): React.ReactElement {
  return (
    <section
      id="comparison"
      className="bg-background py-20 sm:py-28"
      aria-labelledby="comparison-03-heading"
    >
      <div className="container mx-auto w-full max-w-5xl px-6">
        <div className="max-w-2xl">
          <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
            Before and after
          </p>
          <h2
            id="comparison-03-heading"
            className="mt-3 font-serif text-3xl font-medium tracking-tight sm:text-4xl text-foreground"
          >
            The same thought, handled two ways
          </h2>
        </div>

        <div className="mt-12 grid gap-px overflow-hidden rounded-md border border-border bg-border md:grid-cols-2">
          <div className="bg-background p-7 sm:p-8">
            <div className="flex items-center gap-2">
              <CircleAlert
                aria-hidden="true"
                className="size-4 text-muted-foreground"
              />
              <h3 className="font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
                Without Notinn
              </h3>
            </div>
            <ul className="mt-6 flex flex-col gap-4">
              {BEFORE.map((item) => (
                <li
                  key={item}
                  className="flex gap-3 text-sm text-muted-foreground"
                >
                  <Minus
                    aria-hidden="true"
                    className="mt-0.5 size-4 shrink-0 text-muted-foreground/50"
                  />
                  <span className="line-through decoration-muted-foreground/30">
                    {item}
                  </span>
                </li>
              ))}
            </ul>
          </div>

          <div className="bg-card p-7 sm:p-8">
            <div className="flex items-center gap-2">
              <CircleCheck aria-hidden="true" className="size-4 text-primary" />
              <h3 className="font-mono text-[10px] uppercase tracking-[0.12em] text-foreground">
                With Notinn
              </h3>
            </div>
            <ul className="mt-6 flex flex-col gap-4">
              {AFTER.map((item) => (
                <li key={item} className="flex gap-3 text-sm text-foreground">
                  <Check
                    aria-hidden="true"
                    className="mt-0.5 size-4 shrink-0 text-primary"
                  />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="mt-10 flex flex-col items-start justify-between gap-6 sm:flex-row sm:items-center">
          <ul className="flex flex-wrap items-center gap-x-8 gap-y-3">
            {OUTCOMES.map((item) => (
              <li key={item} className="flex items-center gap-2">
                <Check
                  aria-hidden="true"
                  className="size-3.5 shrink-0 text-primary"
                />
                <span className="font-mono text-xs font-semibold tracking-tight text-foreground sm:text-sm">
                  {item}
                </span>
              </li>
            ))}
          </ul>
          <Button
            variant="outline"
            className="group"
            render={
              <a
                href="https://t.me/NotinnBot"
                target="_blank"
                rel="noopener noreferrer"
              >
                Try Notinn on Telegram
                <ArrowRight
                  aria-hidden="true"
                  className="size-3.5 transition-transform duration-150 ease-out group-hover:translate-x-0.5 rtl:rotate-180 rtl:group-hover:-translate-x-0.5"
                />
              </a>
            }
          />
        </div>
      </div>
    </section>
  );
}

export default Comparison03;
