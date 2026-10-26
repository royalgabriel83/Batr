"use client";

import Image from "next/image";
import { ImagePlus, RotateCw, X } from "lucide-react";
import { cx } from "./cx";

export type PhotoTileState = "empty" | "uploading" | "ready" | "error";

export interface PhotoTileProps {
  state: PhotoTileState;
  /** Preview or signed URL. Required when uploading or ready. */
  src?: string;
  /** Describes the photo for screen readers. */
  alt?: string;
  /** Upload progress, 0–100, while uploading. */
  progress?: number;
  isCover?: boolean;
  errorMessage?: string;
  onAdd?: () => void;
  onRemove?: () => void;
  onRetry?: () => void;
  className?: string;
}

/**
 * One square photo slot in the offer photo uploader. Presentation
 * only: uploading, validation and ordering are handled elsewhere
 * (units 06–07).
 */
export function PhotoTile({ state, src, alt = "", progress = 0, isCover, errorMessage, onAdd, onRemove, onRetry, className }: PhotoTileProps) {
  const frame = cx("relative aspect-square w-full overflow-hidden rounded-lg", className);

  if (state === "empty") {
    return (
      <button
        type="button"
        onClick={onAdd}
        className={cx(
          frame,
          "flex flex-col items-center justify-center gap-2 border-2 border-dashed border-border-strong bg-bg-surface text-body-sm font-medium text-accent-primary",
          "hover:bg-accent-soft",
        )}
      >
        <ImagePlus aria-hidden="true" className="size-6" />
        Add photo
      </button>
    );
  }

  return (
    <div className={cx(frame, "border border-border-default bg-bg-subtle")}>
      {src ? (
        <Image src={src} alt={alt} fill unoptimized sizes="200px" className={cx("object-cover", state !== "ready" && "opacity-50")} />
      ) : null}

      {isCover && state === "ready" ? (
        <span className="absolute left-2 top-2 inline-flex items-center gap-1 rounded-sm bg-bg-inverse px-2 py-0.5 text-caption text-text-on-inverse">
          Cover
        </span>
      ) : null}

      {state === "uploading" ? (
        <div className="absolute inset-x-2 bottom-2">
          <div
            role="progressbar"
            aria-label={alt ? `Uploading ${alt}` : "Uploading photo"}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(progress)}
            className="h-1.5 overflow-hidden rounded-full bg-bg-surface"
          >
            <div className="h-full bg-accent-primary" style={{ width: `${Math.max(0, Math.min(100, progress))}%` }} />
          </div>
        </div>
      ) : null}

      {state === "error" ? (
        <div role="alert" className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-state-danger-soft/95 p-3 text-center">
          <p className="text-body-sm text-state-danger">{errorMessage ?? "This photo couldn't be uploaded."}</p>
          {onRetry ? (
            <button
              type="button"
              onClick={onRetry}
              className="inline-flex h-11 items-center gap-1.5 rounded-md px-3 text-body-sm font-semibold text-state-danger underline"
            >
              <RotateCw aria-hidden="true" className="size-4" />
              Retry
            </button>
          ) : null}
        </div>
      ) : null}

      {onRemove ? (
        <button
          type="button"
          onClick={onRemove}
          aria-label={alt ? `Remove photo: ${alt}` : "Remove photo"}
          className="absolute right-1 top-1 flex size-11 items-center justify-center"
        >
          <span className="flex size-8 items-center justify-center rounded-full bg-bg-inverse/80 text-text-on-inverse">
            <X aria-hidden="true" className="size-4" />
          </span>
        </button>
      ) : null}
    </div>
  );
}
