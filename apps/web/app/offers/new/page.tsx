import type { Metadata } from "next";
import { PRODUCT_NAME } from "@batr/shared";
import { requireMember } from "@/server/auth";
import { OfferEditor } from "../OfferEditor";

export const metadata: Metadata = { title: `Create an offer · ${PRODUCT_NAME}` };

export default async function NewOfferPage() {
  const member = await requireMember("/offers/new");
  return <OfferEditor initialOffer={null} owner={{ display_name: member.displayName, member_since: member.memberSince.slice(0, 7) }} />;
}
