import { useCallback, useEffect, useRef, useState } from "react";
import {
  AlertCircle,
  Clock,
  FileAudio,
  FileText,
  HardDrive,
  Image as ImageIcon,
  Loader2,
  Sparkles,
  UploadCloud,
  X,
} from "lucide-react";
import { supabase, SUPABASE_URL, SUPABASE_ANON_KEY } from "@/lib/supabase";
import * as tus from "tus-js-client";
import { FFmpeg } from "@ffmpeg/ffmpeg";
import { fetchFile, toBlobURL } from "@ffmpeg/util";
import { useAuth } from "@/hooks/use-auth";
import {
  Dialog,
  DialogHeader,
  DialogPopup,
  DialogTitle,
  DialogDescription,
  DialogPanel,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectPopup,
  SelectItem,
  SelectGroup,
  SelectGroupLabel,
  SelectSeparator,
} from "@/components/ui/select";
import { Progress, ProgressTrack, ProgressIndicator } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { toastManager } from "@/components/ui/toast";
import { cn } from "@/lib/utils";

export type ModalityType = "audio" | "pdf" | "image";

const AUDIO_EXTENSIONS: Record<string, string> = {
  mp3: "audio/mpeg",
  m4a: "audio/m4a",
  ogg: "audio/ogg",
  opus: "audio/opus",
  wav: "audio/wav",
  aac: "audio/aac",
  webm: "audio/webm",
  flac: "audio/flac",
};

const IMAGE_EXTENSIONS: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  heic: "image/heic",
};

const DOC_EXTENSIONS: Record<string, string> = {
  pdf: "application/pdf",
};

export interface TemplateItem {
  template_key: string;
  template_name: string;
  description: string;
  is_custom: boolean;
  is_default: boolean;
}

const DEFAULT_TEMPLATES: Record<string, TemplateItem[]> = {
  audio: [
    { template_key: "clean_note", template_name: "Clean Note", description: "Structured, clear & formatted note", is_custom: false, is_default: true },
    { template_key: "short_summary", template_name: "Short Summary", description: "A concise TL;DR and key points", is_custom: false, is_default: false },
    { template_key: "detailed_summary", template_name: "Detailed Summary", description: "Sectioned summary preserving major context", is_custom: false, is_default: false },
    { template_key: "action_items", template_name: "Action Items", description: "Tasks, owners, and deadlines when present", is_custom: false, is_default: false },
    { template_key: "meeting_notes", template_name: "Meeting Notes", description: "Agenda, discussion, decisions, and action items", is_custom: false, is_default: false },
    { template_key: "study_notes", template_name: "Study Notes", description: "Concepts, explanations, examples, and review questions", is_custom: false, is_default: false },
  ],
  pdf: [
    { template_key: "extract_and_summarize", template_name: "Extract & Summarize", description: "Comprehensive extraction with structured key sections", is_custom: false, is_default: true },
    { template_key: "short_summary", template_name: "Short Summary", description: "Quick executive summary of the document", is_custom: false, is_default: false },
    { template_key: "action_items", template_name: "Action Items", description: "Extract tasks and deliverables from document", is_custom: false, is_default: false },
    { template_key: "research_note", template_name: "Research Note", description: "Research question, findings, evidence, and implications", is_custom: false, is_default: false },
  ],
  image: [
    { template_key: "extract_and_summarize", template_name: "Extract & Summarize", description: "Visual extraction with structured summary", is_custom: false, is_default: true },
    { template_key: "clean_note", template_name: "Clean Note", description: "Clean structured transcription of image content", is_custom: false, is_default: false },
    { template_key: "key_points", template_name: "Key Points", description: "Key information and bullet points from screenshot", is_custom: false, is_default: false },
  ],
  text: [
    { template_key: "clean_note", template_name: "Clean Note", description: "Structured, clear & formatted note", is_custom: false, is_default: true },
    { template_key: "short_summary", template_name: "Short Summary", description: "A concise TL;DR and key points", is_custom: false, is_default: false },
    { template_key: "detailed_summary", template_name: "Detailed Summary", description: "Sectioned summary preserving major context", is_custom: false, is_default: false },
    { template_key: "action_items", template_name: "Action Items", description: "Tasks, action items, and next steps", is_custom: false, is_default: false },
    { template_key: "study_notes", template_name: "Study Notes", description: "Study guide with concepts and review questions", is_custom: false, is_default: false },
  ],
};

const FREE_MAX_AUDIO_BYTES = 14 * 1024 * 1024; // 14 MB
const PRO_MAX_AUDIO_BYTES = 100 * 1024 * 1024; // 100 MB
const MAX_DOC_BYTES = 14 * 1024 * 1024; // 14 MB
const FREE_MAX_SECONDS = 1800; // 30 mins
const PRO_MAX_SECONDS = 7200; // 2 hours
const MAX_TEXT_CHARS = 50000;

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
}

