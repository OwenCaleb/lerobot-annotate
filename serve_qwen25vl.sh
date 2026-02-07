#!/usr/bin/env bash
set -e

# '''
# conda activate vllm
# 用法 1（推荐，最省事）：MODEL_PATH=/path/to/model ./serve.sh
# 用法 2：bash ./serve_qwen25vl.sh  /mnt/nas_ssd/workspace/wenboli/projects/Wall-X/Pretrained_models/Qwen2.5-VL-7B-Instruct-AWQ
# 不传则用脚本里默认的 MODEL_ID="Qwen/..."

# 在同一台机器上开启另一个终端然后
# export LEROBOT_ANNOTATE_AI_ENABLED=1
# export LEROBOT_ANNOTATE_AI_BASE_URL="http://127.0.0.1:8000/v1"
# export LEROBOT_ANNOTATE_AI_MODEL="qwen25vl"
# export LEROBOT_ANNOTATE_AI_API_KEY="EMPTY"
# export LEROBOT_ANNOTATE_AI_TIMEOUT_S=120
# export LEROBOT_ANNOTATE_AI_MAX_IMAGE_SIZE=768
# '''

# =======================
# CONFIG
# =======================
MODEL_ID_DEFAULT="Qwen/Qwen2.5-VL-7B-Instruct-AWQ"
SERVED_MODEL_NAME="qwen25vl"          # 你的插件里 LEROBOT_ANNOTATE_AI_MODEL 就填这个
HOST="0.0.0.0"
PORT="8000"
API_KEY="EMPTY"                       # 本地服务也建议设一个固定 key，便于插件对齐
GPU_UTIL="0.90"
MAX_MODEL_LEN="8192"

# 你做“多帧抽样 fake VQA”会一次塞多张图；这里把 image 上限放大一点
# vLLM 参数格式: image=16,video=2 这种
LIMIT_MM_PER_PROMPT='{"image":300}'

# 额外可选：如果你发现图像 token 太多导致 OOM，可收紧图像预处理
# MM_PROCESSOR_KWARGS='{"min_pixels":200704,"max_pixels":602112}'  # 示例：可按需调
MM_PROCESSOR_KWARGS=""

# =======================
# MODEL PATH OVERRIDE
# =======================
# 优先级：命令行第1参 > 环境变量 MODEL_PATH > 默认 HF repo id
MODEL_SPEC="${1:-${MODEL_PATH:-$MODEL_ID_DEFAULT}}"

# =======================
# LAUNCH
# =======================
CMD=(vllm serve "$MODEL_SPEC"
  --host "$HOST"
  --port "$PORT"
  --api-key "$API_KEY"
  --served-model-name "$SERVED_MODEL_NAME"
  --trust-remote-code
  --dtype half
  --gpu-memory-utilization "$GPU_UTIL"
  --max-model-len "$MAX_MODEL_LEN"
  --limit-mm-per-prompt "$LIMIT_MM_PER_PROMPT"
)

if [[ -n "$MM_PROCESSOR_KWARGS" ]]; then
  CMD+=(--mm-processor-kwargs "$MM_PROCESSOR_KWARGS")
fi

echo "[serve] ${CMD[@]}"
"${CMD[@]}"
