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
  BUCKETS,
  downsampleToBuckets,
  normaliseBuckets,
} from "./recorder-waveform";

/**
 * Decode the recorded blob into normalised peak buckets for VoiceNote.
 * Falls back to null so the player keeps its synthetic waveform.
 */
async function decodeWaveformPeaks(blob: Blob): Promise<number[] | null> {
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
    return normaliseBuckets(downsampleToBuckets(channel, BUCKETS));
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
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // Initialize supported mime type on client
  useEffect(() => {
    setMimeConfig(pickRecorderMime((t) => MediaRecorder.isTypeSupported(t)));
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopTracks();
      if (timerIntervalRef.current != null) window.clearInterval(timerIntervalRef.current);
      if (animationFrameRef.current != null) window.cancelAnimationFrame(animationFrameRef.current);
      if (audioContextRef.current && audioContextRef.current.state !== "closed") {
        audioContextRef.current.close().catch(() => {});
      }
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
        "Rekaman dihentikan otomatis karena mendekati batas 45 MB. Anda bisa langsung membuat catatan AI atau merekam ulang.",
      );
    }
  }, [liveBytes, duration, state, stopRecording]);

  // Live waveform visualizer
  const startVisualizer = (stream: MediaStream) => {
    try {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtx) return;

      const audioCtx = new AudioCtx();
      audioContextRef.current = audioCtx;
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 64;
      analyserRef.current = analyser;

      const source = audioCtx.createMediaStreamSource(stream);
      source.connect(analyser);

      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      const bufferLength = analyser.frequencyBinCount;
      const dataArray = new Uint8Array(bufferLength);

      const draw = () => {
        animationFrameRef.current = requestAnimationFrame(draw);
        analyser.getByteFrequencyData(dataArray);

        ctx.clearRect(0, 0, canvas.width, canvas.height);

        const barCount = 24;
        const barWidth = 3;
        const gap = (canvas.width - barCount * barWidth) / (barCount - 1);

        for (let i = 0; i < barCount; i++) {
          const dataIdx = Math.floor((i / barCount) * (bufferLength / 2));
          const val = dataArray[dataIdx] || 0;
          const percent = val / 255;
          const minHeight = 4;
          const maxHeight = canvas.height * 0.9;
          const barHeight = Math.max(minHeight, percent * maxHeight);

          const x = i * (barWidth + gap);
          const y = (canvas.height - barHeight) / 2;

          ctx.fillStyle = val > 30 ? "rgb(239, 68, 68)" : "rgba(156, 163, 175, 0.4)";
          ctx.beginPath();
          ctx.roundRect(x, y, barWidth, barHeight, 2);
          ctx.fill();
        }
      };

      draw();
    } catch (err) {
      console.warn("AudioContext visualizer not available:", err);
    }
  };

  const stopVisualizer = () => {
    if (animationFrameRef.current != null) {
      window.cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
    if (audioContextRef.current && audioContextRef.current.state !== "closed") {
      audioContextRef.current.close().catch(() => {});
      audioContextRef.current = null;
    }
  };

  // Start recording
  const startRecording = async () => {
    setError(null);
    setState("requesting");

    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error("Browser Anda belum mendukung perekaman mikrofon.");
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
        stopVisualizer();

        const blobType = mimeConfig.mimeType || "audio/webm";
        const blob = new Blob(audioChunksRef.current, { type: blobType });
        setAudioBlob(blob);

        const url = URL.createObjectURL(blob);
        setAudioUrl(url);
        setState("review");

        const peaks = await decodeWaveformPeaks(blob);
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

      startVisualizer(stream);
    } catch (err) {
      stopTracks();
      setState("idle");
      const errName = (err as { name?: string }).name;
      if (errName === "NotAllowedError" || errName === "PermissionDeniedError") {
        setError("Izin akses mikrofon ditolak. Izinkan mikrofon di pengaturan browser untuk merekam.");
      } else if (errName === "NotFoundError" || errName === "DevicesNotFoundError") {
        setError("Mikrofon tidak ditemukan pada perangkat Anda.");
      } else {
        setError((err as Error).message || "Gagal memulai perekaman audio.");
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
    stopTracks();
    stopVisualizer();
    if (timerIntervalRef.current != null) window.clearInterval(timerIntervalRef.current);
    if (audioUrl) URL.revokeObjectURL(audioUrl);

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
            Rekam Suara Langsung
          </h3>
          <p className="mt-1.5 max-w-sm text-xs sm:text-sm text-muted-foreground/80 leading-relaxed font-sans">
            Tangkap percakapan, rapat, atau rekaman suara langsung dari browser Anda tanpa aplikasi tambahan.
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
              <span>Mulai Rekam</span>
            </Button>
            {onCancel && (
              <Button type="button" variant="ghost" size="lg" onClick={onCancel} className="min-h-11 rounded-full px-5 font-sans text-sm text-muted-foreground hover:text-foreground cursor-pointer">
                Batal
              </Button>
            )}
          </div>

          <p className="mt-4 flex items-center gap-1.5 text-[11px] text-muted-foreground/70">
            <Clock className="size-3" />
            <span>Maksimal {Math.floor(maxDurationSeconds / 60)} menit per sesi</span>
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
          <h4 className="font-sans text-lg font-semibold text-foreground">Izinkan Akses Mikrofon</h4>
          <p className="mt-1 text-xs text-muted-foreground font-sans">Silakan setujui izin mikrofon pada pop-up browser Anda.</p>
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
                {state === "recording" ? "Mendengarkan" : "Dijeda"}
              </span>
              <span className="text-muted-foreground/30">•</span>
              <span className="font-mono text-base font-semibold tracking-tight text-foreground tabular-nums">
                {formatDuration(duration)}
              </span>
            </div>
          </div>

          {/* Live Waveform Canvas */}
          <div className="flex w-full max-w-xs items-center justify-center rounded-xl border border-border/40 bg-muted/20 px-4 py-2.5">
            <canvas ref={canvasRef} width={280} height={32} className="w-full max-w-[280px]" />
          </div>

          {/* Action Buttons */}
          <div className="flex items-center gap-3 pt-1">
            {/* Cancel Button */}
            <Button
              type="button"
              variant="outline"
              size="icon"
              onClick={cancelRecording}
              title="Buang rekaman"
              aria-label="Buang rekaman"
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
                title="Jeda rekaman"
                aria-label="Jeda rekaman"
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
                title="Lanjutkan rekaman"
                aria-label="Lanjutkan rekaman"
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
              <span>Selesai</span>
            </Button>
          </div>
        </div>
      )}

      {/* STATE 3: REVIEW / PLAYBACK */}
      {state === "review" && audioBlob && (
        <div className="py-2 space-y-5">
          <div className="flex items-center justify-between border-b border-border/40 pb-3">
            <div className="flex items-center gap-3">
              <span className="[&_canvas]:!size-8 flex items-center justify-center">
                <ThinkingOrb state="composing" size={20} theme="auto" />
              </span>
              <div>
                <h4 className="font-sans text-base font-semibold text-foreground tracking-tight">Hasil Rekaman</h4>
                <p className="text-xs text-muted-foreground/80 font-sans">Periksa hasil rekaman suara sebelum dibuat menjadi catatan.</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="secondary" className="font-mono text-[11px] gap-1 rounded-full px-2.5 py-0.5 border border-border/40">
                <Clock className="size-3 text-muted-foreground" />
                <span>{formatDuration(duration)}</span>
              </Badge>
              <Badge variant="secondary" className="font-mono text-[11px] rounded-full px-2.5 py-0.5 border border-border/40">
                {formatBytes(audioBlob.size)}
              </Badge>
            </div>
          </div>

          {/* Rare UI Voice Note Player */}
          <div className="flex w-full items-center justify-center py-2">
            <VoiceNote
              src={audioUrl || undefined}
              duration={duration}
              waveform={waveformPeaks ?? undefined}
              size="md"
              accent="var(--primary)"
              className="w-full max-w-lg shadow-sm"
            />
          </div>

          {/* Action CTAs */}
          <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={cancelRecording}
              className="gap-1.5 rounded-full text-xs text-muted-foreground hover:text-foreground cursor-pointer font-sans"
            >
              <RotateCcw className="size-3.5" />
              <span>Rekam Ulang</span>
            </Button>

            <div className="flex items-center gap-2">
              {onCancel && (
                <Button type="button" variant="ghost" size="sm" onClick={onCancel} className="rounded-full text-xs cursor-pointer font-sans text-muted-foreground">
                  Tutup
                </Button>
              )}
              <Button
                type="button"
                variant="default"
                size="sm"
                onClick={handleSubmit}
                className="min-h-10 rounded-full gap-2 px-5 font-sans font-medium text-xs bg-foreground text-background hover:bg-foreground/90 shadow-xs cursor-pointer transition-all"
              >
                <span>Gunakan Rekaman</span>
                <ArrowRight className="size-3.5" />
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
