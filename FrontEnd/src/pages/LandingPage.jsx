import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';

import handOne from "../assets/hand-1.png";
import handTwo from "../assets/hand-2.png";
import "../styles/landing.css";

// Adapted from React Bits CircularCarousel (license in landing.css): https://github.com/DavidHDev/react-bits



const PRESETS = {
  cylinder: {
    axis: 'y',
    tilt: -5,
    perspective: 2500,
    curve: 1,
    spread: 1,
    inward: false,
    billboard: false,
    backfaces: true,
    window: 0
  },
  orbit: {
    axis: 'y',
    tilt: -16,
    perspective: 1500,
    curve: 0,
    spread: 1.45,
    inward: false,
    billboard: true,
    backfaces: false,
    window: 0
  },
  wheel: {
    axis: 'x',
    tilt: 0,
    perspective: 1800,
    curve: 0,
    spread: 1,
    inward: false,
    billboard: false,
    backfaces: true,
    window: 1.7
  },
  panorama: {
    axis: 'y',
    tilt: 0,
    perspective: 0,
    curve: 1,
    spread: 1,
    inward: true,
    billboard: false,
    backfaces: false,
    window: 0
  }
};

const INTRO_LENGTH = { assemble: 1500, rise: 1400, spin: 1800, none: 0 };
const DRAG_THRESHOLD = 5;
const SPRING = 118;
const SETTLE_SPEED = 9;
const CAPTION_SPACE = 76;
const TO_RAD = Math.PI / 180;

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const wrap = degrees => ((((degrees + 180) % 360) + 360) % 360) - 180;
const easeOut = t => 1 - Math.pow(1 - t, 4);
const easeOutQuint = t => 1 - Math.pow(1 - t, 5);

const rotateX = (p, degrees) => {
  const r = degrees * TO_RAD;
  const c = Math.cos(r);
  const s = Math.sin(r);
  return [p[0], p[1] * c - p[2] * s, p[1] * s + p[2] * c];
};

const rotateY = (p, degrees) => {
  const r = degrees * TO_RAD;
  const c = Math.cos(r);
  const s = Math.sin(r);
  return [p[0] * c + p[2] * s, p[1], -p[0] * s + p[2] * c];
};

const Digits = ({ value }) => (
  <span className="circular-carousel__digits">
    {String(value)
      .padStart(2, '0')
      .split('')
      .map((digit, index) => (
        <span key={index} className="circular-carousel__digit">
          <span className="circular-carousel__reel" style={{ transform: `translateY(${-Number(digit) * 10}%)` }}>
            {'0123456789'.split('').map(n => (
              <span key={n}>{n}</span>
            ))}
          </span>
        </span>
      ))}
  </span>
);

const usePrefersReducedMotion = () => {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const query = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    if (!query) return undefined;
    const update = () => setReduced(query.matches);
    update();
    query.addEventListener?.('change', update);
    return () => query.removeEventListener?.('change', update);
  }, []);
  return reduced;
};

