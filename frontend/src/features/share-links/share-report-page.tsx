import { useQuery } from "@tanstack/react-query";

import { cn } from "@/lib/utils";

import { describeDates, longDate } from "@/features/tasks/due";
import { fileSize } from "@/features/tasks/file-size";
import { Markdown } from "@/features/tasks/markdown";
import { PRIORITY, STATUS, isClosed } from "@/features/tasks/task-properties";
import { shareReportQuery, sharedAttachmentUrl, type ShareReport } from "./share-links";

type ReportTask = ShareReport["sections"][number]["tasks"][number];

/**
 * The public page a Share link opens: a read-only report of one Project for someone
 * without an account, or a plain message when the link no longer works. It prints on a light
 * page whatever the viewer's colour scheme.
 */
export function ShareReportPage({ shareKey }: { shareKey: string }) {
  const { data: answer, isError } = useQuery(shareReportQuery(shareKey));

  return (
    <main className="mx-auto min-h-dvh max-w-2xl bg-background px-4 pt-[max(2rem,env(safe-area-inset-top))] pb-[max(2rem,env(safe-area-inset-bottom))] text-foreground sm:px-6 sm:pt-12 print:min-h-0 print:max-w-none print:bg-transparent print:p-0 print:scheme-light">
      <meta name="robots" content="noindex" />
      {answer?.kind === "report" ? (
        <Report report={answer.report} shareKey={shareKey} />
      ) : answer?.kind === "inactive" ? (
        <Notice title="This link is no longer active">
          Ask the person who shared it for a new link.
        </Notice>
      ) : answer?.kind === "missing" ? (
        <Notice title="This link doesn't exist">Check that you copied the whole address.</Notice>
      ) : (
        <p className="text-sm text-muted-foreground">
          {isError ? "Couldn't load this report. Try again in a moment." : "Loading…"}
        </p>
      )}
    </main>
  );
}

function Report({ report, shareKey }: { report: ShareReport; shareKey: string }) {
  const { completed, total, blocked, overdue } = report.summary;
  return (
    <article>
      <title>{report.project.name}</title>
      <header className="mb-6 border-b border-border pb-4">
        <h1 className="text-2xl font-extrabold tracking-tight text-balance sm:text-3xl">
          {report.project.name}
        </h1>
        {report.project.is_archived && (
          <p className="mt-1 text-sm text-muted-foreground">Archived</p>
        )}
        <p className="mt-2 text-sm font-medium">
          {`${String(completed)} of ${String(total)} completed · ${String(blocked)} blocked · ${String(overdue)} overdue`}
        </p>
      </header>
      {total === 0 ? (
        <p className="text-sm text-muted-foreground">No tasks to show.</p>
      ) : (
        report.sections.map((section, index) => (
          <section key={section.name ?? `unnamed-${String(index)}`} className="mb-8">
            {section.name && (
              <h2 className="border-b border-border pb-1.5 text-xs font-semibold tracking-wide text-muted-foreground uppercase print:break-after-avoid">
                {section.name}
              </h2>
            )}
            <ul className="flex flex-col divide-y divide-border">
              {section.tasks.map((task) => (
                <TaskEntry key={task.id} task={task} shareKey={shareKey} />
              ))}
            </ul>
          </section>
        ))
      )}
    </article>
  );
}

/**
 * One Task beside its Status icon, with its Comments as cards and its Subtasks along a guide
 * line under it. Subtasks read smaller than their parent so the levels stay apart.
 */
