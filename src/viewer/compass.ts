export function drawCompass (yaw: number, pitch: number) {
  const size = 90;
  const dpr = window.devicePixelRatio || 1;

  const compass = document.getElementById('compass-canvas') as HTMLCanvasElement | null;
  let ctx: CanvasRenderingContext2D | null = null;
  if (!compass) {
    const c = document.createElement('canvas');
    c.id = 'compass-canvas';
    c.style.cssText = 'position:fixed;bottom:16px;right:16px;pointer-events:none;z-index:50';
    document.body.appendChild(c);
    ctx = c.getContext('2d');
  } else {
    ctx = compass.getContext('2d');
  }
  if (!ctx) return;

  const el = compass || document.getElementById('compass-canvas')!;
  (el as HTMLCanvasElement).width = size * dpr;
  (el as HTMLCanvasElement).height = size * dpr;
  (el as HTMLCanvasElement).style.width = size + 'px';
  (el as HTMLCanvasElement).style.height = size + 'px';

  ctx.clearRect(0, 0, size * dpr, size * dpr);
  ctx.save();
  ctx.scale(dpr, dpr);
  ctx.translate(size / 2, size / 2);

  // Background circle
  ctx.beginPath();
  ctx.arc(0, 0, size / 2 - 4, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(0,0,0,0.6)';
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.3)';
  ctx.lineWidth = 1;
  ctx.stroke();

  // Yaw needle (rotate to show which way is north)
  ctx.rotate(-yaw);

  const labels: [string, number, string][] = [
    ['N', 0, '#ff4444'],
    ['E', Math.PI / 2, '#aaa'],
    ['S', Math.PI, '#fff'],
    ['W', -Math.PI / 2, '#aaa'],
  ];

  ctx.font = 'bold 12px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  for (const [label, angle, color] of labels) {
    ctx.save();
    ctx.rotate(angle);
    ctx.translate(0, -(size / 2 - 14));
    ctx.fillStyle = color;
    ctx.fillText(label, 0, 0);
    ctx.restore();
  }

  // Up / Down indicators (based on pitch)
  ctx.rotate(yaw); // reset rotation
  ctx.font = '10px sans-serif';
  ctx.fillStyle = pitch > 0.5 ? '#88ff88' : '#666';
  ctx.fillText('U', 0, -(size / 2 - 14) * 0.7);
  ctx.fillStyle = pitch < -0.5 ? '#ff8888' : '#666';
  ctx.fillText('D', 0, (size / 2 - 14) * 0.7);

  // Center dot
  ctx.beginPath();
  ctx.arc(0, 0, 2, 0, Math.PI * 2);
  ctx.fillStyle = '#fff';
  ctx.fill();

  ctx.restore();
}
