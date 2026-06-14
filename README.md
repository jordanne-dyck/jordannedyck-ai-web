# jordannedyck-ai-web

Interactive AI resume website — a conversational chat interface where visitors can ask questions about my professional experience and get grounded, context-aware responses powered by GPT-4o and a RAG knowledge base.

## How It Works

The frontend sends user messages to a Next.js API route, which:
1. Searches the [jordannedyck-ai](https://github.com/jordanne-dyck/jordannedyck-ai) backend for relevant knowledge base context
2. Injects the results into a system prompt with role-specific guidance
3. Streams a GPT-4o response back to the chat interface

## Features

- **Streaming chat** with markdown-rendered AI responses
- **RAG-grounded answers** — responses are backed by a searchable knowledge base, not hallucinated
- **Suggested prompts** that rotate as they're used
- **SEO-optimized** with Open Graph tags, JSON-LD structured data, and sitemap
- **Responsive design** with a clean, minimal aesthetic

## Tech Stack

- **Next.js 16** (App Router) / **React 19** / **TypeScript**
- **Tailwind CSS v4**
- **Vercel AI SDK** + **OpenAI API** (GPT-4o, streaming)
- **react-markdown** for response rendering

## Setup

```bash
npm install

# Set up environment variables
cp .env.example .env.local
# Add your OPENAI_API_KEY to .env.local

# Start the backend API first (see jordannedyck-ai repo)
# Then start the frontend
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) to view the site.

> **Note:** The chat requires the [jordannedyck-ai](https://github.com/jordanne-dyck/jordannedyck-ai) backend running on `localhost:5000` to serve knowledge base search results.

## Project Structure

```
app/
├── page.tsx              # Chat interface and UI
├── layout.tsx            # Root layout, metadata, SEO
├── globals.css           # Tailwind theme and custom styles
└── api/chat/route.ts     # Chat API endpoint (GPT-4o + RAG)
public/
└── ...                   # Static assets, favicon, sitemap
```

## Related

- [jordannedyck-ai](https://github.com/jordanne-dyck/jordannedyck-ai) — The RAG backend that powers the knowledge base search
