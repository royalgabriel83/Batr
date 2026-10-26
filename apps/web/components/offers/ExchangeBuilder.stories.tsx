import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { useState } from "react";
import { ExchangeBuilder } from "./ExchangeBuilder";

const meta = { title: "Offers/ExchangeBuilder", component: ExchangeBuilder, args: { offering: "", wants: "" } } satisfies Meta<typeof ExchangeBuilder>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Empty: Story = {};
export const OneSide: Story = { args: { offering: "A Canon EOS 250D with kit lens" } };
export const Joined: Story = { args: { offering: "A Canon EOS 250D with kit lens", wants: "A laptop for school" } };

/** Type in both fields to see the two sides slide together. */
export const Interactive: Story = {
  render: function Render() {
    const [offering, setOffering] = useState("");
    const [wants, setWants] = useState("");
    const field = "h-11 rounded-lg border border-border-strong bg-bg-surface px-3 text-body";
    return (
      <div className="flex max-w-xl flex-col gap-3">
        <label className="flex flex-col gap-1 text-body-sm font-semibold">
          What you&apos;re offering
          <input className={field} value={offering} onChange={(event) => setOffering(event.target.value)} />
        </label>
        <label className="flex flex-col gap-1 text-body-sm font-semibold">
          What you&apos;d like in return
          <input className={field} value={wants} onChange={(event) => setWants(event.target.value)} />
        </label>
        <ExchangeBuilder offering={offering} wants={wants} />
      </div>
    );
  },
};
