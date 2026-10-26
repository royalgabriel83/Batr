import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Gallery } from "./Gallery";

export const metadata: Metadata = { title: "UI gallery (development)", robots: { index: false } };

// Development builds only (specs/milestone-1.md, unit 02).
export default function DevUiPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return <Gallery />;
}
