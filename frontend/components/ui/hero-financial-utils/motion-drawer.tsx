"use client";

import * as React from "react";
import { Menu, X } from "lucide-react";
import { cn } from "cn";

const DrawerCloseContext = React.createContext<() => void>(() => {});

/** Lets content rendered inside the drawer (nav links) close it on click. */
export function useDrawerClose(): () => void {
  return React.useContext(DrawerCloseContext);
}

/**
 * Slide-in drawer used by the mobile hero header. Mirrors the template API
 * (direction / width / backgroundColor / btn + content classes) without
 * pulling framer-motion: the open/close motion is a CSS transform, skipped
 * automatically for reduced-motion users.
 */
export default function MotionDrawer({
  children,
  direction = "left",
  width = 300,
  backgroundColor = "#ffffff",
  clsBtnClassName,
  contentClassName,
  btnClassName,
}: React.PropsWithChildren<{
  direction?: "left" | "right";
  width?: number;
  backgroundColor?: string;
  clsBtnClassName?: string;
  contentClassName?: string;
  btnClassName?: string;
}>) {
  const [open, setOpen] = React.useState(false);
  const close = () => setOpen(false);

  React.useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls="hero-motion-drawer"
        className={cn("relative z-20 inline-flex items-center justify-center", btnClassName)}
      >
        <Menu className="size-4" />
      </button>

      <div
        id="hero-motion-drawer"
        className={cn("fixed inset-0 z-[60]", !open && "pointer-events-none")}
      >
        <button
          type="button"
          aria-label="Close menu"
          tabIndex={open ? 0 : -1}
          onClick={close}
          className={cn(
            "absolute inset-0 bg-ink/45 transition-opacity duration-500 motion-reduce:transition-none",
            open ? "opacity-100" : "pointer-events-none opacity-0",
          )}
        />
        <aside
          role="dialog"
          aria-modal="true"
          style={{ backgroundColor, width: `min(${width}px, 86vw)` }}
          className={cn(
            "absolute top-0 flex h-dvh flex-col overflow-y-auto rounded-r-2xl border-r border-border shadow-2xl transition-transform duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] will-change-transform motion-reduce:transition-none",
            direction === "left" ? "left-0" : "right-0 rounded-l-2xl",
            open
              ? "pointer-events-auto translate-x-0"
              : direction === "left"
                ? "-translate-x-full"
                : "translate-x-full",
          )}
        >
          <button
            type="button"
            tabIndex={open ? 0 : -1}
            onClick={close}
            aria-label="Close menu"
            className={cn(
              "absolute right-4 top-4 z-10 grid size-9 place-items-center rounded-full transition-colors",
              clsBtnClassName,
            )}
          >
            <X className="size-4" />
          </button>
          <DrawerCloseContext.Provider value={close}>
            <div className={cn("pt-2", contentClassName)}>{children}</div>
          </DrawerCloseContext.Provider>
        </aside>
      </div>
    </>
  );
}
