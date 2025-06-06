# Create Shorts & Post to Socials

A local web app that lets you select videos from Google Drive or Dropbox, process them through Mosaic AI to create engaging short-form content, and post directly to Twitter/X.

## Features

- 🎥 Select videos from Google Drive (public files) or Dropbox (any files)
- 🤖 AI-powered video processing with Mosaic (adds captions, music, creates shorts)
- 👀 Preview processed videos before posting
- 🐦 Direct posting to Twitter/X via Upload-Post API
- 🌙 Beautiful dark mode UI with shadcn/ui

## Prerequisites

You'll need API keys/credentials for:

1. **Mosaic API** - Get from [Mosaic Dashboard](https://app.usemosaic.ai)
2. **Dropbox Access Token** - Generate in [Dropbox App Console](https://www.dropbox.com/developers/apps)

## Setup

1. Install dependencies:
```bash
pnpm install
```

2. Create a `.env.local` file with your credentials:
```env
# Mosaic API
VITE_MOSAIC_API_KEY=mk_live_xxxxxxxxx
VITE_MOSAIC_API_BASE=https://api.usemosaic.ai/api

# Dropbox Access Token
VITE_DROPBOX_ACCESS_TOKEN=your-dropbox-access-token
```

3. Run the development server:
```bash
pnpm dev
```

## Configuration Details

### Dropbox Setup

1. Go to [Dropbox App Console](https://www.dropbox.com/developers/apps)
2. Create a new app or use existing
3. Choose "Scoped access" and permissions you need
4. Generate an access token (in the app settings page)
5. Copy the access token to your `.env.local`

## Usage

1. **Select a Video**: 
   - **Dropbox**: Shows all video files in your Dropbox using the access token
2. **Process Video**: Click "Process Video" to send it to Mosaic AI
3. **Add Caption**: Once processed, preview the video and add a caption

## Tech Stack

- React + TypeScript
- Vite
- Tailwind CSS + shadcn/ui
- Axios for API calls
- Dropbox API (REST)
- Mosaic AI API
