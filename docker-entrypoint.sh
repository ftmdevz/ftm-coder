#!/bin/bash
set -e

MODEL="${AI_MODEL:-qwen2.5-coder:7b}"

echo "🚀 Starting Ollama..."
ollama serve &
OLLAMA_PID=$!

# Wait until Ollama HTTP API is ready (up to 30s)
echo "⏳ Waiting for Ollama to be ready..."
for i in $(seq 1 30); do
  if curl -sf http://localhost:11434/api/tags > /dev/null 2>&1; then
    echo "✅ Ollama is ready"
    break
  fi
  if [ "$i" -eq 30 ]; then
    echo "⚠️  Ollama did not start in time — continuing anyway"
  fi
  sleep 1
done

# Pull the model if not already in the volume cache
echo "📥 Pulling model: $MODEL (skip if cached)..."
ollama pull "$MODEL" || echo "⚠️  Model pull failed — model may already be cached or unavailable offline"

echo "🟢 Starting FTM-CODER-AI server on port ${PORT:-3000}..."
# Run node in foreground; shell is PID 1 and will clean up ollama on exit
node --enable-source-maps /app/dist/index.mjs &
NODE_PID=$!

# Forward signals to node
trap "kill $NODE_PID $OLLAMA_PID 2>/dev/null; exit" TERM INT

# Wait for node to exit (container lifetime = node lifetime)
wait $NODE_PID
