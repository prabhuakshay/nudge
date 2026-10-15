import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { FileText, MessageSquare, Search, type LucideIcon } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";

import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { plainMentions } from "@/features/people/mentions";
import { ProjectIcon } from "@/features/projects/project-icon";
import { findProject } from "@/features/projects/projects";
import { DueBadge } from "@/features/tasks/due-badge";
import { useOpenTask } from "@/features/tasks/open-task";
import { TaskCheckbox } from "@/features/tasks/task-checkbox";
import { TaskDetail } from "@/features/tasks/task-detail";
import { isClosed } from "@/features/tasks/task-properties";
import { sidebarQuery, useSetTaskStatus, type SidebarProject } from "@/features/tasks/tasks";
import { useDebouncedValue } from "@/lib/use-debounced-value";
import { cn } from "@/lib/utils";

import { Highlight } from "./highlight";
import { isSearchable, MIN_QUERY_LENGTH, searchQuery, type SearchResult } from "./search";

/** How long typing has to pause before a search is sent, in milliseconds. */
const DEBOUNCE_MS = 200;
/** The server's cap on results, past which the user should narrow the search down. */
const MAX_RESULTS = 50;

const MATCH_LABEL: Record<Exclude<SearchResult["match_in"], "title">, [string, LucideIcon]> = {
  description: ["In the description", FileText],
  comment: ["In a comment", MessageSquare],
};

/**
 * The Search view: a search box and the Tasks whose title, Description or a Comment hold every
 * word, Open before Closed. Results follow typing once it pauses, and the URL's `?q=` follows the
 * search so it can be shared or reloaded. A new `?q=` from elsewhere, such as the command bar,
 * replaces what was typed. Results open in the drawer like any list's rows.
 */
export function SearchView({
  addressQuery,
  inbox,
}: {
  /** The URL's `?q=`. */
  addressQuery: string;
  /** The drawer's fallback Project. */
  inbox: SidebarProject;
}) {
  const [text, setText] = useState(addressQuery);
  const query = useDebouncedValue(text.trim(), DEBOUNCE_MS);
  const [seenAddress, setSeenAddress] = useState(addressQuery);
  if (addressQuery !== seenAddress) {
    setSeenAddress(addressQuery);
    // The URL only echoing what was typed leaves the search box alone.
    if (addressQuery !== query) setText(addressQuery);
  }
  const { data: results, isFetching } = useQuery(searchQuery(query));
  const { openTaskId, setOpenTask } = useOpenTask();
  const navigate = useNavigate();
  const box = useRef<HTMLInputElement>(null);

  useEffect(() => {
    box.current?.focus();
  }, []);

  useEffect(() => {
    // Replace rather than push, so each pause in typing doesn't become a history entry.
    void navigate({
      to: ".",
      search: (prev) => ({ ...prev, q: query || undefined }),
      replace: true,
    });
  }, [navigate, query]);

  return (
    <div className="mx-auto w-full max-w-3xl">
      <header className="mb-4 flex items-center gap-2.5 sm:gap-3">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary-soft text-primary">
          <Search className="size-5" aria-hidden />
        </span>
        <h1 className="truncate text-2xl font-extrabold tracking-tight sm:text-3xl">Search</h1>
      </header>

      <div className="relative mb-4">
        <Search
          className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
          aria-hidden
        />
        <Input
          ref={box}
          type="search"
          aria-label="Search tasks"
          placeholder="Search titles, descriptions and comments"
          value={text}
          onChange={(event) => {
            setText(event.target.value);
          }}
          className="h-11 pl-9 shadow-sm"
        />
      </div>

      <SearchResults
        query={query}
        results={isSearchable(query) ? results : undefined}
        loading={isFetching}
        openId={openTaskId}
        onOpen={setOpenTask}
      />

      <TaskDetail
        taskId={openTaskId}
        project={inbox}
        order={(results ?? []).map((result) => result.id)}
        onOpen={setOpenTask}
        onClose={() => {
          setOpenTask(null);
        }}
      />
    </div>
  );
}

