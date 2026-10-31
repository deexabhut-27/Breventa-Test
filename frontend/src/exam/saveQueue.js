/**
 * Reliable answer persistence.
 * Every change is written to localStorage first, then sent to the server. Failed sends are
 * retried with backoff, so answers survive refreshes and temporary network loss. Each write
 * carries a monotonically increasing sequence number; the server discards out-of-order writes.
 */
export class SaveQueue {
  constructor({ slug, api, onStatus, onFatal }) {
    this.api = api;
    this.onStatus = onStatus;
    this.onFatal = onFatal;
    this.pendingKey = `pes.exam.${slug}.pending`;
    this.seqKey = `pes.exam.${slug}.seq`;
    this.flushing = false;
    this.again = false;
    this.retryDelay = 1000;
    this.retryTimer = null;
    this.stopped = false;
    this.floor = 0;
    try {
      this.pending = new Map(JSON.parse(localStorage.getItem(this.pendingKey) || '[]'));
    } catch {
      this.pending = new Map();
    }
  }

  setSeqFloor(serverMaxSeq) {
    this.floor = Math.max(this.floor, serverMaxSeq || 0);
  }

  nextSeq() {
    const current = Math.max(Number(localStorage.getItem(this.seqKey)) || 0, this.floor);
    const next = current + 1;
    localStorage.setItem(this.seqKey, String(next));
    return next;
  }

  persist() {
    try {
      localStorage.setItem(this.pendingKey, JSON.stringify([...this.pending.entries()]));
    } catch {
      /* storage full or disabled: server sync still works */
    }
  }

  /** Locally pending answers, keyed by question index (used to restore UI state after refresh). */
  pendingMap() {
    return this.pending;
  }

  snapshot() {
    return [...this.pending.values()];
  }

  enqueue({ index, selectedOption, markedForReview }) {
    this.pending.set(index, { index, selectedOption, markedForReview, seq: this.nextSeq() });
    this.persist();
    this.onStatus('saving');
    this.flush();
  }

  async flush() {
    if (this.stopped) return;
    if (this.flushing) {
      this.again = true;
      return;
    }
    if (!this.pending.size) {
      this.onStatus('saved');
      return;
    }
    this.flushing = true;
    clearTimeout(this.retryTimer);
    const items = this.snapshot();
    let networkError = false;
    let fatal = null;

    const results = await Promise.allSettled(
      items.map((it) =>
        this.api.put(`/student/attempt/responses/${it.index}`, {
          selectedOption: it.selectedOption,
          markedForReview: it.markedForReview,
          seq: it.seq,
        }),
      ),
    );
    results.forEach((r, i) => {
      const it = items[i];
      const status = r.status === 'rejected' ? r.reason?.response?.status : 200;
      if (status === 200 || status === 400) {
        // Only drop it if no newer change for the same question arrived meanwhile.
        if (this.pending.get(it.index)?.seq === it.seq) this.pending.delete(it.index);
      } else if (status === 409 || status === 401) {
        fatal = r.reason;
      } else {
        networkError = true; // offline, timeout, 429 or 5xx: keep and retry
      }
    });
    this.persist();
    this.flushing = false;

    if (fatal) {
      this.onFatal(fatal);
      return;
    }
    if (networkError) {
      this.onStatus('offline');
      this.retryTimer = setTimeout(() => this.flush(), this.retryDelay);
      this.retryDelay = Math.min(15000, this.retryDelay * 2);
      return;
    }
    this.retryDelay = 1000;
    if (this.again || this.pending.size) {
      this.again = false;
      this.flush();
    } else {
      this.onStatus('saved');
    }
  }

  stop() {
    this.stopped = true;
    clearTimeout(this.retryTimer);
  }

  clear() {
    this.stop();
    this.pending.clear();
    localStorage.removeItem(this.pendingKey);
    localStorage.removeItem(this.seqKey);
  }
}
