#!/usr/bin/env bash
set -e

# 使用方式：source backend/export_ai_env.sh 

# annotate 服务（FastAPI）里启用 AI 插件
export LEROBOT_ANNOTATE_AI_ENABLED=1

# vLLM OpenAI server
export LEROBOT_ANNOTATE_AI_BASE_URL="http://127.0.0.1:8000/v1"
export LEROBOT_ANNOTATE_AI_MODEL="qwen25vl"
export LEROBOT_ANNOTATE_AI_API_KEY="EMPTY"

export LEROBOT_ANNOTATE_AI_TIMEOUT_S=120
export LEROBOT_ANNOTATE_AI_MAX_IMAGE_SIZE=768

# 结构化 JSON 输出模式：auto 会自动探测 json_schema / structured_outputs / guided_json
export LEROBOT_ANNOTATE_AI_JSON_MODE="auto"

# （可选）更稳一点：完全确定你 vLLM 很旧时，强制 guided_json

# export LEROBOT_ANNOTATE_AI_JSON_MODE="guided_json"
