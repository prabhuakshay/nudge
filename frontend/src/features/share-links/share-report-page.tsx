import { useQuery } from "@tanstack/react-query";
import { format, parseISO } from "date-fns";

import { shareReportQuery, type ShareReport } from "./share-links";

/**
 * The public page a Share link opens: a flat, read-only report of one Project for someone
 * without an account, or a plain message when the link no longer works.
 */
export function ShareReportPage({ shareKey }: { shareKey: string }) {
  const { data: answer, isError } = useQuery(shareReportQuery(shareKey));

  return (
    <main className="mx-auto min-h-dvh max-w-2xl bg-background px-4 pt-[max(2rem,env(safe-area-inset-top))] pb-[max(2rem,env(safe-area-inset-bottom))] text-foreground sm:px-6 sm:pt-12">
      <meta name="robots" content="noindex" />
      {answer?.kind === "report" ? (
        <Report report={answer.report} />
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

function Report({ report }: { report: ShareReport }) {
  const tasks = report.sections.flatMap((section) => section.tasks);
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
      </header>
      {tasks.length === 0 ? (
        <p className="text-sm text-muted-foreground">No open tasks.</p>
      ) : (
        report.sections.map((section, index) => (
          <section key={section.name ?? `unnamed-${String(index)}`} className="mb-6">
            {section.name && <h2 className="mb-2 text-lg font-bold">{section.name}</h2>}
            <ul className="flex flex-col divide-y divide-border">
              {section.tasks.map((task) => (
                <li key={task.id} className="py-2">
                  {task.title}
                </li>
              ))}
            </ul>
          </section>
        ))
      )}
    </article>
  );
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
