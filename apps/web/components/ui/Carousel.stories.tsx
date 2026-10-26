import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { Carousel } from "./Carousel";

const meta = {
  title: "UI/Carousel",
  component: Carousel,
  args: { label: "Example", slideLabel: "Slide", slides: [] },
} satisfies Meta<typeof Carousel>;
export default meta;
type Story = StoryObj<typeof meta>;

const panel = (text: string, className: string) => (
  <div className={`flex aspect-[16/9] items-center justify-center rounded-lg text-h3 ${className}`}>{text}</div>
);

/** Controls underneath on a light surface, as in "How BATR works". */
export const Below: Story = {
  args: {
    label: "Steps",
    slideLabel: "Step",
    slides: [panel("One", "bg-accent-soft"), panel("Two", "bg-bg-subtle"), panel("Three", "bg-accent-soft")],
  },
};

/** Controls over the slides, as on offer photos and the home hero. */
export const OverlayOnPhotos: Story = {
  args: {
    label: "Photos",
    slideLabel: "Photo",
    tone: "inverse",
    controls: "overlay",
    slides: [panel("Photo 1", "bg-bg-inverse text-text-on-inverse"), panel("Photo 2", "bg-accent-primary text-text-on-accent"), panel("Photo 3", "bg-bg-inverse text-text-on-inverse")],
  },
};

/** One slide: no dots, no pause button, no swiping. */
export const Single: Story = { args: { label: "Photos", slides: [panel("Only photo", "bg-bg-subtle")] } };

/** Doesn't move on its own; the dots still work. */
export const Still: Story = { args: { ...Below.args, autoplay: false } };
