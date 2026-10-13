# Three-Tier Demo App (Learning Project)

A minimal but complete **3-tier architecture** you can run locally with Docker
Compose and deploy to Kubernetes (kind / minikube). Built for learning how the
tiers connect, how JWT auth works, and how to containerize + orchestrate each
service independently.

```
          ┌────────────┐      /api/*      ┌────────────┐      SQL      ┌────────────┐
Browser → │  Frontend  │ ───────────────→ │  Backend   │ ───────────→ │  Database  │
          │  (nginx)   │  reverse proxy   │ (Express)  │   (pg pool)  │ (Postgres) │
          └────────────┘                  └────────────┘              └────────────┘
             Tier 1                           Tier 2                       Tier 3
          static HTML/JS                 JWT + product CRUD            persistent data
```

- **Tier 1 — Frontend**: Plain HTML/CSS/JS served by nginx. Shows a login form,
  stores the JWT, and provides a product management UI (create / list / update /
  delete). nginx also reverse-proxies `/api/*` to the backend.
- **Tier 2 — Backend**: Node.js + Express REST API. Issues JWTs on login and
  protects all product endpoints. Talks to PostgreSQL.
- **Tier 3 — Database**: PostgreSQL. Schema is created on first startup.

---

## 1. Project layout

```
three-tier-app/
├── backend/                 # Express API (Tier 2)
│   ├── server.js            # routes: /auth/login + /products CRUD
│   ├── auth.js              # JWT sign + verify middleware
│   ├── db.js                # PostgreSQL connection pool
│   ├── seed.js              # creates the demo user at startup
│   ├── package.json
│   └── Dockerfile
├── frontend/                # nginx + static site (Tier 1)
│   ├── index.html
│   ├── app.js
│   ├── styles.css
│   ├── nginx.conf.template  # proxies /api/ -> backend
│   └── Dockerfile
├── database/
│   └── init.sql             # table schema (users, products)
├── k8s/                     # Kubernetes manifests
│   ├── 00-namespace.yaml
│   ├── 01-secrets.yaml
│   ├── 02-db-configmap.yaml
│   ├── 03-db-statefulset.yaml
│   ├── 04-backend.yaml
│   └── 05-frontend.yaml
├── docker-compose.yml       # run all three tiers locally
└── README.md
```

---

## 2. Dependencies / prerequisites

You do **not** need Node or PostgreSQL installed on your machine — everything
runs inside containers. You only need:

| Tool | Purpose | Install |
|------|---------|---------|
| **Docker** (with Compose v2) | Build images, run locally | https://docs.docker.com/get-docker/ |
| **kubectl** | Talk to a Kubernetes cluster | https://kubernetes.io/docs/tasks/tools/ |
| **kind** *or* **minikube** | A local Kubernetes cluster | https://kind.sigs.k8s.io/ or https://minikube.sigs.k8s.io/ |

Application-level dependencies (installed automatically during the Docker build):

- **Backend** (`backend/package.json`): `express`, `pg`, `jsonwebtoken`,
  `bcryptjs`, `cors`.
- **Frontend**: none — plain HTML/JS served by the official `nginx` image.
- **Database**: official `postgres:16-alpine` image.

---

## 3. Run locally with Docker Compose

This is the fastest way to see all three tiers working together.

```bash
cd three-tier-app
docker compose up --build
```

Then open: **http://localhost:8080**

Log in with the demo credentials:

```
username: admin
password: password123
```

You can now create, edit, and delete products. Data is stored in PostgreSQL and
persists in a named Docker volume (`db-data`) across restarts.

**Stop and clean up:**

```bash
docker compose down          # stop containers
docker compose down -v       # stop AND delete the database volume
```

### What happens on startup
1. `db` starts and runs `database/init.sql` to create the `users` and
   `products` tables.
2. `backend` waits for the database, then creates the demo user (password
   hashed with bcrypt) and starts listening on port 3000.
3. `frontend` (nginx) serves the UI on port 80 (mapped to `localhost:8080`) and
   proxies `/api/*` to the backend.

---

## 4. Deploy to Kubernetes (kind / minikube)

### 4.1 Create a cluster

**Using kind:**
```bash
kind create cluster --name three-tier
```

**Using minikube:**
```bash
minikube start
```

### 4.2 Build the images

```bash
cd three-tier-app
docker build -t three-tier-backend:latest ./backend
docker build -t three-tier-frontend:latest ./frontend
```

### 4.3 Load the images into the cluster

Local clusters don't see your machine's Docker images automatically, so load
them in. The manifests use `imagePullPolicy: IfNotPresent`, so no registry is
required.

**kind:**
```bash
kind load docker-image three-tier-backend:latest --name three-tier
kind load docker-image three-tier-frontend:latest --name three-tier
```

**minikube:**
```bash
minikube image load three-tier-backend:latest
minikube image load three-tier-frontend:latest
```

### 4.4 Apply the manifests

Apply in order (the filenames are numbered for this reason):

```bash
kubectl apply -f k8s/
```

Check everything is running:

```bash
kubectl get pods -n three-tier
kubectl get svc  -n three-tier
```

