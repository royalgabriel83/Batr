import type * as Shared from "@batr/shared";
import type { AgreementSummaryView, AgreementView } from "./agreements";
import type { ProposalSummaryView, ProposalView } from "./proposals";

// The mobile app reads these endpoints through the explicit view types
// in packages/shared. The web's are inferred from the code that builds
// them, so typecheck fails here if the two ever drift apart.

type Same<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;
type Assert<T extends true> = T;

export type ViewTypesMatch = [
  Assert<Same<ProposalView, Shared.ProposalView>>,
  Assert<Same<ProposalSummaryView, Shared.ProposalSummaryView>>,
  Assert<Same<AgreementView, Shared.AgreementView>>,
  Assert<Same<AgreementSummaryView, Shared.AgreementSummaryView>>,
];
