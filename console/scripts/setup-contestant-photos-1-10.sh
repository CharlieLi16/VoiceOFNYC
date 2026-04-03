#!/usr/bin/env bash
# 将 image0.* … image9.* 复制为统一命名的 1.jpg … 10.jpg（供第一轮 PK / 大屏使用）
set -euo pipefail
DIR="$(cd "$(dirname "$0")/../frontend/public/img/contestants" && pwd)"
cp -f "$DIR/image0.jpg" "$DIR/1.jpg"
cp -f "$DIR/image1.jpg" "$DIR/2.jpg"
cp -f "$DIR/image2.jpg" "$DIR/3.jpg"
cp -f "$DIR/image3.jpg" "$DIR/4.jpg"
cp -f "$DIR/image4.jpg" "$DIR/5.jpg"
cp -f "$DIR/image5.jpg" "$DIR/6.jpg"
cp -f "$DIR/image6.jpeg" "$DIR/7.jpg"
cp -f "$DIR/image7.jpeg" "$DIR/8.jpg"
cp -f "$DIR/image8.jpeg" "$DIR/9.jpg"
cp -f "$DIR/image9.jpeg" "$DIR/10.jpg"
echo "OK: $DIR/1.jpg … 10.jpg"
