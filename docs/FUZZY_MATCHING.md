# Fuzzy Name Matching Documentation

## Overview

The LinkedIn sync system uses fuzzy name matching to identify existing contacts in Google Contacts before creating or updating them. This document explains how the fuzzy matching algorithm works, what the scores mean, and how each score range is handled.

## Matching Algorithm

The system uses [Fuse.js](https://fusejs.io/) for fuzzy string matching with the following configuration:

```typescript
const fuse = new Fuse(contacts, {
  keys: ['fullName'],           // Search against "FirstName LastName"
  threshold: 0.2,               // Maximum acceptable score (0.0 = perfect, 1.0 = no match)
  ignoreLocation: true,         // Match anywhere in the string
  includeScore: true,           // Return similarity scores
});
```

## Matching Priority Order

The system tries to match connections in the following order (first match wins):

1. **LinkedIn URL** (exact match) - Highest confidence
2. **Email Address** (exact match) - High confidence  
3. **Full Name** (fuzzy match) - Medium to low confidence, score-dependent

## Fuzzy Score Explained

The fuzzy score is a number between **0.0** and **1.0** that indicates how closely two names match:

- **0.0** = Perfect match (identical)
- **0.1** = Excellent match (minor typo or formatting difference)
- **0.2** = Good match (acceptable threshold)
- **0.4** = Questionable match (needs review)
- **0.6+** = Poor match (likely different people)
- **1.0** = No match at all

### How Fuse.js Calculates the Score

Fuse.js uses the [Levenshtein distance algorithm](https://en.wikipedia.org/wiki/Levenshtein_distance) which counts the minimum number of single-character edits (insertions, deletions, or substitutions) needed to transform one string into another, normalized to a 0-1 scale.

**Formula (simplified):**
```
score = (number of character differences) / (length of longer string)
```

## Score Thresholds and Handling

The system uses two configurable thresholds to determine how to handle fuzzy matches:

### Configuration
```typescript
FUZZY_ACCEPT_THRESHOLD = 0.2   // Auto-accept matches with score ≤ 0.2
FUZZY_WARNING_THRESHOLD = 0.4  // Flag for review matches with score ≤ 0.4
```

### Match Type Decision Tree

```
┌─────────────────────────────────────────┐
│ Start: Check for existing contact      │
└─────────────┬───────────────────────────┘
              │
              ▼
┌─────────────────────────────────────────┐
│ 1. LinkedIn URL Match?                  │
├─────────────────────────────────────────┤
│ YES (1 match) → EXACT                   │◄─── Update contact
│ YES (2+ matches) → UNCERTAIN            │◄─── Log warning
│ NO → Continue to step 2                 │
└─────────────┬───────────────────────────┘
              │
              ▼
┌─────────────────────────────────────────┐
│ 2. Email Match?                         │
├─────────────────────────────────────────┤
│ YES (1 match) → EXACT                   │◄─── Update contact
│ YES (2+ matches) → UNCERTAIN            │◄─── Log warning
│ NO → Continue to step 3                 │
└─────────────┬───────────────────────────┘
              │
              ▼
┌─────────────────────────────────────────┐
│ 3. Fuzzy Name Match (Fuse.js)          │
├─────────────────────────────────────────┤
│ • No matches → NONE                     │◄─── Create new contact
│ • 2+ matches → UNCERTAIN                │◄─── Log warning
│ • 1 match → Check score...              │
└─────────────┬───────────────────────────┘
              │
              ▼
┌─────────────────────────────────────────┐
│ 4. Evaluate Single Name Match Score    │
├─────────────────────────────────────────┤
│ score ≤ 0.2 → FUZZY (accept)           │◄─── Update contact
│ 0.2 < score ≤ 0.4 → UNCERTAIN (warn)   │◄─── Log warning
│ score > 0.4 → NONE (reject)            │◄─── Create new contact
└─────────────────────────────────────────┘
```

## Match Types and Actions

### 1. EXACT Match
**Trigger:** LinkedIn URL or Email matches exactly (single match)  
**Action:** Update the existing contact  
**Confidence:** Very High (99%+)

```typescript
// Example
LinkedIn: "linkedin.com/in/john-doe" → Found 1 contact with same URL
Action: Update that contact
```

### 2. FUZZY Match
**Trigger:** Name fuzzy score ≤ 0.2 (single match)  
**Action:** Update the existing contact  
**Confidence:** High (~90-95%)

```typescript
// Examples of score ≤ 0.2
Search: "John Smith"
Match:  "John Smith"      → score: 0.00 (perfect)
Match:  "John Smyth"      → score: ~0.09 (typo)
Match:  "Jon Smith"       → score: ~0.10 (nickname)
Match:  "John A Smith"    → score: ~0.15 (middle initial)
```

### 3. UNCERTAIN Match
**Trigger:**
- Multiple matches found (2+ contacts), OR
- Name fuzzy score between 0.2 and 0.4 (single match)

**Action:** 
- Increment warning counter
- Log to warning log file
- **Skip updating** (contact remains unchanged)

**Confidence:** Low (~50-70%)

**Requires Manual Review**

```typescript
// Example 1: Multiple matches
LinkedIn: "linkedin.com/in/john-smith"
Found: 2 contacts with same URL → UNCERTAIN (ambiguous)

// Example 2: Questionable name match
Search: "Michael Johnson"
Match:  "Michal Jonson"   → score: ~0.25 (multiple typos)
Match:  "Michael Jonsson"  → score: ~0.35 (spelling variant)
```

### 4. NONE Match
**Trigger:**
- No matches found, OR
- Name fuzzy score > 0.4 (too dissimilar)

**Action:** Create a new contact  
**Confidence:** High that this is a new person

```typescript
// Example 1: No matches
Search: "Jane Doe"
Found: No contacts → Create new

// Example 2: Poor name match (rejected)
Search: "Robert Williams"
Match:  "Richard Williamson" → score: ~0.55 (too different)
Action: Treat as NONE, create new contact
```

## Real-World Examples

### Example 1: Perfect Match via LinkedIn URL
```
LinkedIn Connection: John Doe (linkedin.com/in/john-doe)
Google Contact: John Doe (linkedin.com/in/john-doe)
→ EXACT match
→ Update existing contact
```

### Example 2: Good Fuzzy Match
```
LinkedIn Connection: Michael O'Brien
Google Contact: Micheal OBrien (score: 0.18)
→ FUZZY match (score ≤ 0.2)
→ Update existing contact
```

### Example 3: Uncertain Match Requiring Review
```
LinkedIn Connection: Mike Johnson
Google Contacts:
  - Michael Johnson (score: 0.22)
  - Mikel Johanson (score: 0.30)
→ UNCERTAIN (2 matches)
→ Warning logged, no update, manual review needed
```

### Example 4: Borderline Match Flagged
```
LinkedIn Connection: Catherine Smith
Google Contact: Cathrine Smyth (score: 0.35)
→ UNCERTAIN (0.2 < score ≤ 0.4)
→ Warning logged, no update, manual review needed
```

### Example 5: Poor Match Rejected
```
LinkedIn Connection: Alexander Peterson
Google Contact: Alexandra Petersen (score: 0.50)
→ NONE (score > 0.4)
→ Create new contact
```

## Common Score Ranges

| Score Range | Interpretation | Typical Causes | Action |
|-------------|----------------|----------------|--------|
| 0.00 - 0.05 | Identical or near-identical | Same name, case differences | Auto-update (FUZZY) |
| 0.06 - 0.15 | Very similar | Minor typo, nickname (Jon/John) | Auto-update (FUZZY) |
| 0.16 - 0.20 | Similar | Middle initial, hyphenation | Auto-update (FUZZY) |
| 0.21 - 0.30 | Moderately similar | Multiple typos, name variant | Flag for review (UNCERTAIN) |
| 0.31 - 0.40 | Questionable | Different spelling, similar sound | Flag for review (UNCERTAIN) |
| 0.41 - 0.60 | Dissimilar | Different names, wrong person | Create new (NONE) |
| 0.61 - 1.00 | Very dissimilar | Completely different | Create new (NONE) |

## Factors Affecting Fuzzy Scores

### Increases Score (Worse Match)
- Extra characters: "John" vs "Johnny" (+2 chars, ~15% worse)
- Different characters: "Smith" vs "Smyth" (1 char different, ~20% worse)
- Length difference: "Li" vs "Williams" (large difference, ~70% worse)
- Word order: "Doe John" vs "John Doe" (many edits needed)

### Minimizes Score (Better Match)
- Identical strings: "John Smith" vs "John Smith" (0.00)
- Case only: "john smith" vs "John Smith" (ignored by Fuse.js)
- Whitespace variations: "John  Smith" vs "John Smith" (minimal impact)

## Configuration Recommendations

### Conservative (Reduce False Positives)
```typescript
FUZZY_ACCEPT_THRESHOLD = 0.15   // Only accept very close matches
FUZZY_WARNING_THRESHOLD = 0.35  // Wider review range
```

### Aggressive (Reduce Manual Review)
```typescript
FUZZY_ACCEPT_THRESHOLD = 0.25   // Accept more variations
FUZZY_WARNING_THRESHOLD = 0.45  // Narrower review range
```

### Current (Balanced)
```typescript
FUZZY_ACCEPT_THRESHOLD = 0.2    // Good balance
FUZZY_WARNING_THRESHOLD = 0.4   // Reasonable review threshold
```

## Monitoring and Tuning

### Check Warning Log
Review the warning log file to see contacts that need manual review:

```bash
cat logs/linkedin-sync/[timestamp]-warnings.log
```

### Analyze Patterns
- **Many UNCERTAIN matches?** → Consider lowering `FUZZY_ACCEPT_THRESHOLD`
- **Wrong contacts being updated?** → Raise `FUZZY_ACCEPT_THRESHOLD` (more strict)
- **Too many warnings?** → Adjust `FUZZY_WARNING_THRESHOLD`

## Code References

### Configuration Files
- **Thresholds**: `src/services/linkedin/connectionMatcher.ts` (lines 8-9)
- **Fuse.js Setup**: `src/services/contacts/duplicateDetector.ts` (line 24, 38-43)

### Key Functions
- **Name Matching**: `DuplicateDetector.checkDuplicateName()` (duplicateDetector.ts:28)
- **Match Evaluation**: `ConnectionMatcher.matchByName()` (connectionMatcher.ts:57)
- **Overall Flow**: `ConnectionMatcher.match()` (connectionMatcher.ts:13)

## Troubleshooting

### Problem: Too many false positives (wrong contacts updated)
**Solution:** Decrease `FUZZY_ACCEPT_THRESHOLD` to 0.15 or lower

### Problem: Too many warnings to review
**Solution:** Increase `FUZZY_ACCEPT_THRESHOLD` to 0.25 or adjust `FUZZY_WARNING_THRESHOLD`

### Problem: Common names causing UNCERTAIN matches
**Solution:** Ensure LinkedIn URLs and emails are present in contacts for exact matching priority

### Problem: Cultural name variations (e.g., "Mohammed" vs "Muhammad")
**Solution:** These will likely score 0.20-0.30 and be flagged as UNCERTAIN for manual review

## Best Practices

1. **Prioritize exact matches**: Always add LinkedIn URLs and emails to contacts when possible
2. **Review warnings regularly**: Check the warning log after each sync
3. **Test threshold changes**: Use `testConnectionLimit` in settings to test on a small batch first
4. **Document exceptions**: Keep notes on recurring name variations in your contact base
5. **Cache invalidation**: The system clears contact cache after each sync to ensure fresh data

## Further Reading

- [Fuse.js Documentation](https://fusejs.io/)
- [Levenshtein Distance Algorithm](https://en.wikipedia.org/wiki/Levenshtein_distance)
- [Fuzzy String Matching Concepts](https://en.wikipedia.org/wiki/Approximate_string_matching)
