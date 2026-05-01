/**
 * Shared utility functions for company name formatting.
 */

const YAFO_OR_JAFFA: ReadonlySet<string> = new Set(['yafo', 'jaffa']);

function stripTrailingPunct(word: string): string {
  return word.replace(/[.,]$/, '');
}

function normCompanyWord(word: string): string {
  return stripTrailingPunct(word).toLowerCase();
}

/**
 * Tel Aviv is two words but should count as one city prefix for maxWords; optional
 * "Yafo"/"Jaffa" is dropped. Same optional skip after "Jerusalem" or "Haifa".
 */
export function preprocessIsraeliCityCompanyWords(words: string[]): string[] {
  if (words.length === 0) {
    return words;
  }
  const n0: string = normCompanyWord(words[0]);
  const n1: string = words.length > 1 ? normCompanyWord(words[1]) : '';

  if (n0 === 'tel' && n1 === 'aviv') {
    let idx: number = 2;
    if (idx < words.length && YAFO_OR_JAFFA.has(normCompanyWord(words[idx]))) {
      idx++;
    }
    return ['TelAviv', ...words.slice(idx)];
  }

  if (n0 === 'jerusalem') {
    let idx: number = 1;
    if (idx < words.length && YAFO_OR_JAFFA.has(normCompanyWord(words[idx]))) {
      idx++;
    }
    return ['Jerusalem', ...words.slice(idx)];
  }

  if (n0 === 'haifa') {
    let idx: number = 1;
    if (idx < words.length && YAFO_OR_JAFFA.has(normCompanyWord(words[idx]))) {
      idx++;
    }
    return ['Haifa', ...words.slice(idx)];
  }

  return words;
}

export function wordToPascalCaseSegment(word: string): string {
  if (!word) {
    return '';
  }
  const key: string = normCompanyWord(word);
  if (key === 'telaviv') {
    return 'TelAviv';
  }
  if (key === 'jerusalem') {
    return 'Jerusalem';
  }
  if (key === 'haifa') {
    return 'Haifa';
  }

  // Fix all-caps but preserve internal casing (like OkCupid, 3D)
  // If the word already has internal capitalization (e.g., DiFiore, OkCupid, 3D), keep it UNTOUCHED.
  const isAllUpper = word === word.toUpperCase() && word.length > 1;
  const hasInternalCaps =
    word.length >= 2 &&
    word.slice(1) !== word.slice(1).toLowerCase() &&
    !isAllUpper;

  if (hasInternalCaps) {
    return word;
  }

  const processedRest = isAllUpper
    ? word.slice(1).toLowerCase()
    : word.slice(1);
  return word.charAt(0).toUpperCase() + processedRest;
}

/**
 * Formats a company name by capitalizing each word.
 * Joins words with a space to maintain readability (Title Case).
 */
export function formatCompanyToPascalCase(
  company: string,
  maxWords?: number
): string {
  if (!company || !company.trim()) {
    return '';
  }
  let words: string[] = preprocessIsraeliCityCompanyWords(
    company.trim().split(/\s+/)
  );
  if (maxWords && maxWords > 0) {
    let resultWords = words.slice(0, maxWords);
    const joiners = [
      'of',
      '&',
      'and',
      'with',
      'for',
      'the',
      'a',
      'an',
      'in',
      'at',
      'by',
      'or',
      '+',
      'co',
      'co.',
      'ben',
      'hebrew',
      'jewish',
      'bar',
      'israel',
      'bet',
      'house',
    ];
    const forceNextPrefixes = [
      'TheOpen',
      'BarIlan',
      'IsraelNational',
      'TheIsraeli',
      'TheIsrael',
      'BetShemesh',
      'BenGurion',
      'TheAcademic',
      'TheADHD',
      'Medical',
      'HouseOf',
      'Houseof',
    ];

    while (resultWords.length < words.length) {
      const lastWord = resultWords[resultWords.length - 1]
        .toLowerCase()
        .replace(/[.,]$/, '');
      const currentPascal = resultWords
        .map((w) => wordToPascalCaseSegment(w))
        .join('');

      const shouldForceNext = forceNextPrefixes.some((prefix) =>
        currentPascal.endsWith(prefix)
      );

      if (joiners.includes(lastWord) || shouldForceNext) {
        resultWords.push(words[resultWords.length]);
      } else if (/\d$/.test(lastWord)) {
        let nextIdx = resultWords.length;
        // Skip over purely special character words to find the next meaningful word
        while (nextIdx < words.length && !/[a-zA-Z0-9]/.test(words[nextIdx])) {
          nextIdx++;
        }
        if (nextIdx < words.length) {
          for (let i = resultWords.length; i <= nextIdx; i++) {
            resultWords.push(words[i]);
          }
        } else {
          break;
        }
      } else {
        break;
      }
    }
    // If the final word is a joiner and we can't pull more, remove it if it's a symbol
    // OR if it's the only word left after a joiner (like "Something &")
    while (resultWords.length > 0) {
      const lastWord = resultWords[resultWords.length - 1]
        .toLowerCase()
        .replace(/[.,]$/, '');
      if (
        joiners.includes(lastWord) &&
        resultWords.length < words.length === false
      ) {
        // If it's a symbol like '&' or '+', always remove if at the end
        if (lastWord === '&' || lastWord === '+') {
          resultWords.pop();
        } else {
          break;
        }
      } else {
        break;
      }
    }
    words = resultWords;
  }
  const pascalCaseWords: string[] = words.map((word: string) =>
    wordToPascalCaseSegment(word)
  );
  return pascalCaseWords.join('');
}
