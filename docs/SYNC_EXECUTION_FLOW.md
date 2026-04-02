# LinkedIn Sync Execution Flow

## Current Implementation Flow

```
1. Start LinkedIn Sync
   ↓
2. Extract LinkedIn connections from ZIP
   ├─ Read ZIP file
   ├─ Find Connections.csv
   ├─ Parse CSV
   └─ Extract ALL connections (e.g., 8 connections)
   ↓
3. Apply TEST LIMIT (slice to first 5)
   └─ connectionsToProcess = connections.slice(0, 5)
   ↓
4. Fetch Google Contacts
   ├─ Start fetch phase (spinner)
   ├─ Call duplicateDetector.fetchAllContacts()
   ├─ Update progress (fetched X contacts)
   └─ Complete fetch (✅ Fetched X contacts)
   ↓
5. Initialize Contact Syncer
   └─ Load contact groups
   ↓
6. Start Processing Phase
   ↓
7. Process each connection (ONE BY ONE)
   FOR EACH connection in connectionsToProcess (5 connections):
     ├─ Get company label
     ├─ Match against Google contacts
     ├─ If NO MATCH → Add new contact
     ├─ If MATCH → Update existing contact
     ├─ If UNCERTAIN → Log for clarification
     └─ Update status (new/updated/error counts)
   ↓
8. Complete & Show Summary
```

## Verification

### ✅ Step a: Read 5 lines (temp logic)
- Line 44: `const connections = await this.extractor.extract()` → Reads ALL connections
- Line 49: `const connectionsToProcess = connections.slice(0, 5)` → Limits to 5

### ✅ Step b: Fetch Google contacts
- Line 54-65: Fetch all Google contacts
- This happens AFTER limiting LinkedIn connections to 5
- All Google contacts are loaded into memory/cache for matching

### ✅ Step c: Sync one by one
- Line 86: `for (const connection of connectionsToProcess)`
- Processes each of the 5 connections sequentially
- Each connection is matched, then added/updated

## Flow Summary

**Input:** 8 LinkedIn connections in CSV  
**Step 1:** Extract all 8 connections  
**Step 2:** Limit to first 5 (TEST MODE)  
**Step 3:** Fetch all Google contacts (e.g., 823 contacts)  
**Step 4:** Process 5 LinkedIn connections one by one  
**Output:** 5 contacts synced (new/updated/clarification needed)

---

## Note
The TODO comment on line 47-48 reminds to remove the `.slice(0, 5)` limit after testing is complete.
