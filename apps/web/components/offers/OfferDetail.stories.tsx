import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { OfferDetail } from "./OfferDetail";

const meta = {
  title: "Offers/OfferDetail",
  component: OfferDetail,
  args: {
    offer_type: "item",
    title: "Canon EOS 250D with kit lens",
    description: "Used for two years, always in its bag. Battery holds a full day.",
    category: "electronics",
    condition: "like_new",
    offering_text: "A Canon camera with an 18-55 mm lens",
    wants_text: "A laptop for school",
    area: "ibadan_bodija",
    exchange_mode: "in_person",
    handover_methods: ["collection", "public_meetup"],
    published_at: new Date().toISOString(),
    photos: [],
    owner: { display_name: "Ada Okafor", member_since: "2026-10" },
  },
} satisfies Meta<typeof OfferDetail>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Item: Story = {};
/** Milestone 9: "Service" where an item shows its condition, and "What the service includes". */
export const Service: Story = {
  args: {
    offer_type: "service",
    title: "Maths lessons for JSS students",
    description: "I teach maths at a secondary school in Bodija.",
    category: "lessons_tutoring",
    condition: null,
    offering_text: "Two hours a week for a month",
    wants_text: "A used laptop",
    exchange_mode: "either",
    handover_methods: ["on_site_service", "remote_service"],
  },
};
