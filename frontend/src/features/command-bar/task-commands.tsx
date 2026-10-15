import { useQuery } from "@tanstack/react-query";

import { CommandGroup, CommandItem } from "@/components/ui/command";
import { findProject } from "@/features/projects/projects";
import { shortcutsIn } from "@/features/shortcuts/registry";
import type { ShortcutHandlers } from "@/features/shortcuts/use-shortcuts";
import { useOpenTask } from "@/features/tasks/open-task";
import { requestDetailAction, useTaskKeys } from "@/features/tasks/task-keys";
import { isClosed } from "@/features/tasks/task-properties";
import { sidebarQuery, taskQuery, useSetTaskStatus, type Task } from "@/features/tasks/tasks";

import { KeyHint } from "./key-hint";
import { matches, type Run } from "./matches";

type TaskCommand = { value: string; label: string; binding: string; run: () => void };

/**
 * What the Task keys can do to a Task, as the command bar lists them: what a focused row's keys
 * do, in the order the registry lists them, with Priority split into one command per level.
 */
function useTaskCommands(task: Task, readOnly: boolean): TaskCommand[] {
  const { openTaskId, setOpenTask } = useOpenTask();
  const taskKeys = useTaskKeys();
  const { mutate: setStatus } = useSetTaskStatus();
  const inDrawer = openTaskId === task.id;
  const handlers: ShortcutHandlers = {
    ...(!inDrawer && {
      openTask: () => {
        setOpenTask(task.id);
      },
    }),
    ...(!readOnly && {
      completeTask: () => {
        setStatus({ task, status: isClosed(task.status) ? "open" : "completed" });
      },
      ...taskKeys(task, {
        inDetail: (action) => {
          requestDetailAction(task.id, action);
          setOpenTask(task.id);
        },
        onDeleted: () => {
          if (inDrawer) setOpenTask(null);
        },
      }),
    }),
  };

  return shortcutsIn("list").flatMap(({ id, label, keys }) => {
    const handler = handlers[id];
    if (!handler) return [];
    // The handlers take the key press they answer, as Priority reads its level from the key.
    const press = (key: string) => () => {
      handler(new KeyboardEvent("keydown", { key }));
    };
    if (id === "setPriority") {
      return keys.map((key) => ({
        value: `priority-${key}`,
        label: key === "0" ? "Set priority: none" : `Set priority: P${key}`,
        binding: key,
        run: press(key),
      }));
    }
    const [binding = ""] = keys;
    return [{ value: id, label, binding, run: press(binding) }];
  });
}

/**
 * The commands for the Task focused in a list or open in the drawer, each with its key. Keys that
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
