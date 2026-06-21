import { AI_CONTRACT_VERSION } from './contracts.js';

/** Transport-neutral agent endpoint. SG-07 may mount handle() behind JSON-RPC/CLI without letting
 * tooling reach authoritative state directly. */
export class AIInspectionEndpoint {
  constructor(stack) {
    if (!stack || typeof stack.inspect !== 'function') throw new TypeError('AIInspectionEndpoint requires a TacticalAIStack');
    this.stack = stack;
  }

  handle(request = {}) {
    const method = request.method || 'ai.inspect';
    const params = request.params || {};
    if (method === 'ai.inspect') return response(method, this.stack.inspect(params));
    if (method === 'ai.trace') return response(method, this.stack.trace.query(params));
    if (method === 'ai.contract') {
      return response(method, Object.freeze({
        version: AI_CONTRACT_VERSION,
        methods: Object.freeze(['ai.contract', 'ai.inspect', 'ai.trace']),
        layers: Object.freeze(['director', 'squad', 'utility', 'behavior', 'maneuver']),
        perceptionRule: 'sensors_and_memory_only',
        actionRule: 'sg03_action_port_only',
        movementRule: 'sg02_maneuver_port_only',
      }));
    }
    return Object.freeze({
      version: AI_CONTRACT_VERSION,
      ok: false,
      method,
      error: Object.freeze({ code: 'AI_METHOD_NOT_FOUND', message: `Unknown AI inspection method: ${method}` }),
    });
  }
}

function response(method, result) {
  return Object.freeze({ version: AI_CONTRACT_VERSION, ok: true, method, result });
}
