"use client";

import { Toaster as Sonner, type ToasterProps } from "sonner";
import {
  CircleCheckIcon,
  InfoIcon,
  Loader2Icon,
  OctagonXIcon,
  TriangleAlertIcon,
} from "lucide-react";

const Toaster = ({ ...props }: ToasterProps) => (
  <Sonner
    theme="light"
    position="bottom-right"
    className="toaster group"
    icons={{
      success: <CircleCheckIcon className="size-4" />,
      info: <InfoIcon className="size-4" />,
      warning: <TriangleAlertIcon className="size-4" />,
      error: <OctagonXIcon className="size-4" />,
      loading: <Loader2Icon className="size-4 animate-spin" />,
    }}
    toastOptions={{
      classNames: {
        toast:
          "cn-toast !rounded-lg !border !border-border !bg-card !text-foreground !shadow-[0_24px_60px_-30px_rgba(21,21,15,0.45)]",
        title: "!text-sm !font-medium",
        description: "!text-xs !text-muted-foreground",
        actionButton: "!bg-primary !text-primary-foreground",
        cancelButton: "!bg-secondary !text-secondary-foreground",
        icon: "!text-forest",
      },
    }}
    {...props}
  />
);

export { Toaster };
