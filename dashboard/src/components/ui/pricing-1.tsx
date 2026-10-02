import React, { useState } from "react";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { ArrowUpRight, CheckIcon, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";

type FaqItem = {
  value: string;
  question: string;
  answer: string;
};

type PricingPlan = {
  id: "free" | "pro" | "business";
  label: string;
  badge?: string;
  description: string;
  price: string;
  period: string;
  promoBadge?: string;
  features: string[];
  ctaText: string;
  ctaHref: string;
  isPopular?: boolean;
};

const plans: PricingPlan[] = [
  {
    id: "free",
    label: "Free Starter",
    badge: "Free forever",
    description:
      "Everything you need to capture and organize thoughts straight from Telegram.",
    price: "Rp 0",
    period: "forever",
    features: [
      "30 notes lifetime allowance",
      "Up to 5 note generations per day",
      "Voice notes up to 30 minutes",
      "30 regenerations & Ask queries",
      "Notes remain saved & exportable forever",
      "Clean Markdown & PDF export",
    ],
    ctaText: "Start free on Telegram",
    ctaHref: "https://t.me/NotinnBot",
  },
  {
    id: "pro",
    label: "Pro",
    badge: "Early Bird",
    promoBadge: "Early Bird — first 100 users, then Rp 20.000",
    description:
      "For thinkers, students, and professionals who capture everything.",
    price: "Rp 10.000",
    period: "/month",
    features: [
      "1,000 notes per month",
      "Voice notes up to 2 hours",
      "300 regenerations & Ask queries/mo",
      "Web audio upload up to 45 MB (2 hours)",
      "Extended document & image upload limits",
      "Full-text & semantic search with citations",
      "Permanent web dashboard access",
      "Priority queue processing",
    ],
    ctaText: "Upgrade to Pro",
    ctaHref: "https://t.me/NotinnBot?start=upgrade",
    isPopular: true,
  },
  {
    id: "business",
    label: "Business plan",
    badge: "Custom volume",
    description:
      "Tailored solutions for teams with high-volume capture, custom models, and shared workflows.",
    price: "Custom",
    period: "billed annually",
    features: [
      "Everything included in Pro",
      "Custom monthly note & audio quotas",
      "Multi-user team dashboard & permissions",
      "Dedicated API access & webhook integrations",
      "Custom note templates tailored to your team",
      "Priority support & direct operator onboarding",
      "Custom SLA & enterprise data retention",
    ],
    ctaText: "Contact for Business plan",
    ctaHref: "https://t.me/NotinnBot",
  },
];

const faqs: FaqItem[] = [
  {
    value: "item-1",
    question: "Do I need to install an app?",
    answer:
      "No. Notinn runs natively inside Telegram — no separate app download or complex signup required. Open the bot, press start, and send your first note.",
  },
  {
    value: "item-2",
    question: "What formats can I send to Notinn?",
    answer:
      "You can send messy text, voice notes, audio files, forwarded messages, screenshots, photos, PDFs, DOCX, TXT, and Markdown. Notinn synthesizes them into structured, clean notes.",
  },
  {
    value: "item-3",
    question: "What happens to my original files and privacy?",
    answer:
      "Raw audio, image, and document bytes are processed in memory and never stored on Notinn servers. Only your final structured note is saved to your private library.",
  },
  {
    value: "item-4",
    question: "How does web dashboard access work?",
    answer:
      "Send /web to the Telegram bot to get a secure, single-use login link. Free accounts include a 14-day web dashboard trial, while Pro members enjoy permanent web access.",
  },
  {
    value: "item-5",
    question: "How do I upgrade to the Pro plan?",
    answer:
      "Upgrade instantly via TipTap with QRIS, e-wallet, or bank transfer at the promo price of Rp 10,000/month. Your account and quotas upgrade immediately upon payment.",
  },
  {
    value: "item-6",
    question: "Can I export or search my notes?",
    answer:
      "Yes. Search anytime using /search or /ask directly in Telegram or the web dashboard. Every note can be exported to clean Markdown, plain text, or formatted PDF.",
  },
  {
    value: "item-7",
    question: "Can I cancel my Pro subscription anytime?",
    answer:
      "Yes, you can cancel anytime with no penalties. You will retain Pro benefits until the end of your billing cycle, and your account will revert to Free Starter with all saved notes intact.",
  },
];

function PricingCard({
  plans,
  selectedPlanId,
  onSelectPlan,
}: {
  plans: PricingPlan[];
  selectedPlanId: PricingPlan["id"];
  onSelectPlan: (id: PricingPlan["id"]) => void;
}): React.ReactElement {
  const activePlan = plans.find((p) => p.id === selectedPlanId) ?? plans[1];

  return (
    <div className="flex h-fit w-full max-w-md flex-col gap-6 rounded-3xl bg-card p-8 shadow-sm border border-border">
      {/* Plan Switcher */}
      <div
        role="tablist"
        aria-label="Pricing plans"
        className="flex w-full rounded-full bg-muted/80 p-1 border border-border/50 text-xs font-medium backdrop-blur-xs"
      >
        {plans.map((p) => {
          const isSelected = p.id === activePlan.id;
          return (
            <button
              key={p.id}
              role="tab"
              aria-selected={isSelected}
              type="button"
              onClick={() => onSelectPlan(p.id)}
              className={cn(
                "flex-1 rounded-full px-4 py-2 text-center transition-all duration-200 cursor-pointer",
                isSelected
                  ? "bg-background text-foreground shadow-xs font-semibold"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              <span className="truncate">{p.label}</span>
            </button>
          );
        })}
      </div>

      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-2xl font-medium text-foreground">
            {activePlan.label}
          </h3>
          {activePlan.badge && (
            <Badge
              variant={activePlan.isPopular ? "default" : "outline"}
              className={cn(
                "text-xs font-medium",
                activePlan.isPopular && "bg-primary text-primary-foreground",
              )}
            >
              {activePlan.badge}
            </Badge>
          )}
        </div>
        <p className="text-sm leading-relaxed text-muted-foreground min-h-[40px]">
          {activePlan.description}
        </p>
      </div>

      <div className="flex flex-col items-start gap-1.5">
        <div className="flex items-baseline gap-2">
          <span className="text-4xl sm:text-5xl font-serif font-medium tracking-tight text-foreground">
            {activePlan.price}
          </span>
          <span className="text-sm text-muted-foreground font-sans">
            {activePlan.period}
          </span>
        </div>
        {activePlan.promoBadge && (
          <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 text-primary text-[11px] font-medium px-2.5 py-0.5">
            <Sparkles className="size-3" />
            {activePlan.promoBadge}
          </span>
        )}
      </div>

      <Separator className="bg-border/50" />

      <ul className="flex flex-col gap-3 min-h-[260px]">
        {activePlan.features.map((feature) => (
          <li key={feature} className="flex items-start gap-3">
            <CheckIcon className="mt-0.5 size-4 shrink-0 text-primary" />
            <span className="text-sm text-muted-foreground">{feature}</span>
          </li>
        ))}
      </ul>

      <Button
        size="lg"
        variant="outline"
        className="w-full gap-2 cursor-pointer text-foreground font-medium"
        render={
          <a
            href={activePlan.ctaHref}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center justify-center gap-2 text-foreground font-medium"
          >
            {activePlan.isPopular && <Sparkles className="size-4" />}
            <span>{activePlan.ctaText}</span>
            <ArrowUpRight className="size-4" />
          </a>
        }
      />
    </div>
  );
}

function FaqSection({ faqs }: { faqs: FaqItem[] }): React.ReactElement {
  return (
    <div className="flex w-full flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h3 className="text-lg font-semibold text-foreground">
          Frequently asked questions
        </h3>
        <p className="text-sm text-muted-foreground">
          Everything you need to know about quotas, privacy, and plans.
        </p>
      </div>

      <Accordion defaultValue={["item-1"]} className="flex flex-col gap-2">
        {faqs.map((item) => (
          <AccordionItem
            value={item.value}
            key={item.value}
            className="rounded-xl border border-border/40 bg-muted/40 px-4 transition-colors"
          >
            <AccordionTrigger className="py-4 text-sm font-medium text-foreground hover:no-underline">
              {item.question}
            </AccordionTrigger>
            <AccordionContent className="pb-4 text-sm leading-relaxed text-muted-foreground">
              {item.answer}
            </AccordionContent>
          </AccordionItem>
        ))}
      </Accordion>
    </div>
  );
}

export function Pricing(): React.ReactElement {
  const [selectedPlanId, setSelectedPlanId] =
    useState<PricingPlan["id"]>("pro");

  return (
    <section
      id="pricing"
      aria-label="Pricing"
      className="mx-auto w-full max-w-5xl px-6 py-20 sm:py-28"
    >
      <div className="flex flex-col items-center gap-12 sm:gap-16">
        <div className="flex flex-col items-center gap-4 text-center">
          <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
            Pricing
          </p>
          <h2 className="text-4xl font-bold tracking-tight text-foreground sm:text-5xl font-sans">
            Simple, honest pricing
          </h2>
          <p className="max-w-2xl text-base sm:text-lg text-muted-foreground">
            Start free on Telegram with 30 notes. Upgrade to Pro when your
            thoughts demand serious room.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-10 lg:grid-cols-12 lg:gap-12 w-full items-start">
          <div className="col-span-1 lg:col-span-6 flex justify-center w-full">
            <PricingCard
              plans={plans}
              selectedPlanId={selectedPlanId}
              onSelectPlan={setSelectedPlanId}
            />
          </div>
          <div className="col-span-1 lg:col-span-6 w-full">
            <FaqSection faqs={faqs} />
          </div>
        </div>
      </div>
    </section>
  );
}

export default Pricing;