(function () {
  'use strict';

  /* ============================================================
     1. DOM REFS
  ============================================================ */
  const webcam        = document.getElementById('webcam');
  const cameraCanvas  = document.getElementById('camera-canvas');
  const drawingCanvas = document.getElementById('drawing-canvas');
  const uiCanvas      = document.getElementById('ui-canvas');

  const ctxCamera = cameraCanvas.getContext('2d');
  const ctxDraw   = drawingCanvas.getContext('2d');
  const ctxUI     = uiCanvas.getContext('2d');

  const gestureHud  = document.getElementById('gesture-hud');
  const cursorDot   = document.getElementById('cursor-dot');
  const fpsCounter  = document.getElementById('fps-counter');
  const dropOverlay = document.getElementById('drop-overlay');
  const toolbar     = document.getElementById('toolbar');
  const loadingScr  = document.getElementById('loading-screen');
  const onboarding  = document.getElementById('onboarding-modal');

  /* ============================================================
     2. STATE VARIABLES
  ============================================================ */
  let currentColor  = '#00f0ff';
  let thickness     = 6;
  let glowAmount    = 24;   // shadowBlur mapped from glow slider
  let showCamera   = true;
  let lastX        = null;
  let lastY        = null;
  let currentStroke = [];
  let allStrokes   = [];
  let gestureHistory = [];
  const GESTURE_FRAMES = 4;
  let activeGesture = 'IDLE';
  let lineStartX   = null;
  let lineStartY   = null;
  let inLineDraw   = false;
  let particles    = [];
  let gameMode     = null;
  let dotTargets   = [];
  let nextDotIndex = 0;
  let gameScore    = 0;
  let prevDotX     = null, prevDotY = null;
  let airWritingMode = false;
  let recognizedText = '';
  let airWriteDisplayTimer = null;
  let traceMode = false;
  let traceShape = null;
  let tracePlayerPoints = [];
  let traceRoundActive = false;
  let traceScore = 0;
  let traceRound = 0;

  // FPS tracking
  let fpsFrameCount = 0;
  let fpsLastTime   = performance.now();
  let fpsValue      = 0;

  const LETTER_TEMPLATES = {
    'A': [[0.5,0],[0.1,1],[0.5,0],[0.9,1],[0.25,0.55],[0.75,0.55]],
    'B': [[0,0],[0,1],[0.7,0.2],[0,0.5],[0.8,0.7],[0,1]],
    'C': [[0.9,0.1],[0.1,0.1],[0,0.5],[0.1,0.9],[0.9,0.9]],
    'D': [[0,0],[0,1],[0.6,0.8],[0.9,0.5],[0.6,0.2],[0,0]],
    'E': [[0.8,0],[0,0],[0,0.5],[0.6,0.5],[0,0.5],[0,1],[0.8,1]],
    'I': [[0.3,0],[0.7,0],[0.5,0],[0.5,1],[0.3,1],[0.7,1]],
    'L': [[0,0],[0,1],[0.8,1]],
    'O': [[0.5,0],[0.9,0.3],[0.9,0.7],[0.5,1],[0.1,0.7],[0.1,0.3],[0.5,0]],
    'S': [[0.8,0.1],[0.2,0.1],[0,0.3],[0.5,0.5],[1,0.7],[0.8,0.9],[0.2,0.9]],
    'T': [[0,0],[1,0],[0.5,0],[0.5,1]],
    'U': [[0,0],[0,0.8],[0.5,1],[1,0.8],[1,0]],
    'V': [[0,0],[0.5,1],[1,0]],
    'W': [[0,0],[0.25,1],[0.5,0.5],[0.75,1],[1,0]],
    'X': [[0,0],[1,1],[0.5,0.5],[0,1],[1,0]],
    'Z': [[0,0],[1,0],[0,1],[1,1]]
  };

  /* ============================================================
     3. CANVAS RESIZE
  ============================================================ */
  function resizeCanvases() {
    const w = window.innerWidth;
    const h = window.innerHeight;

    [cameraCanvas, drawingCanvas, uiCanvas].forEach(c => {
      c.width  = w;
      c.height = h;
    });

    // Preserve drawing after resize
    redrawAllStrokes();
  }

  window.addEventListener('resize', resizeCanvases);

  /* ============================================================
     4. TOOLBAR WIRING
  ============================================================ */
  // Color swatches
  document.querySelectorAll('.color-swatch').forEach(swatch => {
    swatch.addEventListener('click', () => {
      document.querySelectorAll('.color-swatch').forEach(s => s.classList.remove('active'));
      swatch.classList.add('active');
      currentColor = swatch.dataset.color;
    });
  });

  // Thickness slider
  const thicknessSlider = document.getElementById('thickness-slider');
  const thicknessValue = document.getElementById('thickness-value');
  thicknessSlider.addEventListener('input', () => {
    thickness = parseInt(thicknessSlider.value, 10);
    thicknessValue.textContent = thickness + 'px';
  });

  // Glow slider
  const glowSlider = document.getElementById('glow-slider');
  const glowValue  = document.getElementById('glow-value');
  glowSlider.addEventListener('input', () => {
    const pct = parseInt(glowSlider.value, 10);
    glowAmount = Math.round((pct / 100) * 40);
    glowValue.textContent = pct + '%';
  });

  // Undo
  document.getElementById('btn-undo').addEventListener('click', () => {
    allStrokes.pop();
    redrawAllStrokes();
  });

  // Clear
  document.getElementById('btn-clear').addEventListener('click', () => {
    allStrokes = [];
    ctxDraw.clearRect(0, 0, drawingCanvas.width, drawingCanvas.height);
  });

  // Camera toggle
  document.getElementById('btn-camera').addEventListener('click', (e) => {
    const btn = e.currentTarget;
    showCamera = !showCamera;
    btn.classList.toggle('active', showCamera);
    cameraCanvas.style.display = showCamera ? 'block' : 'none';
  });

  // Save PNG
  document.getElementById('btn-save').addEventListener('click', () => {
    const merge = document.createElement('canvas');
    merge.width  = drawingCanvas.width;
    merge.height = drawingCanvas.height;
    const mCtx = merge.getContext('2d');
    mCtx.fillStyle = '#07080f';
    mCtx.fillRect(0, 0, merge.width, merge.height);
    mCtx.drawImage(cameraCanvas, 0, 0);
    mCtx.drawImage(drawingCanvas, 0, 0);
    const link = document.createElement('a');
    link.download = 'air-draw.png';
    link.href = merge.toDataURL('image/png');
    link.click();
  });

  // Help — show onboarding
  document.getElementById('btn-help').addEventListener('click', () => {
    onboarding.classList.remove('hidden');
  });

  // Connect Dots game
  document.getElementById('btn-connect-dots').addEventListener('click', () => {
    const patterns = ['star','house','arrow'];
    const pick = patterns[Math.floor(Math.random() * patterns.length)];
    startConnectDots(pick);
  });

  // Air Write toggle
  document.getElementById('btn-air-write').addEventListener('click', () => {
    airWritingMode = !airWritingMode;
    document.getElementById('btn-air-write').classList.toggle('active', airWritingMode);
    if (!airWritingMode) recognizedText = '';
  });

  // Trace Shape game
  document.getElementById('btn-trace').addEventListener('click', () => {
    traceMode = !traceMode;
    document.getElementById('btn-trace').classList.toggle('active', traceMode);
    traceScore = 0; traceRound = 0;
    if (traceMode) {
      gameMode = null;
      startTraceRound();
    } else {
      traceRoundActive = false;
      updateGameHUD();
    }
  });

  // Start Drawing
  document.getElementById('btn-start').addEventListener('click', () => {
    onboarding.classList.add('hidden');
  });

  /* ============================================================
     4b. DRAG & DROP
  ============================================================ */
  window.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropOverlay.classList.remove('hidden');
  });

  window.addEventListener('dragleave', (e) => {
    if (!e.relatedTarget || e.relatedTarget === document.documentElement) {
      dropOverlay.classList.add('hidden');
    }
  });

  window.addEventListener('drop', (e) => {
    e.preventDefault();
    dropOverlay.classList.add('hidden');
    const items = e.dataTransfer.items;
    for (const item of items) {
      if (item.kind === 'file') {
        const file = item.getAsFile();
        if (file.type.startsWith('image/')) {
          handleImageDrop(file, e.clientX, e.clientY);
        } else if (file.type === 'text/plain') {
          handleTextDrop(file, e.clientX, e.clientY);
        }
      } else if (item.kind === 'string' && item.type === 'text/plain') {
        item.getAsString((str) => {
          drawTextOnCanvas(str, e.clientX, e.clientY);
        });
      }
    }
  });

  function handleImageDrop(file, dropX, dropY) {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const maxW = Math.min(img.width, drawingCanvas.width * 0.5);
      const scale = maxW / img.width;
      const w = img.width * scale;
      const h = img.height * scale;
      const x = dropX - w / 2;
      const y = dropY - h / 2;
      ctxDraw.globalAlpha = 0.85;
      ctxDraw.drawImage(img, x, y, w, h);
      ctxDraw.globalAlpha = 1;
      URL.revokeObjectURL(url);
      allStrokes.push({ type: 'image', src: url });
    };
    img.src = url;
  }

  function handleTextDrop(file, dropX, dropY) {
    const reader = new FileReader();
    reader.onload = (e) => drawTextOnCanvas(e.target.result.slice(0, 120), dropX, dropY);
    reader.readAsText(file);
  }

  function drawTextOnCanvas(text, x, y) {
    const lines = text.split('\n').slice(0, 8);
    const fontSize = Math.max(18, thickness * 3);
    ctxDraw.font = `${fontSize}px 'Space Grotesk', sans-serif`;
    ctxDraw.fillStyle = currentColor;
    ctxDraw.shadowColor = currentColor;
    ctxDraw.shadowBlur = glowAmount;
    ctxDraw.textAlign = 'center';
    lines.forEach((line, i) => {
      ctxDraw.fillText(line, x, y + i * (fontSize * 1.4));
    });
    ctxDraw.shadowBlur = 0;
    ctxDraw.textAlign = 'start';
  }

  /* ============================================================
     5. DRAWING ENGINE
  ============================================================ */
  function drawSegment(ctx, x1, y1, x2, y2, color, lw, glow) {
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth   = lw;
    ctx.lineCap     = 'round';
    ctx.lineJoin    = 'round';
    ctx.shadowColor = color;
    ctx.shadowBlur  = glow;
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
    ctx.restore();
  }

  function redrawAllStrokes() {
    ctxDraw.clearRect(0, 0, drawingCanvas.width, drawingCanvas.height);
    allStrokes.forEach(stroke => {
      if (stroke.points.length < 2) return;
      for (let i = 1; i < stroke.points.length; i++) {
        const p0 = stroke.points[i - 1];
        const p1 = stroke.points[i];
        drawSegment(ctxDraw, p0.x, p0.y, p1.x, p1.y,
                     stroke.color, stroke.lw, stroke.glow);
      }
    });
  }

  function eraseAt(cx, cy, radius) {
    ctxDraw.save();
    ctxDraw.globalCompositeOperation = 'destination-out';
    ctxDraw.beginPath();
    ctxDraw.arc(cx, cy, radius, 0, Math.PI * 2);
    ctxDraw.fill();
    ctxDraw.restore();
  }

  function emitParticles(x, y, color) {
    const count = 5;
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 0.8 + Math.random() * 2.2;
      particles.push({
        x, y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 0.5,
        alpha: 0.9 + Math.random() * 0.1,
        radius: 1.5 + Math.random() * 2.5,
        color,
        life: 0,
        maxLife: 28 + Math.floor(Math.random() * 18)
      });
    }
  }

  function updateAndDrawParticles() {
    particles = particles.filter(p => p.life < p.maxLife);
    for (const p of particles) {
      p.x += p.vx;
      p.y += p.vy;
      p.vy += 0.055;
      p.vx *= 0.97;
      p.life++;
      const t = p.life / p.maxLife;
      const alpha = p.alpha * (1 - t * t);
      const radius = p.radius * (1 - t * 0.5);
      uiCtx.save();
      uiCtx.beginPath();
      uiCtx.arc(p.x, p.y, radius, 0, Math.PI * 2);
      uiCtx.fillStyle = p.color;
      uiCtx.shadowColor = p.color;
      uiCtx.shadowBlur = 8;
      uiCtx.globalAlpha = alpha;
      uiCtx.fill();
      uiCtx.beginPath();
      uiCtx.arc(p.x, p.y, radius * 0.35, 0, Math.PI * 2);
      uiCtx.fillStyle = 'rgba(255,255,255,0.9)';
      uiCtx.shadowBlur = 0;
      uiCtx.fill();
      uiCtx.globalAlpha = 1;
      uiCtx.shadowBlur = 0;
      uiCtx.restore();
    }
  }

  function sprayPaint(cx, cy) {
    const count = 14;
    const radius = 26;
    ctxDraw.save();
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const dist = Math.random() * radius;
      const px = cx + Math.cos(angle) * dist;
      const py = cy + Math.sin(angle) * dist;
      const dotR = 1.2 + Math.random() * 3;
      ctxDraw.beginPath();
      ctxDraw.arc(px, py, dotR, 0, Math.PI * 2);
      ctxDraw.fillStyle = currentColor;
      ctxDraw.shadowColor = currentColor;
      ctxDraw.shadowBlur = 6;
      ctxDraw.globalAlpha = 0.45 + Math.random() * 0.55;
      ctxDraw.fill();
    }
    ctxDraw.globalAlpha = 1;
    ctxDraw.shadowBlur = 0;
    ctxDraw.restore();
  }

  function drawLinePreview(x1, y1, x2, y2) {
    ctxUI.save();
    ctxUI.beginPath();
    ctxUI.setLineDash([8, 5]);
    ctxUI.moveTo(x1, y1);
    ctxUI.lineTo(x2, y2);
    ctxUI.strokeStyle = currentColor;
    ctxUI.lineWidth = Math.max(2, thickness * 0.6);
    ctxUI.shadowColor = currentColor;
    ctxUI.shadowBlur = 12;
    ctxUI.globalAlpha = 0.7;
    ctxUI.stroke();
    ctxUI.setLineDash([]);
    ctxUI.shadowBlur = 0;
    ctxUI.globalAlpha = 1;
    ctxUI.restore();
  }

  function commitStroke() {
    if (currentStroke.length > 1) {
      allStrokes.push({
        points: currentStroke.slice(),
        color: currentColor,
        lw:    thickness,
        glow:  glowAmount
      });
    }
    currentStroke = [];
    lastX = null;
    lastY = null;
  }

  /* ============================================================
     6. CONNECT THE DOTS GAME
  ============================================================ */
  const DOT_PATTERNS = {
    star: [
      {x:0.5,y:0.12},{x:0.57,y:0.37},{x:0.82,y:0.37},
      {x:0.62,y:0.54},{x:0.72,y:0.8},{x:0.5,y:0.65},
      {x:0.28,y:0.8},{x:0.38,y:0.54},{x:0.18,y:0.37},{x:0.43,y:0.37}
    ],
    house: [
      {x:0.5,y:0.15},{x:0.8,y:0.42},{x:0.8,y:0.85},
      {x:0.2,y:0.85},{x:0.2,y:0.42}
    ],
    arrow: [
      {x:0.5,y:0.15},{x:0.8,y:0.45},{x:0.65,y:0.45},
      {x:0.65,y:0.85},{x:0.35,y:0.85},{x:0.35,y:0.45},{x:0.2,y:0.45}
    ]
  };

  function startConnectDots(patternName = 'star') {
    gameMode = 'connect_dots';
    const pattern = DOT_PATTERNS[patternName];
    dotTargets = pattern.map((p, i) => ({
      x: p.x * drawingCanvas.width,
      y: p.y * drawingCanvas.height,
      num: i + 1, done: false
    }));
    nextDotIndex = 0;
    gameScore = 0;
    prevDotX = null; prevDotY = null;
    updateGameHUD();
  }

  function drawDotTargets() {
    dotTargets.forEach((dot, i) => {
      const isNext = i === nextDotIndex;
      const r = isNext ? 20 : 14;
      uiCtx.beginPath();
      uiCtx.arc(dot.x, dot.y, r, 0, Math.PI * 2);
      uiCtx.fillStyle = dot.done ? 'rgba(0,240,255,0.3)' : (isNext ? 'rgba(0,240,255,0.15)' : 'rgba(255,255,255,0.08)');
      uiCtx.shadowColor = isNext ? '#00f0ff' : 'transparent';
      uiCtx.shadowBlur = isNext ? 18 : 0;
      uiCtx.fill();
      uiCtx.beginPath();
      uiCtx.arc(dot.x, dot.y, r, 0, Math.PI * 2);
      uiCtx.strokeStyle = dot.done ? '#00f0ff' : (isNext ? '#ffffff' : 'rgba(255,255,255,0.3)');
      uiCtx.lineWidth = isNext ? 2 : 1;
      uiCtx.stroke();
      uiCtx.shadowBlur = 0;
      uiCtx.fillStyle = isNext ? '#ffffff' : 'rgba(255,255,255,0.5)';
      uiCtx.font = `bold ${isNext ? 14 : 11}px Orbitron, monospace`;
      uiCtx.textAlign = 'center';
      uiCtx.textBaseline = 'middle';
      uiCtx.fillText(dot.num, dot.x, dot.y);
      uiCtx.textAlign = 'start';
      uiCtx.textBaseline = 'alphabetic';
    });
  }

  function updateGameHUD() {
    const hud = document.getElementById('game-hud');
    if (!hud) return;
    if (gameMode) {
      hud.classList.add('visible');
      hud.innerHTML = `DOT ${nextDotIndex + 1}/${dotTargets.length} · SCORE ${gameScore}`;
    } else if (traceMode) {
      hud.classList.add('visible');
      hud.innerHTML = `ROUND ${traceRound} · SCORE ${traceScore}`;
    } else {
      hud.classList.remove('visible');
    }
  }

  /* ============================================================
     6b. AIR WRITING / LETTER RECOGNITION
  ============================================================ */
  function normalizeStroke(points) {
    if (points.length < 3) return null;
    const xs = points.map(p => p.x);
    const ys = points.map(p => p.y);
    const minX = Math.min(...xs), maxX = Math.max(...xs);
    const minY = Math.min(...ys), maxY = Math.max(...ys);
    const w = maxX - minX || 1;
    const h = maxY - minY || 1;
    const step = Math.max(1, Math.floor(points.length / 12));
    const sampled = points.filter((_, i) => i % step === 0).slice(0, 12);
    return sampled.map(p => ({ x: (p.x - minX) / w, y: (p.y - minY) / h }));
  }

  function matchLetter(normalized) {
    if (!normalized) return null;
    let best = null, bestScore = Infinity;
    for (const [letter, template] of Object.entries(LETTER_TEMPLATES)) {
      const pts = template.length;
      let totalDist = 0;
      for (let i = 0; i < normalized.length; i++) {
        const ti = Math.floor(i / normalized.length * pts);
        const tp = template[Math.min(ti, pts - 1)];
        totalDist += Math.hypot(normalized[i].x - tp[0], normalized[i].y - tp[1]);
      }
      const avg = totalDist / normalized.length;
      if (avg < bestScore) { bestScore = avg; best = letter; }
    }
    return bestScore < 0.38 ? best : null;
  }

  function showRecognizedLetter(letter) {
    recognizedText += letter;
    if (recognizedText.length > 20) recognizedText = recognizedText.slice(-20);
    clearTimeout(airWriteDisplayTimer);
    airWriteDisplayTimer = setTimeout(() => { recognizedText = ''; }, 4000);
  }

  /* ============================================================
     6c. TRACE THE SHAPE GAME
  ============================================================ */
  function makeCircleShape() {
    const cx = drawingCanvas.width * 0.5;
    const cy = drawingCanvas.height * 0.42;
    const r = Math.min(drawingCanvas.width, drawingCanvas.height) * 0.2;
    const pts = [];
    for (let i = 0; i <= 36; i++) {
      const a = (i / 36) * Math.PI * 2;
      pts.push({ x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r });
    }
    return pts;
  }

  function makeStarShape() {
    const cx = drawingCanvas.width * 0.5;
    const cy = drawingCanvas.height * 0.42;
    const outerR = Math.min(drawingCanvas.width, drawingCanvas.height) * 0.22;
    const innerR = outerR * 0.42;
    const pts = [];
    for (let i = 0; i <= 10; i++) {
      const a = (i / 10) * Math.PI * 2 - Math.PI / 2;
      const r = i % 2 === 0 ? outerR : innerR;
      pts.push({ x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r });
    }
    return pts;
  }

  function makeTriangleShape() {
    const cx = drawingCanvas.width * 0.5;
    const cy = drawingCanvas.height * 0.42;
    const r = Math.min(drawingCanvas.width, drawingCanvas.height) * 0.22;
    return [
      { x: cx, y: cy - r },
      { x: cx + r * 0.87, y: cy + r * 0.5 },
      { x: cx - r * 0.87, y: cy + r * 0.5 },
      { x: cx, y: cy - r }
    ];
  }

  const TRACE_SHAPES = [makeCircleShape, makeStarShape, makeTriangleShape];
  const TRACE_SHAPE_NAMES = ['Circle', 'Star', 'Triangle'];

  function startTraceRound() {
    traceRound++;
    const idx = (traceRound - 1) % TRACE_SHAPES.length;
    traceShape = TRACE_SHAPES[idx]();
    tracePlayerPoints = [];
    traceRoundActive = true;
    updateGameHUD();
  }

  function drawTraceShape() {
    if (!traceShape || !traceRoundActive) return;
    uiCtx.save();
    uiCtx.beginPath();
    uiCtx.setLineDash([10, 6]);
    uiCtx.moveTo(traceShape[0].x, traceShape[0].y);
    traceShape.forEach(p => uiCtx.lineTo(p.x, p.y));
    uiCtx.strokeStyle = 'rgba(255,255,255,0.22)';
    uiCtx.lineWidth = 3;
    uiCtx.shadowColor = '#ffffff';
    uiCtx.shadowBlur = 12;
    uiCtx.stroke();
    uiCtx.setLineDash([]);
    uiCtx.shadowBlur = 0;
    const idx = (traceRound - 1) % TRACE_SHAPE_NAMES.length;
    uiCtx.font = '13px Orbitron, monospace';
    uiCtx.fillStyle = 'rgba(255,255,255,0.35)';
    uiCtx.textAlign = 'center';
    uiCtx.fillText('Trace the ' + TRACE_SHAPE_NAMES[idx], drawingCanvas.width / 2, traceShape[0].y - 28);
    uiCtx.textAlign = 'start';
    uiCtx.restore();
  }

  function scoreTraceAttempt() {
    if (!traceRoundActive || tracePlayerPoints.length < 5) return;
    let totalDist = 0;
    const maxDist = Math.min(drawingCanvas.width, drawingCanvas.height) * 0.08;
    tracePlayerPoints.forEach(pp => {
      let nearest = Infinity;
      traceShape.forEach(sp => {
        const d = Math.hypot(pp.x - sp.x, pp.y - sp.y);
        if (d < nearest) nearest = d;
      });
      totalDist += Math.min(nearest, maxDist);
    });
    const avgDist = totalDist / tracePlayerPoints.length;
    const roundScore = Math.round(Math.max(0, 100 - (avgDist / maxDist) * 100));
    traceScore += roundScore;
    traceRoundActive = false;
    updateGameHUD();
    setTimeout(() => {
      const msg = roundScore >= 85 ? '⭐ Perfect!' : roundScore >= 65 ? '✓ Good!' : 'Try again';
      alert(msg + '  Round score: ' + roundScore + '/100');
      if (traceMode) startTraceRound();
    }, 300);
  }

  /* ============================================================
     7. GESTURE DETECTION
  ============================================================ */
  function isFingerUp(lm, tipIdx, pipIdx) {
    return lm[tipIdx].y < lm[pipIdx].y;
  }

  function getPinchDist(lm) {
    return Math.hypot(lm[4].x - lm[8].x, lm[4].y - lm[8].y);
  }

  function rawGesture(lm) {
    const indexUp  = isFingerUp(lm, 8, 6);
    const middleUp = isFingerUp(lm, 12, 10);
    const ringUp   = isFingerUp(lm, 16, 14);
    const pinkyUp  = isFingerUp(lm, 20, 18);
    const thumbUp  = isFingerUp(lm, 4, 3);

    const pinchDist = getPinchDist(lm);

    // Priority order
    if (thumbUp && !indexUp && !middleUp && !ringUp && !pinkyUp) return 'THUMBS_UP';
    const threeFingers = indexUp && middleUp && ringUp && !pinkyUp;
    if (threeFingers) return 'LINE';
    if (indexUp && pinkyUp && !middleUp && !ringUp)                 return 'SPRAY';
    if (indexUp && middleUp && ringUp && pinkyUp)                   return 'WAVE';
    if (indexUp && middleUp && !ringUp && !pinkyUp)                return 'ERASE';
    if (pinchDist < 0.06)                                          return 'PINCH';
    if (indexUp && !middleUp)                                      return 'DRAW';
    return 'IDLE';
  }

  function smoothGesture(raw) {
    gestureHistory.push(raw);
    if (gestureHistory.length > GESTURE_FRAMES) {
      gestureHistory.shift();
    }
    // Majority vote
    const counts = {};
    gestureHistory.forEach(g => { counts[g] = (counts[g] || 0) + 1; });
    return Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0];
  }

  /* ============================================================
     8. HUD UPDATE
  ============================================================ */
  const GESTURE_META = {
    'IDLE':      { emoji: '✊', label: 'Idle',      cls: '' },
    'DRAW':      { emoji: '☝️', label: 'Drawing',   cls: 'drawing' },
    'ERASE':     { emoji: '✋', label: 'Erasing',   cls: 'erasing' },
    'PINCH':     { emoji: '🤏', label: 'Paused',   cls: '' },
    'WAVE':      { emoji: '👋', label: 'Wave',      cls: '' },
    'SPRAY':     { emoji: '🤘', label: 'Spray',     cls: 'spraying' },
    'LINE':      { emoji: '📏', label: 'Line',      cls: 'lining' },
    'THUMBS_UP': { emoji: '👍', label: 'Thumbs Up', cls: '' }
  };

  function updateHUD(gesture) {
    const meta = GESTURE_META[gesture] || GESTURE_META['IDLE'];
    gestureHud.querySelector('.gesture-emoji').textContent = meta.emoji;
    gestureHud.querySelector('.gesture-label').textContent = meta.label;

    // Reset classes then apply new
    gestureHud.className = '';
    if (meta.cls) gestureHud.classList.add(meta.cls);
  }

  /* ============================================================
     9. HAND SKELETON
  ============================================================ */
  const HAND_CONNECTIONS = [
    [0, 1], [1, 2], [2, 3], [3, 4],
    [0, 5], [5, 6], [6, 7], [7, 8],
    [0, 9], [9, 10], [10, 11], [11, 12],
    [0, 13], [13, 14], [14, 15], [15, 16],
    [0, 17], [17, 18], [18, 19], [19, 20],
    [5, 9], [9, 13], [13, 17]
  ];

  const LANDMARK_COLORS = [
    '#00f0ff', '#ff00ff', '#00ff00', '#ffff00',
    '#ff6b00', '#0088ff', '#ff69b4', '#ffd700',
    '#9932cc', '#00ffff', '#ff3232', '#66ff66',
    '#ffe066', '#ff9966', '#66ccff', '#cc66ff',
    '#ff66cc', '#66ffcc', '#ffcc66', '#6666ff',
    '#ff6666'
  ];

  function lmToCanvas(lm, w, h) {
    // Returns array of {x, y} in canvas coordinates
    return lm.map(p => ({
      x: p.x * w,
      y: p.y * h
    }));
  }

  function drawHandOverlay(lm, gesture) {
    const w = uiCanvas.width;
    const h = uiCanvas.height;
    const pts = lmToCanvas(lm, w, h);

    ctxUI.clearRect(0, 0, w, h);

    // Draw connections
    HAND_CONNECTIONS.forEach(([a, b]) => {
      ctxUI.save();
      ctxUI.strokeStyle = 'rgba(0, 240, 255, 0.5)';
      ctxUI.lineWidth   = 1.5;
      ctxUI.lineCap     = 'round';
      ctxUI.beginPath();
      ctxUI.moveTo(pts[a].x, pts[a].y);
      ctxUI.lineTo(pts[b].x, pts[b].y);
      ctxUI.stroke();
      ctxUI.restore();
    });

    // Draw landmarks
    pts.forEach((pt, i) => {
      ctxUI.save();
      ctxUI.fillStyle = LANDMARK_COLORS[i % LANDMARK_COLORS.length];
      ctxUI.shadowColor = LANDMARK_COLORS[i % LANDMARK_COLORS.length];
      ctxUI.shadowBlur  = 8;
      ctxUI.beginPath();
      ctxUI.arc(pt.x, pt.y, i === 8 ? 8 : 4, 0, Math.PI * 2);
      ctxUI.fill();
      ctxUI.restore();
    });
  }

  /* ============================================================
     10. MEDIAPIPE RESULT HANDLER
  ============================================================ */
  function onHandResults(results) {
    const w = cameraCanvas.width;
    const h = cameraCanvas.height;

    // FPS tracking
    fpsFrameCount++;
    const now = performance.now();
    if (now - fpsLastTime >= 1000) {
      fpsValue = fpsFrameCount;
      fpsFrameCount = 0;
      fpsLastTime = now;
      fpsCounter.textContent = 'FPS: ' + fpsValue;
    }

    // Camera feed — normal (not mirrored)
    if (showCamera && results.image) {
      ctxCamera.drawImage(results.image, 0, 0, w, h);
    } else {
      ctxCamera.clearRect(0, 0, w, h);
    }

    // No hand detected
    if (!results.multiHandLandmarks || !results.multiHandLandmarks.length) {
      ctxUI.clearRect(0, 0, w, h);
      commitStroke();
      updateHUD('IDLE');
      cursorDot.style.display = 'none';
      return;
    }

    const lm = results.multiHandLandmarks[0];

    // Index fingertip (landmark 8) in canvas coords — normal
    const cx = lm[8].x * w;
    const cy = lm[8].y * h;

    // Move cursor dot
    cursorDot.style.display = 'block';
    cursorDot.style.left    = cx + 'px';
    cursorDot.style.top     = cy + 'px';
    cursorDot.style.background = currentColor;
    cursorDot.style.boxShadow   = `0 0 12px ${currentColor}, 0 0 24px ${currentColor}80`;

    // Gesture detection
    const raw     = rawGesture(lm);
    const gesture = smoothGesture(raw);

    updateHUD(gesture);
    drawHandOverlay(lm, gesture);

    // Gesture actions
    if (gesture === 'DRAW') {
      if (lastX !== null && lastY !== null) {
        drawSegment(ctxDraw, lastX, lastY, cx, cy, currentColor, thickness, glowAmount);
        emitParticles(cx, cy, currentColor);
        currentStroke.push({ x: lastX, y: lastY });
        currentStroke.push({ x: cx,    y: cy    });
      }
      lastX = cx;
      lastY = cy;

      // Trace the Shape — collect player points
      if (traceMode && traceRoundActive) {
        tracePlayerPoints.push({ x: cx, y: cy });
      }

      // Connect the Dots hit check
      if (gameMode === 'connect_dots' && nextDotIndex < dotTargets.length) {
        const target = dotTargets[nextDotIndex];
        const dist = Math.hypot(cx - target.x, cy - target.y);
        if (dist < 32) {
          target.done = true;
          if (prevDotX !== null) {
            const accuracy = Math.max(0, 100 - Math.round(dist));
            gameScore += accuracy;
          }
          prevDotX = target.x; prevDotY = target.y;
          nextDotIndex++;
          updateGameHUD();
          if (nextDotIndex >= dotTargets.length) {
            setTimeout(() => {
              gameMode = null;
              updateGameHUD();
              alert('Game Over! Score: ' + gameScore);
            }, 800);
          }
        }
      }

    } else if (gesture === 'ERASE') {
      // Use middle fingertip (landmark 9) for eraser position
      const erX = lm[9].x * w;
      const erY = lm[9].y * h;
      eraseAt(erX, erY, 40);
      lastX = null;
      lastY = null;

    } else if (gesture === 'SPRAY') {
      sprayPaint(cx, cy);
      currentStroke.push({ x: cx, y: cy });
      lastX = cx; lastY = cy;
    } else if (gesture === 'LINE') {
      if (!inLineDraw) {
        lineStartX = cx;
        lineStartY = cy;
        inLineDraw = true;
      }
      drawLinePreview(lineStartX, lineStartY, cx, cy);
    } else {
      if (inLineDraw) {
        if (lineStartX !== null) {
          drawSegment(ctxDraw, lineStartX, lineStartY, lastX || cx, lastY || cy,
            currentColor, thickness, glowAmount);
          allStrokes.push({
            color: currentColor, lw: thickness, glow: glowAmount,
            points: [{ x: lineStartX, y: lineStartY }, { x: lastX || cx, y: lastY || cy }]
          });
        }
        lineStartX = null; lineStartY = null; inLineDraw = false;
      }
      if (airWritingMode && currentStroke.length > 4) {
        const norm = normalizeStroke(currentStroke);
        const letter = matchLetter(norm);
        if (letter) showRecognizedLetter(letter);
      }
      if (traceMode && traceRoundActive && currentStroke.length > 4) {
        scoreTraceAttempt();
      }
      if (gesture === 'PINCH' || gesture === 'IDLE' || gesture === 'THUMBS_UP' || gesture === 'WAVE') {
        commitStroke();
      }
    }

    updateAndDrawParticles();
    if (gameMode === 'connect_dots') drawDotTargets();
    if (traceMode) drawTraceShape();
    if (airWritingMode && recognizedText) {
      uiCtx.save();
      uiCtx.font = 'bold 28px Orbitron, monospace';
      uiCtx.fillStyle = '#ffd700';
      uiCtx.shadowColor = '#ffd700';
      uiCtx.shadowBlur = 20;
      uiCtx.textAlign = 'center';
      uiCtx.fillText(recognizedText, uiCanvas.width / 2, uiCanvas.height - 80);
      uiCtx.textAlign = 'start';
      uiCtx.shadowBlur = 0;
      uiCtx.restore();
    }
  }

  /* ============================================================
     11. MEDIAPIPE INIT
  ============================================================ */
  let hands;
  let camera;

  function initMediaPipe() {
    // Guard: if MediaPipe globals aren't loaded, bail gracefully
    if (typeof Hands === 'undefined' || typeof Camera === 'undefined') {
      console.warn('MediaPipe not loaded — check CDN access');
      return;
    }
    try {
      hands = new Hands({
        locateFile: function (file) {
          return `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`;
        }
      });

      hands.setOptions({
        maxNumHands:          1,
        modelComplexity:      1,
        minDetectionConfidence: 0.72,
        minTrackingConfidence:  0.65
      });

      hands.onResults(onHandResults);

      camera = new Camera(webcam, {
        onFrame: async () => {
          await hands.send({ image: webcam });
        },
        width:  1280,
        height: 720
      });

      camera.start().catch(err => {
        console.warn('Camera start failed:', err);
      });
    } catch (e) {
      console.warn('MediaPipe init error:', e);
    }
  }

  /* ============================================================
     12. BOOT
  ============================================================ */
  resizeCanvases();

  // Always hide loading screen after 4s, even if MediaPipe fails
  setTimeout(() => {
    loadingScr.style.display = 'none';
    onboarding.classList.remove('hidden');
  }, 4000);

  // Try to init MediaPipe, but don't block if it fails
  try {
    setTimeout(initMediaPipe, 500);
  } catch (e) {
    console.warn('MediaPipe init deferred:', e);
  }

})();
