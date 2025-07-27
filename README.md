# AI Comic Generator

A two-part web application that generates AI-powered comics with user feedback to steer future content generation.

## Architecture

- **Frontend**: Static files hosted on GitHub Pages
- **Backend**: Vercel Functions with Redis storage
- **AI**: OpenAI GPT-3.5 for comic generation
- **Feedback**: Emoji-based reactions that train the AI

## Features

- 🎨 AI-generated 3-panel comic strips
- 😊 8 different emoji feedback options
- 📊 Feedback statistics and analytics
- 🧠 AI learns from user preferences
- 📱 Responsive design for all devices
- ⚡ Fast Redis-based storage
- 🔄 Comic history navigation

## Setup Instructions

### Prerequisites

- Node.js 16+ installed
- Vercel account
- Vercel KV (Redis) database
- OpenAI API key
- GitHub account for hosting

### Backend Setup (Vercel)

1. **Install Vercel CLI**:
   ```bash
   npm install -g vercel
   ```

2. **Navigate to backend directory**:
   ```bash
   cd backend
   npm install
   ```

3. **Create a Vercel project**:
   ```bash
   vercel
   ```

4. **Set up environment variables in Vercel dashboard**:
   - `OPENAI_API_KEY`: Your OpenAI API key
   - `KV_URL`: Your Vercel KV database URL
   - `KV_REST_API_URL`: Your Vercel KV REST API URL
   - `KV_REST_API_TOKEN`: Your Vercel KV REST API token
   - `KV_REST_API_READ_ONLY_TOKEN`: Your Vercel KV read-only token

5. **Deploy to Vercel**:
   ```bash
   vercel --prod
   ```

6. **Note your deployment URL** (e.g., `https://your-app.vercel.app`)

### Frontend Setup (GitHub Pages)

1. **Update the API URL** in `frontend/js/config.js`:
   ```javascript
   API_BASE_URL: window.location.hostname === 'localhost' 
       ? 'http://localhost:3000' 
       : 'https://your-app.vercel.app',  // <- Update this
   ```

2. **Create a GitHub repository** for your frontend

3. **Push frontend files to GitHub**:
   ```bash
   cd frontend
   git init
   git add .
   git commit -m "Initial commit"
   git remote add origin https://github.com/YOUR_USERNAME/YOUR_REPO.git
   git push -u origin main
   ```

4. **Enable GitHub Pages**:
   - Go to Settings → Pages
   - Source: Deploy from a branch
   - Branch: main
   - Folder: / (root)
   - Save

5. **Your app will be available at**: `https://YOUR_USERNAME.github.io/YOUR_REPO/`

### Local Development

1. **Run the backend locally**:
   ```bash
   cd backend
   vercel dev
   ```

2. **Open the frontend**:
   ```bash
   cd frontend
   # Open index.html in your browser
   # On macOS: open index.html
   # On Linux: xdg-open index.html
   # On Windows: start index.html
   ```

## Project Structure

```
nrrds/
├── frontend/               # GitHub Pages static files
│   ├── index.html         # Main app page
│   ├── css/
│   │   └── styles.css     # App styles
│   └── js/
│       ├── config.js      # Configuration
│       ├── api.js         # API client
│       ├── comic-renderer.js  # Comic rendering
│       ├── feedback.js    # Feedback system
│       └── app.js         # Main app logic
│
├── backend/               # Vercel Functions
│   ├── api/
│   │   ├── generate-comic.js   # Comic generation
│   │   ├── submit-feedback.js  # Feedback submission
│   │   ├── get-feedback.js     # Get feedback stats
│   │   └── get-comic.js        # Get specific comic
│   ├── package.json
│   └── vercel.json
│
└── generated/             # Original inspiration files
```

## API Endpoints

- `POST /api/generate-comic` - Generate a new comic
- `POST /api/submit-feedback` - Submit user feedback
- `GET /api/get-feedback?comicId=X` - Get feedback statistics
- `GET /api/get-comic?id=X` - Get a specific comic

## Feedback System

Users can react with 8 different emojis:
- 😍 Love it! (weight: +2)
- 😂 Funny (weight: +1.5)
- 🤓 Clever (weight: +1.5)
- ✨ Inspiring (weight: +1.5)
- 😕 Confused (weight: -1)
- 😴 Boring (weight: -1.5)
- 😠 Offensive (weight: -2)
- 😐 Meh (weight: 0)

These weights influence future comic generation to match user preferences.

## Redis Data Structure

```
comic:{id}                    # Comic data
comic:{id}:stats             # Feedback statistics
comic:{id}:feedback          # Feedback IDs list
user:{id}:preferences        # User preference weights
user:{id}:comics            # User's comic history
feedback:{id}               # Individual feedback data
comics:popular              # Sorted set of popular comics
analytics:*                 # Various analytics data
```

## Customization

### Adding New Feedback Types

1. Update `CONFIG.FEEDBACK_TYPES` in `frontend/js/config.js`
2. Add emoji button in `frontend/index.html`
3. Update validation in `backend/api/submit-feedback.js`

### Modifying Comic Generation

Edit the prompt in `backend/api/generate-comic.js` to change:
- Number of panels
- Comic themes
- Art style descriptions
- Character types

### Styling

All styles are in `frontend/css/styles.css`. The app uses CSS variables for easy theming:
- `--primary-color`: Main accent color
- `--secondary-color`: Secondary accent
- `--accent-color`: Highlight color
- `--border-color`: Border color

## Troubleshooting

### Comics not generating
- Check OpenAI API key is set correctly
- Verify Vercel KV is connected
- Check browser console for errors

### Feedback not saving
- Ensure CORS is properly configured
- Check Vercel KV connection
- Verify API endpoints are accessible

### Local development issues
- Make sure `vercel dev` is running for backend
- Update `API_BASE_URL` in config.js
- Check for port conflicts (default: 3000)

## License

MIT License - feel free to use this project as a template for your own comic generator!

## Credits

Built with:
- OpenAI GPT-3.5
- Vercel Functions & KV
- Pure JavaScript (no frameworks)
- Comic Sans MS (of course!)
