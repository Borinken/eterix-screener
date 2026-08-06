FROM node:20-slim

RUN apt-get update \
    && apt-get install -y --no-install-recommends python3 python3-pip \
    && rm -rf /var/lib/apt/lists/* \
    && npm install -g gmgn-cli

WORKDIR /app
COPY requirements.txt .
RUN pip3 install --no-cache-dir --break-system-packages -r requirements.txt
COPY screener_worker.py .

# gmgn-cli needs `gmgn-cli config` run once against its OWN key before this
# will produce results -- see README.md "Deploy the worker" for why this
# step isn't automated here (no confirmed non-interactive flag for it).
CMD ["python3", "screener_worker.py"]
