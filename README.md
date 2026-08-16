# 🤖 Full-Stack AI Assistant with Hybrid RAG & RBAC

An enterprise-grade, microservices-based Retrieval-Augmented Generation (RAG) platform. It allows users to upload PDF documents and ask questions grounded strictly in document context with hybrid vector search, role-based access control (RBAC), and session rate-limiting.

---

## 🏛️ System Architecture

```
                                    +------------------------------+
                                    |    Next.js Frontend (UI)     |
                                    |  (React 19, Tailwind CSS v4) |
                                    +--------------+---------------+
                                                   |
                                                   | HTTP / REST
                                                   v
                                    +------------------------------+
                                    |     NestJS Core Backend      |
                                    | (JWT Auth, RBAC, Rate Limit) |
                                    +-------+--------------+-------+
                                            |              |
                       +--------------------+              +--------------------+
                       |                                                        |
                       v                                                        v
             +-------------------+                                    +-------------------+
             |    PostgreSQL     |                                    |   Redis Server    |
             | Users, Auth, DB   |                                    | Guest Rate Limits |
             +-------------------+                                    +-------------------+
                                                   |
                                                   | HTTP Proxy / Streaming
                                                   v
                                    +------------------------------+
                                    |   FastAPI RAG Microservice   |
                                    |   (LangChain & Text Ingest)  |
                                    +-------+--------------+-------+
                                            |              |
                       +--------------------+              +--------------------+
                       |                                                        |
                       v                                                        v
             +-------------------+                                    +-------------------+
             |   Qdrant DB       |                                    | Local Ollama /    |
             | Dense + BM25 RRF  |                                    | Gemini LLM        |
             +-------------------+                                    +-------------------+
```

---

## ✨ Key Features

- **Hybrid Vector Retrieval (RRF):** Combines dense semantic embeddings with sparse BM25 lexical keyword matching inside **Qdrant** using Reciprocal Rank Fusion.
- **Smart Document Deduplication:** Computes **SHA-256 hashes** for uploaded PDFs to prevent redundant ingestion and vectorization.
- **Strict Context Grounding:** Custom prompt design preventing LLM hallucinations and providing source citations.
- **Role-Based Access Control (RBAC):** Distinct permissions and workflows for `Admin`, `User`, and `Guest` roles.
- **Atomic Rate Limiting:** Enforces guest request throttling (**2 questions / hour**) using **Redis** atomic increment (`INCR`) and TTL expiration.
- **Modern Responsive UI:** Clean chat interface, document management, authentication flow, and rate limit indicators built with **Next.js & Tailwind CSS**.

---

## 🛠️ Tech Stack

| Layer | Technologies |
| :--- | :--- |
| **Frontend** | Next.js 16 (App Router), React 19, Tailwind CSS v4, Lucide Icons, Axios |
| **Core Backend** | NestJS, TypeScript, TypeORM, Passport JWT, Redis (ioredis), Swagger |
| **RAG Microservice** | FastAPI, Python 3.11+, LangChain, FastEmbed (BM25) |
| **AI / LLM** | Ollama (Local) / Google Gemini API |
| **Databases & Cache** | PostgreSQL (Relational & Hashes), Qdrant (Vector DB), Redis (Session Cache) |
| **DevOps** | Docker, Docker Compose |

---

## 📂 Project Structure

```
ai-assistant/
├── frontend/                        # Next.js Web Application
│   ├── app/                         # App Router pages and layouts
│   ├── src/                         # Reusable UI components & API clients
│   └── package.json
├── backend/                         # NestJS Gateway & Orchestration Service
│   ├── src/
│   │   ├── auth/                    # JWT Authentication & Guest Tokens
│   │   ├── chat/                    # Proxy endpoints for RAG microservice
│   │   ├── common/guards/           # RBAC & Redis Guest Rate-Limiter Guards
│   │   └── users/                   # User entities and management
│   └── docker-compose.yml
└── microservices/
    └── rag-chatbot-microservice/    # FastAPI RAG Engine
        ├── app/
        │   ├── api/routes/          # Ingestion & Chat endpoints
        │   ├── ingest.py            # PDF parsing & SHA-256 deduplication
        │   └── vector_store.py      # Qdrant Dense + BM25 Hybrid setup
        └── Dockerfile
```

---

## 🚀 Getting Started

### Prerequisites
- Node.js 20+ & npm
- Python 3.11+
- Docker & Docker Compose
- Ollama (running locally) or a Google Gemini API Key

---

### 1. Start Infrastructure (Postgres, Qdrant, Redis)

Using Docker Compose:
```bash
# From the project root or backend directory
cd backend
docker-compose up -d
```

---

### 2. Run RAG Microservice (FastAPI)

```bash
cd microservices/rag-chatbot-microservice

# Setup virtual environment
python3 -m venv .venv
source .venv/bin/activate

# Install dependencies
pip install -r requirements.txt

# Configure environment
cp .env.example .env

# Start FastAPI server
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```

---

### 3. Run Backend (NestJS)

```bash
cd backend

# Install dependencies
npm install

# Configure environment
cp .env.example .env

# Run in development mode
npm run start:dev
```
Backend will be available at: `http://localhost:3000` (Swagger docs: `http://localhost:3000/api/docs`)

---

### 4. Run Frontend (Next.js)

```bash
cd frontend

# Install dependencies
npm install

# Start Next.js development server
npm run dev
```
Frontend will be available at: `http://localhost:3001`

---

## 🔒 Security & Rate Limiting

- **JWT Authentication:** Dual-token strategy with short-lived access tokens and secure refresh tokens.
- **Guest Throttling:** Guest sessions track interactions via `guest_rate:<user_id>` in Redis with 1-hour rolling TTL windows.
- **Response Headers:** Real-time quota visibility via `X-RateLimit-Limit` and `X-RateLimit-Remaining`.
