import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { Button } from "./Button";
import { Toaster, toast } from "./Toaster";

const meta = { title: "UI/Toast", component: Toaster } satisfies Meta<typeof Toaster>;
export default meta;

/** Press the buttons to show a toast; the newest replaces the last. */
export const Saves: StoryObj<typeof meta> = {
  render: () => (
    <div className="flex gap-3">
      <Button onClick={() => toast({ text: "Saved", action: { label: "View saved", href: "/saved" } })}>Save</Button>
      <Button variant="secondary" onClick={() => toast({ text: "Removed from saved" })}>
        Unsave
      </Button>
      <Toaster />
    </div>
  ),
};
