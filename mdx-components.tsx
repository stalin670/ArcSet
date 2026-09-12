import type { ComponentPropsWithoutRef, ReactNode } from "react";
import Link from "next/link";
import type { MDXComponents } from "mdx/types";

function textValue(children: ReactNode): string {
  if (typeof children === "string" || typeof children === "number") return String(children);
  if (Array.isArray(children)) return children.map(textValue).join("");
  if (children && typeof children === "object" && "props" in children) {
    return textValue((children as { props: { children?: ReactNode } }).props.children);
  }
  return "";
}

function headingId(children: ReactNode) {
  return textValue(children)
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-");
}

function DocsLink({ href = "", children, ...props }: ComponentPropsWithoutRef<"a">) {
  const className = "docs-link focus-ring rounded-sm font-semibold text-foreground underline decoration-border underline-offset-4 transition-colors duration-100 ease-out hover:decoration-primary";
  if (href.startsWith("/")) return <Link href={href} className={className}>{children}</Link>;
  return <a href={href} className={className} target={href.startsWith("http") ? "_blank" : undefined} rel={href.startsWith("http") ? "noreferrer" : undefined} {...props}>{children}</a>;
}

const components: MDXComponents = {
  h1: ({ children }) => <h1 id={headingId(children)} className="text-4xl font-extrabold tracking-[-0.045em] text-foreground md:text-5xl">{children}</h1>,
  h2: ({ children }) => <h2 id={headingId(children)} className="scroll-mt-28 border-t border-border pt-10 text-2xl font-extrabold tracking-[-0.03em] text-foreground">{children}</h2>,
  h3: ({ children }) => <h3 id={headingId(children)} className="scroll-mt-28 text-lg font-extrabold tracking-[-0.02em] text-foreground">{children}</h3>,
  h4: ({ children }) => <h4 id={headingId(children)} className="scroll-mt-28 text-base font-extrabold text-foreground">{children}</h4>,
  p: ({ children }) => <p className="text-[0.95rem] leading-7 text-muted-foreground">{children}</p>,
  a: DocsLink,
  strong: ({ children }) => <strong className="font-extrabold text-foreground">{children}</strong>,
  ul: ({ children }) => <ul className="space-y-2 pl-5 text-[0.95rem] leading-7 text-muted-foreground marker:text-primary">{children}</ul>,
  ol: ({ children }) => <ol className="space-y-3 pl-5 text-[0.95rem] leading-7 text-muted-foreground marker:font-mono marker:text-primary">{children}</ol>,
  li: ({ children }) => <li className="pl-1">{children}</li>,
  blockquote: ({ children }) => <blockquote className="rounded-xl border border-border bg-card p-5 text-sm leading-7 text-muted-foreground">{children}</blockquote>,
  hr: () => <hr className="border-border" />,
  code: ({ children }) => <code className="rounded-md bg-muted px-1.5 py-1 font-mono text-[0.82em] font-semibold text-foreground">{children}</code>,
  pre: ({ children }) => <pre className="overflow-x-auto rounded-xl border border-border bg-card p-5 font-mono text-sm leading-6 text-card-foreground [&_code]:bg-transparent [&_code]:p-0">{children}</pre>,
  table: ({ children }) => <div className="overflow-x-auto rounded-xl border border-border"><table className="w-full min-w-[38rem] border-collapse text-left text-sm">{children}</table></div>,
  thead: ({ children }) => <thead className="bg-muted text-foreground">{children}</thead>,
  tbody: ({ children }) => <tbody className="divide-y divide-border bg-card">{children}</tbody>,
  tr: ({ children }) => <tr className="divide-x divide-border">{children}</tr>,
  th: ({ children }) => <th className="px-4 py-3 font-extrabold">{children}</th>,
  td: ({ children }) => <td className="px-4 py-3 align-top leading-6 text-muted-foreground">{children}</td>,
};

export function useMDXComponents(): MDXComponents {
  return components;
}
