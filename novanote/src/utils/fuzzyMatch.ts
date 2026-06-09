export function fuzzyMatch(query: string, text: string): { match: boolean; score: number } {
  let qi = 0;
  let score = 0;
  let lastMatchIdx = -1;

  const lowerText = text.toLowerCase();
  const lowerQuery = query.toLowerCase();

  for (let ti = 0; ti < lowerText.length && qi < lowerQuery.length; ti++) {
    if (lowerText[ti] === lowerQuery[qi]) {
      score += lastMatchIdx === ti - 1 ? 2 : 1; // bonus for consecutive
      if (ti === 0) score += 2; // bonus for matching start
      lastMatchIdx = ti;
      qi++;
    }
  }

  return { match: qi === lowerQuery.length, score };
}