function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  if (mins < 60) return secs > 0 ? `${mins}m ${secs}s` : `${mins}m`;
  const hours = Math.floor(mins / 60);
  const remMins = mins % 60;
  return remMins > 0 ? `${hours}h ${remMins}m` : `${hours}h`;
}

function delay(ms: number): Promise<void> {
  const { promise, resolve } = Promise.withResolvers<void>();
  setTimeout(resolve, ms);
  return promise;
}

function readAudioDuration(file: File): Promise<number | null> {
  const { promise, resolve } = Promise.withResolvers<number | null>();
  try {
    const audio = document.createElement("audio");
    audio.preload = "metadata";
    const objectUrl = URL.createObjectURL(file);
    audio.src = objectUrl;

    let settled = false;
    const finish = (result: number | null) => {
      if (!settled) {
        settled = true;
        URL.revokeObjectURL(objectUrl);
        resolve(result);
      }
    };

    audio.onloadedmetadata = () => {
      const d = Math.round(audio.duration);
      finish(Number.isFinite(d) && d > 0 ? d : null);
    };

    audio.onerror = () => {
      finish(null);
    };

    setTimeout(() => finish(null), 3000);
  } catch {
    resolve(null);
  }
  return promise;
}

function detectModality(file: File): { modality: ModalityType; mimeType: string } | null {
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
  if (AUDIO_EXTENSIONS[ext] || file.type.startsWith("audio/")) {
    return { modality: "audio", mimeType: file.type || AUDIO_EXTENSIONS[ext] || "audio/mpeg" };
  }
  if (DOC_EXTENSIONS[ext] || file.type === "application/pdf") {
    return { modality: "pdf", mimeType: "application/pdf" };
  }
  if (IMAGE_EXTENSIONS[ext] || file.type.startsWith("image/")) {
    return { modality: "image", mimeType: file.type || IMAGE_EXTENSIONS[ext] || "image/jpeg" };
  }
  return null;
}

// Singleton FFmpeg instance (loaded once per session)
let ffmpegInstance: FFmpeg | null = null;

async function compressAudioIfNeeded(file: File): Promise<File> {
  const FIFTY_MB = 50 * 1024 * 1024;
  if (file.size <= FIFTY_MB) return file; // already small enough

  const ffmpeg = ffmpegInstance ?? (ffmpegInstance = new FFmpeg());
  if (!ffmpeg.loaded) {
    const baseURL = "https://unpkg.com/@ffmpeg/core@0.12.10/dist/umd";
    await ffmpeg.load({
      coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, "text/javascript"),
      wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, "application/wasm"),
    });
  }

  const inputName = "input.m4a";
  const outputName = "output.m4a";
  await ffmpeg.writeFile(inputName, await fetchFile(file));
  await ffmpeg.exec([
    "-i", inputName,
    "-c:a", "aac",
    "-b:a", "48k",
    "-ac", "1",
    outputName,
  ]);
  const data = await ffmpeg.readFile(outputName);
  const blob = new Blob([data], { type: "audio/mp4" });
  return new File([blob], file.name.replace(/\.m4a$/i, "_compressed.m4a"), {
    type: "audio/mp4",
  });
}

export interface UploadAudioDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
  onNoteReady?: (noteId: string) => void;
}

