// charts.js — dependency-free canvas charts (level ring + radar).
(function () {
  function dpr(canvas) {
    const ratio = window.devicePixelRatio || 1;
    const w = canvas.width, h = canvas.height;
    if (canvas._sized === ratio) return canvas.getContext('2d');
    canvas.style.width = w + 'px';
    canvas.style.height = h + 'px';
    canvas.width = w * ratio;
    canvas.height = h * ratio;
    const ctx = canvas.getContext('2d');
    ctx.scale(ratio, ratio);
    canvas._logical = { w, h };
    canvas._sized = ratio;
    return ctx;
  }

  function drawLevelRing(canvas, pct, level) {
    const ctx = dpr(canvas);
    const { w, h } = canvas._logical;
    ctx.clearRect(0, 0, w, h);
    const cx = w / 2, cy = h / 2, r = w / 2 - 10;
    // track
    ctx.lineWidth = 9;
    ctx.strokeStyle = '#333';
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.stroke();
    // progress
    const start = -Math.PI / 2;
    const grad = ctx.createLinearGradient(0, 0, w, h);
    grad.addColorStop(0, '#4ec9b0'); grad.addColorStop(1, '#3794ff');
    ctx.strokeStyle = grad;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.arc(cx, cy, r, start, start + Math.PI * 2 * Math.max(0.001, Math.min(1, pct)));
    ctx.stroke();
    // center label
    ctx.fillStyle = '#fff';
    ctx.font = '600 26px "Segoe UI", system-ui, sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(String(level), cx, cy - 4);
    ctx.fillStyle = '#858585';
    ctx.font = '10px "Segoe UI", system-ui, sans-serif';
    ctx.fillText('LEVEL', cx, cy + 16);
  }

  function drawRadar(canvas, accuracy, labels) {
    const ctx = dpr(canvas);
    const { w, h } = canvas._logical;
    ctx.clearRect(0, 0, w, h);
    const keys = Object.keys(labels);
    const N = keys.length;
    const cx = w / 2, cy = h / 2 + 6, R = Math.min(w, h) / 2 - 34;
    const angleFor = (i) => -Math.PI / 2 + (i / N) * Math.PI * 2;

    // grid rings
    ctx.strokeStyle = '#333'; ctx.fillStyle = '#252526';
    for (let ring = 1; ring <= 4; ring++) {
      const rr = (R * ring) / 4;
      ctx.beginPath();
      for (let i = 0; i <= N; i++) {
        const a = angleFor(i % N);
        const x = cx + rr * Math.cos(a), y = cy + rr * Math.sin(a);
        i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
    // spokes + labels
    ctx.strokeStyle = '#3a3a3a';
    ctx.fillStyle = '#9a9a9a';
    ctx.font = '10px "Segoe UI", system-ui, sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    keys.forEach((k, i) => {
      const a = angleFor(i);
      ctx.beginPath(); ctx.moveTo(cx, cy);
      ctx.lineTo(cx + R * Math.cos(a), cy + R * Math.sin(a)); ctx.stroke();
      const lx = cx + (R + 16) * Math.cos(a), ly = cy + (R + 16) * Math.sin(a);
      ctx.fillText(labels[k], lx, ly);
    });

    // data polygon (null accuracy treated as a faint 0-length; shown as center)
    const hasData = keys.some((k) => accuracy[k] != null);
    if (!hasData) {
      ctx.fillStyle = '#666';
      ctx.font = '11px "Segoe UI", system-ui, sans-serif';
      ctx.fillText('データなし — コンパイルすると', cx, cy);
      ctx.fillText('ここに理解度が表示されます', cx, cy + 16);
      return;
    }
    ctx.beginPath();
    keys.forEach((k, i) => {
      const v = accuracy[k] == null ? 0.15 : accuracy[k];
      const a = angleFor(i);
      const x = cx + R * v * Math.cos(a), y = cy + R * v * Math.sin(a);
      i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    });
    ctx.closePath();
    ctx.fillStyle = 'rgba(78,201,176,0.22)';
    ctx.strokeStyle = '#4ec9b0';
    ctx.lineWidth = 2;
    ctx.fill(); ctx.stroke();
    // vertices
    keys.forEach((k, i) => {
      const v = accuracy[k] == null ? 0.15 : accuracy[k];
      const a = angleFor(i);
      const x = cx + R * v * Math.cos(a), y = cy + R * v * Math.sin(a);
      ctx.beginPath(); ctx.arc(x, y, 3, 0, Math.PI * 2);
      ctx.fillStyle = accuracy[k] == null ? '#555' : '#4ec9b0';
      ctx.fill();
    });
  }

  window.EngcCharts = { drawLevelRing, drawRadar };
})();
