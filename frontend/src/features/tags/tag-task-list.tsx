import { useQuery } from "@tanstack/react-query";

import { FlatTaskTable } from "@/features/tasks/flat-task-table";

import { TagHeader } from "./tag-header";
import { tagTasksQuery, type SidebarTag } from "./tags";

/**
 * A Tag's Tasks across Projects, grouped by Project, with a collapsed Closed group. Quick add files
 * new Tasks in the Inbox with the Tag.
 */
export function TagTaskList({ tag }: { tag: SidebarTag }) {
  const { data: open = [] } = useQuery(tagTasksQuery(tag.id));
  return (
    <FlatTaskTable
      label={`#${tag.name} tasks`}
      header={<TagHeader tag={tag} />}
      quickAdd={{ kind: "tag", tag }}
      open={open}
      source={{ tag: tag.id }}
      empty={`Nothing tagged #${tag.name} is left. Add a task above.`}
    />
  );
}
