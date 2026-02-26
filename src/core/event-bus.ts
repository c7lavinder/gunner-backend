/**
 * Event Bus — typed pub/sub. CRM-agnostic.
 * Webhooks and pollers emit events here.
 * Triggers.ts subscribes and routes to agents.
 */

export type EventKind =
  | 'opportunity.created'
  | 'opportunity.stage_changed'
  | 'inbound.message'
  | 'call.completed'
  | 'call.inbound';

export interface GunnerEvent {
  kind: EventKind;
  tenantId: string;
  contactId: string;
  opportunityId?: string;
  stageId?: string;
  stageName?: string;
  callId?: string;
  messageId?: string;
  raw?: Record<string, unknown>;
  receivedAt: number;
}

type Handler = (event: GunnerEvent) => Promise<void>;

const handlers: Map<EventKind, Handler[]> = new Map();

export function on(kind: EventKind, handler: Handler) {
  if (!handlers.has(kind)) handlers.set(kind, []);
  handlers.get(kind)!.push(handler);
}

export async function emit(event: GunnerEvent): Promise<void> {
  const list = handlers.get(event.kind) ?? [];
  await Promise.allSettled(
    list.map((h) =>
      h(event).catch((err) =>
        console.error(`[event-bus] handler error for ${event.kind}:`, err)
      )
    )
  );
}

export function registeredKinds(): string[] {
  return [...handlers.keys()];
}
