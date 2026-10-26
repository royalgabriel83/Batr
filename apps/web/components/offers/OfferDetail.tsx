import type { ReactNode } from "react";
import { CalendarDays, Handshake, LockKeyhole, MapPin, Repeat2 } from "lucide-react";
import {
  OFFER_CATEGORIES,
  OFFER_CONDITIONS,
  OFFER_EXCHANGE_MODES,
  OFFER_HANDOVER_METHODS,
  areaLabel,
  handoverMethodsLabel,
  memberSinceLabel,
  postedAge,
  type OfferArea,
  type OfferCategory,
  type OfferCondition,
  type OfferExchangeMode,
  type OfferHandoverMethod,
  type OfferType,
} from "@batr/shared";
import { MemberInitial } from "@/components/ui/MemberInitial";
import { ExchangePair } from "./ExchangePair";
import { OfferGallery, type GalleryPhoto } from "./OfferGallery";

export interface OfferDetailProps {
  /** Missing means an item. A service shows "Service" where an item shows its condition. */
  offer_type?: OfferType;
  title: string;
  description: string;
  category: OfferCategory | null;
  condition: OfferCondition | null;
  offering_text: string;
  wants_text: string;
  /** General area only (location phase 1); BATR holds no address. */
  area?: OfferArea | null;
  exchange_mode?: OfferExchangeMode | null;
  handover_methods?: readonly OfferHandoverMethod[];
  /** When it was published; the editor's preview has none. */
  published_at?: string | null;
  photos: GalleryPhoto[];
  owner: { display_name: string | null; member_since: string | null };
  /** h1 on the offer page; h2 inside the editor's preview. */
  headingLevel?: 1 | 2;
  /** On the offer page: lets the gallery refresh expired photo links. */
  offerId?: string;
  /** On the offer page: actions shown under the terms (Share). */
  actions?: ReactNode;
  /** On the offer page: the heart and bookmark over the main photo. */
  marks?: ReactNode;
  /** On the offer page: BATR's assessed value, when there is one. */
  valuation?: ReactNode;
}

/**
 * An offer as others see it, in the approved reference layout (owner,
 * 2026-10-17): gallery on the left, then category, serif title, owner
 * row with the general area, the exchange, where and how it happens,
 * and the owner card. The editor's preview and the offer page both use
 * this component, so the preview matches what is published. No trust
 * claims other than "Member since" (ui-context.md), and no Propose or
 * Message action in Milestone 1.
 */
