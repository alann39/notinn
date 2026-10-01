"use client";

import { useState } from "react";
import { ArrowRight, Check, Copy, MessageCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/onboarding-dialog";
import { StartNowButton } from "@/components/ui/start-now-button";
import { TELEGRAM_URL } from "@/content/landing.id";

const stepContent = [
  {
    step: 1,
    title: "Open a private chat with @NotinnBot",
    description: "Find @NotinnBot in Telegram and start a private chat.",
    image: "/brand/open-telegram.png",
    imageAlt: "Open a private chat with @NotinnBot in Telegram",
  },
  {
    step: 2,
    title: "Send /web to get your login link",
    description:
      "Send the /web command in the chat and the bot replies with your secure login link.",
    image: "/brand/send-web.png",
    imageAlt: "Send /web command to @NotinnBot",
  },
  {
    step: 3,
    title: "Open the login link",
    description: "Tap the link in Telegram to reach your dashboard.",
    image: "/brand/got-link.png",
    imageAlt: "Receive secure link and access Notinn dashboard",
  },
];

const totalSteps = stepContent.length;

export function LoginOnboardingDialog(): React.ReactElement {
  const [step, setStep] = useState(1);
  const [copied, setCopied] = useState(false);

  const handleContinue = () => {
    if (step < totalSteps) {
      setStep(step + 1);
    }
  };

  const handleCopyCommand = async () => {
    try {
      await navigator.clipboard.writeText("/web");
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Leave the button unchanged; the dialog stays open for a manual copy.
    }
  };

  return (
    <Dialog
      onOpenChange={(open) => {
        if (open) setStep(1);
      }}
    >
      <DialogTrigger asChild>
        <StartNowButton text="START NOW" />
      </DialogTrigger>
      <DialogContent className="gap-0 p-0 sm:max-w-[420px] overflow-hidden [&>button:last-child]:text-white">
        <div className="p-2 pb-0">
          <img
            src={stepContent[step - 1].image}
            alt={stepContent[step - 1].imageAlt}
            className="h-44 sm:h-48 w-full rounded-lg object-cover transition-all duration-300 bg-neutral-900"
            width={404}
            height={192}
          />
        </div>
        <div className="space-y-6 px-6 pb-6 pt-3">
          <DialogHeader>
            <DialogTitle>{stepContent[step - 1].title}</DialogTitle>
            <DialogDescription>
              {stepContent[step - 1].description}
            </DialogDescription>
          </DialogHeader>
          {step === 2 && (
            <div className="flex items-center justify-between gap-3 rounded-lg border border-input bg-muted px-4 py-3">
              <code className="text-base font-semibold text-foreground">
                /web
              </code>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleCopyCommand}
              >
                {copied ? (
                  <>
                    <Check aria-hidden="true" />
                    <span>Copied!</span>
                  </>
                ) : (
                  <>
                    <Copy aria-hidden="true" />
                    <span>Copy</span>
                  </>
                )}
              </Button>
            </div>
          )}
          <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
            <div
              className="flex justify-center space-x-1.5 max-sm:order-1"
              aria-hidden="true"
            >
              {[...Array(totalSteps)].map((_, index) => (
                <div
                  key={index}
                  className={cn(
                    "h-1.5 w-1.5 rounded-full bg-primary",
                    index + 1 === step ? "bg-primary" : "opacity-20",
                  )}
                />
              ))}
            </div>
            <DialogFooter className="sm:justify-end">
              {step < totalSteps ? (
                <Button
                  className="group"
                  type="button"
                  onClick={handleContinue}
                >
                  Next
                  <ArrowRight
                    className="-me-1 ms-2 opacity-60 transition-transform group-hover:translate-x-0.5"
                    size={16}
                    strokeWidth={2}
                    aria-hidden="true"
                  />
                </Button>
              ) : (
                <Button
                  type="button"
                  className="gap-2 font-medium"
                  onClick={() => {
                    window.open(TELEGRAM_URL, "_blank", "noopener,noreferrer");
                  }}
                >
                  <MessageCircle className="size-4" />
                  <span>@NotinnBot</span>
                </Button>
              )}
            </DialogFooter>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default LoginOnboardingDialog;
