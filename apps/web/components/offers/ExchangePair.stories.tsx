import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { ExchangePair } from "./ExchangePair";

const meta = {
  title: "Offers/ExchangePair",
  component: ExchangePair,
  args: { offering: "A Canon EOS 250D with kit lens", wants: "A laptop for school" },
  decorators: [(Story) => <div className="max-w-md"><Story /></div>],
} satisfies Meta<typeof ExchangePair>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Compact: Story = {};
export const ReturnOnCards: Story = { args: { variant: "return" } };
/** On the offer page: the two sides meet at the symbol as the page opens. */
export const Panel: Story = { args: { variant: "panel" } };
