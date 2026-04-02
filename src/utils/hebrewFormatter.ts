function isHebrewChar(char: string): boolean {
  const code: number = char.charCodeAt(0);
  return (
    (code >= 0x0590 && code <= 0x05ff) || (code >= 0xfb1d && code <= 0xfb4f)
  );
}

function containsHebrew(text: string): boolean {
  for (let i: number = 0; i < text.length; i++) {
    if (isHebrewChar(text[i])) {
      return true;
    }
  }
  return false;
}

function reverseHebrewWords(text: string): string {
  if (!containsHebrew(text)) {
    return text;
  }
  const words: string[] = text.split(' ');
  const hebrewWords: string[] = [];
  const nonHebrewWords: string[] = [];
  words.forEach((word: string) => {
    if (containsHebrew(word)) {
      hebrewWords.push(word.split('').reverse().join(''));
    } else {
      nonHebrewWords.push(word);
    }
  });
  const reversedHebrewWords: string[] = hebrewWords.reverse();
  return [...reversedHebrewWords, ...nonHebrewWords].join(' ');
}

export function formatHebrewText(text: string): string {
  return reverseHebrewWords(text);
}

export function extractEnglishFromMixed(text: string): string {
  if (!text || !text.trim()) {
    return '';
  }
  const parts: string[] = text.split(/[\u0590-\u05FF\uFB1D-\uFB4F]+/);
  const englishParts: string[] = [];
  for (const part of parts) {
    const trimmed: string = part.trim();
    if (trimmed && trimmed !== '-' && trimmed !== '–' && trimmed !== '—') {
      const cleanedPart: string = trimmed
        .replace(/^[\s\-–—]+|[\s\-–—]+$/g, '')
        .trim();
      if (cleanedPart) {
        englishParts.push(cleanedPart);
      }
    }
  }
  if (englishParts.length === 0) {
    return '';
  }
  return englishParts.join(' ');
}

export function formatMixedHebrewEnglish(text: string): string {
  if (!text || !text.trim()) {
    return '';
  }
  const trimmedText: string = text.trim();
  const hasHebrew: boolean = containsHebrew(trimmedText);
  const englishMatches: string[] | null =
    trimmedText.match(/[A-Za-z0-9\s\-'&.]+/g);
  const hasEnglish: boolean =
    englishMatches !== null && englishMatches.length > 0;
  if (!hasHebrew && !hasEnglish) {
    return '';
  }
  if (!hasHebrew && hasEnglish) {
    return englishMatches!.join(' ').replace(/\s+/g, ' ').trim();
  }
  if (hasHebrew && !hasEnglish) {
    return reverseHebrewWords(trimmedText);
  }
  const hebrewParts: string[] = [];
  const englishParts: string[] = [];
  const hebrewMatches: RegExpMatchArray | null = trimmedText.match(
    /[\u0590-\u05FF\uFB1D-\uFB4F]+(?:\s+[\u0590-\u05FF\uFB1D-\uFB4F]+)*/g
  );
  if (hebrewMatches) {
    for (const match of hebrewMatches) {
      hebrewParts.push(match.trim());
    }
  }
  if (englishMatches) {
    for (const match of englishMatches) {
      englishParts.push(match.trim());
    }
  }
  const hebrewText: string = hebrewParts.join(' ').trim();
  const englishText: string = englishParts.join(' ').trim();
  const reversedHebrew: string = reverseHebrewWords(hebrewText);
  return `${reversedHebrew} - ${englishText}`.trim();
}
