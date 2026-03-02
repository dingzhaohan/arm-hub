# Stage 1: Frontend build
FROM registry.dp.tech/public/node:22 AS frontend

ARG BUILD_MODE=test

WORKDIR /build
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci --ignore-scripts
COPY frontend/ ./
RUN npx vite build --mode ${BUILD_MODE}

# Stage 2: Runtime
FROM registry.dp.tech/base/python3.11 

WORKDIR /workspace

# Conda
RUN wget -q https://dp-filetrans-zjk.oss-cn-zhangjiakou.aliyuncs.com/software/miniforge/Mambaforge-22.9.0-0-Linux-x86_64.sh && \
    bash Mambaforge-22.9.0-0-Linux-x86_64.sh -b -p /opt/conda && \
    rm -f Mambaforge-22.9.0-0-Linux-x86_64.sh && \
    /opt/conda/bin/conda clean -afy
ENV PATH=/opt/conda/bin:$PATH

# Python deps (cached unless requirements.txt changes)
COPY backend/requirements.txt /tmp/requirements.txt
RUN /opt/conda/bin/pip install --no-cache-dir -r /tmp/requirements.txt -i https://pypi.tuna.tsinghua.edu.cn/simple

# Backend source
COPY backend/ /workspace/backend/

# Frontend dist from Stage 1
COPY --from=frontend /build/dist/ /workspace/frontend/dist/

CMD ["/opt/conda/bin/uvicorn", "main:app", "--workers", "2", "--host", "0.0.0.0", "--port", "80", "--app-dir", "/workspace/backend"]
