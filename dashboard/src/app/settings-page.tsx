import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { Header } from "@/components/layout/header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  AlertTriangle,
  ExternalLink,
  Globe,
  Shield,
  Sliders,
  User,
} from "lucide-react";
import { Spinner } from "@/components/ui/spinner";
import type { UserPreferences, UserProfile } from "@/types/user";

const LANGUAGE_LABELS: Record<string, string> = {
  mirror: "Mirror source language",
  id: "Indonesian (id)",
  en: "English (en)",
};

const PRIVACY_LABELS: Record<string, { label: string; description: string }> = {
  balanced: {
    label: "Balanced",
    description: "Keeps source text securely for search and regeneration",
  },
  minimal: {
    label: "Minimal",
    description: "Discards source text immediately after note processing",
  },
};

export function SettingsPage() {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [preferences, setPreferences] = useState<UserPreferences | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadSettings() {
      try {
        const [profileRes, prefsRes] = await Promise.all([
          supabase.rpc("web_get_profile"),
          supabase.rpc("web_get_preferences"),
        ]);
        if (profileRes.data) {
          setProfile(Array.isArray(profileRes.data) ? profileRes.data[0] : profileRes.data);
        }
        if (prefsRes.data) {
          setPreferences(Array.isArray(prefsRes.data) ? prefsRes.data[0] : prefsRes.data);
        }
      } catch (err) {
        console.error("Failed to load settings:", err);
      } finally {
        setLoading(false);
      }
    }
    loadSettings();
  }, []);

  if (loading) {
    return (
      <>
        <Header title="Settings" />
        <div className="flex flex-col items-center justify-center py-32 px-4 max-w-sm mx-auto space-y-3">
          <Spinner className="size-6 text-foreground" />
          <p className="text-xs font-medium text-muted-foreground">Loading settings…</p>
        </div>
      </>
    );
  }

  return (
    <>
      <Header title="Settings" />
      <div className="p-4 sm:p-6 md:p-8 space-y-6 max-w-3xl mx-auto">
        {/* Account Profile Card */}
        {profile && (
          <Card className="p-6 space-y-4 transition-colors rounded-2xl">
            <div className="flex items-center gap-3 pb-3 border-b border-border">
              <div className="flex size-9 items-center justify-center rounded-lg bg-muted text-foreground border border-border">
                <User className="size-4.5" />
              </div>
              <div>
                <h2 className="text-base font-semibold text-foreground tracking-tight">
                  Account Details
                </h2>
                <p className="text-xs text-muted-foreground">
                  Your Telegram-linked identity
                </p>
              </div>
            </div>

            <dl className="divide-y divide-border text-sm">
              <div className="flex items-center justify-between py-3">
                <dt className="text-muted-foreground font-medium">Display name</dt>
                <dd className="font-medium text-foreground">{profile.display_name ?? "—"}</dd>
              </div>
              <div className="flex items-center justify-between py-3">
                <dt className="text-muted-foreground font-medium">Subscription Tier</dt>
                <dd>
                  <Badge variant="default" className="capitalize text-xs font-semibold">
                    {profile.plan_key}
                  </Badge>
                </dd>
              </div>
              <div className="flex items-center justify-between py-3">
                <dt className="text-muted-foreground font-medium">Member since</dt>
                <dd className="font-medium text-foreground tabular-nums">
                  {new Date(profile.created_at).toLocaleDateString("en-GB", {
                    day: "numeric",
                    month: "long",
                    year: "numeric",
                  })}
                </dd>
              </div>
            </dl>
          </Card>
        )}

        {/* Preferences Card */}
        {preferences && (
          <Card className="p-6 space-y-4 transition-colors rounded-2xl">
            <div className="flex items-center justify-between pb-3 border-b border-border">
              <div className="flex items-center gap-3">
                <div className="flex size-9 items-center justify-center rounded-lg bg-muted text-foreground border border-border">
                  <Sliders className="size-4.5" />
                </div>
                <div>
                  <h2 className="text-base font-semibold text-foreground tracking-tight">
                    Capture & Note Preferences
                  </h2>
                  <p className="text-xs text-muted-foreground">
                    Configured via Telegram bot commands
                  </p>
                </div>
              </div>

              <Button
                variant="outline"
                size="sm"
                onClick={() => window.open("https://t.me/NotinnBot", "_blank")}
                className="gap-1.5 text-xs"
              >
                <span>Edit in Telegram</span>
                <ExternalLink className="size-3" />
              </Button>
            </div>

            <dl className="divide-y divide-border text-sm">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between py-3 gap-1">
                <dt className="flex items-center gap-2 text-muted-foreground font-medium">
                  <Globe className="size-4 text-muted-foreground" />
                  <span>Output language</span>
                </dt>
                <dd>
                  <Badge variant="secondary" className="text-xs">
                    {LANGUAGE_LABELS[preferences.output_language] ?? preferences.output_language}
                  </Badge>
                </dd>
              </div>

              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between py-3 gap-1">
                <dt className="flex items-center gap-2 text-muted-foreground font-medium">
                  <Shield className="size-4 text-muted-foreground" />
                  <span>Privacy mode</span>
                </dt>
                <dd className="text-right">
                  <div className="flex items-center gap-2 justify-end">
                    <Badge variant="secondary" className="capitalize text-xs">
                      {preferences.privacy_mode}
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1 max-w-xs sm:text-right">
                    {PRIVACY_LABELS[preferences.privacy_mode]?.description ?? ""}
                  </p>
                </dd>
              </div>

              <div className="flex items-center justify-between py-3">
                <dt className="text-muted-foreground font-medium">Default text template</dt>
                <dd>
                  {preferences.default_text_template ? (
                    <span className="font-mono text-xs text-foreground bg-muted px-2.5 py-1 rounded border border-border">
                      {preferences.default_text_template}
                    </span>
                  ) : (
                    <Badge variant="secondary" className="text-[11px] font-normal">
                      Automatic default
                    </Badge>
                  )}
                </dd>
              </div>

              <div className="flex items-center justify-between py-3">
                <dt className="text-muted-foreground font-medium">Default voice template</dt>
                <dd>
                  {preferences.default_voice_template ? (
                    <span className="font-mono text-xs text-foreground bg-muted px-2.5 py-1 rounded border border-border">
                      {preferences.default_voice_template}
                    </span>
                  ) : (
                    <Badge variant="secondary" className="text-[11px] font-normal">
                      Automatic default
                    </Badge>
                  )}
                </dd>
              </div>

              <div className="flex items-center justify-between py-3">
                <dt className="text-muted-foreground font-medium">Default document template</dt>
                <dd>
                  {preferences.default_document_template ? (
                    <span className="font-mono text-xs text-foreground bg-muted px-2.5 py-1 rounded border border-border">
                      {preferences.default_document_template}
                    </span>
                  ) : (
                    <Badge variant="secondary" className="text-[11px] font-normal">
                      Automatic default
                    </Badge>
                  )}
                </dd>
              </div>
            </dl>

            <div className="rounded-lg bg-muted/40 p-3.5 text-xs text-muted-foreground flex items-start gap-3 border border-border">
              <Shield className="size-4 shrink-0 mt-0.5 text-muted-foreground/70" />
              <div className="space-y-1.5">
                <p>
                  <strong>Why are some templates empty?</strong><br/>
                  When a template is not set, Notinn uses its built-in smart defaults to structure your notes optimally based on the content type.
                </p>
                <p className="pt-1">
                  To adjust these settings, send <kbd className="px-1.5 py-0.5 rounded bg-muted border border-border text-foreground font-mono text-[11px]">/settings</kbd> to the Notinn bot in Telegram.
                </p>
              </div>
            </div>
          </Card>
        )}

        {/* Danger Zone */}
        <Card className="border-border bg-muted/10 p-6 space-y-3 rounded-2xl">
          <div className="flex items-center gap-3">
            <div className="flex size-9 items-center justify-center rounded-lg bg-muted text-muted-foreground border border-border">
              <AlertTriangle className="size-4.5" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-foreground tracking-tight">Danger Zone</h2>
              <p className="text-xs text-muted-foreground">Account and data lifecycle management</p>
            </div>
          </div>

          <p className="text-xs sm:text-sm text-muted-foreground leading-relaxed">
            To delete your account and all associated notes and files, send{" "}
            <kbd className="px-1.5 py-0.5 rounded bg-muted border border-border text-foreground font-mono text-xs">
              /delete_account
            </kbd>
            {" "}in Telegram. A 7-day cancellation window applies before permanent deletion.
          </p>
        </Card>
      </div>
    </>
  );
}
