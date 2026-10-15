import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { Hash, Search } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { CommandGroup, CommandItem } from "@/components/ui/command";
import { plainMentions } from "@/features/people/mentions";
import { peopleQuery } from "@/features/people/people";
import { PersonAvatar } from "@/features/people/person-avatar";
import { ProjectIcon } from "@/features/projects/project-icon";
import { allProjects, findProject } from "@/features/projects/projects";
import { isSearchable, searchQuery } from "@/features/search/search";
import { tagHue } from "@/features/tags/tags";
import { useShowTask } from "@/features/tasks/open-task";
import { sidebarQuery } from "@/features/tasks/tasks";
import { useDebouncedValue } from "@/lib/use-debounced-value";

import { matches, type Run } from "./matches";

/** How long typing has to pause before Tasks are searched for, in milliseconds. */
const DEBOUNCE_MS = 200;
/** How many matching Tasks the bar lists; Search has the rest. */
const TOP_TASKS = 5;

/** The best five Tasks the server finds for the query, and a way to see all of them in Search. */
export function TaskResults({ query, run }: { query: string; run: Run }) {
  const searched = useDebouncedValue(query, DEBOUNCE_MS);
  const { data: results = [] } = useQuery(searchQuery(searched));
  const { data: sidebar } = useQuery(sidebarQuery);
  const showTask = useShowTask();
  const navigate = useNavigate();
  if (!isSearchable(query) || results.length === 0) return null;

  return (
    <CommandGroup heading="Tasks">
      {results.slice(0, TOP_TASKS).map((task) => {
        const project = sidebar && findProject(sidebar, task.project_id);
        return (
          <CommandItem
            key={task.id}
            value={`task-${String(task.id)}`}
            onSelect={() => {
              run(() => {
                showTask(task);
              });
            }}
          >
            <span className="min-w-0 flex-1 truncate">{plainMentions(task.title)}</span>
            {project && (
              <span className="max-w-[40%] truncate text-xs text-muted-foreground">
                {project.name}
              </span>
            )}
          </CommandItem>
        );
      })}
      <CommandItem
        value="see-all-results"
        onSelect={() => {
          run(() => void navigate({ to: "/search", search: { q: query } }));
        }}
        className="text-muted-foreground"
      >
        <Search aria-hidden />
        See all results
      </CommandItem>
    </CommandGroup>
  );
}

/** The Projects whose names match, the Inbox and archived ones included. */
export function ProjectResults({ query, run }: { query: string; run: Run }) {
  const { data: sidebar } = useQuery(sidebarQuery);
  const navigate = useNavigate();
  if (!sidebar) return null;
  const found = [...allProjects(sidebar), ...sidebar.archived].filter((project) =>
    matches(project.name, query),
  );
  if (found.length === 0) return null;

  return (
    <CommandGroup heading="Projects">
      {found.map((project) => (
        <CommandItem
          key={project.id}
          value={`project-${String(project.id)}`}
          onSelect={() => {
            run(() => {
              void navigate(
                project.is_inbox
                  ? { to: "/inbox" }
                  : { to: "/projects/$projectId", params: { projectId: String(project.id) } },
              );
            });
          }}
        >
          <ProjectIcon project={project} />
          <span className="truncate">{project.name}</span>
          {project.is_archived && (
            <Badge variant="secondary" size="sm">
              Archived
            </Badge>
          )}
        </CommandItem>
      ))}
    </CommandGroup>
  );
}

/** The Tags whose names match. */
export function TagResults({ query, run }: { query: string; run: Run }) {
  const { data: sidebar } = useQuery(sidebarQuery);
  const navigate = useNavigate();
  const found = (sidebar?.tags ?? []).filter((tag) => matches(tag.name, query));
  if (found.length === 0) return null;

  return (
    <CommandGroup heading="Tags">
      {found.map((tag) => (
        <CommandItem
          key={tag.id}
          value={`tag-${String(tag.id)}`}
          onSelect={() => {
            run(() => void navigate({ to: "/tags/$tagId", params: { tagId: String(tag.id) } }));
          }}
        >
          <Hash className={tagHue(tag).text} aria-hidden />
          <span className="truncate">{tag.name}</span>
        </CommandItem>
      ))}
    </CommandGroup>
  );
}

/** The People whose names match. */
export function PeopleResults({ query, run }: { query: string; run: Run }) {
  const { data: people = [] } = useQuery(peopleQuery);
  const navigate = useNavigate();
  const found = people.filter((person) => matches(person.name, query));
  if (found.length === 0) return null;

  return (
    <CommandGroup heading="People">
      {found.map((person) => (
        <CommandItem
          key={person.id}
          value={`person-${String(person.id)}`}
          onSelect={() => {
            run(
              () =>
                void navigate({
                  to: "/people/$personId",
                  params: { personId: String(person.id) },
                }),
            );
          }}
        >
          <PersonAvatar person={person} size="xs" />
          <span className="truncate">{person.name}</span>
        </CommandItem>
      ))}
    </CommandGroup>
  );
}
