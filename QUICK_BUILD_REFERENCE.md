# Quick Build Reference Card

**Fast rebuild when code changes** 🚀

---

## One-Line Commands

### Build Everything
```bash
./build-all.sh
```

### Build Pydantic Backend Only
```bash
cd copilotkit-pydantic && ./build-and-run.sh
```

### Build Runtime Server Only
```bash
cd copilot-runtime-server && ./build-and-run.sh
```

---

## Production Mode

```bash
# All services
./build-all.sh production

# Individual services
cd copilotkit-pydantic && ./build-and-run.sh production
cd copilot-runtime-server && ./build-and-run.sh production
```

---

## Quick Health Checks

```bash
# Pydantic Backend
curl http://localhost:8001/healthz

# Runtime Server
curl http://localhost:3001/health
```

---

## View Logs

```bash
# Pydantic
docker logs -f copilotkit-pydantic

# Runtime
docker logs -f copilot-runtime-server

# Both
docker logs -f copilotkit-pydantic & docker logs -f copilot-runtime-server
```

---

## Stop/Remove

```bash
# Stop both
docker stop copilotkit-pydantic copilot-runtime-server

# Remove both
docker rm copilotkit-pydantic copilot-runtime-server
```

---

## Workflow

1. **Edit code** in either service
2. **Run build script:** `./build-all.sh` or individual script
3. **Check health:** `curl http://localhost:8001/healthz`
4. **Test changes**
5. **Repeat**

---

**Full documentation:** [BUILD_SCRIPTS_README.md](BUILD_SCRIPTS_README.md)
