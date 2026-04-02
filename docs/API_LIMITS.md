# Google People API Limitations

This document outlines the rate limits and quotas for the Google People API that affect this application.

## Rate Limits (Per Minute Per User)

| Quota Type | Default Limit | Current Project Limit |
|------------|---------------|----------------------|
| **Critical read requests (Contact and Profile Reads)** | 60 per minute | 60 per minute |
| **Critical write requests (Contact Creates and Updates)** | 30 per minute | 30 per minute |
| **Photo write requests (Photo Updates)** | 50 per minute | 50 per minute |
| **Read requests (Contact Group Reads)** | 90 per minute | 90 per minute |
| **Write requests (Contact Deletes and Contact Group Writes)** | 30 per minute | 30 per minute |

## Daily Limits

| Quota Type | Limit |
|------------|-------|
| **Daily Contact Writes (Total)** | 100,000 per day per user |

## Important Notes

### Hidden Quota Consumption
- **Batch operations consume 6x quota units**: Each `batchCreateContacts` or `batchUpdateContacts` call consumes 6 "Critical Read Request" quota units, not just 1.
- **Write operations consume read quota**: Creating and updating contacts also consumes from the "Critical read requests" quota pool.
- **Duplicate checking**: Each connection processed requires multiple read operations for duplicate detection.

### Quota Reset
- **Per-minute quotas reset every 60 seconds**
- Wait at least 1 full minute between sync runs if you hit rate limits

### Contact Limits
- **Maximum contacts per user**: 25,000 contacts (including trash)
- This is a Gmail system limit, not a People API-specific limit

### Sync Tokens
- **Sync tokens expire after 7 days**
- Used for incremental synchronization

### Batch Requests
- **Maximum batch size**: 1,000 calls per batch request
- Mutate requests for the same user should be sent sequentially

### Response Pagination
- **Default page size**: 100 contacts per request
- Use `pageToken` to retrieve additional pages

## Current Application Settings

To stay within these limits, the application uses the following settings:

| Setting | Value | Reason |
|---------|-------|--------|
| `writeDelayMs` | 3000ms (3 seconds) | Limits to ~20 connections/minute, staying under the 60 read requests/minute limit |
| `testConnectionLimit` | 50 connections | Safe batch size for testing, completes in ~2.5 minutes |

### Calculation
- Each connection requires approximately 3-4 API calls (reads for duplicate checking + 1 write)
- With 3-second delay: 20 connections/minute × 3-4 calls = 60-80 requests/minute
- This approaches but stays near the 60/minute read limit

## Requesting Quota Increases

You can request higher quotas through the Google Cloud Console:

1. Go to [Google Cloud Console → IAM & Admin → Quotas](https://console.cloud.google.com/iam-admin/quotas)
2. Filter for "People API" or service "people.googleapis.com"
3. Select the quota you want to increase (e.g., "Critical read requests per minute per user")
4. Click "Edit Quotas" or "Edit"
5. Enter your desired new limit
6. Provide justification (e.g., "Syncing LinkedIn connections to Google Contacts - need to process user contacts efficiently")
7. Submit the request

**Note**: Quota increase requests are subject to review and approval is not guaranteed.

## Error Handling

When quota limits are exceeded, the API returns:
- **HTTP Status**: 429 (Too Many Requests) or 403 (Forbidden)
- **Error Message**: "Quota exceeded for quota metric 'Critical read requests (Contact and Profile Reads)' and limit 'Critical read requests (Contact and Profile Reads) per minute per user'"

### Recommended Response
Implement exponential backoff:
1. Wait 5 seconds and retry
2. If still failing, wait 10 seconds
3. If still failing, wait 20 seconds
4. Maximum retry attempts: 5-7 times

## References

- [Google People API Documentation](https://developers.google.com/people)
- [Google Cloud Quotas Documentation](https://docs.cloud.google.com/docs/quotas/view-manage)
- [Stack Overflow: People API Quota Limits](https://stackoverflow.com/questions/50700494/people-api-google-quota-limits)
- [Issue Tracker: Batch Operations Quota](https://stackoverflow.com/questions/67684411/why-and-how-is-the-quota-critial-read-requests-exceeded-when-using-batchcreate)

## Last Updated

2026-03-12
