import { useQuery } from "@tanstack/react-query";
import { MessageSquare, Pencil, SendHorizontal, Trash2 } from "lucide-react";
import { useCallback, useState, type KeyboardEvent } from "react";

import { Kbd } from "@/components/ui/kbd";
import { AutosizeTextarea } from "@/components/ui/textarea";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { initialsFor } from "@/components/layout/initials";
import { sessionQuery } from "@/features/auth/session";
import { plainMentions } from "@/features/people/mentions";
import { useWithMentions } from "@/features/people/people";

import { activityTime, exactTime } from "./activity-time";
import {
  commentsQuery,
  isEdited,
  useAddComment,
  useDeleteComment,
  useEditComment,
  type Comment,
} from "./comments";
import { Markdown } from "./markdown";

/** Ctrl+Enter, or Cmd+Enter on a Mac, sends; Enter alone starts a new line. */
function isSend(event: KeyboardEvent) {
  return event.key === "Enter" && (event.ctrlKey || event.metaKey);
}

/** The Details tab's last section: the Task's Comments as social-style cards, oldest first. */
export function Comments({ taskId }: { taskId: number }) {
  const { data: comments = [] } = useQuery(commentsQuery(taskId));
  return (
    <section aria-labelledby="task-comments">
      <div className="mb-2 flex items-center gap-2">
        <h3
          id="task-comments"
          className="text-[11px] font-bold tracking-wider text-muted-foreground uppercase"
        >
          Comments
        </h3>
        {comments.length > 0 && (
          <span className="text-xs text-muted-foreground tabular-nums">{comments.length}</span>
        )}
      </div>
      {comments.length === 0 ? (
        <div className="flex flex-col items-center rounded-xl border border-dashed border-border px-5 py-10 text-center">
          <span className="mb-3 flex size-10 items-center justify-center rounded-full bg-primary-soft text-primary">
            <MessageSquare className="size-5" aria-hidden />
          </span>
          <p className="text-sm font-semibold">No comments yet</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Notes, updates and links for this task go here.
          </p>
        </div>
      ) : (
        <ol className="flex flex-col gap-1">
          {comments.map((item) => (
            <CommentCard key={item.id} comment={item} />
          ))}
        </ol>
      )}
    </section>
  );
}

/** One Comment: who and when above, the markdown below, edit and delete on hover or focus. */
function CommentCard({ comment }: { comment: Comment }) {
  const { data: user } = useQuery(sessionQuery);
  const { mutate: edit } = useEditComment();
  const { mutate: remove } = useDeleteComment(comment.task_id);
  const withMentions = useWithMentions();
  const [editing, setEditing] = useState(false);
  const focus = useCallback((element: HTMLTextAreaElement | null) => {
    element?.focus();
  }, []);
  const at = new Date(comment.created_at);

  return (
    <li className="group/comment flex gap-3 py-2">
      <span
        aria-hidden
        className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground"
      >
        {user && initialsFor(user)}
      </span>
      <article
        aria-label="Comment"
        className="min-w-0 flex-1 rounded-xl border border-border bg-surface shadow-sm"
      >
        <header className="flex items-center gap-2 border-b border-border/60 px-3 py-1.5 text-xs">
          <span className="font-semibold">You</span>
          <span className="text-muted-foreground">
            <Tooltip>
              <TooltipTrigger asChild>
                <time dateTime={comment.created_at}>{activityTime(at, new Date())}</time>
              </TooltipTrigger>
              <TooltipContent>{exactTime(at)}</TooltipContent>
            </Tooltip>
            {isEdited(comment) && " · edited"}
          </span>
          {/* Always shown on touch screens, which can't hover; on hover or focus from `lg`. */}
          <span className="ml-auto flex gap-0.5 transition-opacity lg:opacity-0 lg:group-focus-within/comment:opacity-100 lg:group-hover/comment:opacity-100">
            <button
              type="button"
              aria-label="Edit comment"
              onClick={() => {
                setEditing(true);
              }}
              className="flex size-8 items-center justify-center rounded text-muted-foreground hover:bg-surface-muted hover:text-foreground lg:size-6"
            >
              <Pencil className="size-3.5" aria-hidden />
            </button>
            <button
              type="button"
              aria-label="Delete comment"
              onClick={() => {
                remove(comment.id);
              }}
              className="flex size-8 items-center justify-center rounded text-muted-foreground hover:bg-danger-soft hover:text-danger lg:size-6"
            >
              <Trash2 className="size-3.5" aria-hidden />
            </button>
          </span>
        </header>
        <div className="px-3 py-2">
          {editing ? (
            <AutosizeTextarea
              ref={focus}
              aria-label="Edit comment"
              defaultValue={plainMentions(comment.body)}
              maxLength={10_000}
              onKeyDown={(event) => {
                if (event.key === "Escape") {
                  // Put the text back first, so the blur that follows has nothing to save.
                  event.currentTarget.value = plainMentions(comment.body);
                  event.currentTarget.blur();
                } else if (isSend(event)) {
                  event.currentTarget.blur();
                }
              }}
              onBlur={(event) => {
                setEditing(false);
                const body = withMentions(event.currentTarget.value.trim());
                if (body && body !== comment.body) edit({ id: comment.id, body });
              }}
              className="min-h-0 rounded-none border-0 bg-transparent p-0 shadow-none focus-visible:outline-none"
            />
          ) : (
            <Markdown text={comment.body} />
          )}
        </div>
      </article>
    </li>
  );
}

/** The bottom of the drawer: the Comment composer, with its shortcut from `sm`. */
export function CommentFooter({ taskId }: { taskId: number }) {
  return (
    <footer className="shrink-0 border-t border-border bg-surface px-4 py-3 sm:px-6">
      <CommentComposer taskId={taskId} />
      <p className="mt-1.5 hidden text-[11px] text-muted-foreground sm:block">
        <Kbd>Ctrl</Kbd> <Kbd>Enter</Kbd> to send
      </p>
    </footer>
  );
}

/** The field that adds a Comment. */
export function CommentComposer({ taskId }: { taskId: number }) {
  const { mutate: add } = useAddComment(taskId);
  const withMentions = useWithMentions();
  const [draft, setDraft] = useState("");

  const send = () => {
    const body = withMentions(draft.trim());
    if (!body) return;
    const sent = draft;
    setDraft("");
    add(body, {
      onError: () => {
        setDraft(sent);
      },
    });
  };

  return (
    <div className="flex items-end gap-2 rounded-xl border border-border bg-surface p-1.5 pl-3 focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/15">
      <AutosizeTextarea
        aria-label="Write a comment"
        aria-keyshortcuts="Control+Enter Meta+Enter"
        value={draft}
        maxLength={10_000}
        onChange={(event) => {
          setDraft(event.target.value);
        }}
        onKeyDown={(event) => {
          if (isSend(event)) {
            event.preventDefault();
            send();
          }
        }}
        placeholder="Write a comment… (@ to mention)"
        rows={1}
        className="min-h-0 flex-1 border-0 bg-transparent p-0 py-1 shadow-none focus-visible:outline-none"
      />
      <button
        type="button"
        onClick={send}
        disabled={!draft.trim()}
        aria-label="Send comment"
        className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground transition-opacity focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:opacity-30 sm:size-8"
      >
        <SendHorizontal className="size-4" aria-hidden />
      </button>
    </div>
  );
}
