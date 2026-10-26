import type { ReactNode } from "react";
import { CircleAlert, CircleCheck, Info } from "lucide-react";
import { cx } from "./cx";

export type FormAlertTone = "danger" | "info" | "success";

const tones: Record<FormAlertTone, { classes: string; Icon: typeof Info }> = {
  danger: { classes: "bg-state-danger-soft text-state-danger", Icon: CircleAlert },
  info: { classes: "bg-state-info-soft text-state-info", Icon: Info },
  success: { classes: "bg-state-success-soft text-state-success", Icon: CircleCheck },
};

export interface FormAlertProps {
  tone: FormAlertTone;
  children: ReactNode;
  className?: string;
}

/** A form-level message. Errors are announced at once; others politely. */
export function FormAlert({ tone, children, className }: FormAlertProps) {
  const { classes, Icon } = tones[tone];
  return (
    <div
      role={tone === "danger" ? "alert" : "status"}
      className={cx("flex items-start gap-2 rounded-lg px-3 py-2.5 text-body-sm", classes, className)}
    >
      <Icon aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
      <div className="text-text-primary">{children}</div>
    </div>
  );
}
