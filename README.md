# NRRDS

AI-powered comic generator that creates personalized humor based on user feedback.

## Overview

NRRDS generates multi-panel comic strips using OpenAI's GPT models. The system learns from user reactions to improve future comic generation, creating more personalized and engaging content over time.

## Architecture

- **Frontend**: Vanilla JavaScript with modular ES6+ structure
- **Backend**: Vercel serverless functions
- **AI**: OpenAI GPT-4o for comic creation
- **Storage**: Upstash Redis for comics and feedback data
- **Deployment**: Vercel platform

## Key Features

- Real-time comic generation with AI
- User feedback system with emoji reactions
- Adaptive content based on community preferences
- Token-based learning system for content optimization
- Comic history and sharing capabilities
- Multi-character support with enhanced rendering

## Technology Stack

- JavaScript (ES6+ modules)
- Vercel serverless functions
- OpenAI API (GPT-4o)
- Upstash Redis
- Vite for development