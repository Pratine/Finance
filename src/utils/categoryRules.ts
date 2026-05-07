// Pure rule-matching logic — extracted for testability.
// Rules are applied in order; the first matching rule wins.

export interface Rule {
  id: number
  pattern: string
  categoryId: number
}

// Returns the categoryId of the first rule whose pattern is found in the
// description (case-insensitive substring match), or null if no rule matches.
export function matchRule(description: string, rules: Rule[]): number | null {
  const lower = description.toLowerCase()
  for (const rule of rules) {
    if (lower.includes(rule.pattern.toLowerCase())) {
      return rule.categoryId
    }
  }
  return null
}
