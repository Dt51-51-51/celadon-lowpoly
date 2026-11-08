import * as THREE from 'three';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import {applyPalette} from '../../src/engine/parameters.ts';
import {describe, loaderFor, ownMaterials, type BuiltAsset} from './recipe-loader.ts';
import {frameToView} from './frame-camera.ts';

type Step = {target: () => HTMLElement; run: () => void};
const STEP_MS = 2600;
const RESUME_MS = 7000;

function chip(label: string, className = 'hero-chip') {
  const node = document.createElement('button');
  node.type = 'button';
  node.className = className;
  node.textContent = label;
  return node;
}

export async function mountHero(host: HTMLElement, {reducedMotion}: {reducedMotion: boolean}) {
  const load = loaderFor('market-stall');
  if (!load) throw new Error('Missing recipe module');
  const recipe = await load();
  const descriptor = describe(recipe.metadata);
  const preset = recipe.metadata.presets.find(item => item.id === 'fruit-stall');
  let draft: Record<string, unknown> = {...recipe.metadata.defaults, ...preset?.parameters};
  const width = recipe.metadata.controls.find(control => control.key === 'width');
  const types = recipe.metadata.controls.find(control => control.key === 'type');

  const renderer = new THREE.WebGLRenderer({antialias: true, alpha: true});
  renderer.setPixelRatio(Math.min(2, devicePixelRatio));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  const canvas = renderer.domElement;
  canvas.className = 'hero-canvas';
  canvas.setAttribute('aria-label', 'Fruit stall model. Drag to rotate it and use the controls to change it.');
  const scene = new THREE.Scene();
  const key = new THREE.DirectionalLight(0xffffff, 2.4);
  key.castShadow = true;
  key.shadow.mapSize.set(1024, 1024);
  key.shadow.radius = 6;
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(40, 40), new THREE.ShadowMaterial({opacity: 0.16}));
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  const pivot = new THREE.Group();
  scene.add(new THREE.HemisphereLight(0xffffff, 0x8a8f99, 1.5), key, key.target, ground, pivot);
  const camera = new THREE.PerspectiveCamera(32, 1, 0.01, 100);
  const orbit = new OrbitControls(camera, canvas);
  orbit.enableDamping = true;
  orbit.enableZoom = false;
  orbit.enablePan = false;
  orbit.autoRotateSpeed = 0.8;
  let current: BuiltAsset | null = null;
  const place = (built: BuiltAsset, reset: boolean) => {
    ownMaterials(built);
    built.traverse(object => { if ((object as THREE.Mesh).isMesh) object.castShadow = true; });
    if (current) { pivot.remove(current); current.dispose(); }
    current = built;
    pivot.add(built);
    const box = new THREE.Box3().setFromObject(built);
    ground.position.y = box.min.y;
    const framed = frameToView(camera, orbit, built, reset, 0.62);
    key.position.copy(framed.center).add(new THREE.Vector3(2.5, 6, 3).multiplyScalar(framed.radius));
    key.target.position.copy(framed.center);
    const span = framed.radius * 2.5;
    Object.assign(key.shadow.camera, {left: -span, right: span, top: span, bottom: -span, far: framed.radius * 20});
    key.shadow.camera.updateProjectionMatrix();
  };
  const build = (next: Record<string, unknown>, reset = false) => {
    place(recipe.createAsset(next), reset);
    draft = next;
    caption.textContent = 'Fruit stall';
    sync();
  };

  const caption = document.createElement('div');
  caption.className = 'hero-caption';
  caption.setAttribute('aria-live', 'polite');
  const rail = document.createElement('div');
  rail.className = 'hero-rail';
  const typeGroup = document.createElement('div');
  typeGroup.className = 'hero-group';
  typeGroup.setAttribute('role', 'group');
  typeGroup.setAttribute('aria-label', 'Stall type');
  const typeButtons = new Map<string, HTMLButtonElement>();
  for (const option of types?.kind === 'choice' ? types.options : []) {
    const value = option.value;
    const button = chip(value.slice(0, 1).toUpperCase() + value.slice(1));
    button.title = option.label;
    button.addEventListener('click', () => apply({...draft, type: value}));
    typeButtons.set(value, button);
    typeGroup.append(button);
  }
  const widthLabel = document.createElement('label');
  widthLabel.className = 'hero-group hero-range';
  const widthText = document.createElement('span');
  const slider = document.createElement('input');
  slider.type = 'range';
  slider.min = String(width?.kind === 'range' ? width.min : 1.6);
  slider.max = String(width?.kind === 'range' ? width.max : 4);
  slider.step = '0.1';
  slider.addEventListener('input', () => apply({...draft, width: Number(slider.value)}));
  widthLabel.append(widthText, slider);
  const paletteGroup = document.createElement('div');
  paletteGroup.className = 'hero-group';
  paletteGroup.setAttribute('role', 'group');
  paletteGroup.setAttribute('aria-label', 'Palette');
  const swatches = new Map<string, HTMLButtonElement>();
  for (const palette of recipe.metadata.palettes) {
    const button = chip('', 'hero-swatch');
    button.setAttribute('aria-label', palette.label + ' palette');
    button.title = palette.label;
    const colors = palette.colors.slice(0, 3);
    button.style.background = 'conic-gradient(' + colors.map((color, index) => color + ' ' + (index * 360 / colors.length) + 'deg ' + ((index + 1) * 360 / colors.length) + 'deg').join(',') + ')';
    button.addEventListener('click', () => apply(applyPalette(descriptor, draft, palette.id)));
    swatches.set(palette.id, button);
    paletteGroup.append(button);
  }
  rail.append(typeGroup, widthLabel, paletteGroup);
  const cursor = document.createElement('div');
  cursor.className = 'hero-cursor';
  cursor.setAttribute('aria-hidden', 'true');
  cursor.innerHTML = '<svg viewBox="0 0 24 24" width="28" height="28"><path d="M4 2l15 9-6.5 1.6L9 19z" fill="#17202e" stroke="#fff" stroke-width="1.6" stroke-linejoin="round"/></svg>';

  function sync() {
    for (const [value, button] of typeButtons) button.setAttribute('aria-pressed', String(draft.type === value));
    const colorway = String(draft.colorway ?? '');
    for (const [id, button] of swatches) button.setAttribute('aria-pressed', String(colorway === id));
    slider.value = String(draft.width);
    widthText.textContent = 'Width ' + Number(draft.width).toFixed(1) + ' m';
  }
  function apply(next: Record<string, unknown>) {
    try { build(next); } catch { sync(); }
  }

  host.append(canvas, rail);
  host.append(cursor, caption);
  const resize = () => {
    const w = Math.max(200, host.clientWidth), h = Math.max(200, host.clientHeight);
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    if (current) frameToView(camera, orbit, current, false, 0.62);
  };
  const resizeObserver = new ResizeObserver(resize);
  resizeObserver.observe(host);
  resize();
  build(draft, true);

  let visible = true, running = true, demo = true, step = 0, timer = 0, resumeTimer = 0, sinceTour = 0, touring = false, tour = 0, motion = 0;
  const wait = (ms: number) => new Promise<void>(done => window.setTimeout(done, ms));
  const easeOut = (t: number) => 1 - (1 - t) ** 3;
  const backOut = (t: number) => { const c = 1.9; return 1 + (c + 1) * (t - 1) ** 3 + c * (t - 1) ** 2; };
  const pieces = (root: THREE.Object3D) => {
    const list: {node: THREE.Object3D; position: THREE.Vector3; scale: THREE.Vector3; y: number}[] = [];
    root.traverse(node => { if ((node as THREE.Mesh).isMesh) list.push({node, position: node.position.clone(), scale: node.scale.clone(), y: new THREE.Box3().setFromObject(node).getCenter(new THREE.Vector3()).y}); });
    return list.sort((a, b) => a.y - b.y);
  };
  const animate = (root: THREE.Object3D, entering: boolean) => new Promise<void>(done => {
    if (reducedMotion) { done(); return; }
    const list = pieces(root), box = new THREE.Box3().setFromObject(root), rise = Math.max(0.2, box.max.y - box.min.y) * (entering ? 0.45 : 0.25);
    const duration = entering ? 620 : 360, stagger = Math.min(entering ? 110 : 40, (entering ? 900 : 260) / Math.max(1, list.length)), total = duration + stagger * list.length, start = performance.now(), id = ++motion;
    const finish = () => { for (const piece of list) { piece.node.scale.copy(piece.scale); piece.node.position.copy(piece.position); } pivot.rotation.y = 0; pivot.scale.set(1, 1, 1); done(); };
    const tick = (now: number) => {
      if (id !== motion || !running) { finish(); return; }
      const order = entering ? list : [...list].reverse();
      order.forEach((piece, rank) => {
        const t = Math.min(1, Math.max(0, (now - start - rank * stagger) / duration)), k = entering ? backOut(t) : 1 - easeOut(t), lift = entering ? 1 - easeOut(t) : easeOut(t);
        piece.node.scale.copy(piece.scale).multiplyScalar(Math.max(0.001, k));
        piece.node.position.copy(piece.position);
        piece.node.position.y += lift * rise;
      });
      const whole = Math.min(1, (now - start) / total);
      pivot.rotation.y = entering ? -0.8 * (1 - easeOut(whole)) : 0.6 * easeOut(whole);
      const squash = entering ? 1 + 0.06 * Math.sin(whole * Math.PI * 2) * (1 - whole) : 1;
      pivot.scale.set(1 / Math.sqrt(squash), squash, 1 / Math.sqrt(squash));
      if (now - start >= total) { if (entering) finish(); else done(); return; }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
  const showcase = ['hot-air-balloon', 'sailboat', 'cottage', 'palm-tree', 'crystal-cluster'];
  const loadShowcase = async (family: string) => {
    const loader = loaderFor(family);
    if (!loader) return null;
    const module = await loader(), meta = module.metadata, preset = meta.presets[0];
    return {asset: module.createAsset({...meta.defaults, ...preset?.parameters}), title: preset?.name ?? meta.title};
  };
  const runTour = async () => {
    touring = true;
    rail.classList.add('hero-rail-away');
    cursor.classList.add('hidden');
    for (let k = 0; k < 3 && demo && running; k++) {
      const family = showcase[tour++ % showcase.length]!;
      let item: Awaited<ReturnType<typeof loadShowcase>> = null;
      try { item = await loadShowcase(family); } catch { item = null; }
      if (!item) continue;
      if (!demo || !running) { item.asset.dispose(); break; }
      if (current) await animate(current, false);
      place(item.asset, true);
      caption.textContent = item.title;
      await animate(item.asset, true);
      await wait(3400);
    }
    touring = false;
    if (!running) return;
    if (current) await animate(current, false);
    build(draft, true);
    if (current) void animate(current, true);
    rail.classList.remove('hero-rail-away');
    if (demo) { cursor.classList.remove('hidden'); timer = window.setTimeout(next, 1400); }
  };
  const visibility = new IntersectionObserver(entries => { visible = entries.some(entry => entry.isIntersecting); });
  visibility.observe(host);
  const loop = () => {
    if (!running) return;
    if (visible) { orbit.autoRotate = demo && !reducedMotion; orbit.update(); renderer.render(scene, camera); }
    requestAnimationFrame(loop);
  };
  loop();
  host.classList.add('hero-live');

  const glide = (to: number) => {
    if (reducedMotion) { apply({...draft, width: to}); return; }
    const from = Number(draft.width), start = performance.now();
    let last = 0;
    const tick = (now: number) => {
      if (!demo) return;
      const t = Math.min(1, (now - start) / 900), value = Math.round((from + (to - from) * (1 - (1 - t) ** 3)) * 10) / 10;
      if (now - last > 60 || t === 1) { last = now; apply({...draft, width: value}); }
      if (t < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  };
  const palette = (id: string) => () => apply(applyPalette(descriptor, draft, id));
  const kind = (value: string) => () => apply({...draft, type: value});
  const steps: Step[] = [
    {target: () => swatches.get('harbor') ?? paletteGroup, run: palette('harbor')},
    {target: () => slider, run: () => glide(3.8)},
    {target: () => typeButtons.get('canopy') ?? typeGroup, run: kind('canopy')},
    {target: () => swatches.get('spice') ?? paletteGroup, run: palette('spice')},
    {target: () => typeButtons.get('cart') ?? typeGroup, run: kind('cart')},
    {target: () => slider, run: () => glide(2.4)},
    {target: () => swatches.get('market') ?? paletteGroup, run: palette('market')},
    {target: () => typeButtons.get('awning') ?? typeGroup, run: kind('awning')},
  ];
  const point = (target: HTMLElement) => {
    const a = target.getBoundingClientRect(), b = host.getBoundingClientRect();
    const x = target === slider ? a.left - b.left + a.width * ((Number(draft.width) - Number(slider.min)) / (Number(slider.max) - Number(slider.min))) : a.left - b.left + a.width / 2;
    cursor.style.transform = 'translate(' + (x - 4) + 'px,' + (a.top - b.top + a.height / 2 - 2) + 'px)';
  };
  const next = () => {
    if (!demo || !running || touring) return;
    if (++sinceTour > 3) { sinceTour = 0; void runTour(); return; }
    const current = steps[step % steps.length]!;
    step++;
    point(current.target());
    timer = window.setTimeout(() => {
      if (!demo) return;
      cursor.classList.add('press');
      window.setTimeout(() => cursor.classList.remove('press'), 220);
      current.run();
      if (current.target() === slider) window.setTimeout(() => demo && point(slider), 950);
      timer = window.setTimeout(next, STEP_MS - 700);
    }, 700);
  };
  const stop = () => {
    window.clearTimeout(resumeTimer);
    if (!demo) return;
    demo = false;
    window.clearTimeout(timer);
    cursor.classList.add('hidden');
    motion++;
  };
  const later = () => {
    window.clearTimeout(resumeTimer);
    resumeTimer = window.setTimeout(() => { if (demo || touring) return; demo = true; cursor.classList.remove('hidden'); next(); }, RESUME_MS);
  };
  host.addEventListener('pointerenter', stop);
  host.addEventListener('pointerdown', stop);
  host.addEventListener('focusin', stop);
  host.addEventListener('pointerleave', later);
  if (demo) timer = window.setTimeout(next, 900);

  return () => {
    running = false;
    demo = false;
    window.clearTimeout(timer);
    window.clearTimeout(resumeTimer);
    visibility.disconnect();
    resizeObserver.disconnect();
    orbit.dispose();
    current?.dispose();
    renderer.dispose();
  };
}
