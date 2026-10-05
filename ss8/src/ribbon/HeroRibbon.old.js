import * as THREE from 'three';
import { FullScreenQuad } from 'three/examples/jsm/postprocessing/Pass.js';

import { SphereWalker } from './SphereWalker.js';
import { RibbonTrailGeometry } from './RibbonTrailGeometry.js';
import { createRibbonMaterial } from './ribbonMaterial.js';
import { SecondOrderScalar } from './SecondOrderScalar.js';
import { rasterizeTitle } from './rasterizeTitle.js';

// ─── Конфигурация ───────────────────────────────────────────────────
// Всё, что стоит крутить, собрано здесь.
export const CFG = {
    NODES: 220,            // колец в ленте (длина истории)
    TURNS: 1.18,           // длина ленты в оборотах вокруг сферы (>1 → концы прячутся друг за другом)
    WIDTH: 0.50,           // ширина ленты × n   (у atuin 0.25 — мы шире почти вдвое)
    THICKNESS: 0.055,      // толщина ленты × n

    FREQUENCY: 0.55,       // оборотов в секунду
    RADIUS_LANDSCAPE: 1.05, // × top_ws
    RADIUS_PORTRAIT: 0.70,  // × top_ws

    COLOR_HEAD: 0x04ECFE,  // циан у головы
    COLOR_TAIL: 0x004DCE,  // синий у хвоста

    IOR: 1.45,
    REFRACT_STRENGTH: 0.1,
    ABERRATION: 80,        // px разлёта каналов
    ABERRATION_BASE: 8,    // px базового сдвига R/B
    REFRACT_MIX: 0.4,      // насколько ярко буквы проступают сквозь ленту
    EXPOSURE: 0.95,

    BLUR_SCALE: 0.25,      // разрешение прохода преломления
    BLUR_RADIUS: 3,        // тапов гауссианы

    TILT: 0.3,             // доля наклона за курсором
    SPRING_TILT: { f: 1.5, z: 1.0 },
    SPRING_SCALE: { f: 1.0, z: 0.9 },
    SCALE_POINTER: 5.0,    // «раздувание» от скорости мыши

    STEP_MS: 1000 / 60,
    MAX_SUBSTEPS: 5,
};

// ─── Шейдер сепарабельного блюра ────────────────────────────────────
const blurFrag = /* glsl */ `
    precision highp float;
    varying vec2 vUv;
    uniform sampler2D uTex;
    uniform vec2 uDirection;  // (1/w, 0) или (0, 1/h)
    uniform float uWeights[BLUR_TAPS];

    void main() {
        vec3 acc = texture2D(uTex, vUv).rgb * uWeights[0];
        float wsum = uWeights[0];
        for (int i = 1; i < BLUR_TAPS; i++) {
            vec2 o = uDirection * float(i);
            acc += texture2D(uTex, vUv + o).rgb * uWeights[i];
            acc += texture2D(uTex, vUv - o).rgb * uWeights[i];
            wsum += 2.0 * uWeights[i];
        }
        gl_FragColor = vec4(acc / wsum, 1.0);
    }
`;

const blurVert = /* glsl */ `
    varying vec2 vUv;
    void main() {
        vUv = uv;
        gl_Position = vec4(position.xy, 0.0, 1.0);
    }
`;

function gaussianWeights(radius) {
    const w = new Array(radius).fill(0);
    for (let i = 0; i < radius; i++) {
        w[i] = (0.39894 * Math.exp((-0.5 * i * i) / (radius * radius))) / radius;
    }
    return w;
}

