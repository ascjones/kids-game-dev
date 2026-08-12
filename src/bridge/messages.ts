import { z } from 'zod';

// Bridge message contract (R12, KTD4). Shared by the browser client and the
// dev-server middleware; HARNESS.md documents the same shapes for the harness.
//
// The plan's bridge protocol also reserves a `progress_snapshot` outbox type;
// it is deferred from v1 (no producer or consumer) per the plan's open
// questions, so it is deliberately absent here.

export const outboxPayloadSchemas = {
  new_game_idea: z.object({
    idea: z.string().min(1),
    genre: z.literal('platformer'),
  }),
  challenge_completed: z.object({
    challengeId: z.string().min(1),
    challengeTitle: z.string().optional(),
  }),
  free_request: z.object({
    request: z.string().min(1),
  }),
} as const;

export type OutboxType = keyof typeof outboxPayloadSchemas;
export const OUTBOX_TYPES = Object.keys(outboxPayloadSchemas) as OutboxType[];

/** What the browser sends: the middleware stamps id/at and names the file. */
export const decisionInputSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('new_game_idea'), payload: outboxPayloadSchemas.new_game_idea }),
  z.object({
    type: z.literal('challenge_completed'),
    payload: outboxPayloadSchemas.challenge_completed,
  }),
  z.object({ type: z.literal('free_request'), payload: outboxPayloadSchemas.free_request }),
]);

export type DecisionInput = z.infer<typeof decisionInputSchema>;

/** Full envelope as written into bridge/outbox/. */
export const outboxEnvelopeSchema = z.object({
  id: z.string().min(1),
  type: z.enum(OUTBOX_TYPES),
  at: z.string().min(1),
  payload: z.record(z.string(), z.unknown()),
});

export type OutboxEnvelope = z.infer<typeof outboxEnvelopeSchema>;

/** Messages the harness writes into bridge/inbox/. id/at are recommended but not required. */
export const inboxMessageSchema = z.discriminatedUnion('type', [
  z.object({
    id: z.string().optional(),
    type: z.literal('environment_updated'),
    at: z.string().optional(),
    payload: z.object({ note: z.string().optional() }).optional(),
  }),
  z.object({
    id: z.string().optional(),
    type: z.literal('message'),
    at: z.string().optional(),
    payload: z.object({ text: z.string().min(1) }),
  }),
]);

export type InboxMessage = z.infer<typeof inboxMessageSchema>;