export function OfferDetail({
  offer_type = "item",
  title,
  description,
  category,
  condition,
  offering_text,
  wants_text,
  area = null,
  exchange_mode = null,
  handover_methods = [],
  published_at = null,
  photos,
  owner,
  headingLevel = 1,
  offerId,
  actions,
  marks,
  valuation,
}: OfferDetailProps) {
  const Heading = headingLevel === 1 ? "h1" : "h2";
  const Sub = headingLevel === 1 ? "h2" : "h3";
  const since = memberSinceLabel(owner.member_since);
  const place = exchange_mode === "remote" ? null : areaLabel(area);
  const how = handoverMethodsLabel(handover_methods);
  const age = postedAge(published_at);
  const facts: string[] = [];
  if (category) facts.push(OFFER_CATEGORIES[category]);
  const service = offer_type === "service";
  if (service) facts.push("Service");
  else if (condition) facts.push(OFFER_CONDITIONS[condition]);
  const logistics: { icon: ReactNode; label: string; value: string }[] = [];
  if (place)
    logistics.push({
      icon: <MapPin aria-hidden="true" className="size-5" />,
      label: "Location",
      value: place,
    });
  if (exchange_mode) {
    logistics.push({
      icon: <Repeat2 aria-hidden="true" className="size-5" />,
      label: "Exchange",
      value: OFFER_EXCHANGE_MODES[exchange_mode],
    });
  }
  if (how)
    logistics.push({
      icon: <Handshake aria-hidden="true" className="size-5" />,
      label: "How",
      value: how,
    });
  if (age && published_at)
    logistics.push({
      icon: <CalendarDays aria-hidden="true" className="size-5" />,
      label: "Posted",
      value: age,
    });
  // Meeting in person needs a place; say how it is shared whenever one could be.
  const inPerson =
    place !== null ||
    exchange_mode === "in_person" ||
    exchange_mode === "either" ||
    handover_methods.some((m) => OFFER_HANDOVER_METHODS[m].inPerson);

  return (
    <article className="grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] lg:items-start lg:gap-14">
      <OfferGallery photos={photos} title={title} offerId={offerId} overlay={marks} />
      <div className="flex flex-col lg:sticky lg:top-24">
        <div className="flex flex-col gap-3">
          {facts.length > 0 ? (
            <ul aria-label={service ? "Category and type" : "Category and condition"} className="flex flex-wrap gap-2">
              {facts.map((fact, index) => (
                <li
                  key={fact}
                  className={
                    index === 0 && category
                      ? "rounded-full bg-accent-soft px-2.5 py-1 text-caption text-accent-primary"
                      : "rounded-full border border-border-default bg-bg-surface px-2.5 py-1 text-caption text-text-secondary"
                  }
                >
                  {fact}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-body-sm text-text-secondary">No category or condition yet</p>
          )}
          <Heading className="text-h1 break-words md:text-h2-lg">{title || "Untitled offer"}</Heading>
          <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-body-sm text-text-secondary">
            <span className="flex items-center gap-2">
              <MemberInitial name={owner.display_name} size="md" />
              <span className="font-semibold text-text-primary">{owner.display_name ?? "BATR member"}</span>
            </span>
            {place ? (
              <span className="flex items-center gap-1">
                <MapPin aria-hidden="true" className="size-4 text-text-muted" />
                {place}
              </span>
            ) : null}
            {age ? (
              <time dateTime={published_at ?? undefined} className="text-text-muted" suppressHydrationWarning>
                Posted {age === "Today" || age === "Yesterday" ? age.toLowerCase() : age}
              </time>
            ) : null}
          </p>
        </div>
        {description ? (
          <p className="mt-5 max-w-prose text-body whitespace-pre-line break-words text-text-secondary">{description}</p>
        ) : null}
        <ExchangePair variant="panel" offering={offering_text} wants={wants_text} service={service} className="mt-6" />
        {actions ? <div className="mt-3 flex flex-wrap gap-2">{actions}</div> : null}
        {valuation ? <div className="mt-6">{valuation}</div> : null}
        {logistics.length > 0 || inPerson ? (
          <section aria-label="Where and how" className="mt-6 flex flex-col gap-4 border-t border-border-default pt-6">
            {logistics.length > 0 ? (
              <dl className="grid grid-cols-2 gap-x-4 gap-y-4">
                {logistics.map(({ icon, label, value }) => (
                  <div key={label} className="relative min-w-0 pl-8">
                    <dt className="text-caption text-text-muted">
                      <span className="absolute top-0.5 left-0 text-accent-primary">{icon}</span>
                      {label}
                    </dt>
                    <dd className="text-body-sm font-medium break-words">{value}</dd>
                  </div>
                ))}
              </dl>
            ) : null}
            {inPerson ? (
              <p className="flex items-start gap-2 text-body-sm text-text-secondary">
                <LockKeyhole aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-text-muted" />
                Exact meeting details are agreed privately between members.
              </p>
            ) : null}
          </section>
        ) : null}
        <section className="mt-6 flex items-center gap-4 rounded-xl bg-bg-surface p-4 shadow-card ring-1 ring-border-default/70">
          <MemberInitial name={owner.display_name} size="lg" />
          <div className="flex min-w-0 flex-col">
            <p className="text-caption text-text-muted">Offered by</p>
            <Sub className="truncate text-body font-semibold">{owner.display_name ?? "BATR member"}</Sub>
            {since ? <p className="text-body-sm text-text-secondary">Member since {since}</p> : null}
          </div>
        </section>
      </div>
    </article>
  );
}
