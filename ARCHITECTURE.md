# Gunner Backend — Architecture

## Layers (top to bottom, strict one-way dependency)

```
API           → receives webhooks, exposes control endpoints
Core          → event bus, CRM sync poller, toggle system, dry-run, audit log
Agents        → business logic only. read context, return decisions. touch NOTHING directly.
Bots          → the only things allowed to write to GHL. one bot = one action.
Integrations  → raw GHL client, AI client. no business logic here.
Playbook      → config, triggers, stage IDs, SLAs. all tenant-specific data lives here.
```

## Rules (never break these)

1. **One poller** — `core/crm-sync.ts` is the only thing polling GHL. Never create another.
2. **Agents don't touch GHL** — agents call bots. bots call GHL. agents never call integrations directly.
3. **Agents don't know their triggers** — `core/triggers.ts` wires events to agents. Agents just export a `run()` function.
4. **Nothing hardcoded** — stage IDs, phone numbers, user IDs, team names all come from playbook config.
5. **Every agent/bot is toggled** — nothing runs unless its toggle is ON. Check at entry point.
6. **Dry run at the bot layer** — bots check `isDryRun()` before writing. Agents don't need to know.
7. **One registry** — `core/agent-registry.ts` maps agent name → handler. That's the only place.

## Adding an Agent (the ONLY correct way)
1. Write the agent in `src/agents/your-agent.ts` — export `run(event)`
2. Register it in `src/core/agent-registry.ts`
3. Add trigger in `src/playbook/triggers.ts`
Done. Zero other files change.

## Adding a Bot (the ONLY correct way)
1. Write the bot in `src/bots/your-bot.ts` — export one function that does one thing
2. Export it from `src/bots/index.ts`
Done.
