import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import type { OfferSummary } from "@/lib/offers/types";
import { OfferCard } from "./OfferCard";

const item: OfferSummary = {
  id: "11111111-1111-4111-8111-111111111111",
  offer_type: "item",
  title: "Canon EOS 250D with kit lens",
  description: "",
  category: "electronics",
  condition: "like_new",
  offering_text: "A Canon camera with an 18-55 mm lens",
  wants_text: "A laptop for school",
  area: "ibadan_bodija",
  exchange_mode: "in_person",
  handover_methods: ["collection"],
  status: "active",
  revision: 1,
  content_version: 1,
  published_at: new Date().toISOString(),
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
  closed_at: null,
  removed_at: null,
  owner: { display_name: "Ada Okafor", member_since: "2026-10" },
  is_owner: false,
  photo_count: 0,
  cover: null,
};

const meta = {
  title: "Offers/OfferCard",
  component: OfferCard,
  args: { offer: item, guest: true },
  decorators: [(Story) => <div className="max-w-xs"><Story /></div>],
} satisfies Meta<typeof OfferCard>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Item: Story = {};
/** Milestone 9: a service is marked on its photo and has no condition. */
export const Service: Story = {
  args: {
    offer: {
      ...item,
      offer_type: "service",
      title: "Maths lessons for JSS students",
      category: "lessons_tutoring",
      condition: null,
      offering_text: "Two hours a week for a month",
      wants_text: "A used laptop",
      exchange_mode: "either",
      handover_methods: ["on_site_service", "remote_service"],
    },
  },
};
