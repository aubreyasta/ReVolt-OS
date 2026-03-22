# ReVolt OS

**Mission:** A Circular Economy OS for SMEs that turns hazardous, "unknown" used batteries into certified, high-value energy assets.

Built for the Moonshot Hackathon 2026 using Gemini, MongoDB Atlas, and ElevenLabs.

## Quick Start (GitHub Codespaces)

```bash
pip install -r requirements.txt
cp .env.example .env
# Edit .env with your MongoDB connection string
python 01_schema_and_seed.py
python 02_vector_search_setup.py
python 03_api_endpoints.py
```

## Project Structure

```
├── 01_schema_and_seed.py      # Battery Digital Twin schema + 5 sample batteries
├── 02_vector_search_setup.py  # Atlas Vector Search index + demo query
├── 03_api_endpoints.py        # Flask API (11 endpoints)
├── requirements.txt           # Python dependencies
├── .env.example               # Environment variable template
└── .gitignore
```

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/health` | Health check |
| GET | `/api/batteries` | List all batteries |
| GET | `/api/batteries/<id>` | Get battery details |
| GET | `/api/batteries/<id>/passport` | Get Battery Passport |
| POST | `/api/batteries` | Create/update battery |
| POST | `/api/batteries/search` | Vector similarity search |
| POST | `/api/batteries/identify` | Mystery battery ID from voltage readings |
| GET | `/api/batteries/<id>/safety` | Get safety workflow state |
| PATCH | `/api/batteries/<id>/safety` | Advance/log safety step |
| PATCH | `/api/batteries/<id>/status` | Update marketplace status |

## Tech Stack

- **Gemini 1.5 Pro** — Multimodal battery auditor
- **MongoDB Atlas** — Digital Twin store + Vector Search
- **ElevenLabs** — Voice-guided Safety Agent
- **Flask** — REST API
- **React** — Frontend (Sprint 4)