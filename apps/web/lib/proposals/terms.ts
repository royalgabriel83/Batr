// Moved to packages/shared so the mobile app reads terms the same way
// (milestone-2-part-2.md). Re-exported here for the web's imports.
export {
  cashLabel,
  changedWord,
  chipsFor,
  exchangeTitle,
  formatDay,
  formatRecordTime,
  formatWhen,
  handoverInstruction,
  itemLabel,
  itemsSentence,
  nameOr,
  otherRole,
  shortRef,
  sidesFor,
} from "@batr/shared";
export type { ItemView, PartyRole as Role, RevisionView } from "@batr/shared";
