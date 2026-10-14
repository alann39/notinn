"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  AlertCircle,
  ArrowRight,
  Clock,
  Mic,
  Pause,
  Play,
  RotateCcw,
  Square,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { ThinkingOrb } from "@/components/ui/thinking-orbs";
import { VoiceNote } from "@/components/ui/voice-note";
import {
  MAX_AUDIO_BYTES,
  formatBytes,
  formatDuration,
  pickRecorderMime,
  secondsUntilCap,
} from "./recorder-limits";
import {
  downsampleToBuckets,
  normaliseBuckets,
} from "./recorder-waveform";

/**
 * Decode the recorded blob into normalised peak buckets for VoiceNote.
 * Falls back to null so the player keeps its synthetic waveform.
 */
async function decodeWaveformPeaks(blob: Blob, buckets: number = 28): Promise<number[] | null> {
  if (typeof window === "undefined") {
    return null;
  }
  try {
    const arrayBuffer = await blob.arrayBuffer();
    const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return null;
    const ctx = new AudioCtx();
    const audioBuffer = await ctx.decodeAudioData(arrayBuffer);
    await ctx.close();
    const channel = audioBuffer.getChannelData(0);
    return normaliseBuckets(downsampleToBuckets(channel, buckets));
  } catch {
    return null;
  }
}

export interface TemplateItem {
  template_key: string;
  template_name: string;
  description: string;
  is_custom?: boolean;
  is_default?: boolean;
}

export interface InBrowserRecorderProps {
  onAudioReady?: (file: File, durationSeconds: number, templateKey: string) => void;
  onCancel?: () => void;
  templates?: TemplateItem[];
  defaultTemplateKey?: string;
  maxDurationSeconds?: number; // e.g. 1800 (30m Free) or 7200 (2h Pro)
  className?: string;
}

type RecorderState = "idle" | "requesting" | "recording" | "paused" | "review";

