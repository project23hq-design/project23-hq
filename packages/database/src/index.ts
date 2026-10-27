import type { Database } from "./types.gen";

export type { Database, Json } from "./types.gen";

type PublicSchema = Database["public"];
export type Tables<T extends keyof PublicSchema["Tables"]> = PublicSchema["Tables"][T]["Row"];
export type Views<T extends keyof PublicSchema["Views"]> = PublicSchema["Views"][T]["Row"];
export type Enums<T extends keyof PublicSchema["Enums"]> = PublicSchema["Enums"][T];
export type Rpc<T extends keyof PublicSchema["Functions"]> = PublicSchema["Functions"][T];

/** Public projection of an event, non-null fields asserted where the view guarantees them. */
export type PublicEvent = Views<"public_events">;
export type PublicTicketType = Views<"public_ticket_types">;
