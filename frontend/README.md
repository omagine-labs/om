# CHIP Communication Coach Frontend

A modern React/Next.js frontend for the CHIP Communication Coach MVP. This application allows users to upload meeting recordings and get AI-powered analysis including transcripts, summaries, action items, and communication metrics.

## Features

- **File Upload**: Drag & drop interface for uploading video/audio files
- **Sample Recording**: Built-in sample recording for testing
- **Real-time Processing**: Live status updates during AI processing
- **Intelligence Viewer**: Tabbed interface showing:
  - Meeting summaries
  - Full transcripts with download capability
  - Action items with priorities
  - Communication metrics (talk time, response delays, company values)
  - Topics and sentiment analysis
- **Backend Integration**: Full API integration with your backend service
- **Responsive Design**: Works on desktop, tablet, and mobile

## Tech Stack

- **Next.js 15** with App Router
- **React 18** with TypeScript
- **Tailwind CSS** for styling
- **Lucide React** for icons
- **Axios** for API requests
- **React Dropzone** for file uploads

## Prerequisites

- Node.js 18+
- Your backend service running (typically on port 8000)

## Getting Started

### 1. Install Dependencies

```bash
npm install
```

### 2. Environment Setup

Copy the environment example file:

```bash
cp .env.example .env.local
```

Edit `.env.local` to match your backend URL:

```bash
# Backend API Configuration
NEXT_PUBLIC_BACKEND_URL=http://localhost:8000
```

### 3. Run Development Server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) to view the application.

## Project Structure

```
frontend/
├── app/
│   ├── page.tsx           # Main dashboard page
│   ├── layout.tsx         # Root layout
│   └── globals.css        # Global styles
├── components/
│   ├── FileUpload.tsx     # Upload interface
│   ├── RecordingsList.tsx # Recordings dashboard
│   └── IntelligenceViewer.tsx # AI results viewer
├── lib/
│   ├── types.ts          # TypeScript interfaces
│   └── api-client.ts     # Backend API client
└── public/               # Static assets
```

## API Integration

The frontend connects to your backend through the `MeetingAssistantAPI` class which handles:

- File uploads with progress tracking
- Recording status polling
- Intelligence data fetching
- Sample recording processing
- Health checks

### Expected Backend Endpoints

- `POST /api/upload` - File upload
- `POST /api/process-sample` - Process sample recording
- `GET /api/recordings` - List all recordings
- `GET /api/recordings/{id}/status` - Check processing status
- `GET /api/intelligence/{id}` - Get analysis results
- `GET /api/recordings/{id}/file/{filename}` - Stream media files
- `GET /health` - Backend health check

## Usage

### Uploading Files

1. **Drag & Drop**: Drop video/audio files directly onto the upload area
2. **File Picker**: Click the upload area to browse and select files
3. **Sample Recording**: Use the "Analyze Sample" button to process the included demo recording

### Viewing Results

1. Wait for processing to complete (typically 2-5 minutes)
2. Click on a completed recording to expand it
3. View the media player and tabbed intelligence results
4. Copy transcripts, download files, or review metrics

### Supported File Types

- **Video**: MP4, WebM, MOV, AVI
- **Audio**: MP3, WAV, M4A, AAC
- **Size Limit**: 200MB per file

## Development

### Build for Production

```bash
npm run build
npm start
```

### Linting

```bash
npm run lint
```

## Troubleshooting

### Backend Connection Issues

- Check that your backend is running on the correct port
- Verify the `NEXT_PUBLIC_BACKEND_URL` in `.env.local`
- Look for CORS issues in browser console

### Upload Failures

- Ensure file size is under 200MB
- Check file format is supported
- Verify backend upload endpoint is working

### Processing Stuck

- Check backend logs for processing errors
- Ensure your backend has proper AI service credentials
- Try with smaller files first

## Environment Variables

| Variable                  | Description          | Default                 |
| ------------------------- | -------------------- | ----------------------- |
| `NEXT_PUBLIC_BACKEND_URL` | Backend API base URL | `http://localhost:8000` |

## Contributing

This frontend is designed to work with any backend that implements the expected API contract. Adjust the `MeetingAssistantAPI` class in `lib/api-client.ts` to match your specific backend implementation.
