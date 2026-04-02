# Google Cloud Console Setup Guide

Before running the POC, you need to configure the OAuth redirect URI in Google Cloud Console.

## Steps to Configure Redirect URI

1. **Navigate to Google Cloud Console**
   - Go to https://console.cloud.google.com/

2. **Select Your Project**
   - Click on the project dropdown at the top
   - Select project: `decisive-fabric-489614-k6`

3. **Navigate to Credentials**
   - In the left sidebar, click **APIs & Services**
   - Click **Credentials**

4. **Edit OAuth 2.0 Client**
   - Find your OAuth 2.0 Client ID: `YOUR_CLIENT_ID.apps.googleusercontent.com`
   - Click the pencil icon (✏️) to edit

5. **Add Redirect URI**
   - Scroll down to **Authorized redirect URIs**
   - Click **+ ADD URI**
   - Enter: `http://localhost:3000`
   - Click **SAVE** at the bottom

## Verify Configuration

After saving, your OAuth client should have:

- **Client ID**: `YOUR_CLIENT_ID.apps.googleusercontent.com`
- **Client Secret**: `YOUR_CLIENT_SECRET`
- **Authorized redirect URIs**: `http://localhost:3000`

## You're Ready!

Now you can run the POC:

```bash
cd poc
pnpm start
```

The authentication will happen automatically in your browser!
