import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { Plus } from "lucide-react";
import { Button } from "./Button";

const meta = { title: "UI/Button", component: Button, args: { children: "Publish offer" } } satisfies Meta<typeof Button>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Primary: Story = {};
export const Secondary: Story = { args: { variant: "secondary", children: "Save draft" } };
export const Tertiary: Story = { args: { variant: "tertiary", children: "Preview" } };
export const Danger: Story = { args: { variant: "danger", children: "Delete offer" } };
export const WithIcon: Story = { args: { icon: <Plus aria-hidden="true" />, children: "Create offer" } };
export const Loading: Story = { args: { loading: true } };
export const Disabled: Story = { args: { disabled: true } };
export const OnDarkFrame: Story = {
  args: { surface: "inverse", children: "Explore offers" },
  decorators: [(Story) => <div className="rounded-xl bg-bg-inverse p-6"><Story /></div>],
};