// ─── Основной класс ─────────────────────────────────────────────────
export class HeroRibbon {
    constructor(canvas, titleEl) {
        this.canvas = canvas;
        this.titleEl = titleEl;

        this.dpr = Math.min(window.devicePixelRatio || 1, 2);
        this.w = canvas.offsetWidth || window.innerWidth;
        this.h = canvas.offsetHeight || Math.round(window.innerWidth * 0.6);

        // ── Renderer ─────────────────────────────────────────────────
        this.renderer = new THREE.WebGLRenderer({
            canvas,
            antialias: true,
            alpha: true,
            premultipliedAlpha: false,
        });
        this.renderer.setPixelRatio(this.dpr);
        this.renderer.setSize(this.w, this.h, false);
        this.renderer.outputColorSpace = THREE.SRGBColorSpace;
        this.renderer.setClearColor(0x000000, 0);
        this.renderer.autoClear = true;

        // ── Камера ───────────────────────────────────────────────────
        this.camera = new THREE.PerspectiveCamera(45, this.w / this.h, 0.01, 15);
        this.camera.position.set(0, 0, 3);
        this.camera.lookAt(0, 0, 0);

        this.scene = new THREE.Scene();

        // ── Текстовая плоскость ──────────────────────────────────────
        this.textCanvas = document.createElement('canvas');
        this.textTexture = new THREE.CanvasTexture(this.textCanvas);
        this.textTexture.colorSpace = THREE.SRGBColorSpace;
        this.textTexture.minFilter = THREE.LinearFilter;
        this.textTexture.magFilter = THREE.LinearFilter;
        this.textTexture.generateMipmaps = false;

        this.textPlane = new THREE.Mesh(
            new THREE.PlaneGeometry(1, 1),
            new THREE.MeshBasicMaterial({
                map: this.textTexture,
                transparent: true,
                depthWrite: false,   // не пишет глубину…
                depthTest: true,     // …но проверяется по глубине ленты
                toneMapped: false,
            })
        );
        this.textPlane.renderOrder = 10; // рисуется после ленты
        this.scene.add(this.textPlane);

        // ── Лента ────────────────────────────────────────────────────
        this.material = createRibbonMaterial(CFG);
        this.ribbon = null;
        this.walker = null;
        this._buildRibbon();

        // ── Проход преломления + блюр ────────────────────────────────
        const rtOpts = {
            minFilter: THREE.LinearFilter,
            magFilter: THREE.LinearFilter,
            format: THREE.RGBAFormat,
            type: THREE.UnsignedByteType,
            depthBuffer: false,
        };
        this.rtA = new THREE.WebGLRenderTarget(1, 1, rtOpts);
        this.rtB = new THREE.WebGLRenderTarget(1, 1, rtOpts);

        this.blurMat = new THREE.ShaderMaterial({
            vertexShader: blurVert,
            fragmentShader: blurFrag,
            defines: { BLUR_TAPS: CFG.BLUR_RADIUS },
            uniforms: {
                uTex: { value: null },
                uDirection: { value: new THREE.Vector2() },
                uWeights: { value: gaussianWeights(CFG.BLUR_RADIUS) },
            },
            depthTest: false,
            depthWrite: false,
        });
        this.blurQuad = new FullScreenQuad(this.blurMat);

        this.material.uniforms.uContent.value = this.rtA.texture;

        // ── Пружины ──────────────────────────────────────────────────
        this.tiltX = new SecondOrderScalar(CFG.SPRING_TILT.f, CFG.SPRING_TILT.z, 0, 0);
        this.tiltY = new SecondOrderScalar(CFG.SPRING_TILT.f, CFG.SPRING_TILT.z, 0, 0);
        this.scaleSpring = new SecondOrderScalar(CFG.SPRING_SCALE.f, CFG.SPRING_SCALE.z, 0, 1);

        this.pointer = new THREE.Vector2(0.5, 0.5);
        this.prevPointer = new THREE.Vector2(0.5, 0.5);
        this._hasPointer = false;

        this._targetQuat = new THREE.Quaternion();
        this._scratchQuat = new THREE.Quaternion();
        this._euler = new THREE.Euler(0, 0, 0, 'YXZ');
        this._identity = new THREE.Quaternion();
        this._from = new THREE.Vector3(0, 0, 1);
        this._to = new THREE.Vector3();
        this._tiltScale = new THREE.Vector3(0.8, 0.8, 1);

        // ── Клок ─────────────────────────────────────────────────────
        this.totalMs = 0;
        this.accumulator = 0;
        this.lastTime = 0;
        this.running = false;
        this.visible = true;
        this.rafId = 0;

        this._bindEvents();
        this.resize();
    }

    // ────────────────────────────────────────────────────────────────
    get topWs() {
        return this.camera.position.z * Math.tan((this.camera.fov * Math.PI) / 360);
    }

    get targetRadius() {
        const t = this.topWs;
        return this.w > this.h
            ? CFG.RADIUS_LANDSCAPE * t
            : Math.max(t * this.camera.aspect, CFG.RADIUS_PORTRAIT * t);
    }

    get nFactor() {
        return this.w / this.h > 1 ? 1.1 : 0.8;
    }

    _buildRibbon() {
        const radius = this.targetRadius;
        const n = this.nFactor;

        if (this.ribbon) {
            this.scene.remove(this.ribbon);
            this.ribbon.geometry.dispose();
        }

        this.walker = new SphereWalker(radius, CFG.FREQUENCY);

        const geo = new RibbonTrailGeometry(
            CFG.NODES,
            CFG.WIDTH * n,
            CFG.THICKNESS * n,
            2 * Math.PI * radius * CFG.TURNS,
            this.walker.p1
        );

        this.ribbon = new THREE.Mesh(geo, this.material);
        this.ribbon.frustumCulled = false;
        this.ribbon.rotation.order = 'YXZ';
        this.ribbon.position.y = 0.05;
        this.scene.add(this.ribbon);
    }