Wait until all pods show `Running` / `READY 1/1` (the backend may restart a few
times while it waits for the database — that's expected).

### 4.5 Access the frontend

The frontend is exposed as a `NodePort` on port **30080**.

**minikube:**
```bash
minikube service frontend -n three-tier --url
# open the printed URL
```

**kind** (NodePort isn't directly reachable, so port-forward instead):
```bash
kubectl port-forward -n three-tier svc/frontend 8080:80
# then open http://localhost:8080
```

Log in with `admin` / `password123`.

### 4.6 Tear down

```bash
kubectl delete -f k8s/
# or delete the whole cluster:
kind delete cluster --name three-tier     # kind
minikube delete                            # minikube
```

---

## 5. API reference

Base path through the frontend proxy is `/api`. Calling the backend directly
(e.g., in Compose on an exposed port) uses the same paths without `/api`.

| Method | Path | Auth | Body | Description |
|--------|------|------|------|-------------|
| `POST` | `/auth/login` | no | `{ "username", "password" }` | Returns `{ "token" }` |
| `GET` | `/health` | no | — | Liveness/readiness check |
| `POST` | `/products` | **JWT** | `{ "name", "description", "price" }` | Create a product |
| `GET` | `/products` | **JWT** | — | List all products |
| `GET` | `/products/:id` | **JWT** | — | Get one product |
| `PUT` | `/products/:id` | **JWT** | `{ "name", "description", "price" }` | Update a product |
| `DELETE` | `/products/:id` | **JWT** | — | Delete a product |

Authenticated requests must include the header:

```
Authorization: Bearer <token>
```

### Quick test with curl (against Docker Compose)

The frontend proxies the API, so you can hit it via `localhost:8080/api`:

```bash
# 1. Log in and capture the token
TOKEN=$(curl -s -X POST http://localhost:8080/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"username":"admin","password":"password123"}' | sed 's/.*"token":"\([^"]*\)".*/\1/')

# 2. Create a product
curl -s -X POST http://localhost:8080/api/products \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"name":"Keyboard","description":"Mechanical","price":79.99}'

# 3. List products
curl -s http://localhost:8080/api/products -H "Authorization: Bearer $TOKEN"
```

---

## 6. Configuration (environment variables)

**Backend:**

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3000` | Port the API listens on |
| `DB_HOST` | `localhost` | PostgreSQL host |
| `DB_PORT` | `5432` | PostgreSQL port |
| `DB_USER` | `appuser` | PostgreSQL user |
| `DB_PASSWORD` | `apppassword` | PostgreSQL password |
| `DB_NAME` | `appdb` | PostgreSQL database |
| `JWT_SECRET` | `dev-only-change-me` | JWT signing secret |
| `JWT_EXPIRES_IN` | `1h` | Token lifetime |
| `DEMO_USER` | `admin` | Seeded demo username |
| `DEMO_PASSWORD` | `password123` | Seeded demo password |

**Frontend:**

| Variable | Default | Description |
|----------|---------|-------------|
| `BACKEND_URL` | `http://backend:3000` | Where nginx proxies `/api/*` |

In Docker Compose these are set in `docker-compose.yml`. In Kubernetes they come
from `k8s/01-secrets.yaml` (DB creds, JWT secret, demo user) and the deployment
manifests.

---

## 7. Security notes (important for learning)

This project is intentionally simple. Before using anything like it in
production, you would want to:

- **Never commit secrets.** `k8s/01-secrets.yaml` contains plaintext values for
  convenience. Use a real secrets manager (e.g., AWS Secrets Manager + External
  Secrets Operator) and generate secrets out-of-band.
- **Serve over HTTPS** (TLS termination at an Ingress or load balancer).
- **Use a strong, unique `JWT_SECRET`** and shorter token lifetimes with refresh
  tokens.
- **Add rate limiting and input validation** on the backend.
- **Restrict CORS** to known origins (currently open for learning).
- **Run database migrations** with a proper tool instead of a single init
  script.

---

## 8. How this maps to a real AWS 3-tier VPC

You asked about 3-tier on an AWS VPC. The *application* pattern here is the same;
in a production AWS setup the *network isolation* would typically look like:

- **Public subnet**: load balancer / Ingress (reaches the frontend).
- **Private subnet**: frontend + backend pods (EKS worker nodes).
- **Isolated/private subnet**: database (e.g., Amazon RDS for PostgreSQL),
  reachable only from the backend's security group.

On EKS you'd push the images to **Amazon ECR** instead of loading them locally,
and replace the in-cluster Postgres StatefulSet with **Amazon RDS**. The app code
would not change — only the `DB_HOST` and image references.

---

## 9. Troubleshooting

| Symptom | Likely cause / fix |
|---------|--------------------|
| Backend keeps restarting | It's waiting for the DB. Give it a minute; check `kubectl logs -n three-tier deploy/backend`. |
| `Invalid credentials` on login | Use `admin` / `password123`, or check `DEMO_USER`/`DEMO_PASSWORD`. |
| Login works but products fail | Token expired (default 1h). Log out and back in. |
| kind: can't reach NodePort | Use `kubectl port-forward svc/frontend 8080:80` instead. |
| Images not found in cluster | Re-run the `kind load` / `minikube image load` step. |
| Port 8080 already in use | Change the left side of `8080:80` in `docker-compose.yml`. |
