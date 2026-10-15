import { useQuery } from "@tanstack/react-query";
import {
  File as FileIcon,
  FileImage,
  FileSpreadsheet,
  FileText,
  Upload,
  X,
  type LucideIcon,
} from "lucide-react";
import { useRef, useState, type DragEvent } from "react";

import { cn } from "@/lib/utils";

import { fileSize } from "./file-size";
import {
  attachmentsQuery,
  attachmentUrl,
  useDeleteAttachment,
  useUploadAttachment,
  type Attachment,
} from "./tasks";

/** Types the browser can show as a thumbnail. SVG is left out: the server never serves it inline. */
const THUMBNAIL_TYPES = new Set(["image/png", "image/jpeg", "image/gif", "image/webp"]);

type FileKind = { icon: LucideIcon; label: string; className: string };

function fileKind(contentType: string): FileKind {
  if (contentType === "application/pdf") {
    return { icon: FileText, label: "PDF", className: "bg-hue-red-soft text-hue-red" };
  }
  if (/spreadsheet|excel|csv/.test(contentType)) {
    return { icon: FileSpreadsheet, label: "Sheet", className: "bg-hue-green-soft text-hue-green" };
  }
  if (/word|opendocument\.text|^text\//.test(contentType)) {
    return { icon: FileText, label: "Doc", className: "bg-hue-blue-soft text-hue-blue" };
  }
  if (contentType.startsWith("image/")) {
    return { icon: FileImage, label: "Image", className: "bg-hue-violet-soft text-hue-violet" };
  }
  return { icon: FileIcon, label: "File", className: "bg-surface-muted text-muted-foreground" };
}

/**
 * The drawer's Attachments: image thumbnails, then a chip per other file, then a drop zone that
 * also opens the file picker. Each file goes up in its own request.
 */
export function Attachments({ taskId }: { taskId: number }) {
  const { data: attachments = [] } = useQuery(attachmentsQuery(taskId));
  const { mutate: upload, isPending: uploading } = useUploadAttachment(taskId);
  const { mutate: remove } = useDeleteAttachment(taskId);
  const picker = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const images = attachments.filter((item) => THUMBNAIL_TYPES.has(item.content_type));
  const files = attachments.filter((item) => !THUMBNAIL_TYPES.has(item.content_type));

  const uploadAll = (list: FileList | null) => {
    for (const file of Array.from(list ?? [])) upload(file);
  };
  const onDragOver = (event: DragEvent) => {
    event.preventDefault();
    setDragging(true);
  };
  const onDrop = (event: DragEvent) => {
    event.preventDefault();
    setDragging(false);
    uploadAll(event.dataTransfer.files);
  };

  return (
    <section aria-labelledby="task-attachments">
      <div className="mb-2 flex items-center gap-2">
        <h3
          id="task-attachments"
          className="text-[11px] font-bold tracking-wider text-muted-foreground uppercase"
        >
          Attachments
        </h3>
        {attachments.length > 0 && (
          <span className="text-xs text-muted-foreground tabular-nums">{attachments.length}</span>
        )}
      </div>
      <div className="flex flex-col gap-2">
        {images.length > 0 && (
          <ul className="grid grid-cols-3 gap-2">
            {images.map((item) => (
              <li
                key={item.id}
                className="group/att relative aspect-[4/3] overflow-hidden rounded-lg border border-border bg-surface-muted"
              >
                <a href={attachmentUrl(item.id)} target="_blank" rel="noreferrer">
                  <img
                    src={attachmentUrl(item.id)}
                    alt={item.name}
                    loading="lazy"
                    className="size-full object-cover"
                  />
                </a>
                <span className="pointer-events-none absolute inset-x-0 bottom-0 truncate bg-gradient-to-t from-foreground/60 to-transparent px-2 pt-4 pb-1 text-[10px] font-medium text-surface">
                  {item.name}
                </span>
                <RemoveFile
                  attachment={item}
                  onRemove={() => {
                    remove(item.id);
                  }}
                />
              </li>
            ))}
          </ul>
        )}
        {files.length > 0 && (
          <ul className="flex flex-col gap-2">
            {files.map((item) => (
              <FileChip
                key={item.id}
                attachment={item}
                onRemove={() => {
                  remove(item.id);
                }}
              />
            ))}
          </ul>
        )}
        <button
          type="button"
          onClick={() => picker.current?.click()}
          onDragOver={onDragOver}
          onDragLeave={() => {
            setDragging(false);
          }}
          onDrop={onDrop}
          className={cn(
            "flex min-h-11 items-center justify-center gap-2 rounded-lg border border-dashed border-border py-2.5 text-xs text-muted-foreground transition-colors hover:border-primary hover:bg-primary-soft/40 hover:text-primary",
            dragging && "border-primary bg-primary-soft/40 text-primary",
          )}
        >
          <Upload className="size-3.5" aria-hidden />
          {uploading ? (
            "Uploading…"
          ) : (
            <span>
              Drop files or <span className="font-semibold">browse</span>
            </span>
          )}
        </button>
        <input
          ref={picker}
          type="file"
          multiple
          hidden
          aria-label="Attach files"
          onChange={(event) => {
            uploadAll(event.currentTarget.files);
            event.currentTarget.value = "";
          }}
        />
      </div>
    </section>
  );
}

function FileChip({ attachment, onRemove }: { attachment: Attachment; onRemove: () => void }) {
  const kind = fileKind(attachment.content_type);
  return (
    <li className="group/att relative flex items-center gap-2.5 rounded-lg border border-border bg-surface p-2 pr-9">
      <span
        className={cn(
          "flex size-8 shrink-0 items-center justify-center rounded-md",
          kind.className,
        )}
      >
        <kind.icon className="size-4" aria-hidden />
      </span>
      <a
        href={attachmentUrl(attachment.id)}
        target="_blank"
        rel="noreferrer"
        className="min-w-0 flex-1 hover:underline"
      >
        <span className="block truncate text-sm font-medium">{attachment.name}</span>
        <span className="text-[11px] text-muted-foreground uppercase">
          {kind.label} · {fileSize(attachment.size)}
        </span>
      </a>
      <RemoveFile attachment={attachment} onRemove={onRemove} />
    </li>
  );
}

/** Always shown on touch screens, which can't hover; on hover or focus from `lg`. */
function RemoveFile({ attachment, onRemove }: { attachment: Attachment; onRemove: () => void }) {
  return (
    <button
      type="button"
      onClick={onRemove}
      aria-label={`Delete ${attachment.name}`}
      className="absolute top-1.5 right-1.5 flex size-7 items-center justify-center rounded-md bg-surface/90 text-muted-foreground shadow-sm transition-opacity hover:text-danger lg:size-6 lg:opacity-0 lg:group-focus-within/att:opacity-100 lg:group-hover/att:opacity-100"
    >
      <X className="size-3.5" aria-hidden />
    </button>
  );
}
