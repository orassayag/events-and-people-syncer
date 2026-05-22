Delete Empty Contacts

1. We will add a new script to run "Sync Phones" script (☎️ Sync Phones - Add multiple phones to an existing Google contact by ID).
2. The name will be "Delete Empty Contacts - 🗑️ Delete all empty contacts from Google Contacts."
3. Logic:
   a. Like in the "SCAN_REPOS_REPORT.txt" report logic - We will fetch all the labels and all the contacts.
   b. Once all the contacts fetched we will filter out the contacts upon the following criteria: 1. The contact must have 1 label of the following: "Imported on 6/27", "Imported on 6/27 1", "Imported on 7/20" (If have more than one label skip it). 2. The contact must not have any email addresses. 3. The contact must not have any phone numbers. 4. The contact notes must start with the word "Position:".
   c. Once we filtered out all these contacts, we will loop them one by one, and do the following logic for each:
   1. Write to a log file in the logs folder: logs/delete_empty_contacts.txt, for example:
      Id: https://contacts.google.com/person/c8199502555158149969
      Name: John Doe
      Label: Imported on 6/27
      Emails: none
      Phones: none
      Notes: Position: Software Engineer
   2. Delete the contact from Google Contacts.
   3. We will add sleep of 1 second after each delete.
4. Make sure we are supporting the "dry mode" like all other scripts, so i can first test it and verify it and then run it on the contacts on production.
