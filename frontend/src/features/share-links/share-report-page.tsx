import { useQuery } from "@tanstack/react-query";
import { format, parseISO } from "date-fns";

import { describeDates } from "@/features/tasks/due";
import { fileSize } from "@/features/tasks/file-size";
import { Markdown } from "@/features/tasks/markdown";
import { PRIORITY, STATUS } from "@/features/tasks/task-properties";
import { shareReportQuery, sharedAttachmentUrl, type ShareReport } from "./share-links";

type ReportTask = ShareReport["sections"][number]["tasks"][number];

/**
 * The public page a Share link opens: a flat, read-only report of one Project for someone
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
        <p className="mt-1 text-sm text-muted-foreground">
          {report.project.is_archived && (
            <>
              <span>Archived</span>
              <span aria-hidden> · </span>
            </>
          )}
          <span>As of {ownerClock(report.as_of)}</span>
        </p>
        <p className="mt-2 text-sm font-medium">
          {`${String(completed)} of ${String(total)} completed · ${String(blocked)} blocked · ${String(overdue)} overdue`}
        </p>
      </header>
      {total === 0 ? (
        <p className="text-sm text-muted-foreground">No tasks to show.</p>
      ) : (
        report.sections.map((section, index) => (
          <section key={section.name ?? `unnamed-${String(index)}`} className="mb-6">
            {section.name && (
              <h2 className="mb-1 text-lg font-bold print:break-after-avoid">{section.name}</h2>
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

/** One Task, flat: a Subtask's title names its parent, since the report has no nesting. */
function TaskEntry({ task, shareKey }: { task: ReportTask; shareKey: string }) {
  return (
    <li className="flex flex-col gap-1 py-3 print:break-inside-avoid">
      <h3 className="font-semibold">
        {task.parent_title && <span className="text-muted-foreground">{task.parent_title} › </span>}
        {task.title}
      </h3>
      <p className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
        <span className={STATUS[task.status].text}>{statusLabel(task)}</span>
        {task.priority !== 0 && (
          <span className={PRIORITY[task.priority].text}>{PRIORITY[task.priority].short}</span>
        )}
        {task.due_date && <span>{datesLabel(task)}</span>}
        {task.is_overdue && <span className="text-warning">Overdue</span>}
        {task.tags.map((tag) => (
          <span key={tag}>#{tag}</span>
        ))}
      </p>
      {task.blocked_reason && <p className="text-sm">Blocked: {task.blocked_reason}</p>}
      {task.description && <Markdown text={task.description} />}
      {task.attachments.length > 0 && (
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
      )}
    </li>
  );
}

/** The Status, with when it was Closed for a Closed Task: "Completed 1 Nov 2026, 20:00". */
function statusLabel(task: ReportTask) {
  const label = STATUS[task.status].label;
  return task.completed_at === null ? label : `${label} ${ownerClock(task.completed_at)}`;
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
 * The time as the owner's clock showed it. The server sends it with the owner's offset, so
 * reading only its date and time keeps the owner's day even when the viewer is elsewhere.
 */
function ownerClock(iso: string) {
  return format(parseISO(iso.slice(0, 19)), "d MMM yyyy, HH:mm");
}