function SearchResults({
  query,
  results,
  loading,
  openId,
  onOpen,
}: {
  query: string;
  results: SearchResult[] | undefined;
  loading: boolean;
  openId: number | null;
  onOpen: (taskId: number) => void;
}) {
  if (!isSearchable(query)) {
    return (
      <Hint>Type at least {MIN_QUERY_LENGTH} characters. Archived Projects are searched too.</Hint>
    );
  }
  if (!results) {
    return <Hint>{loading ? "Searching…" : null}</Hint>;
  }
  if (results.length === 0) {
    return <Hint>No tasks match “{query}”</Hint>;
  }
  return (
    <>
      <p className="mb-2 px-1 text-xs text-muted-foreground" aria-live="polite">
        {results.length >= MAX_RESULTS
          ? `The best ${String(MAX_RESULTS)} matches. Add words to narrow it down.`
          : `${String(results.length)} ${results.length === 1 ? "task" : "tasks"}`}
      </p>
      <ul
        aria-label="Search results"
        className="overflow-hidden rounded-xl border border-border bg-surface shadow-sm"
      >
        {results.map((result) => (
          <ResultRow
            key={result.id}
            result={result}
            query={query}
            selected={result.id === openId}
            onOpen={onOpen}
          />
        ))}
      </ul>
    </>
  );
}

function Hint({ children }: { children: ReactNode }) {
  return (
    <p className="px-1 py-8 text-center text-sm text-muted-foreground" aria-live="polite">
      {children}
    </p>
  );
}

/**
 * One result: its checkbox, then a button that opens it, reading the highlighted title, where it
 * matched with the snippet, and its Project and due date. Archived Tasks are read-only, so they
 * have no checkbox.
 */
function ResultRow({
  result,
  query,
  selected,
  onOpen,
}: {
  result: SearchResult;
  query: string;
  selected: boolean;
  onOpen: (taskId: number) => void;
}) {
  const { data: sidebar } = useQuery(sidebarQuery);
  const { mutate: setStatus } = useSetTaskStatus();
  const project = sidebar && findProject(sidebar, result.project_id);
  const closed = isClosed(result.status);
  const title = plainMentions(result.title);
  return (
    <li
      className={cn(
        "flex items-start gap-3 border-b border-border/60 py-2.5 pr-3 pl-4 transition-colors last:border-b-0",
        selected
          ? "bg-primary-soft/50 shadow-[inset_2px_0_0_var(--primary)]"
          : "hover:bg-surface-muted/60",
      )}
    >
      <span className="flex h-5 w-[18px] shrink-0 items-center">
        {project && !project.is_archived && (
          <TaskCheckbox
            task={result}
            onToggle={() => {
              setStatus({ task: result, status: closed ? "open" : "completed" });
            }}
          />
        )}
      </span>
      <button
        type="button"
        data-task-id={result.id}
        onClick={() => {
          onOpen(result.id);
        }}
        className="flex min-w-0 flex-1 flex-col gap-0.5 rounded-sm text-left outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
      >
        <span
          className={cn(
            "truncate text-sm font-semibold",
            closed && "font-medium text-muted-foreground line-through",
          )}
        >
          {result.match_in === "title" ? <Highlight text={title} query={query} /> : title}
        </span>
        <MatchSnippet result={result} query={query} />
        <span className="flex min-w-0 items-center gap-2 text-xs text-muted-foreground">
          {project && <ProjectName project={project} />}
          <DueBadge task={result} />
        </span>
      </button>
    </li>
  );
}

function ProjectName({ project }: { project: SidebarProject }) {
  return (
    <>
      <span className="flex min-w-0 items-center gap-1">
        <ProjectIcon project={project} className="size-3 shrink-0" />
        <span className="truncate">{project.name}</span>
      </span>
      {project.is_archived && (
        <Badge variant="secondary" className="shrink-0">
          Archived
        </Badge>
      )}
    </>
  );
}

/** Where a result matched, when not in its title, and the matching text around it. */
function MatchSnippet({ result, query }: { result: SearchResult; query: string }) {
  if (result.match_in === "title") return null;
  const [label, Icon] = MATCH_LABEL[result.match_in];
  return (
    <span className="flex min-w-0 items-start gap-1.5 text-xs text-muted-foreground">
      <Icon className="mt-0.5 size-3 shrink-0" aria-hidden />
      <span className="sr-only">{label}</span>
      <span className="line-clamp-2 text-foreground/80">
        <Highlight text={result.snippet} query={query} />
      </span>
    </span>
  );
}
