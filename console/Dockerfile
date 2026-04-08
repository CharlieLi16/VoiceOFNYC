# 构建上下文必须是 **console/** 目录（与 db.py 中 ROOT =「console」一致）。
# 本地：在仓库根执行  docker build -f console/Dockerfile -t voiceofnyc-api console
# Railway：Service → Settings → Root Directory 填 **console**，本文件即 Dockerfile。
FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

WORKDIR /repo/console/backend

COPY backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY backend/ .

# 与 db.seed_round*_from_public_files 使用的路径一致
COPY frontend/public/stage /repo/console/frontend/public/stage

EXPOSE 8765

CMD uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8765}
