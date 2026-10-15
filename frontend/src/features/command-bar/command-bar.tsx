import { Clock, CornerDownLeft, Plus, Search } from "lucide-react";
import { useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  CommandDialog,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { DialogClose } from "@/components/ui/dialog";
import { plainMentions } from "@/features/people/mentions";
import { SHORTCUTS, shortcutsIn, type ShortcutId } from "@/features/shortcuts/registry";
import { useShortcuts } from "@/features/shortcuts/use-shortcuts";
import { useOpenTask, useShowTask } from "@/features/tasks/open-task";
import { recentTasks } from "@/features/tasks/recent-tasks";

import { PeopleResults, ProjectResults, TagResults, TaskResults } from "./find-groups";
import { KeyHint } from "./key-hint";
import { matches, type Run } from "./matches";
import { TaskCommands } from "./task-commands";

/** What the bar can do besides finding things: the app's global shortcuts it was handed. */
export type CommandActions = Partial<Record<ShortcutId, () => void>>;

/** The Task of the list row a key was pressed on, if it was pressed on one. */
function rowTaskId(target: EventTarget | null): number | null {
  const row = target instanceof Element ? target.closest("[role=row][data-task-id]") : null;
  const id = Number(row?.getAttribute("data-task-id"));
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

/**
 * The command bar, opened with Mod+K or `/`, or on phones from the search button it renders in
 * the top bar. Empty, it offers Go to and the Tasks opened last; typing finds commands for the
 * focused or open Task, Tasks, Projects, Tags, People and Actions, and finally offers to create
 * a Task from the words, in the global Quick add. A command runs once the bar has closed and
 * handed focus back, so a picker it opens keeps focus.
 */
export function CommandBar({
  actions,
  onCreateTask,
}: {
  actions: CommandActions;
  onCreateTask: (text: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [focusedTaskId, setFocusedTaskId] = useState<number | null>(null);
  const pending = useRef<(() => void) | null>(null);

  useShortcuts({
    openCommandBar: (event) => {
      if (!open) setFocusedTaskId(rowTaskId(event.target));
      setOpen(!open);
    },
  });

  const run: Run = (command) => {
    pending.current = command;
    setOpen(false);
  };

  return (
    <>
      <Button
        variant="ghost"
        size="icon"
        aria-label="Search and commands"
        className="text-muted-foreground lg:hidden"
        onClick={() => {
          setFocusedTaskId(null);
          setOpen(true);
        }}
      >
        <Search aria-hidden />
      </Button>
      <CommandDialog
        title="Command bar"
        label="Command bar"
        open={open}
        onOpenChange={setOpen}
        onCloseAutoFocus={() => {
          const command = pending.current;
          pending.current = null;
          // After Radix has put focus back where it was, which it does once this returns.
          if (command) queueMicrotask(command);
        }}
        shouldFilter={false}
        loop
        className="bg-transparent"
      >
        <CommandBarBody
          focusedTaskId={focusedTaskId}
          actions={actions}
          onCreateTask={onCreateTask}
          run={run}
        />
      </CommandDialog>
    </>
  );
}

function CommandBarBody({
  focusedTaskId,
  actions,
  onCreateTask,
  run,
}: {
  focusedTaskId: number | null;
  actions: CommandActions;
  onCreateTask: (text: string) => void;
  run: Run;
}) {
  const [text, setText] = useState("");
  const query = text.trim();
  const { openTaskId } = useOpenTask();
  const taskId = focusedTaskId ?? openTaskId;

  return (
    <>
      <div className="relative">
        <CommandInput
          value={text}
          onValueChange={setText}
          placeholder="Search or run a command…"
          className="pr-16 sm:pr-0"
        />
        <DialogClose asChild>
          <Button
            variant="ghost"
            className="absolute top-0 right-1 h-10 px-3 text-sm text-primary sm:hidden"
          >
            Cancel
          </Button>
        </DialogClose>
      </div>
      <CommandList className="max-h-none flex-1 p-1 sm:max-h-[min(28rem,60dvh)]">
        {query ? (
          <>
            {taskId !== null && <TaskCommands taskId={taskId} query={query} run={run} />}
            <TaskResults query={query} run={run} />
            <ProjectResults query={query} run={run} />
            <TagResults query={query} run={run} />
            <PeopleResults query={query} run={run} />
            <ActionGroup heading="Actions" actions={actions} query={query} run={run} />
            <CommandGroup>
              <CommandItem
                value="create-task"
                onSelect={() => {
                  run(() => {
                    onCreateTask(query);
                  });
                }}
              >
                <Plus aria-hidden />
                <span className="truncate">
                  Create task: <span className="font-semibold">{query}</span>
                </span>
                <CornerDownLeft className="ml-auto text-muted-foreground" aria-hidden />
              </CommandItem>
            </CommandGroup>
          </>
        ) : (
          <>
            <ActionGroup heading="Go to" actions={goTo(actions)} query="" run={run} />
            <RecentGroup run={run} />
          </>
        )}
      </CommandList>
    </>
  );
}

/** The actions that go to a view or Settings. */
function goTo(actions: CommandActions): CommandActions {
  return Object.fromEntries(Object.entries(actions).filter(([id]) => id.startsWith("goTo")));
}

/** The actions whose labels match, in the order the registry lists them, each with its key. */
function ActionGroup({
  heading,
  actions,
  query,
  run,
}: {
  heading: string;
  actions: CommandActions;
  query: string;
  run: Run;
}) {
  const found = shortcutsIn("global").filter(
    ({ id, label }) => actions[id] && matches(label, query),
  );
  if (found.length === 0) return null;
  return (
    <CommandGroup heading={heading}>
      {found.map(({ id, label }) => (
        <CommandItem
          key={id}
          value={id}
          onSelect={() => {
            const action = actions[id];
            if (action) run(action);
          }}
        >
          <span className="truncate">{label}</span>
          <KeyHint binding={SHORTCUTS[id].keys[0]} />
        </CommandItem>
      ))}
    </CommandGroup>
  );
}

/** The Tasks this browser opened last. */
function RecentGroup({ run }: { run: Run }) {
  const [recent] = useState(recentTasks);
  const showTask = useShowTask();
  if (recent.length === 0) return null;
  return (
    <CommandGroup heading="Recent">
      {recent.map((task) => (
        <CommandItem
          key={task.id}
          value={`recent-${String(task.id)}`}
          onSelect={() => {
            run(() => {
              showTask(task);
            });
          }}
        >
          <Clock className="text-muted-foreground" aria-hidden />
          <span className="truncate">{plainMentions(task.title)}</span>
        </CommandItem>
      ))}
    </CommandGroup>
  );
}