function TaskEntry({
  task,
  shareKey,
  isSubtask = false,
}: {
  task: ReportTask;
  shareKey: string;
  isSubtask?: boolean;
}) {
  const status = STATUS[task.status];
  const StatusIcon = status.icon;
  return (
    <li className={cn("flex gap-2.5 print:break-inside-avoid", isSubtask ? "py-1.5" : "py-4")}>
      <StatusIcon
        aria-hidden
        className={cn("shrink-0", status.text, isSubtask ? "mt-0.5 size-3.5" : "mt-1 size-4")}
      />
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <h3
          className={cn(
            isSubtask ? "text-sm font-medium" : "text-base font-semibold",
            isClosed(task.status) && "text-muted-foreground",
            task.status === "completed" && "line-through",
          )}
        >
          {task.title}
        </h3>
        <Details task={task} />
        {task.blocked_reason && (
          <p className="text-sm text-warning">Blocked: {task.blocked_reason}</p>
        )}
        {task.description && <Markdown text={task.description} />}
        <Attachments task={task} shareKey={shareKey} />
        <Comments comments={task.comments} />
        {task.subtasks.length > 0 && (
          <ul aria-label="Subtasks" className="mt-1 flex flex-col border-l border-border pl-3">
            {task.subtasks.map((subtask) => (
              <TaskEntry key={subtask.id} task={subtask} shareKey={shareKey} isSubtask />
            ))}
          </ul>
        )}
      </div>
    </li>
  );
}

/** Links that download the Task's Attachments through the Share link. */
function Attachments({ task, shareKey }: { task: ReportTask; shareKey: string }) {
  if (task.attachments.length === 0) return null;
  return (
    <p className="flex flex-wrap gap-x-3 gap-y-0.5 text-sm">
      {task.attachments.map((file) => (
        <a
          key={file.id}
          href={sharedAttachmentUrl(shareKey, file.id)}
          target="_blank"
          rel="noreferrer"
          className="text-primary hover:underline"
        >
          {file.name} <span className="text-muted-foreground">({fileSize(file.size)})</span>
        </a>
      ))}
    </p>
  );
}

/** The Task's Comments, oldest first, each dated on the owner's calendar. */
function Comments({ comments }: { comments: ReportTask["comments"] }) {
  if (comments.length === 0) return null;
  return (
    <ol aria-label="Comments" className="flex flex-col gap-1.5">
      {comments.map((comment) => (
        <li
          key={comment.id}
          className="flex items-baseline gap-3 rounded-md border border-border bg-surface px-3 py-1.5"
        >
          <Markdown text={comment.body} className="min-w-0 flex-1 text-[13px]" />
          <time
            dateTime={comment.at}
            className="shrink-0 text-[11px] whitespace-nowrap text-muted-foreground"
          >
            {ownerDay(comment.at)}
          </time>
        </li>
      ))}
    </ol>
  );
}

/** The Task's Status (unless Open, the usual case), Priority, dates and Tags, in one line. */
function Details({ task }: { task: ReportTask }) {
  const status = STATUS[task.status];
  const shown =
    task.status !== "open" || task.priority !== 0 || task.due_date !== null || task.tags.length > 0;
  if (!shown) return null;
  return (
    <p className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
      {task.status !== "open" && <span className={status.text}>{status.label}</span>}
      {task.priority !== 0 && (
        <span className={PRIORITY[task.priority].text}>{PRIORITY[task.priority].short}</span>
      )}
      {task.due_date && <span>{datesLabel(task)}</span>}
      {task.is_overdue && <span className="text-warning">Overdue</span>}
      {task.tags.map((tag) => (
        <span key={tag}>#{tag}</span>
      ))}
    </p>
  );
}

/** "Due 1 Nov 2026" for a single date, or the range in full. */
function datesLabel(task: ReportTask) {
  const dates = describeDates(task);
  return task.start_date === null ? `Due ${dates}` : dates;
}

function Notice({ title, children }: { title: string; children: string }) {
  return (
    <div className="flex flex-col gap-2 py-16 text-center">
      <h1 className="text-xl font-bold">{title}</h1>
      <p className="text-sm text-muted-foreground">{children}</p>
    </div>
  );
}

/**
 * The day as the owner's calendar showed it. The server sends the time with the owner's offset,
 * so reading only its date keeps the owner's day even when the viewer is elsewhere.
 */
function ownerDay(iso: string) {
  return longDate(iso.slice(0, 10));
}
