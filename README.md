# Blasting World

Cartoon destruction over **Google Street View**, with optional **Kie AI damage plates** from Isaac'sFLIX.

## Play

```bash
# Terminal 1 — Isaac'sFLIX API (Kie)
cd "/home/isaac/Isaac Projects/AI Social Media Gen Content/backend"
source .venv/bin/activate
uvicorn app.main:app --host 127.0.0.1 --port 8101

# Terminal 2 — game
cd "/home/isaac/Isaac Projects/BlastingWorld"
npm install
cp .env.example .env   # optional Maps key
npm run dev
```

Open http://127.0.0.1:5173/

1. Pick **Great Neck · 566 Middle Neck Rd** (or paste a Maps URL)
2. Optional: **AI Damage This Place (Kie)** — waits ~30–60s, shows fictional VFX plate
3. **Blast This View** — play cartoon props over the street / AI plate

## Kie link

Game proxies `/kie-api` → `http://127.0.0.1:8101` (Isaac'sFLIX).

New API routes in that project:
- `POST /api/media/blast-damage` — fictional damaged storefront
- `POST /api/media/image-edit` — Flux Kontext edit with `input_image`

## Fiction notice

All destruction is fictional VFX. Nothing happens to real shops or people.