    // ────────────────────────────────────────────────────────────────
    _bindEvents() {
        this._onPointer = (e) => {
            this.pointer.set(e.clientX / window.innerWidth, 1 - e.clientY / window.innerHeight);
            if (!this._hasPointer) {
                this.prevPointer.copy(this.pointer);
                this._hasPointer = true;
            }
        };
        window.addEventListener('pointermove', this._onPointer, { passive: true });

        this._onVisibility = () => {
            if (document.hidden) this.pause();
            else if (this.visible) this.start();
        };
        document.addEventListener('visibilitychange', this._onVisibility);

        this._resizeTimer = 0;
        this._onResize = () => {
            clearTimeout(this._resizeTimer);
            this._resizeTimer = setTimeout(() => this.resize(), 200);
        };
        window.addEventListener('resize', this._onResize);

        // rAF крутится только пока hero в кадре
        if ('IntersectionObserver' in window) {
            this._io = new IntersectionObserver(
                ([entry]) => {
                    this.visible = entry.isIntersecting;
                    if (this.visible && !document.hidden) this.start();
                    else this.pause();
                },
                { threshold: 0 }
            );
            this._io.observe(this.canvas);
        }
    }

    // ────────────────────────────────────────────────────────────────
    resize() {
        const w = this.canvas.offsetWidth;
        const h = this.canvas.offsetHeight;
        if (!w || !h) return;

        this.w = w;
        this.h = h;
        this.dpr = Math.min(window.devicePixelRatio || 1, 2);

        this.renderer.setPixelRatio(this.dpr);
        this.renderer.setSize(w, h, false);

        this.camera.aspect = w / h;
        this.camera.updateProjectionMatrix();

        const bw = Math.max(1, Math.round(w * this.dpr * CFG.BLUR_SCALE));
        const bh = Math.max(1, Math.round(h * this.dpr * CFG.BLUR_SCALE));
        this.rtA.setSize(bw, bh);
        this.rtB.setSize(bw, bh);

        this.material.uniforms.uResolution.value.set(w * this.dpr, h * this.dpr);

        // Плоскость ровно во весь фрустум на z = 0
        const planeH = 2 * this.topWs;
        const planeW = planeH * this.camera.aspect;
        this.textPlane.geometry.dispose();
        this.textPlane.geometry = new THREE.PlaneGeometry(planeW, planeH);

        this._buildRibbon(); // пересоздаёт walker с новым радиусом

        this.refreshTitle();
    }

    /** Перерисовать текстуру заголовка. Вызывать после смены шрифта/размера. */
    refreshTitle() {
        if (!this.titleEl) return;

        const w = Math.max(1, Math.round(this.w * this.dpr));
        const h = Math.max(1, Math.round(this.h * this.dpr));
        if (this.textCanvas.width !== w || this.textCanvas.height !== h) {
            this.textCanvas.width = w;
            this.textCanvas.height = h;
        }

        const rect = this.canvas.getBoundingClientRect();
        rasterizeTitle(this.textCanvas, this.titleEl, rect, this.dpr);
        this.textTexture.needsUpdate = true;
    }

    // ────────────────────────────────────────────────────────────────
    _step(dtMs) {
        const dt = dtMs / 1000;

        // A + B — голова ползёт по сфере
        const head = this.walker.step(this.totalMs, dtMs);
        this.ribbon.geometry.moveTo(head);

        // C — наклон за курсором. Берём только CFG.TILT долю полного поворота.
        this._to
            .set(this.pointer.x * 2 - 1, this.pointer.y * 2 - 1, 1)
            .multiply(this._tiltScale)
            .normalize();
        this._targetQuat.setFromUnitVectors(this._from, this._to);
        this._scratchQuat.copy(this._identity).slerp(this._targetQuat, CFG.TILT);
        this._euler.setFromQuaternion(this._scratchQuat, 'YXZ');

        this.ribbon.rotation.x = this.tiltX.update(dt, this._euler.x);
        this.ribbon.rotation.y = this.tiltY.update(dt, this._euler.y);
        this.ribbon.rotation.z = 0;

        // D — «раздувание» от скорости мыши
        const delta = this.pointer.distanceTo(this.prevPointer);
        this.prevPointer.copy(this.pointer);
        const s = this.scaleSpring.update(dt, 1 + CFG.SCALE_POINTER * delta);
        this.ribbon.scale.setScalar(s);

        this.totalMs += dtMs;
    }

