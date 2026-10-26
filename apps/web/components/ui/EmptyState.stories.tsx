import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { PackageOpen, RotateCw, SearchX } from "lucide-react";
import { EmptyState } from "./EmptyState";

const meta = { title: "UI/EmptyState", component: EmptyState } satisfies Meta<typeof EmptyState>;
export default meta;
type Story = StoryObj<typeof meta>;

const action = (label: string) => (
  <a href="#" className="inline-flex h-11 items-center rounded-full bg-accent-primary px-5 text-body-sm font-semibold text-text-on-accent">
    {label}
  </a>
);

export const NothingYet: Story = {
  args: { icon: <PackageOpen />, title: "You haven't created any offers yet", action: action("Create your first offer"), children: "Add photos, say what you're offering and what you'd like in return." },
};
export const NoMatches: Story = {
  args: { icon: <SearchX />, title: "No offers in Baby and kids yet", action: action("Offer something in Baby and kids"), children: "Be the first to offer something here, or see what members are offering elsewhere." },
};
export const LoadError: Story = {
  args: { role: "alert", icon: <RotateCw />, title: "We couldn't load offers", action: action("Retry"), children: "Check your connection and try again." },
};
