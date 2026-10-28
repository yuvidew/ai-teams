// Caps one model step, so a single runaway generation can't burn through a
// period's allowance before the next usage check.
export const MAX_OUTPUT_TOKENS = 8192
