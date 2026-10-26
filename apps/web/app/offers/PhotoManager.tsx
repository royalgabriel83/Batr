"use client";

import { useRef, useState, type DragEvent } from "react";
import { ArrowLeft, ArrowRight, Upload } from "lucide-react";
import { ACCEPTED_PHOTO_TYPES, OFFER_LIMITS } from "@batr/shared";
import { PhotoTile } from "@/components/ui";
import { cx } from "@/components/ui/cx";
import type { OfferPhoto } from "@/lib/offers/types";

// Longer messages (such as the HEIC one) don't fit inside a phone-sized
// tile, so they are shown in full under it and the tile says "Not added".
const TILE_MESSAGE_MAX = 40;

/** A photo chosen in this browser that is not (yet) on the offer. */
export interface PendingPhoto {
  localId: string;
  name: string;
  previewUrl: string | null;
  state: "checking" | "queued" | "uploading" | "error";
  progress: number;
  message?: string;
  /** False for files the browser refused (wrong type, too large, HEIC). */
  retryable: boolean;
}

export interface PhotoManagerProps {
  photos: OfferPhoto[];
  pending: PendingPhoto[];
  error?: string;
  /** A line for what to photograph (a service: "A photo of your work, your tools or a sample"). */
  hint?: string;
  busy: boolean;
  onAddFiles: (files: File[]) => void;
  onRemove: (photoId: string) => void;
  onMove: (photoId: string, toIndex: number) => void;
  onAltText: (photoId: string, altText: string) => void;
  onRetry: (localId: string) => void;
  onDismiss: (localId: string) => void;
}

/**
 * The offer's photos: saved photos first (the first is the cover), then
 * photos still uploading or refused. Reordering works by dragging or
 * with the Move buttons (keyboard). Each saved photo can be described
 * for screen readers; members are prompted, not forced.
 */