    _renderRefractionPass() {
        const prevTarget = this.renderer.getRenderTarget();

        this.ribbon.visible = false;

        // Чуть ближе камера — чтобы при преломлении не выбирать края текстуры
        this.camera.position.z -= 0.2;
        this.camera.updateMatrixWorld();

        this.renderer.setRenderTarget(this.rtA);
        this.renderer.setClearColor(0xffffff, 1); // белый фон = «пусто»
        this.renderer.clear();
        this.renderer.render(this.scene, this.camera);

        this.camera.position.z += 0.2;
        this.camera.updateMatrixWorld();

        // Сепарабельный гауссов блюр: rtA → rtB (гор.) → rtA (верт.)
        const bw = this.rtA.width;
        const bh = this.rtA.height;

        this.blurMat.uniforms.uTex.value = this.rtA.texture;
        this.blurMat.uniforms.uDirection.value.set(1 / bw, 0);
        this.renderer.setRenderTarget(this.rtB);
        this.blurQuad.render(this.renderer);

        this.blurMat.uniforms.uTex.value = this.rtB.texture;
        this.blurMat.uniforms.uDirection.value.set(0, 1 / bh);
        this.renderer.setRenderTarget(this.rtA);
        this.blurQuad.render(this.renderer);

        this.ribbon.visible = true;
        this.renderer.setRenderTarget(prevTarget);
        this.renderer.setClearColor(0x000000, 0);
    }

    _render() {
        this._renderRefractionPass();
        this.material.uniforms.uCameraPos.value.copy(this.camera.position);
        this.renderer.render(this.scene, this.camera);
    }

    // ────────────────────────────────────────────────────────────────
    _loop = (time) => {
        if (!this.running) return;
        this.rafId = requestAnimationFrame(this._loop);

        if (!this.lastTime) this.lastTime = time;
        let elapsed = time - this.lastTime;
        this.lastTime = time;

        if (elapsed > 250) elapsed = CFG.STEP_MS; // вернулись из фона — не догоняем

        this.accumulator += elapsed;

        let steps = 0;
        while (this.accumulator >= CFG.STEP_MS && steps < CFG.MAX_SUBSTEPS) {
            this._step(CFG.STEP_MS);
            this.accumulator -= CFG.STEP_MS;
            steps++;
        }
        if (steps === CFG.MAX_SUBSTEPS) this.accumulator = 0;

        this._render();
    };

    start() {
        if (this.running) return;
        this.running = true;
        this.lastTime = 0;
        this.rafId = requestAnimationFrame(this._loop);
    }

    pause() {
        this.running = false;
        cancelAnimationFrame(this.rafId);
    }

    dispose() {
        this.pause();
        window.removeEventListener('pointermove', this._onPointer);
        window.removeEventListener('resize', this._onResize);
        document.removeEventListener('visibilitychange', this._onVisibility);
        this._io?.disconnect();

        this.ribbon?.geometry.dispose();
        this.material.dispose();
        this.textPlane.geometry.dispose();
        this.textPlane.material.dispose();
        this.textTexture.dispose();
        this.rtA.dispose();
        this.rtB.dispose();
        this.blurQuad.dispose();
        this.renderer.dispose();
    }
}

// ─── Точка входа ────────────────────────────────────────────────────
export function initHeroRibbon() {
    const canvas = document.getElementById('hero-canvas');
    const title = document.querySelector('.hero__title');
    if (!canvas || !title) return null;

    // WebGL есть?
    const probe = document.createElement('canvas');
    if (!probe.getContext('webgl2') && !probe.getContext('webgl')) {
        title.style.visibility = 'visible';
        title.style.opacity = '1';
        return null;
    }

    const ribbon = new HeroRibbon(canvas, title);

    // DOM-заголовок прячем не сразу, а когда лента уже проявилась.
    // Текстура рисует буквы ровно в тех же координатах, поэтому подмена
    // не видна — нет ни вспышки, ни скачка.
    const reveal = () => {
        ribbon.refreshTitle();
        ribbon.start();
        requestAnimationFrame(() => {
            canvas.classList.add('is-ready'); // opacity 0 → 1 за 450 мс
            setTimeout(() => title.classList.add('is-rasterized'), 450);
        });
    };

    if (document.fonts?.ready) {
        document.fonts.ready.then(() => requestAnimationFrame(reveal));
    } else {
        requestAnimationFrame(reveal);
    }

    return ribbon;
}
