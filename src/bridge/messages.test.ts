import { describe, expect, it } from 'vitest';
import {
  decisionInputSchema,
  inboxMessageSchema,
  outboxEnvelopeSchema,
  OUTBOX_TYPES,
} from './messages';

const validDecisions = [
  { type: 'new_game_idea', payload: { idea: 'space cat adventure', genre: 'platformer' } },
  { type: 'challenge_completed', payload: { challengeId: 'make-jump', challengeTitle: 'Jump!' } },
  { type: 'free_request', payload: { request: 'make the sky purple' } },
] as const;

describe('decision messages', () => {
  it.each(validDecisions.map((d) => [d.type, d] as const))(
    '%s round-trips through the schema',
    (_type, decision) => {
      const parsed = decisionInputSchema.parse(JSON.parse(JSON.stringify(decision)));
      expect(parsed).toEqual(decision);
    },
  );

  it('covers every declared outbox type', () => {
    expect(new Set(validDecisions.map((d) => d.type))).toEqual(new Set(OUTBOX_TYPES));
  });

  it('rejects an unknown type', () => {
    expect(
      decisionInputSchema.safeParse({ type: 'progress_snapshot', payload: {} }).success,
    ).toBe(false);
  });

  it('rejects an empty idea', () => {
    expect(
      decisionInputSchema.safeParse({
        type: 'new_game_idea',
        payload: { idea: '', genre: 'platformer' },
      }).success,
    ).toBe(false);
  });
});

describe('outbox envelope', () => {
  it('round-trips a stamped envelope', () => {
    const envelope = {
      id: 'abc-123',
      type: 'free_request',
      at: '2026-08-12T10:00:00.000Z',
      payload: { request: 'add a dragon' },
    };
    expect(outboxEnvelopeSchema.parse(JSON.parse(JSON.stringify(envelope)))).toEqual(envelope);
  });
});

describe('inbox messages', () => {
  it.each([
    ['environment_updated', { type: 'environment_updated', payload: { note: 'new world!' } }],
    ['message', { type: 'message', payload: { text: 'I built your castle!' } }],
  ] as const)('%s round-trips through the schema', (_type, message) => {
    expect(inboxMessageSchema.parse(JSON.parse(JSON.stringify(message)))).toEqual(message);
  });

  it('accepts a bare environment_updated with no payload', () => {
    expect(inboxMessageSchema.safeParse({ type: 'environment_updated' }).success).toBe(true);
  });

  it('rejects a message with no text', () => {
    expect(inboxMessageSchema.safeParse({ type: 'message', payload: {} }).success).toBe(false);
  });
});
