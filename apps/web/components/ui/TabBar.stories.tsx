import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { TabBar } from "./TabBar";

const meta = {
  title: "UI/TabBar",
  component: TabBar,
  parameters: { layout: "fullscreen", viewport: { defaultViewport: "phone" } },
  globals: { viewport: { value: "phone" } },
} satisfies Meta<typeof TabBar>;
export default meta;

export const SignedIn: StoryObj<typeof meta> = { args: { signedIn: true } };
export const SignedOut: StoryObj<typeof meta> = { args: { signedIn: false } };
