import { useQuery } from "@tanstack/react-query";

import { CommandGroup, CommandItem } from "@/components/ui/command";
import { findProject } from "@/features/projects/projects";
import { shortcutsIn } from "@/features/shortcuts/registry";
import { useOpenTask } from "@/features/tasks/open-task";
import { sidebarQuery, taskQuery, type Task } from "@/features/tasks/tasks";
import { useTaskVerbs } from "@/features/tasks/use-task-verbs";

import { KeyHint } from "./key-hint";
import { matches, type Run } from "./matches";

type TaskCommand = { value: string; label: string; binding: string; run: () => void };

/**
 * The Task's verbs that have a key, as the command bar lists them: in the order the registry
 * lists their keys and named as it names them, with Priority split into one command per level.
 */
function useTaskCommands(task: Task, readOnly: boolean): TaskCommand[] {
  const { openTaskId, setOpenTask } = useOpenTask();
  const inDrawer = openTaskId === task.id;
  const verbs = useTaskVerbs()(
    task,
    { readOnly, inDrawer },
    {
      onDeleted: () => {
        if (inDrawer) setOpenTask(null);
      },
    },
  );

  return shortcutsIn("list").flatMap(({ id, label, keys }) =>
    verbs
      .filter((verb) => verb.shortcut === id)
      .map((verb) => {
        const binding = verb.binding ?? keys[0] ?? "";
        return {
          value: verb.binding === undefined ? id : `${id}-${verb.binding}`,
          // A verb with its own key, such as one Priority level, names itself.
          label: verb.binding === undefined ? label : verb.label,
          binding,
          run: verb.run,
        };
      }),
  );
}

/**
 * The commands for the Task focused in a list or open in the drawer, each with its key. Verbs that
 * need the drawer, such as Set date, open it and do it there.
 */
export function TaskCommands({ taskId, query, run }: { taskId: number; query: string; run: Run }) {
  const { data: task } = useQuery(taskQuery(taskId));
  const { data: sidebar } = useQuery(sidebarQuery);
  if (!task || !sidebar) return null;
  const readOnly = findProject(sidebar, task.project_id)?.is_archived ?? false;
  return <TaskCommandGroup task={task} readOnly={readOnly} query={query} run={run} />;
}

function TaskCommandGroup({
  task,
  readOnly,
  query,
  run,
}: {
  task: Task;
  readOnly: boolean;
  query: string;
  run: Run;
}) {
  const found = useTaskCommands(task, readOnly).filter((command) => matches(command.label, query));
  if (found.length === 0) return null;
  return (
    <CommandGroup heading="This task">
      {found.map((command) => (
        <CommandItem
          key={command.value}
          value={command.value}
          onSelect={() => {
            run(command.run);
          }}
        >
          <span className="truncate">{command.label}</span>
          <KeyHint binding={command.binding} />
        </CommandItem>
      ))}
    </CommandGroup>
  );
}
