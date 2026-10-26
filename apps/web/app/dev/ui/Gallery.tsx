"use client";

import { useState, type ReactNode } from "react";
import { Archive, CircleCheck, Circle, CirclePause, FilePenLine, Info, Plus, TriangleAlert } from "lucide-react";
import { Badge, Button, PhotoTile, SegmentedControl, Select, TextField, Textarea } from "@/components/ui";

const SAMPLE_PHOTO =
  "data:image/svg+xml;utf8," +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 4 4"><rect width="4" height="4" fill="gray"/><rect width="2" height="2" fill="silver"/><rect x="2" y="2" width="2" height="2" fill="silver"/></svg>',
  );

const conditionOptions = [
  { value: "new", label: "New" },
  { value: "like_new", label: "Like new" },
  { value: "good", label: "Good" },
  { value: "fair", label: "Fair" },
] as const;

const categoryOptions = [
  { value: "electronics", label: "Electronics" },
  { value: "books_media", label: "Books and media" },
  { value: "other", label: "Other" },
] as const;

function Section({ title, children, inverse }: { title: string; children: ReactNode; inverse?: boolean }) {
  return (
    <section aria-labelledby={`${title}-heading`} className="flex flex-col gap-4">
      <h2 id={`${title}-heading`} className="text-h2">
        {title}
      </h2>
      <div className={inverse ? "rounded-lg bg-bg-inverse p-6" : "rounded-lg border border-border-default bg-bg-surface p-6"}>
        {children}
      </div>
    </section>
  );
}

export function Gallery() {
  const [clicks, setClicks] = useState(0);
  const [condition, setCondition] = useState("good");

  return (
    <main className="mx-auto flex max-w-7xl flex-col gap-12 px-4 py-12 md:px-6 lg:px-8">
      <header>
        <h1 className="text-h1">UI gallery</h1>
        <p className="mt-2 text-body text-text-secondary">
          Development only. Tokens and primitives from unit 02; values are PENDING APPROVAL in ui-context.md.
        </p>
      </header>

      <Section title="Typography">
        <div className="flex flex-col gap-2">
          <p className="text-display">Display 36/40</p>
          <p className="text-h1">Heading 1 30/36</p>
          <p className="text-h2">Heading 2 24/32</p>
          <p className="text-h3">Heading 3 20/28</p>
          <p className="text-h4">Heading 4 18/28</p>
          <p className="text-body">Body 16/24, the default text size.</p>
          <p className="text-body-sm text-text-secondary">Body small 14/20, secondary text.</p>
          <p className="text-caption text-text-muted">Caption 12/16, meta labels</p>
          <p className="text-body tabular-nums">Tabular figures: 1,234 · 15 Oct 2026</p>
        </div>
      </Section>

      <Section title="Buttons">
        <div className="flex flex-col gap-6">
          <div className="flex flex-wrap items-center gap-3">
            <Button onClick={() => setClicks((n) => n + 1)}>Primary</Button>
            <Button variant="secondary">Secondary</Button>
            <Button variant="tertiary">Tertiary</Button>
            <Button variant="danger">Danger</Button>
            <Button icon={<Plus aria-hidden="true" className="size-5" />}>With icon</Button>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Button size="sm">Small 32</Button>
            <Button size="md">Medium 40</Button>
            <Button size="lg">Large 48</Button>
            <Button size="sm" variant="secondary">
              Small secondary
            </Button>
            <Button size="md" variant="secondary">
              Medium secondary
            </Button>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Button disabled onClick={() => setClicks((n) => n + 1)}>
              Disabled
            </Button>
            <Button loading>Loading</Button>
            <p className="text-body-sm text-text-secondary" data-testid="click-count">
              Primary clicks: {clicks}
            </p>
          </div>
        </div>
      </Section>

      <Section title="Buttons on the brand frame" inverse>
        <div className="flex flex-wrap items-center gap-3">
          <Button surface="inverse">Primary</Button>
          <Button surface="inverse" variant="secondary">
            Secondary
          </Button>
          <Button surface="inverse" variant="tertiary">
            Tertiary
          </Button>
        </div>
      </Section>

      <Section title="Badges">
        <div className="flex flex-wrap items-center gap-3">
          <Badge icon={<FilePenLine />}>Neutral</Badge>
          <Badge tone="success" icon={<CircleCheck />}>
            Success
          </Badge>
          <Badge tone="warning" icon={<CirclePause />}>
            Warning
          </Badge>
          <Badge tone="danger" icon={<TriangleAlert />}>
            Danger
          </Badge>
          <Badge tone="info" icon={<Info />}>
            Info
          </Badge>
          <Badge icon={<Archive />}>
            <span>Neutral, second icon</span>
          </Badge>
        </div>
      </Section>

      <Section title="Form fields">
        <div className="grid gap-6 md:grid-cols-2">
          <TextField id="demo-title" label="Title" required helper="5 to 80 characters." />
          <TextField id="demo-title-error" label="Title with error" required defaultValue="Bike" error="Use at least 5 characters." />
          <Textarea id="demo-description" label="Description" maxLength={2000} helper="Optional." />
          <Select id="demo-category" label="Category" required placeholder="Choose a category" options={categoryOptions} defaultValue="" />
          <TextField id="demo-disabled" label="Disabled field" disabled defaultValue="Read only" />
          <Select id="demo-category-error" label="Category with error" required placeholder="Choose a category" options={categoryOptions} defaultValue="" error="Choose a category." />
        </div>
      </Section>

      <Section title="Segmented control">
        <div className="flex flex-col gap-6">
          <SegmentedControl
            name="demo-condition"
            legend="Condition"
            required
            options={conditionOptions}
            value={condition}
            onChange={(event) => setCondition(event.target.value)}
          />
          <p className="text-body-sm text-text-secondary" data-testid="condition-value">
            Selected: {condition}
          </p>
          <SegmentedControl name="demo-condition-error" legend="Condition with error" required options={conditionOptions} error="Choose a condition." />
        </div>
      </Section>

      <Section title="Photo tiles">
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
          <PhotoTile state="ready" src={SAMPLE_PHOTO} alt="Sample photo, cover" isCover onRemove={() => undefined} />
          <PhotoTile state="ready" src={SAMPLE_PHOTO} alt="Sample photo" onRemove={() => undefined} />
          <PhotoTile state="uploading" src={SAMPLE_PHOTO} alt="Sample photo" progress={60} />
          <PhotoTile state="error" src={SAMPLE_PHOTO} alt="Sample photo" errorMessage="Please use a JPEG, PNG or WebP photo." onRetry={() => undefined} onRemove={() => undefined} />
          <PhotoTile state="empty" onAdd={() => undefined} />
        </div>
      </Section>

      <Section title="Status icon reference">
        <p className="flex items-center gap-2 text-body-sm text-text-secondary">
          <Circle aria-hidden="true" className="size-4" />
          Offer status badges are wired to the shared status labels in unit 03.
        </p>
      </Section>
    </main>
  );
}