export function PhotoManager({ photos, pending, error, hint, busy, onAddFiles, onRemove, onMove, onAltText, onRetry, onDismiss }: PhotoManagerProps) {
  const input = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState<string | null>(null);
  const [dropActive, setDropActive] = useState(false);
  const slotsLeft = OFFER_LIMITS.photosMax - photos.length - pending.filter((p) => p.state !== "error").length;

  function dropFiles(event: DragEvent) {
    event.preventDefault();
    setDropActive(false);
    if (dragging) return;
    if (event.dataTransfer.files.length > 0) onAddFiles([...event.dataTransfer.files]);
  }

  return (
    <fieldset
      className="flex flex-col gap-3"
      aria-describedby={error ? "photos-error" : "photos-help"}
      onDragOver={(event) => {
        event.preventDefault();
        if (!dragging) setDropActive(true);
      }}
      onDragLeave={() => setDropActive(false)}
      onDrop={dropFiles}
    >
      <legend className="mb-1 text-h3">Photos</legend>
      <p id="photos-help" className="text-body-sm text-text-muted">
        {hint ? `${hint}. ` : ""}Add 1 to {OFFER_LIMITS.photosMax} photos. The first photo is the cover. JPEG, PNG or WebP, up to 10 MB each. You can drag photos here.
      </p>
      {error ? (
        <p id="photos-error" className="text-body-sm text-state-danger">
          {error}
        </p>
      ) : null}

      <ol className={cx("grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4", dropActive && "rounded-lg outline-2 outline-dashed outline-accent-primary")}>
        {photos.map((photo, index) => {
          const label = photo.alt_text || `Photo ${String(index + 1)}`;
          return (
            <li
              key={photo.id}
              draggable={!busy}
              onDragStart={() => setDragging(photo.id)}
              onDragEnd={() => setDragging(null)}
              onDrop={(event) => {
                event.preventDefault();
                event.stopPropagation();
                if (dragging && dragging !== photo.id) onMove(dragging, index);
                setDragging(null);
              }}
              className="flex flex-col gap-2"
              data-photo-id={photo.id}
            >
              <PhotoTile state="ready" src={photo.thumb_url ?? undefined} alt={label} isCover={index === 0} onRemove={busy ? undefined : () => onRemove(photo.id)} />
              <div className="flex justify-between">
                <button
                  type="button"
                  className="inline-flex size-11 items-center justify-center rounded-md text-text-secondary hover:bg-bg-subtle aria-disabled:opacity-40"
                  aria-label={`Move ${label} earlier`}
                  aria-disabled={busy || index === 0 || undefined}
                  onClick={() => !busy && index > 0 && onMove(photo.id, index - 1)}
                >
                  <ArrowLeft aria-hidden="true" className="size-4" />
                </button>
                <button
                  type="button"
                  className="inline-flex size-11 items-center justify-center rounded-md text-text-secondary hover:bg-bg-subtle aria-disabled:opacity-40"
                  aria-label={`Move ${label} later`}
                  aria-disabled={busy || index === photos.length - 1 || undefined}
                  onClick={() => !busy && index < photos.length - 1 && onMove(photo.id, index + 1)}
                >
                  <ArrowRight aria-hidden="true" className="size-4" />
                </button>
              </div>
              <label className="flex flex-col gap-1 text-caption text-text-secondary">
                Describe photo {index + 1} (optional)
                <input
                  type="text"
                  defaultValue={photo.alt_text}
                  maxLength={OFFER_LIMITS.altTextMax}
                  onBlur={(event) => {
                    if (event.target.value.trim() !== photo.alt_text) onAltText(photo.id, event.target.value.trim());
                  }}
                  className="h-11 w-full rounded-lg border border-border-strong bg-bg-surface px-2 text-body-sm text-text-primary"
                />
              </label>
            </li>
          );
        })}

        {pending.map((photo) => (
          <li key={photo.localId} className="flex flex-col gap-2" data-pending-photo={photo.name}>
            <PhotoTile
              state={photo.state === "error" ? "error" : "uploading"}
              src={photo.previewUrl ?? undefined}
              alt={photo.name}
              progress={photo.progress}
              errorMessage={photo.message && photo.message.length > TILE_MESSAGE_MAX ? "Not added" : photo.message}
              onRetry={photo.state === "error" && photo.retryable ? () => onRetry(photo.localId) : undefined}
              onRemove={photo.state === "error" ? () => onDismiss(photo.localId) : undefined}
            />
            <p className="truncate text-caption text-text-muted">{photo.name}</p>
            {photo.state === "error" && photo.message && photo.message.length > TILE_MESSAGE_MAX ? (
              <p className="text-caption text-state-danger">{photo.message}</p>
            ) : null}
          </li>
        ))}

        {slotsLeft > 0 ? (
          <li>
            <PhotoTile state="empty" onAdd={() => input.current?.click()} />
          </li>
        ) : null}
      </ol>

      <input
        ref={input}
        id="photos-input"
        type="file"
        accept={ACCEPTED_PHOTO_TYPES.join(",")}
        multiple
        className="sr-only"
        tabIndex={-1}
        aria-hidden="true"
        onChange={(event) => {
          const files = [...(event.target.files ?? [])];
          event.target.value = "";
          if (files.length > 0) onAddFiles(files);
        }}
      />
      {slotsLeft > 0 ? (
        <button
          id="photos-add"
          type="button"
          onClick={() => input.current?.click()}
          className="inline-flex h-11 items-center gap-2 self-start rounded-md px-1 text-body-sm font-semibold text-accent-primary underline-offset-2 hover:underline"
        >
          <Upload aria-hidden="true" className="size-4" />
          Choose photos
        </button>
      ) : (
        <p className="text-body-sm text-text-muted">This offer has the maximum of {OFFER_LIMITS.photosMax} photos.</p>
      )}
    </fieldset>
  );
}
