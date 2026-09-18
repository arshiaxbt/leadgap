import {
  evaluateAlert,
  type ResearchSnapshot,
  type AlertRule,
  type AlertState,
} from "../../src/lib/research";
import type { Env } from "./db";
export async function evaluateRules(
  env: Env,
  snapshot: ResearchSnapshot,
  now: number,
) {
  const result = await env.DB.prepare(
    "SELECT i.owner,i.id,i.payload,COALESCE(s.matched,0) matched,COALESCE(s.last_fired,0) last_fired FROM account_items i LEFT JOIN alert_state s ON s.owner=i.owner AND s.id=i.id WHERE i.kind='rules'",
  ).all<{
    owner: string;
    id: string;
    payload: string;
    matched: number;
    last_fired: number;
  }>();
  const states: {
      owner: string;
      id: string;
      matched: number;
      lastFired: number;
    }[] = [],
    notices: {
      id: string;
      owner: string;
      ruleId: string;
      created: number;
      payload: string;
    }[] = [];
  for (const entry of result.results) {
    const rule = JSON.parse(entry.payload) as AlertRule;
    const prior: AlertState = {
      matched: !!entry.matched,
      lastFired: entry.last_fired,
    };
    const row = snapshot.windows[rule.window]?.find(
      (r) => r.symbol === rule.symbol && r.eventId === rule.eventId,
    );
    const { state, fire } = evaluateAlert(rule, prior, row, now, snapshot.asOf);
    if (state.matched !== prior.matched || state.lastFired !== prior.lastFired)
      states.push({
        owner: entry.owner,
        id: entry.id,
        matched: state.matched ? 1 : 0,
        lastFired: state.lastFired,
      });
    if (fire && row)
      notices.push({
        id: `${entry.owner}:${entry.id}:${Math.floor(now / 60_000)}`,
        owner: entry.owner,
        ruleId: entry.id,
        created: now,
        payload: JSON.stringify({
          title: `${row.title} · score ${row.score}, gap ${(Math.abs(row.gap) * 100).toFixed(2)}%`,
          symbol: row.symbol,
          eventId: row.eventId,
        }),
      });
  }
  // Two set-based statements keep evaluation inside the D1 query budget.
  if (states.length || notices.length)
    await env.DB.batch([
      env.DB.prepare(
        "INSERT INTO alert_state(owner,id,matched,last_fired) SELECT json_extract(value,'$.owner'),json_extract(value,'$.id'),json_extract(value,'$.matched'),json_extract(value,'$.lastFired') FROM json_each(?) WHERE true ON CONFLICT(owner,id) DO UPDATE SET matched=excluded.matched,last_fired=excluded.last_fired",
      ).bind(JSON.stringify(states)),
      env.DB.prepare(
        "INSERT OR IGNORE INTO notifications(id,owner,rule_id,created,payload) SELECT json_extract(value,'$.id'),json_extract(value,'$.owner'),json_extract(value,'$.ruleId'),json_extract(value,'$.created'),json_extract(value,'$.payload') FROM json_each(?)",
      ).bind(JSON.stringify(notices)),
    ]);
}
