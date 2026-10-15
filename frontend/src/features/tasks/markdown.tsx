import ReactMarkdown, { defaultUrlTransform, type Components } from "react-markdown";
import remarkGfm from "remark-gfm";

import { PersonChip } from "@/features/people/mention-text";
import { cn } from "@/lib/utils";

/** GitHub-flavoured extras people expect in notes: bare-URL links, strikethrough, tables. */
const REMARK_PLUGINS = [remarkGfm];

/** A Mention token is a markdown link to `person:<id>`. */
const PERSON_LINK = /^person:(\d+)$/;

/** Keep Mention links, which the default transform would strip as an unknown protocol. */
function urlTransform(url: string) {
  return PERSON_LINK.test(url) ? url : defaultUrlTransform(url);
}

/** Links leave the app, so they open in a new tab without access back to it. */
const COMPONENTS: Components = {
  a: ({ href, title, children }) => {
    const person = href && PERSON_LINK.exec(href);
    if (person) {
      const name = typeof children === "string" ? children.replace(/^@/, "") : "";
      return <PersonChip mention={{ id: Number(person[1]), name }} />;
    }
    return (
      <a
        href={href}
        title={title}
        target="_blank"
        rel="noopener noreferrer"
        className="font-medium text-primary underline underline-offset-2"
      >
        {children}
      </a>
    );
  },
};

/**
 * Markdown the user wrote, rendered as text and formatting only. Raw HTML in it is dropped and
 * unsafe link protocols are removed, so a Description can never run script or restyle the page.
 * Mentions show as Person chips.
 */
export function Markdown({ text, className }: { text: string; className?: string }) {
  return (
    <div
      className={cn(
        "space-y-2 text-sm leading-relaxed break-words",
        "[&_li]:marker:text-muted-foreground [&_ol]:list-decimal [&_ol]:pl-5 [&_ul]:list-disc [&_ul]:pl-5",
        "[&_h1]:text-base [&_h1]:font-bold [&_h2]:font-bold [&_h3]:font-semibold",
        "[&_code]:rounded [&_code]:bg-surface-muted [&_code]:px-1 [&_code]:text-[0.9em]",
        "[&_blockquote]:border-l-2 [&_blockquote]:border-border [&_blockquote]:pl-3 [&_blockquote]:text-muted-foreground",
        className,
      )}
    >
      <ReactMarkdown
        remarkPlugins={REMARK_PLUGINS}
        skipHtml
        urlTransform={urlTransform}
        components={COMPONENTS}
      >
        {text}
      </ReactMarkdown>
    </div>
  );
}
