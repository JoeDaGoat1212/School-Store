/** What staff can say about a requested item. Students see "Coming soon" and "Now selling". */
export type RequestStatus = "new" | "planned" | "stocked" | "declined";

export const STATUS_LABEL: Record<RequestStatus, string> = {
  new: "New",
  planned: "Coming soon",
  stocked: "Now selling",
  declined: "Not doing",
};
