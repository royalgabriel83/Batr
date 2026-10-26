import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Inter, Newsreader } from "next/font/google";
import { PRODUCT_NAME } from "@batr/shared";
import { SiteFooter, SiteHeader, TabBar, Toaster } from "@/components/ui";
import { signOut } from "./account/actions";
import { getCurrentMember } from "@/server/auth";
import { loadExchangesCount, loadHeaderCounts } from "@/server/proposals/queries";
import { loadSafetyStatus } from "@/server/safety/queries";
import { SuspendedBanner } from "@/components/safety/SuspendedBanner";
import { WarningBanner } from "@/components/safety/WarningBanner";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });
// Display serif for headings (PROPOSED 2026-10-17, ui-context.md Typography).
const newsreader = Newsreader({
  subsets: ["latin"],
  variable: "--font-newsreader",
  display: "swap",
  weight: ["400", "500"],
  style: ["normal", "italic"],
});

export const metadata: Metadata = {
  title: PRODUCT_NAME,
  description: `${PRODUCT_NAME} is a peer-to-peer exchange marketplace.`,
};

export default async function RootLayout({ children }: { children: ReactNode }) {
  const member = await getCurrentMember();
  const [exchangesCount, counts, safety] = member
    ? await Promise.all([loadExchangesCount(), loadHeaderCounts(), loadSafetyStatus()])
    : [0, { messages: 0, notifications: 0 }, { suspended: false, moderator: false, senior: false, warned: false }];
  return (
    <html lang="en" className={`${inter.variable} ${newsreader.variable}`}>
      <body className="flex min-h-screen flex-col bg-bg-base text-body text-text-primary antialiased">
        <SiteHeader
          member={member}
          signOut={signOut}
          exchangesCount={exchangesCount}
          messagesCount={counts.messages}
          notificationsCount={counts.notifications}
          moderator={safety.moderator}
        />
        {safety.suspended ? <SuspendedBanner /> : null}
        {safety.warned ? <WarningBanner /> : null}
        <div className="flex-1">{children}</div>
        <SiteFooter />
        <TabBar signedIn={member !== null} exchangesCount={exchangesCount} />
        <Toaster />
      </body>
    </html>
  );
}
