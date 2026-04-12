# Dockerfile：告诉 Docker 如何「打包」本服务镜像（基础系统、依赖、拷贝哪些文件、启动命令）。
# 构建出的镜像可在本机或 Railway 等平台上运行，环境一致、不依赖你电脑上的路径。
#
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

# 签到票码池：checkin_db 默认读 ROOT/firebase-vote/data/vote-codes.csv（仅当 SQLite 中 checkin_pool 为空时导入）
RUN mkdir -p /repo/console/firebase-vote/data
COPY firebase-vote/data/vote-codes.csv /repo/console/firebase-vote/data/vote-codes.csv

EXPOSE 8765

CMD uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8765}
