export type MinorityOutcome = {
  counts: number[];
  winningChoices: number[];
  outcome: "minority" | "tie" | "none";
};

/** Score only choices that received votes. Equal totals do not award chips. */
export function countMinorityChoices(optionCount: number, choices: readonly (number | null | undefined)[]): MinorityOutcome {
  const counts = Array<number>(optionCount).fill(0);
  for (const choice of choices) {
    if (typeof choice === "number" && Number.isInteger(choice) && choice >= 0 && choice < optionCount) counts[choice]++;
  }
  const selected = counts.filter(count => count > 0);
  if (selected.length < 2) return { counts, winningChoices: [], outcome: "none" };
  const minimum = Math.min(...selected);
  if (selected.every(count => count === minimum)) return { counts, winningChoices: [], outcome: "tie" };
  return { counts, winningChoices: counts.flatMap((count, index) => count === minimum ? [index] : []), outcome: "minority" };
}