export function UploadAudioDialog({
  open,
  onOpenChange,
  onSuccess,
  onNoteReady,
}: UploadAudioDialogProps) {
  const { user, profile } = useAuth();
  const [activeTab, setActiveTab] = useState<"upload" | "text">("upload");

  // Tab 1 (File Upload) States
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [detectedModality, setDetectedModality] = useState<ModalityType>("audio");
  const [durationSeconds, setDurationSeconds] = useState<number | null>(null);
  const [fileTemplates, setFileTemplates] = useState<TemplateItem[]>(DEFAULT_TEMPLATES.audio);
  const [fileTemplateKey, setFileTemplateKey] = useState<string>("clean_note");
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<number>(0);
  const [bytesProgress, setBytesProgress] = useState<{ loaded: number; total: number } | null>(null);
  const [statusText, setStatusText] = useState<string>("");
  const [fileError, setFileError] = useState<string | null>(null);

  // Tab 2 (Paste Text) States
  const [pastedText, setPastedText] = useState<string>("");
  const [textTemplates, setTextTemplates] = useState<TemplateItem[]>(DEFAULT_TEMPLATES.text);
  const [textTemplateKey, setTextTemplateKey] = useState<string>("clean_note");
  const [isSubmittingText, setIsSubmittingText] = useState(false);
  const [textStatusText, setTextStatusText] = useState<string>("");
  const [textError, setTextError] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const isProOrAlpha = profile?.plan_key === "pro" || profile?.plan_key === "alpha";
  const maxAudioBytes = isProOrAlpha ? PRO_MAX_AUDIO_BYTES : FREE_MAX_AUDIO_BYTES;
  const maxDuration = isProOrAlpha ? PRO_MAX_SECONDS : FREE_MAX_SECONDS;

  const resetState = useCallback(() => {
    setSelectedFile(null);
    setDetectedModality("audio");
    setDurationSeconds(null);
    setFileTemplateKey("clean_note");
    setIsDragging(false);
    setIsUploading(false);
    setUploadProgress(0);
    setBytesProgress(null);
    setStatusText("");
    setFileError(null);

    setPastedText("");
    setTextTemplateKey("clean_note");
    setIsSubmittingText(false);
    setTextStatusText("");
    setTextError(null);

    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  }, []);

  // Fetch templates for a specific modality
  const loadTemplatesForModality = useCallback(async (modality: string) => {
    try {
      const { data, error } = await supabase.rpc("web_list_templates", {
        p_input_type: modality,
      });
      if (!error && Array.isArray(data) && data.length > 0) {
        const list = data as TemplateItem[];
        const defaultTpl = list.find((t) => t.is_default) || list[0];
        return { list, defaultKey: defaultTpl ? defaultTpl.template_key : "clean_note" };
      }
    } catch {
      // fallback
    }
    const fallback = DEFAULT_TEMPLATES[modality] || DEFAULT_TEMPLATES.audio;
    const defaultTpl = fallback.find((t) => t.is_default) || fallback[0];
    return { list: fallback, defaultKey: defaultTpl.template_key };
  }, []);

  // Initial template loading when dialog opens
  useEffect(() => {
    if (!open) return;
    let cancelled = false;

    async function initTemplates() {
      const [audioRes, textRes] = await Promise.all([
        loadTemplatesForModality("audio"),
        loadTemplatesForModality("text"),
      ]);
      if (cancelled) return;
      setFileTemplates(audioRes.list);
      setFileTemplateKey(audioRes.defaultKey);
      setTextTemplates(textRes.list);
      setTextTemplateKey(textRes.defaultKey);
    }

    initTemplates();
    return () => {
      cancelled = true;
    };
  }, [open, loadTemplatesForModality]);

  const handleOpenChange = (newOpen: boolean) => {
    if (!newOpen && (isUploading || isSubmittingText)) {
      return;
    }
    if (!newOpen) {
      resetState();
    }
    onOpenChange(newOpen);
  };

  const handleFile = async (file: File) => {
    setFileError(null);
    const detection = detectModality(file);

    if (!detection) {
      setFileError(
        "Unsupported file format. Supported: Audio (MP3, M4A, WAV, AAC, WEBM, FLAC), PDF documents, and Images (JPG, PNG, WebP, HEIC).",
      );
      return;
    }

    const { modality } = detection;

    // Check size limit according to modality
    if (modality === "pdf" || modality === "image") {
      if (file.size > MAX_DOC_BYTES) {
        setFileError(
          `File size (${formatBytes(file.size)}) exceeds the 14 MB limit for ${modality === "pdf" ? "PDF documents" : "images"}.`,
        );
        return;
      }
    } else {
      // Audio size check
      if (file.size > maxAudioBytes) {
        if (!isProOrAlpha) {
          setFileError(
            `Audio file size (${formatBytes(file.size)}) exceeds the Free plan limit (${formatBytes(FREE_MAX_AUDIO_BYTES)}). Upgrade to Pro for uploads up to 100 MB.`,
          );
        } else {
          setFileError(
            `Audio file size (${formatBytes(file.size)}) exceeds the 100 MB limit. Split long recordings into smaller files.`,
          );
        }
        return;
      }
    }

    setSelectedFile(file);
    setDetectedModality(modality);

    // Fetch and switch templates for detected modality
    const { list, defaultKey } = await loadTemplatesForModality(modality);
    setFileTemplates(list);
    setFileTemplateKey(defaultKey);

    // Try to extract duration if audio
    if (modality === "audio") {
      const duration = await readAudioDuration(file);
      if (duration !== null) {
        setDurationSeconds(duration);
        if (duration > maxDuration) {
          setFileError(
            `Audio duration (${formatDuration(duration)}) exceeds your plan limit (${formatDuration(maxDuration)}).`,
          );
        }
      } else {
        setDurationSeconds(null);
      }
    } else {
      setDurationSeconds(null);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    if (isUploading) return;
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    if (isUploading) return;
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = async (e: React.DragEvent) => {
    if (isUploading) return;
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) {
      await handleFile(file);
    }
  };

  const handleFileInputChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (isUploading) return;
    const file = e.target.files?.[0];
    if (file) {
      await handleFile(file);
    }
  };

  // Poll for note readiness
  const pollJobCompletion = async (jobId: string, successLabel: string) => {
    let attempts = 0;
    const maxAttempts = 30; // 30 * 1.5s = 45s
    let resolvedNoteId: string | null = null;

    while (attempts < maxAttempts) {
      await delay(1500);
      attempts += 1;

      try {
        const { data: statusData, error: statusError } = await supabase.rpc("web_get_job_status", {
          p_job_id: jobId,
        });

        if (!statusError && statusData) {
          const statusRow = Array.isArray(statusData) ? statusData[0] : statusData;
          if (statusRow && typeof statusRow === "object") {
            if ("note_id" in statusRow && typeof statusRow.note_id === "string") {
              resolvedNoteId = statusRow.note_id;
              break;
            }
            if ("state" in statusRow && (statusRow.state === "FAILED" || statusRow.state === "CANCELLED")) {
              break;
            }
          }
        }
      } catch {
        // continue polling
      }
    }

    if (resolvedNoteId && onNoteReady) {
      setUploadProgress(100);
      setStatusText("Complete!");

      toastManager.add({
        title: "Note Ready!",
        description: "Note processed successfully. Opening preview...",
        type: "success",
      });

      setTimeout(() => {
        resetState();
        onOpenChange(false);
        onNoteReady(resolvedNoteId!);
      }, 400);
      return;
    }

    toastManager.add({
      title: successLabel,
      description: "Note is processing in the background and will appear in your notes list shortly.",
      type: "default",
    });

    setTimeout(() => {
      resetState();
      onOpenChange(false);
      onSuccess?.();
    }, 500);
  };

  // Upload handler for Tab 1 (File)
  const handleUploadFile = async () => {
    if (!selectedFile || !user || isUploading) return;
    setIsUploading(true);
    setFileError(null);
    setUploadProgress(5);
    setStatusText("Preparing file...");
    setBytesProgress({ loaded: 0, total: selectedFile.size });

    const modalityName = detectedModality === "pdf" ? "PDF Document" : detectedModality === "image" ? "Image" : "Audio";

    toastManager.add({
      title: `Uploading ${modalityName}...`,
      description: `Uploading "${selectedFile.name}" (${formatBytes(selectedFile.size)}). Please wait...`,
      type: "default",
    });

    try {
      const detection = detectModality(selectedFile);
      const ext = selectedFile.name.split(".").pop()?.toLowerCase() || (detectedModality === "pdf" ? "pdf" : "jpg");
      const mimeType = detection?.mimeType || selectedFile.type || "application/octet-stream";
      const uniqueId = crypto.randomUUID();
      const storagePath = `${user.id}/${uniqueId}.${ext}`;

      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData.session?.access_token;
      if (!accessToken) {
        throw new Error("Invalid session. Please sign in again.");
      }

      // Compress audio if file exceeds Supabase 50MB limit
      let fileToUpload = selectedFile;
      if (selectedFile.size > 50 * 1024 * 1024) {
        setStatusText("Compressing audio (this may take a moment)...");
        setUploadProgress(3);
        fileToUpload = await compressAudioIfNeeded(selectedFile);
      }

      setStatusText(`Uploading ${modalityName.toLowerCase()} to secure storage...`);

      // TUS resumable upload (no 50MB cap on Supabase free tier)
      const tusEndpoint = `${SUPABASE_URL}/storage/v1/upload/resumable`;
      await new Promise<void>((resolve, reject) => {
        const upload = new tus.Upload(fileToUpload, {
          endpoint: tusEndpoint,
          retryDelays: [0, 1000, 3000, 5000],
          chunkSize: 2 * 1024 * 1024, // 2MB chunks (Supabase Kong gateway limit)
          headers: {
            Authorization: `Bearer ${accessToken}`,
            apikey: SUPABASE_ANON_KEY,
          },
          metadata: {
            bucketName: "audio_uploads",
            objectName: storagePath,
            contentType: mimeType,
            cacheControl: "3600",
          },
          onProgress: (bytesUploaded, bytesTotal) => {
            setBytesProgress({ loaded: bytesUploaded, total: bytesTotal });
            const filePercent = bytesTotal > 0 ? bytesUploaded / bytesTotal : 0;
            setUploadProgress(Math.min(85, Math.round(5 + filePercent * 80)));
          },
          onSuccess: () => {
            resolve();
          },
          onError: (err) => {
            const msg =
              err instanceof tus.DetailedError
                ? (err.originalResponse?.getBody() ?? err.message)
                : String(err);
            reject(new Error(msg));
          },
        });
        upload.start();
      });

      // Submit processing job via Edge Function
      setUploadProgress(90);
      setStatusText("Queuing AI note generation...");
      setBytesProgress(null);

      const submitResponse = await fetch(`${SUPABASE_URL}/functions/v1/web-submit-audio-job`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: SUPABASE_ANON_KEY,
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          input_type: detectedModality,
          storage_path: storagePath,
          mime_type: mimeType,
          size_bytes: selectedFile.size,
          duration_seconds: detectedModality === "audio" ? durationSeconds : null,
          template_key: fileTemplateKey,
        }),
      });

      if (!submitResponse.ok) {
        let errorMsg = "Failed to process file";
        try {
          const errData = await submitResponse.json();
          if (errData && errData.error) errorMsg = errData.error;
        } catch {
          // ignore
        }
        throw new Error(errorMsg);
      }

      const submitData = await submitResponse.json();
      const jobId: string | null = submitData?.job_id ?? null;

      if (jobId) {
        setStatusText("Processing note with AI...");
        setUploadProgress(94);
        await pollJobCompletion(jobId, `${modalityName} Uploaded`);
      } else {
        setUploadProgress(100);
        setStatusText("Complete!");
        toastManager.add({
          title: "Upload Successful!",
          description: "File uploaded successfully. Note will synchronize automatically.",
          type: "success",
        });
        setTimeout(() => {
          resetState();
          onOpenChange(false);
          onSuccess?.();
        }, 500);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "An error occurred while uploading file";
      setFileError(msg);
      toastManager.add({
        title: "Upload Failed",
        description: msg,
        type: "error",
      });
      setIsUploading(false);
      setUploadProgress(0);
      setBytesProgress(null);
      setStatusText("");
    }
  };

  // Submit handler for Tab 2 (Direct Text)
  const handleSubmitText = async () => {
    const trimmed = pastedText.trim();
    if (!trimmed || !user || isSubmittingText) return;

    if (trimmed.length > MAX_TEXT_CHARS) {
      setTextError(`Text exceeds the maximum limit of ${MAX_TEXT_CHARS.toLocaleString()} characters.`);
      return;
    }

    setIsSubmittingText(true);
    setTextError(null);
    setTextStatusText("Submitting text note...");

    toastManager.add({
      title: "Creating Note...",
      description: "Analyzing text and generating structured note...",
      type: "default",
    });

    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData.session?.access_token;
      if (!accessToken) {
        throw new Error("Invalid session. Please sign in again.");
      }

      const submitResponse = await fetch(`${SUPABASE_URL}/functions/v1/web-submit-audio-job`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: SUPABASE_ANON_KEY,
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          input_type: "text",
          source_text: trimmed,
          template_key: textTemplateKey,
        }),
      });

      if (!submitResponse.ok) {
        let errorMsg = "Failed to process text note";
        try {
          const errData = await submitResponse.json();
          if (errData && errData.error) errorMsg = errData.error;
        } catch {
          // ignore
        }
        throw new Error(errorMsg);
      }

      const submitData = await submitResponse.json();
      const jobId: string | null = submitData?.job_id ?? null;

      if (jobId) {
        setTextStatusText("Formatting note with AI...");
        await pollJobCompletion(jobId, "Text Note Submitted");
      } else {
        toastManager.add({
          title: "Note Created!",
          description: "Text note is processing and will appear shortly.",
          type: "success",
        });
        setTimeout(() => {
          resetState();
          onOpenChange(false);
          onSuccess?.();
        }, 500);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "An error occurred while processing text";
      setTextError(msg);
      toastManager.add({
        title: "Generation Failed",
        description: msg,
        type: "error",
      });
      setIsSubmittingText(false);
      setTextStatusText("");
    }
  };

  const customFileTemplates = fileTemplates.filter((t) => t.is_custom);
  const systemFileTemplates = fileTemplates.filter((t) => !t.is_custom);
  const selectedFileTemplate = fileTemplates.find((t) => t.template_key === fileTemplateKey);

  const customTextTemplates = textTemplates.filter((t) => t.is_custom);
  const systemTextTemplates = textTemplates.filter((t) => !t.is_custom);
  const selectedTextTemplate = textTemplates.find((t) => t.template_key === textTemplateKey);

  const modalityBadgeLabel =
    detectedModality === "audio"
      ? "Audio"
      : detectedModality === "pdf"
        ? "PDF Document"
        : "Image";

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogPopup className="sm:max-w-xl max-h-[92vh] flex flex-col p-0 overflow-hidden">
        {/* Dialog Header with right padding for close button */}
        <DialogHeader className="p-6 pb-2 pr-12 max-sm:p-4 max-sm:pb-2 max-sm:pr-10 border-b border-border/40">
          <div className="flex items-center gap-2.5">
            <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary border border-primary/20">
              <Sparkles className="size-5" />
            </div>
            <div className="min-w-0">
              <DialogTitle className="text-base sm:text-lg font-semibold tracking-tight">
                New Note
              </DialogTitle>
              <DialogDescription className="text-xs text-muted-foreground mt-0.5 truncate">
                Upload audio, import PDF documents, drop images, or paste text directly.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        {/* Scrollable Dialog Panel with Coss ScrollArea */}
        <DialogPanel className="p-6 py-4 max-sm:p-4 max-sm:py-3 flex-1 min-h-0">
          {/* 2-Tab Coss UI: Upload File vs Paste Text */}
          <Tabs
            value={activeTab}
            onValueChange={(val) => {
              if (!isUploading && !isSubmittingText) {
                setActiveTab(val as "upload" | "text");
              }
            }}
            className="flex flex-col gap-3.5"
          >
            <TabsList className="w-full grid grid-cols-2">
              <TabsTrigger value="upload" className="gap-2 text-xs">
                <UploadCloud className="size-3.5" />
                <span>Upload File</span>
              </TabsTrigger>
              <TabsTrigger value="text" className="gap-2 text-xs">
                <FileText className="size-3.5" />
                <span>Paste Text</span>
              </TabsTrigger>
            </TabsList>

            {/* ============================================================== */}
            {/* TAB 1: FILE UPLOAD (AUDIO, PDF, IMAGE)                         */}
            {/* ============================================================== */}
            <TabsContent value="upload" className="space-y-4 pt-1 outline-none">
              {/* Dropzone */}
              {!selectedFile ? (
                <div
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  onDrop={handleDrop}
                  onClick={() => fileInputRef.current?.click()}
                  className={cn(
                    "relative flex flex-col items-center justify-center rounded-xl border-2 border-dashed p-6 sm:p-7 text-center transition-all cursor-pointer",
                    isDragging
                      ? "border-primary bg-primary/5 scale-[1.01]"
                      : "border-border hover:border-foreground/40 hover:bg-muted/30",
                    isUploading && "pointer-events-none opacity-50",
                  )}
                >
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="audio/*,.mp3,.m4a,.ogg,.opus,.wav,.aac,.webm,.flac,.pdf,image/*,.jpg,.jpeg,.png,.webp,.heic"
                    onChange={handleFileInputChange}
                    className="hidden"
                  />

                  <div className="flex size-11 items-center justify-center rounded-2xl bg-muted text-muted-foreground mb-2.5 shadow-xs">
                    <UploadCloud className="size-5 text-foreground/80" />
                  </div>

                  <p className="text-sm font-semibold text-foreground">
                    Choose a file or drag & drop here
                  </p>
                  <p className="text-xs text-muted-foreground mt-1 max-w-sm">
                    Supports <strong>Audio</strong> (up to {isProOrAlpha ? "100 MB" : "14 MB"}), <strong>PDF</strong>, and <strong>Images</strong> (up to 14 MB).
                  </p>

                  <div className="flex flex-wrap items-center justify-center gap-1.5 mt-3">
                    <Badge variant="outline" className="text-[10px] uppercase font-mono tracking-wider">Audio</Badge>
                    <Badge variant="outline" className="text-[10px] uppercase font-mono tracking-wider">PDF</Badge>
                    <Badge variant="outline" className="text-[10px] uppercase font-mono tracking-wider">JPG / PNG</Badge>
                  </div>
                </div>
              ) : (
                /* Selected File Card */
                <div className="rounded-xl border border-border bg-card p-3.5 space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className={cn(
                        "flex size-10 shrink-0 items-center justify-center rounded-lg border",
                        detectedModality === "audio" && "bg-primary/10 text-primary border-primary/20",
                        detectedModality === "pdf" && "bg-rose-500/10 text-rose-500 border-rose-500/20",
                        detectedModality === "image" && "bg-blue-500/10 text-blue-500 border-blue-500/20",
                      )}>
                        {detectedModality === "audio" && <FileAudio className="size-5" />}
                        {detectedModality === "pdf" && <FileText className="size-5" />}
                        {detectedModality === "image" && <ImageIcon className="size-5" />}
                      </div>

                      <div className="min-w-0">
                        <p className="text-sm font-medium text-foreground truncate max-w-[200px] sm:max-w-xs">
                          {selectedFile.name}
                        </p>
                        <div className="flex items-center gap-2 mt-0.5 text-xs text-muted-foreground">
                          <span className="flex items-center gap-1">
                            <HardDrive className="size-3" />
                            {formatBytes(selectedFile.size)}
                          </span>
                          {durationSeconds !== null && (
                            <>
                              <span>•</span>
                              <span className="flex items-center gap-1">
                                <Clock className="size-3" />
                                {formatDuration(durationSeconds)}
                              </span>
                            </>
                          )}
                          <span>•</span>
                          <Badge variant="secondary" className="text-[10px] uppercase font-medium py-0 px-1.5 h-4">
                            {modalityBadgeLabel}
                          </Badge>
                        </div>
                      </div>
                    </div>

                    {!isUploading && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setSelectedFile(null);
                          setDurationSeconds(null);
                          setFileError(null);
                          if (fileInputRef.current) fileInputRef.current.value = "";
                        }}
                        className="size-7 p-0 text-muted-foreground hover:text-foreground"
                        title="Remove file"
                        aria-label="Remove file"
                      >
                        <X className="size-4" />
                      </Button>
                    )}
                  </div>

                  {/* Progress bar during upload */}
                  {isUploading && (
                    <div className="space-y-1.5 pt-1">
                      <div className="flex justify-between items-center text-xs">
                        <span className="text-muted-foreground flex items-center gap-1.5">
                          <Loader2 className="size-3 animate-spin text-primary" />
                          {statusText || "Uploading..."}
                        </span>
                        <span className="font-mono font-medium text-foreground">
                          {uploadProgress}%
                        </span>
                      </div>
                      <Progress value={uploadProgress}>
                        <ProgressTrack className="h-1.5">
                          <ProgressIndicator className="bg-primary transition-all duration-300" />
                        </ProgressTrack>
                      </Progress>
                      {bytesProgress && (
                        <p className="text-[11px] text-muted-foreground font-mono text-right">
                          {formatBytes(bytesProgress.loaded)} / {formatBytes(bytesProgress.total)}
                        </p>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* Template Selector for File */}
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-foreground flex items-center gap-1.5">
                  <Sparkles className="size-3.5 text-primary" />
                  Note Template ({modalityBadgeLabel})
                </label>

                <Select
                  value={fileTemplateKey}
                  onValueChange={(val: string | null) => {
                    if (val) setFileTemplateKey(val);
                  }}
                  disabled={isUploading}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Select template...">
                      {selectedFileTemplate ? (
                        <span className="font-medium text-xs">{selectedFileTemplate.template_name}</span>
                      ) : null}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectPopup className="w-(--anchor-width) min-w-[260px] max-h-72">
                    {customFileTemplates.length > 0 && (
                      <SelectGroup>
                        <SelectGroupLabel>Your Custom Templates</SelectGroupLabel>
                        {customFileTemplates.map((t) => (
                          <SelectItem key={t.template_key} value={t.template_key}>
                            <div className="flex flex-col py-0.5">
                              <span className="font-medium text-xs">{t.template_name}</span>
                              <span className="text-[10px] text-muted-foreground line-clamp-1">{t.description}</span>
                            </div>
                          </SelectItem>
                        ))}
                        <SelectSeparator />
                      </SelectGroup>
                    )}
                    <SelectGroup>
                      <SelectGroupLabel>System Templates</SelectGroupLabel>
                      {systemFileTemplates.map((t) => (
                        <SelectItem key={t.template_key} value={t.template_key}>
                          <div className="flex flex-col py-0.5">
                            <span className="font-medium text-xs">{t.template_name}</span>
                            <span className="text-[10px] text-muted-foreground line-clamp-1">{t.description}</span>
                          </div>
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectPopup>
                </Select>

                {selectedFileTemplate && (
                  <p className="text-[11px] text-muted-foreground">
                    {selectedFileTemplate.description}
                  </p>
                )}
              </div>

              {/* Error Alert */}
              {fileError && (
                <Alert variant="error" className="py-2.5">
                  <AlertCircle className="size-4" />
                  <AlertTitle className="text-xs font-semibold">Upload Failed</AlertTitle>
                  <AlertDescription className="text-xs leading-relaxed">{fileError}</AlertDescription>
                </Alert>
              )}
            </TabsContent>

            {/* ============================================================== */}
            {/* TAB 2: PASTE TEXT / MARKDOWN                                   */}
            {/* ============================================================== */}
            <TabsContent value="text" className="space-y-4 pt-1 outline-none">
              <div className="space-y-1.5">
                <label htmlFor="pasted-note-text" className="text-xs font-medium text-foreground flex items-center justify-between">
                  <span>Text / Markdown Content</span>
                  <span className={cn(
                    "font-mono text-[11px]",
                    pastedText.length > MAX_TEXT_CHARS ? "text-destructive font-semibold" : "text-muted-foreground"
                  )}>
                    {pastedText.length.toLocaleString()} / {MAX_TEXT_CHARS.toLocaleString()} characters
                  </span>
                </label>

                <Textarea
                  id="pasted-note-text"
                  placeholder="Paste or type notes, meeting transcripts, articles, or drafts here..."
                  value={pastedText}
                  onChange={(e) => setPastedText(e.target.value)}
                  disabled={isSubmittingText}
                  className="min-h-[150px] max-h-[240px] font-sans text-xs sm:text-sm leading-relaxed"
                />

                <p className="text-[11px] text-muted-foreground">
                  Supports plain text or Markdown. AI will extract key points, summary, and action items.
                </p>
              </div>

              {/* Template Selector for Text */}
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-foreground flex items-center gap-1.5">
                  <Sparkles className="size-3.5 text-primary" />
                  Note Template
                </label>

                <Select
                  value={textTemplateKey}
                  onValueChange={(val: string | null) => {
                    if (val) setTextTemplateKey(val);
                  }}
                  disabled={isSubmittingText}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Select template...">
                      {selectedTextTemplate ? (
                        <span className="font-medium text-xs">{selectedTextTemplate.template_name}</span>
                      ) : null}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectPopup className="w-(--anchor-width) min-w-[260px] max-h-72">
                    {customTextTemplates.length > 0 && (
                      <SelectGroup>
                        <SelectGroupLabel>Your Custom Templates</SelectGroupLabel>
                        {customTextTemplates.map((t) => (
                          <SelectItem key={t.template_key} value={t.template_key}>
                            <div className="flex flex-col py-0.5">
                              <span className="font-medium text-xs">{t.template_name}</span>
                              <span className="text-[10px] text-muted-foreground line-clamp-1">{t.description}</span>
                            </div>
                          </SelectItem>
                        ))}
                        <SelectSeparator />
                      </SelectGroup>
                    )}
                    <SelectGroup>
                      <SelectGroupLabel>System Templates</SelectGroupLabel>
                      {systemTextTemplates.map((t) => (
                        <SelectItem key={t.template_key} value={t.template_key}>
                          <div className="flex flex-col py-0.5">
                            <span className="font-medium text-xs">{t.template_name}</span>
                            <span className="text-[10px] text-muted-foreground line-clamp-1">{t.description}</span>
                          </div>
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectPopup>
                </Select>

                {selectedTextTemplate && (
                  <p className="text-[11px] text-muted-foreground">
                    {selectedTextTemplate.description}
                  </p>
                )}
              </div>

              {/* Status indicator during text submission */}
              {isSubmittingText && (
                <div className="flex items-center gap-2 p-3 rounded-lg bg-muted/40 border border-border text-xs text-muted-foreground">
                  <Loader2 className="size-4 animate-spin text-primary" />
                  <span>{textStatusText || "Processing text note with AI..."}</span>
                </div>
              )}

              {/* Error Alert */}
              {textError && (
                <Alert variant="error" className="py-2.5">
                  <AlertCircle className="size-4" />
                  <AlertTitle className="text-xs font-semibold">Generation Failed</AlertTitle>
                  <AlertDescription className="text-xs leading-relaxed">{textError}</AlertDescription>
                </Alert>
              )}
            </TabsContent>
          </Tabs>
        </DialogPanel>

        {/* Sticky Dialog Footer with Coss default framing */}
        <DialogFooter variant="default" className="p-4 px-6 max-sm:px-4 max-sm:py-3 border-t bg-muted/50">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => handleOpenChange(false)}
            disabled={isUploading || isSubmittingText}
          >
            Cancel
          </Button>

          {activeTab === "upload" ? (
            <Button
              type="button"
              variant="default"
              size="sm"
              onClick={handleUploadFile}
              disabled={!selectedFile || isUploading}
              className="gap-1.5"
            >
              {isUploading ? (
                <>
                  <Loader2 className="size-3.5 animate-spin" />
                  <span>Processing...</span>
                </>
              ) : (
                <>
                  <UploadCloud className="size-3.5" />
                  <span>Upload & Generate Note</span>
                </>
              )}
            </Button>
          ) : (
            <Button
              type="button"
              variant="default"
              size="sm"
              onClick={handleSubmitText}
              disabled={!pastedText.trim() || pastedText.length > MAX_TEXT_CHARS || isSubmittingText}
              className="gap-1.5"
            >
              {isSubmittingText ? (
                <>
                  <Loader2 className="size-3.5 animate-spin" />
                  <span>Generating...</span>
                </>
              ) : (
                <>
                  <Sparkles className="size-3.5" />
                  <span>Generate Note</span>
                </>
              )}
            </Button>
          )}
        </DialogFooter>
      </DialogPopup>
    </Dialog>
  );
}
