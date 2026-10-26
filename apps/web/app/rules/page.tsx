import type { Metadata } from "next";
import { PRODUCT_NAME } from "@batr/shared";
import { FormAlert } from "@/components/ui";

// "What can't be offered" (milestone-6.md, S9). DRAFT WORDING: the
// owner supplies or approves this list before release.

export const metadata: Metadata = { title: `What can't be offered · ${PRODUCT_NAME}` };

const NOT_ALLOWED = [
  "Weapons and ammunition",
  "Drugs and drug equipment",
  "Stolen goods",
  "Counterfeit goods",
  "Live animals",
  "Adult content",
  "Recalled or unsafe products",
  "Personal or financial data",
  "Cash or currency swaps",
  "Anything illegal in Nigeria",
];

export default function RulesPage() {
  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-6 px-4 pt-6 pb-12 md:px-6 md:pt-10 md:pb-16">
      <div className="flex flex-col gap-2">
        <h1 className="text-h1 md:text-h2-lg">What can&apos;t be offered</h1>
        <p className="text-body text-text-secondary">
          These items can&apos;t be offered or asked for on {PRODUCT_NAME}. BATR removes offers that include them and may limit the account.
        </p>
      </div>
      <FormAlert tone="info">Draft list: BATR will confirm the final wording.</FormAlert>
      <ul className="flex flex-col divide-y divide-border-default rounded-xl border border-border-default bg-bg-surface px-5 shadow-card md:px-6">
        {NOT_ALLOWED.map((item) => (
          <li key={item} className="py-3 text-body">
            {item}
          </li>
        ))}
      </ul>
      <p className="text-body-sm text-text-secondary">
        If you see an offer like this, open it and choose Report offer. BATR will review it.
      </p>
    </main>
  );
}
