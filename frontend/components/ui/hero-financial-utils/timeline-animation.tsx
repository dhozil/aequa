"use client";

import * as React from "react";
import { cn } from "cn";

/**
 * Animates a child of the hero timeline element. `timelineRef` points at the
 * wrapping section; every child watches the same root and flips
 * `data-visible` on first intersection, so the pieces enter in order given by
 * `animationNum`. The stagger delay and per-number transform live in CSS
 * (`globals.css`, `data-anim="n"`), gated behind `prefers-reduced-motion`.
 */
type TimelineTag =
  | "a"
  | "button"
  | "div"
  | "h1"
  | "h2"
  | "header"
  | "img"
  | "li"
  | "p"
  | "span"
  | "ul";

type Props = {
  as?: TimelineTag;
  animationNum: number;
  timelineRef: React.RefObject<HTMLDivElement | null>;
  className?: string;
  children?: React.ReactNode;
} & Record<string, unknown>;

export function TimelineAnimation({
  as = "div",
  animationNum,
  timelineRef,
  className,
  children,
  ...rest
}: Props) {
  const ref = React.useRef<HTMLElement>(null);

  React.useEffect(() => {
    const node = ref.current;
    const root = timelineRef?.current;
    if (!node) return;
    if (!root || typeof IntersectionObserver === "undefined") {
      node.dataset.visible = "true";
      node.dataset.timeline = "true";
      return;
    }
    // Hiding CSS is gated behind [data-timeline] on this item, set imperatively
    // here, so the server-rendered markup stays visible if JavaScript never runs.
    node.dataset.timeline = "true";
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            node.dataset.visible = "true";
            observer.disconnect();
          }
        }
      },
      { rootMargin: "0px 0px -8% 0px", threshold: 0.06 },
    );
    observer.observe(root);
    return () => observer.disconnect();
  }, [timelineRef]);

  const props = {
    ...rest,
    ref,
    "data-anim": animationNum,
    className: cn("tl-item", className),
  } as unknown as React.DetailedHTMLProps<
    React.HTMLAttributes<HTMLElement>,
    HTMLElement
  >;

  return React.createElement(as as string, props, children);
}

export default TimelineAnimation;
