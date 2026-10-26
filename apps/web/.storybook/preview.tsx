import type { Preview } from "@storybook/nextjs-vite";
import "../app/globals.css";

// The app's fonts come from next/font in app/layout.tsx; here the same
// families load from preview-head.html under the same variable names.

const preview: Preview = {
  parameters: {
    layout: "padded",
    // App-router mode trips over Next 16.4's router internals in this
    // Storybook version; the pages-router mock serves next/navigation too.
    nextjs: { appDirectory: false },
    backgrounds: { disable: true },
    viewport: {
      options: {
        phone: { name: "Phone (375)", styles: { width: "375px", height: "812px" } },
        desktop: { name: "Desktop (1280)", styles: { width: "1280px", height: "860px" } },
      },
    },
  },
  decorators: [
    (Story) => (
      <div className="bg-bg-base font-sans text-body text-text-primary">
        <Story />
      </div>
    ),
  ],
};

export default preview;
