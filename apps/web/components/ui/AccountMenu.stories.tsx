import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { AccountMenu } from "./AccountMenu";

const meta = {
  title: "UI/AccountMenu",
  component: AccountMenu,
  args: { displayName: "Kemi Adeyemi", current: false, signOut: async () => {} },
  decorators: [(Story) => <div className="flex min-h-80 justify-end"><Story /></div>],
} satisfies Meta<typeof AccountMenu>;
export default meta;

export const Closed: StoryObj<typeof meta> = {};
export const OnAccountPage: StoryObj<typeof meta> = { args: { current: true } };