export function InBrowserRecorder({
  onAudioReady,
  onCancel,
  defaultTemplateKey = "clean_note",
  maxDurationSeconds = 1800, // 30 mins
  className,
}: InBrowserRecorderProps) {
  const [state, setState] = useState<RecorderState>("idle");
  const [duration, setDuration] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [mimeConfig, setMimeConfig] = useState({ mimeType: "audio/webm", extension: "webm" });
  const [liveBytes, setLiveBytes] = useState(0);
  const [waveformPeaks, setWaveformPeaks] = useState<number[] | null>(null);

  // Refs for audio infrastructure
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const timerIntervalRef = useRef<number | null>(null);
  const isDiscardingRef = useRef(false);


  // Initialize supported mime type on client
  useEffect(() => {
    setMimeConfig(pickRecorderMime((t) => MediaRecorder.isTypeSupported(t)));
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopTracks();
      if (timerIntervalRef.current != null) window.clearInterval(timerIntervalRef.current);
      if (audioUrl) URL.revokeObjectURL(audioUrl);
    };
  }, [audioUrl]);

  const stopTracks = () => {
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((track) => track.stop());
      mediaStreamRef.current = null;
    }
  };

  // Stop recording & proceed to review
  const stopRecording = useCallback(() => {
    if (timerIntervalRef.current != null) {
      window.clearInterval(timerIntervalRef.current);
      timerIntervalRef.current = null;
    }
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      mediaRecorderRef.current.stop();
    }
  }, []);

  // Hard stop before the blob outgrows the Supabase 45 MB ceiling.
  useEffect(() => {
    if (state !== "recording" && state !== "paused") return;
    if (duration < 5) return; // need a stable byte-rate sample
    const left = secondsUntilCap(liveBytes, duration, MAX_AUDIO_BYTES);
    if (left !== null && left <= 10) {
      stopRecording();
      setError(
        "Recording stopped automatically because it is approaching the 45 MB limit. You can generate the AI note or record again.",
      );
    }
  }, [liveBytes, duration, state, stopRecording]);

  // Live waveform visualizer


  // Start recording
  const startRecording = async () => {
    isDiscardingRef.current = false;
    setError(null);
    setState("requesting");

    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error("Your browser does not support microphone recording.");
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });

      mediaStreamRef.current = stream;
      audioChunksRef.current = [];

      const options = mimeConfig.mimeType ? { mimeType: mimeConfig.mimeType } : undefined;
      const recorder = new MediaRecorder(stream, options);
      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          audioChunksRef.current.push(event.data);
          setLiveBytes((prev) => prev + event.data.size);
        }
      };

      recorder.onstop = async () => {
        stopTracks();

        if (isDiscardingRef.current) {
          isDiscardingRef.current = false;
          audioChunksRef.current = [];
          setAudioBlob(null);
          setAudioUrl(null);
          setDuration(0);
          setLiveBytes(0);
          setWaveformPeaks(null);
          setState("idle");
          return;
        }

        const blobType = mimeConfig.mimeType || "audio/webm";
        const blob = new Blob(audioChunksRef.current, { type: blobType });
        setAudioBlob(blob);

        const url = URL.createObjectURL(blob);
        setAudioUrl(url);
        setState("review");

        const peaks = await decodeWaveformPeaks(blob, 28);
        setWaveformPeaks(peaks);
      };

      recorder.start(500); // 500ms chunk slices
      setState("recording");
      setDuration(0);
      setLiveBytes(0);

      // Start duration timer
      timerIntervalRef.current = window.setInterval(() => {
        setDuration((prev) => {
          const next = prev + 1;
          if (next >= maxDurationSeconds) {
            stopRecording();
          }
          return next;
        });
      }, 1000);


    } catch (err) {
      stopTracks();
      setState("idle");
      const errName = (err as { name?: string }).name;
      if (errName === "NotAllowedError" || errName === "PermissionDeniedError") {
        setError("Microphone access denied. Please allow microphone permissions in your browser settings to record.");
      } else if (errName === "NotFoundError" || errName === "DevicesNotFoundError") {
        setError("No microphone found on your device.");
      } else {
        setError((err as Error).message || "Failed to start audio recording.");
      }
    }
  };

  // Pause recording
  const pauseRecording = () => {
    if (mediaRecorderRef.current && state === "recording") {
      mediaRecorderRef.current.pause();
      if (timerIntervalRef.current != null) window.clearInterval(timerIntervalRef.current);
      setState("paused");
    }
  };

  // Resume recording
  const resumeRecording = () => {
    if (mediaRecorderRef.current && state === "paused") {
      mediaRecorderRef.current.resume();
      timerIntervalRef.current = window.setInterval(() => {
        setDuration((prev) => {
          const next = prev + 1;
          if (next >= maxDurationSeconds) stopRecording();
          return next;
        });
      }, 1000);
      setState("recording");
    }
  };

  // Cancel / Discard
  const cancelRecording = () => {
    isDiscardingRef.current = true;
    stopTracks();

    if (timerIntervalRef.current != null) {
      window.clearInterval(timerIntervalRef.current);
      timerIntervalRef.current = null;
    }
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      mediaRecorderRef.current.stop();
    }
    if (audioUrl) URL.revokeObjectURL(audioUrl);

    audioChunksRef.current = [];
    setAudioBlob(null);
    setAudioUrl(null);
    setDuration(0);
    setLiveBytes(0);
    setWaveformPeaks(null);
    setState("idle");
    setError(null);
  };

  // Handle final submission
  const handleSubmit = () => {
    if (!audioBlob) return;
    const filename = `recording-${Date.now()}.${mimeConfig.extension}`;
    const file = new File([audioBlob], filename, { type: audioBlob.type });
    onAudioReady?.(file, duration, defaultTemplateKey);
  };

  return (
    <div className={cn("w-full rounded-2xl border border-border/50 bg-card/60 backdrop-blur-xs p-6 sm:p-8 shadow-xs", className)}>

      {/* Error Banner */}
      {error && (
        <div className="mb-5 flex items-start gap-3 rounded-xl border border-destructive/40 bg-destructive/10 p-3.5 text-xs sm:text-sm text-destructive">
          <AlertCircle className="mt-0.5 size-4 shrink-0" />
          <div className="min-w-0 flex-1">{error}</div>
        </div>
      )}

      {/* STATE 1: IDLE */}
      {state === "idle" && (
        <div className="flex flex-col items-center py-6 text-center">
          {/* Thinking Orb */}
          <div className="relative mb-5 flex items-center justify-center">
            <div className="relative flex size-20 items-center justify-center rounded-full border border-border/40 bg-muted/30 shadow-xs backdrop-blur-xs transition-transform hover:scale-105">
              <span className="[&_canvas]:!size-16 flex items-center justify-center">
                <ThinkingOrb state="working" size={64} theme="auto" />
              </span>
            </div>
          </div>

          <h3 className="font-sans text-xl sm:text-2xl font-semibold tracking-tight text-foreground">
            Record Audio Directly
          </h3>
          <p className="mt-1.5 max-w-sm text-xs sm:text-sm text-muted-foreground/80 leading-relaxed font-sans">
            Capture conversations, meetings, or voice memos directly from your browser with no extra apps needed.
          </p>

          <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
            <Button
              type="button"
              variant="default"
              size="lg"
              onClick={startRecording}
              className="min-h-11 rounded-full gap-2 px-6 font-sans font-medium text-sm shadow-xs cursor-pointer bg-foreground text-background hover:bg-foreground/90 transition-all"
            >
              <Mic className="size-4" />
              <span>Start Recording</span>
            </Button>
            {onCancel && (
              <Button type="button" variant="ghost" size="lg" onClick={onCancel} className="min-h-11 rounded-full px-5 font-sans text-sm text-muted-foreground hover:text-foreground cursor-pointer">
                Cancel
              </Button>
            )}
          </div>

          <p className="mt-4 flex items-center gap-1.5 text-[11px] text-muted-foreground/70">
            <Clock className="size-3" />
            <span>Maximum {Math.floor(maxDurationSeconds / 60)} minutes per session</span>
          </p>
        </div>
      )}

      {/* STATE 1B: REQUESTING PERMISSION */}
      {state === "requesting" && (
        <div className="flex flex-col items-center py-10 text-center">
          <div className="relative mb-5 flex size-20 items-center justify-center rounded-full border border-border/40 bg-muted/30 shadow-xs backdrop-blur-xs">
            <span className="[&_canvas]:!size-16 flex items-center justify-center">
              <ThinkingOrb state="searching" size={64} theme="auto" />
            </span>
          </div>
          <h4 className="font-sans text-lg font-semibold text-foreground">Allow Microphone Access</h4>
          <p className="mt-1 text-xs text-muted-foreground font-sans">Please grant microphone permission in your browser prompt.</p>
        </div>
      )}

      {/* STATE 2: RECORDING OR PAUSED */}
      {(state === "recording" || state === "paused") && (
        <div className="flex flex-col items-center py-6 text-center space-y-5">
          {/* Hero Thinking Orb */}
          <div className="relative flex flex-col items-center justify-center">
            <div
              className={cn(
                "relative flex items-center justify-center size-22 rounded-full transition-all duration-300",
                state === "recording"
                  ? "shadow-2xl ring-1 ring-white/15"
                  : "ring-1 ring-white/10 opacity-90",
              )}
              style={{
                background: "rgba(24, 24, 27, 0.85)",
                backdropFilter: "blur(16px)",
                boxShadow:
                  "inset 0 0 0 1px rgba(255, 255, 255, 0.12), inset 0 0 30px 0 rgba(255, 255, 255, 0.02), 0 16px 36px -10px rgba(0, 0, 0, 0.5)",
              }}
            >
              <span className="[&_canvas]:!size-16 flex items-center justify-center">
                <ThinkingOrb
                  state={state === "recording" ? "listening" : "breathing"}
                  size={64}
                  theme="dark"
                  speed={state === "recording" ? 1.2 : 0.4}
                />
              </span>
            </div>

            {/* Floating Status & Timer Island */}
            <div className="mt-4 flex items-center gap-2.5 rounded-full border border-border/40 bg-background/80 px-4 py-1.5 shadow-2xs backdrop-blur-xs">
              <span
                className={cn(
                  "size-2 rounded-full",
                  state === "recording" ? "bg-red-500 animate-pulse" : "bg-amber-400",
                )}
              />
              <span className="text-[11px] font-sans font-medium uppercase tracking-wider text-muted-foreground">
                {state === "recording" ? "Listening" : "Paused"}
              </span>
              <span className="text-muted-foreground/30">•</span>
              <span className="font-mono text-base font-semibold tracking-tight text-foreground tabular-nums">
                {formatDuration(duration)}
              </span>
            </div>
          </div>



          {/* Action Buttons */}
          <div className="flex items-center gap-3 pt-1">
            {/* Cancel Button */}
            <Button
              type="button"
              variant="outline"
              size="icon"
              onClick={cancelRecording}
              title="Discard recording"
              aria-label="Discard recording"
              className="size-11 rounded-full text-muted-foreground hover:bg-destructive/10 hover:text-destructive cursor-pointer"
            >
              <Trash2 className="size-4" />
            </Button>

            {/* Pause / Resume Button */}
            {state === "recording" ? (
              <Button
                type="button"
                variant="outline"
                size="icon"
                onClick={pauseRecording}
                title="Pause recording"
                aria-label="Pause recording"
                className="size-11 rounded-full border-border/50 hover:bg-muted cursor-pointer"
              >
                <Pause className="size-4" />
              </Button>
            ) : (
              <Button
                type="button"
                variant="outline"
                size="icon"
                onClick={resumeRecording}
                title="Resume recording"
                aria-label="Resume recording"
                className="size-11 rounded-full text-primary border-primary/40 hover:bg-primary/10 cursor-pointer"
              >
                <Play className="size-4" />
              </Button>
            )}

            {/* Stop / Finish Button */}
            <Button
              type="button"
              variant="default"
              size="lg"
              onClick={stopRecording}
              className="min-h-11 rounded-full gap-2 px-6 font-sans font-medium text-sm bg-foreground text-background hover:bg-foreground/90 cursor-pointer shadow-xs transition-all"
            >
              <Square className="size-3.5 fill-current" />
              <span>Finish</span>
            </Button>
          </div>
        </div>
      )}

      {/* STATE 3: REVIEW / PLAYBACK */}
      {state === "review" && audioBlob && (
        <div className="py-1 space-y-4">
          {/* Header Info: Responsive Stack on Mobile */}
          <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center sm:justify-between border-b border-border/40 pb-3">
            <div className="flex items-start sm:items-center gap-2.5">
              <span className="[&_canvas]:!size-6 flex items-center justify-center shrink-0 mt-0.5 sm:mt-0">
                <ThinkingOrb state="composing" size={20} theme="auto" />
              </span>
              <div className="min-w-0">
                <h4 className="font-sans text-sm sm:text-base font-semibold text-foreground tracking-tight">Recorded Audio</h4>
                <p className="text-[11px] sm:text-xs text-muted-foreground/80 font-sans leading-tight">Review your recorded voice note before generating the note.</p>
              </div>
            </div>
            <div className="flex items-center gap-1.5 shrink-0 self-start sm:self-auto pl-9 sm:pl-0">
              <Badge variant="secondary" className="font-mono text-[10px] sm:text-[11px] gap-1 rounded-full px-2 py-0.5 border border-border/40">
                <Clock className="size-3 text-muted-foreground" />
                <span>{formatDuration(duration)}</span>
              </Badge>
              <Badge variant="secondary" className="font-mono text-[10px] sm:text-[11px] rounded-full px-2 py-0.5 border border-border/40">
                {formatBytes(audioBlob.size)}
              </Badge>
            </div>
          </div>

          {/* Rare UI Voice Note Player - Fully Fluid Container */}
          <div className="flex w-full items-center justify-center py-1 overflow-hidden">
            <VoiceNote
              src={audioUrl || undefined}
              duration={duration}
              waveform={waveformPeaks ?? undefined}
              bars={28}
              size="md"
              accent="var(--primary)"
              className="w-full max-w-full shadow-sm"
            />
          </div>

          {/* Action CTAs: Clean Mobile Dock */}
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-between pt-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={cancelRecording}
              className="h-10 sm:h-9 w-full sm:w-auto gap-1.5 rounded-full text-xs text-muted-foreground hover:text-foreground cursor-pointer font-sans"
            >
              <RotateCcw className="size-3.5" />
              <span>Record Again</span>
            </Button>

            <div className="flex items-center gap-2 w-full sm:w-auto">
              {onCancel && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={onCancel}
                  className="h-10 sm:h-9 flex-1 sm:flex-none rounded-full text-xs cursor-pointer font-sans text-muted-foreground hover:text-foreground"
                >
                  Close
                </Button>
              )}
              <Button
                type="button"
                variant="default"
                size="sm"
                onClick={handleSubmit}
                className="h-10 sm:h-9 flex-1 sm:flex-none rounded-full gap-2 px-5 font-sans font-medium text-xs bg-foreground text-background hover:bg-foreground/90 shadow-xs cursor-pointer transition-all"
              >
                <span>Use Recording</span>
                <ArrowRight className="size-3.5" />
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