const CircularCarousel = ({
  items = [],
  preset = 'cylinder',
  intro = 'rise',
  cardWidth = 220,
  aspectRatio = 1,
  gap = 25,
  curve,
  tilt,
  perspective,
  autoplay = 'drift',
  speed = 14,
  interval = 3,
  direction = 'left',
  draggable = true,
  momentum = 0.6,
  snap = true,
  pauseOnHover = true,
  focusOnClick = true,
  parallax = 0.3,
  stretch = 0.5,
  depthFade = 0.55,
  fadeColor = '#000000',
  innerShade = 0.6,
  cornerRadius = 12,
  captions = false,
  onChange,
  onItemClick,
  ariaLabel = "Workflow steps",
  className = '',
  style
}) => {
  const list = items;
  const count = list.length;
  const shape = PRESETS[preset] ? preset : 'cylinder';
  const layout = PRESETS[shape];
  const axis = layout.axis;
  const tiltValue = tilt ?? layout.tilt;
  const curveValue = layout.billboard ? 0 : clamp(curve ?? layout.curve, 0, 1);
  const reduced = usePrefersReducedMotion();

  const cardW = Math.max(40, cardWidth);
  const cardH = cardW / clamp(aspectRatio, 0.2, 5);
  const along = axis === 'x' ? cardH : cardW;
  const step = 360 / count;

  const radius = useMemo(() => {
    const n = Math.max(count, 3);
    const pitch = (along + gap) * layout.spread;
    const chord = pitch / (2 * Math.sin(Math.PI / n));
    const arc = (n * pitch) / (2 * Math.PI);
    return Math.max(chord + (arc - chord) * curveValue, along * 0.6);
  }, [count, along, gap, curveValue, layout.spread]);

  const rootRef = useRef(null);
  const stageRef = useRef(null);
  const cameraRef = useRef(null);
  const ringRef = useRef(null);
  const cardRefs = useRef([]);
  const wakeRef = useRef(() => {});
  const measureRef = useRef(() => {});
  const activeRef = useRef(0);
  const [active, setActive] = useState(0);
  const [ready] = useState(true);
  const [dragging, setDragging] = useState(false);
  const readyRef = useRef(false);
  useLayoutEffect(() => { readyRef.current = ready; }, [ready]);

  const stateRef = useRef({
    angle: 0,
    velocity: 0,
    target: null,
    dir: 0,
    press: null,
    drag: false,
    hover: false,
    pointer: { inside: false, x: 0, y: 0 },
    yaw: 0,
    pitch: 0,
    intro: null,
    introDone: false,
    holdUntil: 0,
    stepAt: 0,
    suppressClick: false,
    wheelTimer: 0,
    fit: 1,
    shift: 0,
    drop: 0,
    last: 0
  });

  const settings = {
    count,
    step,
    radius,
    layout,
    axis,
    tilt: tiltValue,
    perspective: layout.inward ? radius : (perspective ?? layout.perspective),
    cardW,
    cardH,
    intro: reduced ? 'none' : intro in INTRO_LENGTH ? intro : 'rise',
    autoplay: reduced ? 'off' : autoplay,
    speed,
    interval: Math.max(0.5, interval),
    draggable,
    momentum: clamp(momentum, 0, 1),
    snap,
    pauseOnHover,
    parallax: reduced ? 0 : clamp(parallax, 0, 1),
    stretch: reduced ? 0 : clamp(stretch, 0, 1),
    depthFade: clamp(depthFade, 0, 1),
    captions,
    reduced
  };
  const settingsRef = useRef(settings);
  useLayoutEffect(() => { settingsRef.current = settings; });

  const onChangeRef = useRef(onChange);
  useLayoutEffect(() => { onChangeRef.current = onChange; }, [onChange]);

  const dragSign = layout.inward ? -1 : 1;
  const directionSign = (direction === 'right' ? 1 : -1) * dragSign;

  useEffect(() => {
    stateRef.current.dir = directionSign;
    wakeRef.current();
  }, [directionSign]);

  useLayoutEffect(() => {
    const root = rootRef.current;
    const stage = stageRef.current;
    const camera = cameraRef.current;
    const ring = ringRef.current;
    if (!root || !stage || !camera || !ring) return undefined;
    const state = stateRef.current;
    let raf = 0;
    let visible = true;

    const nearest = angle => Math.round(angle / settingsRef.current.step) * settingsRef.current.step;

    const measure = () => {
      const s = settingsRef.current;
      const rect = root.getBoundingClientRect();
      if (!rect.width || !rect.height) return;
      const room = s.captions ? CAPTION_SPACE : 0;
      const width = rect.width * 0.94;
      const height = (rect.height - room) * 0.92;
      const P = s.perspective;
      let minX = Infinity;
      let maxX = -Infinity;
      let minY = Infinity;
      let maxY = -Infinity;
      if (s.layout.inward) {
        minX = -width / 2;
        maxX = width / 2;
        minY = -s.cardH / 2;
        maxY = s.cardH / 2;
      } else {
        const corners = [
          [-s.cardW / 2, -s.cardH / 2],
          [s.cardW / 2, -s.cardH / 2],
          [-s.cardW / 2, s.cardH / 2],
          [s.cardW / 2, s.cardH / 2]
        ];
        const limit = s.layout.window ? s.layout.window * s.step : 180;
        for (let a = -limit; a <= limit; a += limit / 24) {
          for (const [cx, cy] of corners) {
            let p;
            if (s.axis === 'x') {
              p = rotateY(rotateX([cx, cy, s.radius], -a), s.tilt);
            } else if (s.layout.billboard) {
              const c = rotateY([0, 0, s.radius], a);
              p = rotateX([c[0] + cx, cy, c[2]], s.tilt);
            } else {
              p = rotateX(rotateY([cx, cy, s.radius], a), s.tilt);
            }
            p = [p[0], p[1], p[2] - s.radius];
            if (p[2] >= P * 0.95) continue;
            const k = P / (P - p[2]);
            minX = Math.min(minX, p[0] * k);
            maxX = Math.max(maxX, p[0] * k);
            minY = Math.min(minY, p[1] * k);
            maxY = Math.max(maxY, p[1] * k);
          }
        }
      }
      const spanX = Math.max(maxX - minX, 1);
      const spanY = Math.max(maxY - minY, 1);
      const fit = s.layout.billboard ? Math.min(1, Math.max(0.85, width / spanX), height / spanY) : Math.min(1, width / spanX, height / spanY);
      state.fit = fit;
      state.shift = -((minY + maxY) / 2) * fit - room / 2;
      state.drop = s.axis === 'x' ? (rect.width / fit) * 0.55 + s.cardW : (rect.height / fit) * 0.55 + s.cardH;
      stage.style.perspective = `${P}px`;
      stage.style.transform = `translate3d(0, ${state.shift}px, 0) scale(${fit})`;
    };
    measureRef.current = measure;

    const introCard = (elapsed, landing) => {
      if (!state.intro) return { radius: 1, lift: 0 };
      const type = state.intro.type;
      const reach = Math.abs(wrap(landing + state.angle));
      if (type === 'assemble') {
        const delay = (reach / 180) * 420;
        const p = easeOut(clamp((elapsed - delay) / 1080, 0, 1));
        return { radius: 1 + 0.6 * (1 - p), lift: 0 };
      }
      if (type === 'rise') {
        const delay = (reach / 180) * 480;
        const p = easeOutQuint(clamp((elapsed - delay) / 900, 0, 1));
        return { radius: 1, lift: (1 - p) * state.drop };
      }
      if (type === 'spin') {
        const p = easeOut(clamp(elapsed / INTRO_LENGTH.spin, 0, 1));
        return { radius: 1 + 0.28 * (1 - p), lift: 0 };
      }
      return { radius: 1, lift: 0 };
    };

    const advance = (s, dt, now) => {
      if (!state.introDone && readyRef.current) {
        if (!state.intro) {
          if (s.intro === 'none') state.introDone = true;
          else state.intro = { type: s.intro, start: now };
        }
        if (state.intro && now - state.intro.start >= INTRO_LENGTH[state.intro.type]) {
          state.intro = null;
          state.introDone = true;
        }
      }

      const paused = (s.pauseOnHover && state.hover) || state.drag || now < state.holdUntil;
      const cruise = s.autoplay === 'drift' && !paused && !state.intro ? s.speed * state.dir : 0;
      let busy = Boolean(state.intro) || state.drag;

      if (state.drag || state.intro) {
        state.velocity = state.drag ? state.velocity : 0;
      } else if (state.target !== null) {
        let remaining = dt;
        const damping = 2 * Math.sqrt(SPRING);
        while (remaining > 0) {
          const h = Math.min(remaining, 1 / 240);
          const accel = SPRING * (state.target - state.angle) - damping * state.velocity;
          state.velocity += accel * h;
          state.angle += state.velocity * h;
          remaining -= h;
        }
        if (Math.abs(state.target - state.angle) < 0.004 && Math.abs(state.velocity) < 0.03) {
          state.angle = state.target;
          state.velocity = 0;
          state.target = null;
        }
        busy = true;
      } else {
        const tau = 0.18 + s.momentum * 1.5;
        state.velocity += (cruise - state.velocity) * (1 - Math.exp(-dt / tau));
        state.angle += state.velocity * dt;
        if (cruise === 0 && s.snap && Math.abs(state.velocity) < SETTLE_SPEED) {
          const target = nearest(state.angle);
          if (Math.abs(target - state.angle) > 0.004) state.target = target;
          else { state.angle = target; state.velocity = 0; }
        }
        busy = busy || cruise !== 0 || Math.abs(state.velocity) > 0.01 || state.target !== null;
      }

      if (s.autoplay === 'step' && !paused && !state.intro && state.introDone) {
        if (!state.stepAt) state.stepAt = now + s.interval * 1000;
        if (now >= state.stepAt) {
          state.target = (state.target ?? nearest(state.angle)) + s.step * state.dir;
          state.stepAt = now + s.interval * 1000;
        }
        busy = true;
      } else {
        state.stepAt = 0;
      }

      if (now < state.holdUntil) busy = true;

      const ease = 1 - Math.exp(-dt / 0.35);
      const aimYaw = state.pointer.inside ? state.pointer.x * s.parallax * 9 : 0;
      const aimPitch = state.pointer.inside ? -state.pointer.y * s.parallax * 6 : 0;
      state.yaw += (aimYaw - state.yaw) * ease;
      state.pitch += (aimPitch - state.pitch) * ease;
      if (Math.abs(aimYaw - state.yaw) > 0.01 || Math.abs(aimPitch - state.pitch) > 0.01) busy = true;

      return busy;
    };

    const render = (s, now) => {
      const elapsed = state.intro ? now - state.intro.start : 0;
      const swell = 1 + s.stretch * 0.12 * Math.min(1, Math.abs(state.velocity) / 420);
      let spinOffset = 0;
      if (state.intro?.type === 'spin') {
        const p = easeOut(clamp(elapsed / INTRO_LENGTH.spin, 0, 1));
        spinOffset = -300 * state.dir * (1 - p);
      } else if (state.intro?.type === 'assemble') {
        const p = easeOut(clamp(elapsed / INTRO_LENGTH.assemble, 0, 1));
        spinOffset = -32 * state.dir * (1 - p);
      }
      const angle = state.angle + spinOffset;
      const R = s.radius * swell;

      if (s.axis === 'x') {
        camera.style.transform = `translate3d(0, 0, ${-R}px) rotateY(${s.tilt + state.yaw}deg) rotateX(${state.pitch}deg)`;
        ring.style.transform = `rotateX(${-angle}deg)`;
      } else if (s.layout.inward) {
        camera.style.transform = `translate3d(0, 0, ${s.perspective - 1}px) rotateX(${s.tilt + state.pitch}deg) rotateY(${state.yaw}deg)`;
        ring.style.transform = `rotateY(${angle}deg)`;
      } else {
        camera.style.transform = `translate3d(0, 0, ${-R}px) rotateX(${s.tilt + state.pitch}deg) rotateY(${state.yaw}deg)`;
        ring.style.transform = `rotateY(${angle}deg)`;
      }

      for (let index = 0; index < s.count; index++) {
        const card = cardRefs.current[index];
        if (!card) continue;
        const base = index * s.step;
        const mod = introCard(elapsed, base);
        const r = R * mod.radius;
        let transform;
        if (s.axis === 'x') {
          transform = `rotateX(${-base}deg) translateZ(${r}px)`;
        } else if (s.layout.inward) {
          transform = `rotateY(${base}deg) translateZ(${-r}px)`;
        } else {
          transform = `rotateY(${base}deg) translateZ(${r}px)`;
          if (s.layout.billboard) transform += ` rotateY(${-(base + angle)}deg)`;
        }
        if (mod.lift) transform += s.axis === 'x' ? ` translateX(${mod.lift}px)` : ` translateY(${mod.lift}px)`;
        card.style.transform = transform;

        const world = wrap(base + angle);
        const facing = Math.cos(world * TO_RAD);
        if (s.layout.inward) card.style.visibility = Math.abs(world) > 86 ? 'hidden' : '';
        const fade = s.depthFade * Math.pow((1 - facing) / 2, 1.25);
        card.style.setProperty('--cc-depth', fade.toFixed(3));
      }

      const index = ((Math.round(-state.angle / s.step) % s.count) + s.count) % s.count || 0;
      if (index !== activeRef.current) {
        activeRef.current = index;
        setActive(index);
        onChangeRef.current?.(index);
      }
    };

    const frame = now => {
      raf = 0;
      const s = settingsRef.current;
      const dt = state.last ? Math.min((now - state.last) / 1000, 0.05) : 1 / 60;
      state.last = now;
      const busy = advance(s, dt, now);
      render(s, now);
      if (busy && visible && !document.hidden) raf = requestAnimationFrame(frame);
      else state.last = 0;
    };

    const wake = () => {
      if (!raf && visible && !document.hidden) raf = requestAnimationFrame(frame);
    };
    wakeRef.current = wake;

    const onVisibility = () => {
      if (document.hidden) {
        cancelAnimationFrame(raf);
        raf = 0;
        state.last = 0;
      } else wake();
    };

    const resize = new ResizeObserver(() => {
      measure();
      wake();
    });
    resize.observe(root);

    const io = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
      if (visible) wake();
      else {
        cancelAnimationFrame(raf);
        raf = 0;
        state.last = 0;
      }
    });
    io.observe(root);

    const onWheel = event => {
      const s = settingsRef.current;
      if (!s.draggable) return;
      const delta = Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : 0;
      if (!delta) return;
      event.preventDefault();
      const perPixel = 180 / (Math.PI * s.radius * state.fit);
      state.target = null;
      state.angle -= delta * perPixel * (s.layout.inward ? -1 : 1);
      state.velocity = -delta * perPixel * (s.layout.inward ? -1 : 1) * 30;
      state.holdUntil = performance.now() + 1600;
      clearTimeout(state.wheelTimer);
      state.wheelTimer = setTimeout(() => {
        if (settingsRef.current.snap) state.target = nearest(state.angle + state.velocity * 0.12);
        wake();
      }, 140);
      wake();
    };
    root.addEventListener('wheel', onWheel, { passive: false });
    document.addEventListener('visibilitychange', onVisibility);

    measure();
    render(settingsRef.current, performance.now());
    wake();

    return () => {
      cancelAnimationFrame(raf);
      resize.disconnect();
      io.disconnect();
      clearTimeout(state.wheelTimer);
      root.removeEventListener('wheel', onWheel);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, []);

  useLayoutEffect(() => {
    measureRef.current();
    wakeRef.current();
  }, [radius, cardW, cardH, tiltValue, perspective, preset, captions, count]);

  useEffect(() => {
    wakeRef.current();
  });

  const focusIndex = useCallback(index => {
    const state = stateRef.current;
    const s = settingsRef.current;
    let target = -index * s.step;
    target += 360 * Math.round((state.angle - target) / 360);
    if (s.reduced) { state.angle = target; state.velocity = 0; state.target = null; }
    else state.target = target;
    state.holdUntil = performance.now() + 2800;
    wakeRef.current();
  }, []);

  const stepBy = useCallback(delta => {
    const state = stateRef.current;
    const s = settingsRef.current;
    const base = state.target ?? Math.round(state.angle / s.step) * s.step;
    const target = base - delta * s.step * (s.layout.inward ? -1 : 1);
    if (s.reduced) { state.angle = target; state.velocity = 0; state.target = null; }
    else state.target = target;
    state.holdUntil = performance.now() + 2800;
    wakeRef.current();
  }, []);

  const updatePointer = event => {
    const rect = rootRef.current.getBoundingClientRect();
    const pointer = stateRef.current.pointer;
    pointer.x = clamp(((event.clientX - rect.left) / rect.width) * 2 - 1, -1, 1);
    pointer.y = clamp(((event.clientY - rect.top) / rect.height) * 2 - 1, -1, 1);
  };

  const handlePointerDown = event => {
    const state = stateRef.current;
    if (event.target.closest("button")) return;
    state.suppressClick = false;
    if (!draggable || event.button !== 0) return;
    state.press = {
      id: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      angle: state.angle,
      moved: false,
      origin: 0,
      samples: [{ time: performance.now(), angle: state.angle }]
    };
  };

  const handlePointerMove = event => {
    const state = stateRef.current;
    if (event.pointerType === 'mouse') {
      state.pointer.inside = true;
      updatePointer(event);
    }
    const press = state.press;
    if (!press || press.id !== event.pointerId) {
      wakeRef.current();
      return;
    }
    const s = settingsRef.current;
    const delta = s.axis === 'x' ? event.clientY - press.y : event.clientX - press.x;
    const cross = s.axis === 'x' ? event.clientX - press.x : event.clientY - press.y;
    if (!press.moved) {
      if (Math.abs(delta) < DRAG_THRESHOLD) return;
      if (Math.abs(cross) > Math.abs(delta) * 1.2 && event.pointerType !== 'mouse') {
        state.press = null;
        return;
      }
      press.moved = true;
      press.origin = delta;
      state.drag = true;
      state.target = null;
      state.velocity = 0;
      setDragging(true);
      try {
        rootRef.current.setPointerCapture(event.pointerId);
      } catch {}
    }
    const perPixel = 180 / (Math.PI * s.radius * state.fit);
    state.angle = press.angle + (delta - press.origin) * perPixel * (s.layout.inward ? -1 : 1);
    const now = performance.now();
    press.samples.push({ time: now, angle: state.angle });
    while (press.samples.length > 2 && now - press.samples[0].time > 110) press.samples.shift();
    wakeRef.current();
  };

  const releasePointer = event => {
    const state = stateRef.current;
    const press = state.press;
    if (!press || press.id !== event.pointerId) return;
    state.press = null;
    if (!press.moved) return;
    state.drag = false;
    setDragging(false);
    state.suppressClick = true;
    const s = settingsRef.current;
    const first = press.samples[0];
    const last = press.samples[press.samples.length - 1];
    const span = (last.time - first.time) / 1000;
    const velocity = span > 0.008 ? clamp((last.angle - first.angle) / span, -1400, 1400) : 0;
    state.velocity = velocity;
    if (Math.abs(velocity) > 60) state.dir = Math.sign(velocity);
    const coasting = s.autoplay === 'drift' && !(s.pauseOnHover && state.hover && event.pointerType === 'mouse');
    if (s.snap && !coasting) {
      const tau = 0.18 + s.momentum * 1.5;
      const target = Math.round((state.angle + (s.reduced ? 0 : velocity * tau * 0.55)) / s.step) * s.step;
      if (s.reduced) { state.angle = target; state.velocity = 0; state.target = null; }
      else state.target = target;
    }
    wakeRef.current();
  };

  const handlePointerEnter = event => {
    if (event.pointerType !== 'mouse') return;
    stateRef.current.hover = true;
    wakeRef.current();
  };

  const handlePointerLeave = event => {
    const state = stateRef.current;
    if (event.pointerType === 'mouse') {
      state.hover = false;
      state.pointer.inside = false;
    }
    wakeRef.current();
  };

  const handleClick = event => {
    const state = stateRef.current;
    if (state.suppressClick) {
      state.suppressClick = false;
      return;
    }
    const card = event.target.closest?.('[data-cc-index]');
    if (!card) return;
    const index = Number(card.getAttribute('data-cc-index'));
    if (focusOnClick) focusIndex(index);
    onItemClick?.(list[index], index);
  };

  const handleKeyDown = event => {
    if (event.target.closest("button")) return;
    const forward = axis === 'x' ? 'ArrowDown' : 'ArrowRight';
    const backward = axis === 'x' ? 'ArrowUp' : 'ArrowLeft';
    if (event.key === forward) stepBy(1);
    else if (event.key === backward) stepBy(-1);
    else if (event.key === 'Home') focusIndex(0);
    else if (event.key === 'End') focusIndex(count - 1);
    else if (event.key === 'Enter' || event.key === ' ') onItemClick?.(list[activeRef.current], activeRef.current);
    else return;
    event.preventDefault();
  };

  const current = list[active] || list[0];
  const label = current ? current.title || current.alt || `Step ${active + 1}` : '';

  return (
    <div
      ref={rootRef}
      className={`circular-carousel ${className}`.trim()}
      style={{
        ...style,
        '--cc-fade': fadeColor,
        '--cc-radius': `${Math.max(0, cornerRadius)}px`,
        '--cc-inner': (1 - clamp(innerShade, 0, 1)).toFixed(3)
      }}
      role="region"
      aria-roledescription="carousel"
      aria-label={ariaLabel}
      tabIndex={0}
      data-axis={axis}
      data-shape={shape}
      data-ready={ready ? '' : undefined}
      data-draggable={draggable ? '' : undefined}
      data-dragging={dragging ? '' : undefined}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={releasePointer}
      onPointerCancel={releasePointer}
      onPointerEnter={handlePointerEnter}
      onPointerLeave={handlePointerLeave}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
    >
      <div className="circular-carousel__view">
        <div ref={stageRef} className="circular-carousel__stage">
          <div ref={cameraRef} className="circular-carousel__camera">
            <div ref={ringRef} className="circular-carousel__ring">
              {list.map((item, index) => (
                <div
                  key={index}
                  ref={element => {
                    cardRefs.current[index] = element;
                  }}
                  className="circular-carousel__card"
                  data-cc-index={index}
                  role="group"
                  aria-roledescription="slide"
                  aria-label={`${item.title || item.alt || `Step ${index + 1}`}, ${index + 1} of ${count}`}
                >
                  <div className="circular-carousel__content" style={{ width: cardW, height: cardH, left: -cardW / 2, top: -cardH / 2 }}>
                    {item.content}
                    <div className="circular-carousel__shade" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
      {captions && current && (
        <div className="circular-carousel__caption" aria-hidden="true">
          <span key={active} className="circular-carousel__title">
            {current.title || current.alt}
            {current.subtitle && <span className="circular-carousel__subtitle">{current.subtitle}</span>}
          </span>
          <span className="circular-carousel__count">
            <Digits value={active + 1} />
            <span className="circular-carousel__slash">/</span>
            <span>{String(count).padStart(2, '0')}</span>
          </span>
        </div>
      )}
      <div className="circular-carousel__controls" aria-label="Carousel controls">
        <button type="button" onClick={() => stepBy(-1)}>Previous</button>
        <button type="button" onClick={() => stepBy(1)}>Next <span aria-hidden="true">?</span></button>
      </div>
      <div className="circular-carousel__live" aria-live="polite" aria-atomic="true">
        {`${label}, ${active + 1} of ${count}`}
      </div>
    </div>
  );
};




const steps = [
  { title: "Upload Project Knowledge", description: "Upload project documents, meeting notes, and important handover information into a centralized workspace." },
  { title: "Organize Information", description: "Handover Helper processes and organizes project knowledge so that relevant information can be retrieved when needed." },
  { title: "Generate Handover Guide", description: "Create a structured handover guide covering responsibilities, key contacts, decisions, and unfinished tasks." },
  { title: "Review & Approve", description: "The outgoing employee reviews the guide, corrects inaccuracies, and approves information before the handover." },
  { title: "Ask Your Project", description: "The incoming employee asks questions and uses the AI assistant to find relevant information from project documents." },
  { title: "Complete the Handover", description: "Identify remaining knowledge gaps, monitor transition readiness, and prepare the incoming employee to take over." }
];

const items = steps.map((step, index) => ({
  title: step.title,
  content: <article className="workflow-card"><div className="workflow-card-top"><span>Step {index + 1}</span></div><div><h2>{step.title}</h2><p>{step.description}</p></div></article>
}));



const FEATURES = [
  { title: "Centralized Knowledge Hub", description: "Organize project documents, meeting notes, and transition information in one workspace." },
  { title: "Handover Guides", description: "Structure responsibilities, decisions, contacts, and pending work into clear guides." },
  { title: "Ask Your Project", description: "Ask questions about project knowledge and find answers in relevant documents." },
  { title: "Review & Approval", description: "Review, correct, and approve handover information before responsibilities transfer." },
  { title: "Knowledge Gap Detection", description: "Identify missing documentation, unresolved questions, and incomplete details." },
  { title: "Handover Readiness", description: "Track handover progress and identify outstanding transition tasks." },
];

const THROW_MS = 650;
const RETURN_MS = 650;

function Features() {
  const [index, setIndex] = useState(0);
  const [target, setTarget] = useState(0);
  const [phase, setPhase] = useState("idle");
  const [reducedMotion, setReducedMotion] = useState(() => window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  const touchStart = useRef(null);
  const suppressCardClick = useRef(false);
  const deckRef = useRef(null);

  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = (event) => setReducedMotion(event.matches);
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  useEffect(() => {
    let timer;
    const delay = (duration) => reducedMotion ? 0 : duration;
    if (phase === "idle" && index === FEATURES.length) {
      timer = setTimeout(() => setPhase("regroup"), delay(80));
    } else if (phase === "idle" && target > index) {
      timer = setTimeout(() => setPhase("lift"), 0);
    } else if (phase === "idle" && target < index) {
      timer = setTimeout(() => { setIndex((value) => value - 1); setPhase("return"); }, 0);
    } else if (phase === "lift") {
      timer = setTimeout(() => setPhase("throw"), delay(150));
    } else if (phase === "throw") {
      timer = setTimeout(() => { setIndex((value) => value + 1); setPhase("idle"); }, delay(THROW_MS));
    } else if (phase === "return") {
      timer = setTimeout(() => setPhase("idle"), delay(RETURN_MS));
    } else if (phase === "regroup") {
      timer = setTimeout(() => setPhase("settling"), delay(80));
    } else if (phase === "settling") {
      timer = setTimeout(() => setPhase("complete"), delay(RETURN_MS));
    }
    return () => clearTimeout(timer);
  }, [index, target, phase, reducedMotion]);

  const busy = phase !== "idle" && phase !== "complete";
  const navigate = (destination) => {
    if (busy) return;
    const next = Math.max(0, Math.min(FEATURES.length, destination));
    if (phase === "complete") {
      if (next === 0) { setIndex(0); setTarget(0); setPhase("idle"); }
      else { setIndex(FEATURES.length); setTarget(next); setPhase("idle"); }
      return;
    }
    setTarget(next);
  };

  function handleKeyDown(event) {
    if (event.key === "ArrowRight") { event.preventDefault(); navigate(index + 1); }
    if (event.key === "ArrowLeft") { event.preventDefault(); navigate(index - 1); }
  }

  function handleTouchEnd(event) {
    if (touchStart.current === null) return;
    const distance = event.changedTouches[0].clientX - touchStart.current;
    touchStart.current = null;
    suppressCardClick.current = Math.abs(distance) > 10;
    if (Math.abs(distance) > 50) navigate(index + (distance < 0 ? 1 : -1));
  }

  function moveDeck(event) {
    if (event.pointerType !== "mouse" || reducedMotion || !deckRef.current) return;
    const bounds = event.currentTarget.getBoundingClientRect();
    const x = (event.clientX - bounds.left) / bounds.width * 2 - 1;
    const y = (event.clientY - bounds.top) / bounds.height * 2 - 1;
    deckRef.current.style.setProperty("--deck-yaw", `${x * 9}deg`);
    deckRef.current.style.setProperty("--deck-pitch", `${-y * 6}deg`);
    deckRef.current.style.setProperty("--deck-x", `${x * 9}px`);
    deckRef.current.style.setProperty("--deck-y", `${y * 6}px`);
  }

  function resetDeck() {
    ["--deck-yaw", "--deck-pitch", "--deck-x", "--deck-y"].forEach(property => deckRef.current?.style.removeProperty(property));
  }

  const complete = phase === "complete" || phase === "regroup" || phase === "settling";
  const announcedIndex = Math.min(index, FEATURES.length - 1);

  return (
    <section className="features-section" id="features" aria-labelledby="features-heading" tabIndex={0} onKeyDown={handleKeyDown} onPointerMove={moveDeck} onPointerLeave={resetDeck}>
      <div className="features-content">
        <div className="features-heading">
          <p>Explore the handover</p>
          <h2 id="features-heading">Features</h2>
        </div>
        <div ref={deckRef} className="features-deck" aria-label="Feature cards" onPointerDown={(event) => { if (event.pointerType === "mouse") suppressCardClick.current = false; }} onTouchStart={(event) => { suppressCardClick.current = false; touchStart.current = event.touches[0].clientX; }} onTouchEnd={handleTouchEnd}>
          {FEATURES.map((feature, cardIndex) => {
            const thrown = cardIndex < index || (cardIndex === index && phase === "throw");
            const lifted = cardIndex === index && phase === "lift";
            const depth = Math.max(0, cardIndex - index);
            const direction = cardIndex % 2 === 0 ? -1 : 1;
            const stacked = phase === "settling" || phase === "complete";
            const offset = stacked ? cardIndex : depth;
            const transform = stacked
              ? `translate(${offset * 3}px, ${offset * -3}px) rotate(${(offset - 2.5) * 0.8}deg)`
              : thrown
                ? `translateX(calc(${direction < 0 ? "-100vw - 100%" : "100vw + 100%"})) rotate(${direction * 30}deg)`
                : lifted
                  ? `translateY(-16px) rotate(${direction * 3}deg) scale(1.025)`
                  : `translate(${depth * 5}px, ${depth * -5}px) rotate(${depth * 1.15}deg)`;
            return (
              <article key={feature.title} className={`feature-card${cardIndex === index && phase === "throw" ? " is-throwing" : ""}`} style={{ transform, zIndex: FEATURES.length - cardIndex }} aria-hidden={complete || cardIndex !== index} role={cardIndex === index && !complete ? "button" : undefined} tabIndex={cardIndex === index && !complete ? 0 : undefined} aria-label={cardIndex === index && !complete ? `${feature.title}. ${feature.description} Activate to see the next feature.` : undefined} onClick={() => { if (suppressCardClick.current) { suppressCardClick.current = false; return; } if (cardIndex === index && !complete) navigate(index + 1); }} onKeyDown={(event) => { if ((event.key === "Enter" || event.key === " ") && cardIndex === index && !complete) { event.preventDefault(); navigate(index + 1); } }}>
                <div className="feature-card-copy"><h3>{feature.title}</h3><p>{feature.description}</p></div>
              </article>
            );
          })}
        </div>
        <p className="features-status" aria-live="polite">{phase === "complete" ? "You’ve explored all six features." : <span className="features-visually-hidden">{FEATURES[announcedIndex].title}</span>}</p>
        <div className="features-progress" aria-label="Feature progress">
          {FEATURES.map((feature, cardIndex) => (
            <button key={feature.title} type="button" className={`features-progress-bar ${complete || cardIndex < index ? "is-complete" : cardIndex === index ? "is-active" : ""}`} aria-label={`Go to ${feature.title}`} aria-current={!complete && cardIndex === index ? "step" : undefined} disabled={busy} onClick={() => navigate(cardIndex)} />
          ))}
        </div>
        <div className="features-controls">
          <button className="features-control-rounded" type="button" onClick={() => navigate(index - 1)} disabled={busy || index === 0}>Previous</button>
          {phase === "complete" ? <button className="features-control-rounded" type="button" onClick={() => navigate(0)}>Replay <span aria-hidden="true">↻</span></button> : <button type="button" onClick={() => navigate(index + 1)} disabled={busy}>Next <span aria-hidden="true">→</span></button>}
        </div>
      </div>
    </section>
  );
}

export default function LandingPage() {
  function moveNavbarGlow(event) {
    if (event.pointerType !== "mouse") return;
    const bounds = event.currentTarget.getBoundingClientRect();
    event.currentTarget.style.setProperty("--glow-x", `${event.clientX - bounds.left}px`);
    event.currentTarget.style.setProperty("--glow-y", `${event.clientY - bounds.top}px`);
  }

  function moveHands(event) {
    if (event.pointerType !== "mouse") return;
    const bounds = event.currentTarget.getBoundingClientRect();
    const x = (event.clientX - bounds.left) / bounds.width - 0.5;
    const y = (event.clientY - bounds.top) / bounds.height - 0.5;
    event.currentTarget.style.setProperty("--hands-x", `${x * 12}px`);
    event.currentTarget.style.setProperty("--hands-y", `${y * 12}px`);
  }

  function resetHands(event) {
    event.currentTarget.style.removeProperty("--hands-x");
    event.currentTarget.style.removeProperty("--hands-y");
  }

  return (
    <main className="landing-page">
      <nav className="landing-navbar" onPointerMove={moveNavbarGlow}>
        <a href="/" className="landing-nav-brand" aria-label="Handover Helper home">H<span>H</span></a>

        <div className="landing-nav-group landing-nav-main">
          <a href="/" className="landing-nav-home">Home</a>
          <a href="#features" className="landing-nav-features">
            Features
          </a>
          <a href="#how-it-works" className="landing-nav-how">How it works</a>
        </div>

        <div className="landing-nav-group landing-nav-account">
          <a href="/login" className="landing-nav-signin">
            Sign in
          </a>
          <a href="/register" className="landing-nav-register">
            Register
          </a>
        </div>
      </nav>

      <section className="landing-hero">
        <h1 className="landing-title">
          <span>HANDOVER</span>
          <span className="landing-title-red">HELPER</span>
        </h1>

        <div className="landing-illustration" onPointerMove={moveHands} onPointerLeave={resetHands}>
          <div className="landing-hands" role="img" aria-label="Hands passing project documents">
            <img className="landing-hand-left" src={handOne} alt="" />
            <img className="landing-hand-right" src={handTwo} alt="" />
          </div>
        </div>
      </section>
      <span className="landing-scroll-hint" aria-hidden="true" />
      <Features />
      <section className="how-content" id="how-it-works" aria-labelledby="how-title">
        <h2 id="how-title">HOW IT WORKS</h2>
        <p className="how-intro">Explore the planned steps for a clearer project handover.</p>
        <div className="how-carousel">
          <CircularCarousel items={items} preset="orbit" intro="rise" autoplay="off" draggable snap focusOnClick cardWidth={300} aspectRatio={0.93} gap={0} tilt={-8} perspective={1500} parallax={0.12} stretch={0} depthFade={0.48} fadeColor="#0f0c29" ariaLabel="Handover workflow steps" />
        </div>
      </section>
    </main>
  );
}
