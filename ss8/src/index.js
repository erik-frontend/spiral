import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { RGBELoader } from 'three/examples/jsm/loaders/RGBELoader.js';
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { ScrollSmoother } from "gsap/ScrollSmoother";
import model from './assets/Spiral.glb';
import hdri from './assets/hdri.hdr';
import './styles/main.scss';
import { initHeroRibbon } from './ribbon/HeroRibbon.js';

gsap.registerPlugin(ScrollTrigger);

// ─── Параметры карточной спирали (общие для DOM-карусели и 3D-спирали) ─
// Держим здесь, чтобы вращение спирали и карточек не разъехалось.
// Карточки распределены равномерно по высоте секции; каждая делает
// PER_CARD_TURNS оборота вокруг своей родной точки (см. initSpiralCards).
// Сцена карточек — sticky и «прилипает» к вьюпорту не сразу, а когда верх
// секции доходит до верха экрана. Поэтому первую карточку сдвигаем вниз по
// прогрессу (PAD_TOP больше), чтобы она выходила во фронт уже на «прилипшей»
// сцене, а не в момент въезда секции.
const SPIRAL_PAD_TOP = 0.22;             // отступ сверху (после включения sticky)
const SPIRAL_PAD_BOT = 0.06;             // отступ снизу
const SPIRAL_PER_CARD_TURNS = 0.85;      // размах вращения карточки (больше = шире угловой шаг, крупнее зазор по кругу)
// Полный угловой ход карточки за весь скролл секции, в оборотах:
const SPIRAL_TOTAL_TURNS = SPIRAL_PER_CARD_TURNS / (1 - SPIRAL_PAD_TOP - SPIRAL_PAD_BOT);
const SPIRAL_MODEL_FACTOR = 0.5;         // насколько мягче крутится 3D-модель спирали

// ─── Параметры сцены ───────────────────────────────────────────────
const CYLINDER_RADIUS = 3;   // радиус спирали (для позиционирования карточек)
const CARD_GAP = 4;      // зазор между поверхностью спирали и карточкой
const CARD_Z = CYLINDER_RADIUS + CARD_GAP;
const CARD_W = 2;
const CARD_H = 3;

// ─── Данные карточек ───────────────────────────────────────────────
// Карточка i лицом к камере когда group.rotation.y == i * STEP_ANGLE.
// Y-шаг = 5 ед. — подобран так чтобы при переходе карточка не выходила за FOV.
const STEP_ANGLE = Math.PI / 5;  // 60° между карточками → небольшой скролл
const cardsConfig = [
    { title: 'Шаг 1', text: 'Описание первого шага', x: 0, y: CYLINDER_RADIUS + 3.8 },
    { title: 'Шаг 2', text: 'Описание второго шага', x: 0, y: CYLINDER_RADIUS + 2.8 },
    { title: 'Шаг 3', text: 'Описание второго шага', x: 0, y: CYLINDER_RADIUS + 1.8 },
    { title: 'Шаг 4', text: 'Описание второго шага', x: -1.1, y: CYLINDER_RADIUS - 4.2 },
    { title: 'Шаг 5', text: 'Описание второго шага', x: -1.1, y: CYLINDER_RADIUS - 5.2 },
    { title: 'Шаг 6', text: 'Описание второго шага', x: -1.1, y: CYLINDER_RADIUS - 6.2 },
    { title: 'Шаг 7', text: 'Описание второго шага', x: -2, y: CYLINDER_RADIUS - 12.2 },
    { title: 'Шаг 8', text: 'Описание второго шага', x: -2, y: CYLINDER_RADIUS - 13.2 },
];

// ─── Renderer ─────────────────────────────────────────────────────
const canvas = document.getElementById('canvas');
if (canvas) {
    // Высота canvas должна совпадать с CSS-высотой #canvas (237.083vw), иначе
    // пиксельный буфер (innerHeight*4) и CSS-бокс не совпадают: картинка тянется
    // по вертикали и спираль обрезается сверху. Считаем ту же величину от ширины.
    const CANVAS_VH_FACTOR = 2.37083;        // = 237.083vw
    const canvasH = window.innerWidth * CANVAS_VH_FACTOR;
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });

    renderer.setSize(window.innerWidth, canvasH);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.setClearColor(0x000000, 0);

    // ─── Камера ────────────────────────────────────────────────────────
    const camera = new THREE.PerspectiveCamera(45, window.innerWidth / canvasH, 0.1, 1000);
    camera.position.set(0, 0, 40);

    // ─── Сцена ────────────────────────────────────────────────────────
    const scene = new THREE.Scene();
    scene.add(new THREE.AmbientLight(0xffffff, 1.5));
    const dirLight = new THREE.DirectionalLight(0xffffff, 3);
    dirLight.position.set(5, 10, 7);
    scene.add(dirLight);

    // ─── Группа (всё вращается вместе) ───────────────────────────────
    const group = new THREE.Group();
    scene.add(group);

    // ─── HDRI окружение ───────────────────────────────────────────────
    new RGBELoader().load(hdri, (texture) => {
        texture.mapping = THREE.EquirectangularReflectionMapping;
        scene.environment = texture;
    });

    // ─── GLB модель ───────────────────────────────────────────────────
    let mesh = null;
    let modelW = 0, modelH = 0;

    // Вписываем модель в видимую область камеры целиком (как object-fit: contain),
    // чтобы при смене соотношения сторон экрана модель пропорционально уменьшалась/увеличивалась
    function fitModelToView() {
        if (!mesh) return;

        const visibleH = 2 * camera.position.z * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
        const visibleW = visibleH * camera.aspect;
        // FIT_PAD < 1 оставляет запас по краям, чтобы верх/низ спирали не упирались
        // в кромку canvas и не «срезались».
        const FIT_PAD = 0.92;
        mesh.scale.setScalar(Math.min(visibleH / modelH, visibleW / modelW) * FIT_PAD);

        // Центрируем после масштабирования
        mesh.updateMatrixWorld(true);
        const center = new THREE.Box3().setFromObject(mesh).getCenter(new THREE.Vector3());
        mesh.position.set(-center.x, -center.y - 1, -center.z);
    }

    new GLTFLoader().load(model, (gltf) => {
        mesh = gltf.scene;
        mesh.rotation.y = THREE.MathUtils.degToRad(120);
        mesh.updateMatrixWorld(true);

        const box0 = new THREE.Box3().setFromObject(mesh);
        modelW = box0.max.x - box0.min.x;
        modelH = box0.max.y - box0.min.y;

        group.add(mesh);
        fitModelToView();
    });

    // ─── Текстура карточки ────────────────────────────────────────────
    function makeCardTexture(title, text) {
        const W = 360, H = 516;
        const c = document.createElement('canvas');
        c.width = W; c.height = H;
        const ctx = c.getContext('2d');

        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.roundRect(16, 16, W - 32, H - 32, 32);
        ctx.fill();

        ctx.strokeStyle = '#dddddd';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.roundRect(16, 16, W - 32, H - 32, 32);
        ctx.stroke();

        ctx.fillStyle = '#111111';
        ctx.font = 'bold 80px sans-serif';
        ctx.fillText(title, 60, 140);

        ctx.fillStyle = '#eeeeee';
        ctx.fillRect(60, 170, W - 120, 3);

        ctx.fillStyle = '#555555';
        ctx.font = '52px sans-serif';
        const words = text.split(' ');
        let line = '', y = 270;
        for (const word of words) {
            const test = line + word + ' ';
            if (ctx.measureText(test).width > W - 120) {
                ctx.fillText(line.trim(), 60, y);
                line = word + ' ';
                y += 72;
            } else {
                line = test;
            }
        }
        ctx.fillText(line.trim(), 60, y);

        return new THREE.CanvasTexture(c);
    }

    // ─── Создание карточек ────────────────────────────────────────────
    // Карточка i: лицом к камере когда group.rotation.y == i * STEP_ANGLE
    // Позиция в локальном пространстве группы:
    //   x = -sin(theta) * CARD_Z,  z = cos(theta) * CARD_Z
    // Ориентация: rotation.y = -theta  (чтобы при повороте группы на theta нормаль стала +Z)
    // cardsConfig.forEach((cfg, i) => {
    //     const theta = i * STEP_ANGLE + 0.7 + cfg.x;
    //     const cg = new THREE.Group();
    //     cg.position.set(-Math.sin(theta) * CARD_Z, cfg.y, Math.cos(theta) * CARD_Z);
    //     cg.rotation.y = -theta;

    //     cg.add(new THREE.Mesh(
    //         new THREE.PlaneGeometry(CARD_W, CARD_H),
    //         new THREE.MeshBasicMaterial({ map: makeCardTexture(cfg.title, cfg.text), side: THREE.FrontSide })
    //     ));

    //     const back = new THREE.Mesh(
    //         new THREE.PlaneGeometry(CARD_W, CARD_H),
    //         new THREE.MeshBasicMaterial({ color: 0x111122 })
    //     );
    //     back.rotation.y = Math.PI;
    //     cg.add(back);

    //     group.add(cg);
    // });

    // ─── Scroll ────────────────────────────────────────────────────────
    const section = document.querySelector('.cards');

    ScrollTrigger.create({
        trigger: section,
        start: 'top bottom',
        end: 'bottom bottom-=100%',
        scrub: 1,
        onUpdate: (self) => {
            // Спираль вращается синхронно с карточной каруселью (initSpiralCards):
            // тот же прогресс → та же сторона и темп, чтобы карточки читались как
            // «нанизанные» на спираль. Полный ход карточки = SPIRAL_TOTAL_TURNS
            // оборота; 3D-модель крутим в ту же сторону, но мягче (коэффициент < 1),
            // иначе модель мельтешит.
            group.rotation.y = self.progress * Math.PI * 2 * SPIRAL_TOTAL_TURNS * SPIRAL_MODEL_FACTOR;
        }
    });

    // ─── Render loop ──────────────────────────────────────────────────
    function animate() {
        requestAnimationFrame(animate);
        renderer.render(scene, camera);
    }
    animate();

    // ─── Resize ───────────────────────────────────────────────────────
    window.addEventListener('resize', () => {
        const h = window.innerWidth * CANVAS_VH_FACTOR;
        camera.aspect = window.innerWidth / h;
        camera.updateProjectionMatrix();
        renderer.setSize(window.innerWidth, h);
        fitModelToView();
    });


}

// — DOM ready
document.addEventListener('DOMContentLoaded', function () {
    // .industries аккордеон
    document.querySelectorAll('.industries__item-toggle').forEach((toggle) => {
        toggle.addEventListener('click', () => {
            const item = toggle.closest('.industries__item');
            const body = item.querySelector('.industries__item-body');
            const isActive = item.classList.contains('active');

            // закрыть все
            document.querySelectorAll('.industries__item.active').forEach((el) => {
                el.classList.remove('active');
                el.querySelector('.industries__item-body').classList.remove('open');
            });

            // открыть текущий если был закрыт
            if (!isActive) {
                item.classList.add('active');
                body.classList.add('open');
            }
        });
    });

    const isSafari = () => {
        return (
            ~navigator.userAgent.indexOf('Safari') &&
            navigator.userAgent.indexOf('Chrome') < 0
        );
    };

    const isMobile = {
        Android: function () { return navigator.userAgent.match(/Android/i); },
        BlackBerry: function () { return navigator.userAgent.match(/BlackBerry/i); },
        iOS: function () { return navigator.userAgent.match(/iPhone|iPad|iPod/i); },
        Opera: function () { return navigator.userAgent.match(/Opera mini/i); },
        Windows: function () { return navigator.userAgent.match(/IEMobile/i); },
        any: function () {
            return (
                isMobile.Android() ||
                isMobile.BlackBerry() ||
                isMobile.iOS() ||
                isMobile.Opera() ||
                isMobile.Windows()
            );
        },
    };

    if (isMobile.any()) {
        document.querySelector('body').classList.add('v-mobile');
        document.querySelector('html').classList.add('v-mobile');
    } else {
        document.querySelector('body').classList.add('v-desk');
        document.querySelector('html').classList.add('v-desk');
    }

    if (isSafari() && window.location.hash) {
        const hash = window.location.hash;
        history.replaceState(null, '', window.location.pathname);

        window.addEventListener("load", () => {
            const target = document.querySelector(hash);
            if (target) {
                document.fonts.ready.then(() => {
                    ScrollTrigger.refresh();
                    requestAnimationFrame(() => {
                        smoother.scrollTo(target, true, `top top+=${header.offsetHeight}`);
                    });
                });
            }
        });
    }

    const header = document.querySelector('header');
    const footer = document.querySelector('footer');
    const headerBg = document.querySelector('.header__bg');
    const menu = document.querySelector('.header__menu');
    const menuOpen = document.querySelector('.header__burger');
    const menuClose = document.querySelector('.header__menu-close');

    document.body.style.setProperty('--header', header.offsetHeight + 'px');
    document.body.style.setProperty('--footer', footer.offsetHeight + 'px');

    addEventListener("resize", () => {
        document.body.style.setProperty('--header', header.offsetHeight + 'px');
        document.body.style.setProperty('--footer', footer.offsetHeight + 'px');
    });

    window.addEventListener('scroll', function () {
        if (window.scrollY > 0) {
            header.classList.add('scrolled');
        } else {
            header.classList.remove('scrolled');
        }
    });

    if (menu) {
        const menuItems = menu.querySelectorAll('a');

        function openMenu() {
            headerBg.classList.add('active');
            menu.classList.add('active');
            menuOpen.classList.add('active');
            document.body.classList.add('_lock');

            gsap.killTweensOf(menuItems);
            gsap.set(menuItems, { opacity: 0, y: 30 });
            gsap.to(menuItems, {
                opacity: 1, y: 0, duration: 0.4,
                ease: 'power1.out', stagger: 0.05, delay: 0.3,
            });
        }

        function closeMenu() {
            headerBg.classList.remove('active');
            menu.classList.remove('active');
            menuOpen.classList.remove('active');
            document.body.classList.remove('_lock');

            gsap.killTweensOf(menuItems);
            gsap.set(menuItems, { opacity: 0, y: 30 });
        }

        menuOpen.addEventListener('click', function () {
            menu.classList.contains('active') ? closeMenu() : openMenu();
        });

        menuClose.addEventListener('click', closeMenu);
        headerBg.addEventListener('click', closeMenu);
    }

    const currencyDropdowns = document.querySelectorAll('.banner__currency');

    if (currencyDropdowns.length) {
        currencyDropdowns.forEach(function (currencyDropdown) {
            const currencyToggle = currencyDropdown.querySelector('.banner__currency-current');
            const currencyMenu = currencyDropdown.querySelector('.banner__currency-list');
            const currencyItems = currencyDropdown.querySelectorAll('.banner__currency-item');
            const currencyHiddenInput = currencyDropdown
                .closest('.banner__form-input')
                .querySelector('input[name="buy_currency"]');

            currencyToggle.addEventListener('click', function (event) {
                event.stopPropagation();
                currencyDropdowns.forEach(function (otherDropdown) {
                    if (otherDropdown !== currencyDropdown) {
                        otherDropdown.querySelector('.banner__currency-list').classList.remove('active');
                    }
                });
                currencyMenu.classList.toggle('active');
            });

            currencyItems.forEach(function (currencyItem) {
                if (!currencyItem.classList.contains('banner__currency-current')) {
                    currencyItem.addEventListener('click', function (event) {
                        event.stopPropagation();
                        currencyItems.forEach(item => item.classList.remove('active'));
                        currencyItem.classList.add('active');

                        const selectedNameHTML = currencyItem.querySelector('.banner__currency-item--name').innerHTML;
                        const selectedIconHTML = currencyItem.querySelector('.banner__currency-item--icon').innerHTML;

                        currencyToggle.querySelector('.banner__currency-item--name').innerHTML = selectedNameHTML;
                        currencyToggle.querySelector('.banner__currency-item--icon').innerHTML = selectedIconHTML;

                        const selectedValue = currencyItem.querySelector('strong').innerText.trim();
                        if (currencyHiddenInput) currencyHiddenInput.value = selectedValue;

                        currencyMenu.classList.remove('active');
                    });
                }
            });
        });

        document.addEventListener('click', function () {
            document.querySelectorAll('.banner__currency-list').forEach(menu => menu.classList.remove('active'));
        });
    }

    const popup = document.querySelector(".popup");

    if (popup) {
        const openButtons = document.querySelectorAll(".open-popup");
        const closeBtn = document.querySelector(".popup__close");

        popup.addEventListener("click", (e) => {
            if (!e.target.closest(".popup__content")) closePopup();
        });

        function closePopup() {
            popup.classList.remove("active");
            document.body.style.overflow = "";
        }

        openButtons.forEach(btn => {
            btn.addEventListener("click", (e) => {
                e.preventDefault();
                popup.classList.add("active");
                document.body.style.overflow = "hidden";
            });
        });

        closeBtn.addEventListener("click", closePopup);
    }

    // GSAP
    gsap.registerPlugin(ScrollTrigger, ScrollSmoother);

    const smoother = ScrollSmoother.create({
        wrapper: '#smooth-wrapper',
        content: '#smooth-content',
        smooth: 1,
        effects: true,
        smoothTouch: 0.1
    });

    if (footer) {
        ScrollTrigger.create({
            trigger: footer,
            start: 'top bottom',
            onEnter: () => gsap.to(header, { opacity: 0, visibility: 'hidden', duration: 0.4, ease: 'power2.in' }),
            onLeaveBack: () => gsap.to(header, { opacity: 1, visibility: 'visible', duration: 0.4, ease: 'power2.out' }),
        });
    }

    document.addEventListener("click", function (e) {
        const gotoBtn = e.target.closest('[data-goto]');
        const anchorLink = e.target.closest('a[href*="#"]');
        let targetSelector = null;

        if (gotoBtn) {
            e.preventDefault();
            targetSelector = gotoBtn.dataset.goto;
        }

        if (anchorLink) {
            const hash = anchorLink.hash;
            if (hash && document.querySelector(hash)) {
                e.preventDefault();
                targetSelector = hash;
            }
        }

        if (targetSelector) {
            menu.classList.remove('active');
            document.body.classList.remove('_lock');
            smoother.scrollTo(targetSelector, true, `top top+=${header.offsetHeight}`);
        }
    });

    window.addEventListener("load", () => {
        if (window.location.hash) {
            const target = document.querySelector(window.location.hash);
            if (target) {
                setTimeout(() => {
                    smoother.scrollTo(target, true, `top top+=${header.offsetHeight}`);
                }, 100);
            }
        }
    });

    const animatedTitles = document.querySelectorAll('.animated-title');
    const totalDuration = 0.8;

    if (animatedTitles.length) {
        animatedTitles.forEach(title => {
            const rows = title.querySelectorAll('p');
            rows.forEach(row => {
                const letters = row.textContent.split('');
                row.textContent = '';
                letters.forEach(letter => {
                    const el = document.createElement('span');
                    el.textContent = letter === ' ' ? '\u00A0' : letter;
                    el.style.display = 'inline-block';
                    row.appendChild(el);
                });
            });

            const allSpans = title.querySelectorAll('p span');
            const stagger = totalDuration / allSpans.length;

            gsap.fromTo(allSpans,
                { opacity: 0, y: 5 },
                {
                    opacity: 1, y: 0, duration: 0.2,
                    ease: 'power2.out', stagger,
                    scrollTrigger: { trigger: title, start: 'top 80%' },
                }
            );
        });
    }

    document.querySelectorAll('.animated-text').forEach(block => {
        gsap.fromTo(block.querySelectorAll('p'),
            { opacity: 0, y: 20 },
            {
                opacity: 1, y: 0, duration: 0.6,
                ease: 'power2.out', stagger: 0.08,
                scrollTrigger: { trigger: block, start: 'top 80%' },
            }
        );
    });

    document.querySelectorAll('.anim-line-top, .anim-line-bottom, .anim-line-left, .anim-line-right').forEach((line, i) => {
        const partnerItem = line.closest('.partners__item');

        ScrollTrigger.create({
            trigger: line,
            start: 'top 95%',
            once: true,
            onEnter: () => {
                if (partnerItem) {
                    line.classList.add('animated');
                    if (!partnerItem._imgAnimated) {
                        partnerItem._imgAnimated = true;
                        gsap.fromTo(
                            partnerItem.querySelectorAll('img, svg'),
                            { opacity: 0, scale: 0 },
                            { opacity: 1, scale: 1, duration: 0.5, ease: 'power2.out' }
                        );
                    }
                } else {
                    gsap.delayedCall(i * 0.02, () => line.classList.add('animated'));
                }
            },
        });
    });

    document.querySelectorAll('.fadeInUp').forEach(button => {
        gsap.fromTo(button,
            { opacity: 0, y: 20 },
            {
                opacity: 1, y: 0, duration: 0.6, ease: 'power2.out',
                scrollTrigger: { trigger: button, start: 'top 80%' },
            }
        );
    });

    document.querySelectorAll('.fadeInRight').forEach(button => {
        gsap.fromTo(button,
            { opacity: 0, x: -40 },
            {
                opacity: 1, x: 0, duration: 1.2, ease: 'power2.out',
                scrollTrigger: { trigger: button, start: 'top 80%' },
            }
        );
    });

    document.querySelectorAll('.fadeInLeft').forEach(button => {
        gsap.fromTo(button,
            { opacity: 0, x: 40 },
            {
                opacity: 1, x: 0, duration: 1.2, ease: 'power2.out',
                scrollTrigger: { trigger: button, start: 'top 80%' },
            }
        );
    });

    // wave animation
    const createElm = function (menuItem) {
        let menuItemsTexts = menuItem.children[0].children[0];
        const menuItemsTextsArray = [...menuItemsTexts.textContent];
        menuItemsTexts.textContent = '';

        const textsArray = [];
        menuItemsTextsArray.forEach((menuItemText) => {
            if (menuItemText === ' ') {
                textsArray.push('<span style="display:inline-block;width:0.35em">&nbsp;</span>');
            } else {
                textsArray.push(`<span>${menuItemText}</span>`);
            }
        });

        menuItemsTexts.innerHTML = textsArray.join('');

        const parentElm = menuItemsTexts.parentElement;
        const parentElmHeight = parentElm.clientHeight;
        parentElm.style.height = `${parentElmHeight}px`;

        const cloneItem = menuItemsTexts.cloneNode(true);
        parentElm.appendChild(cloneItem);
    };

    const animation = function (menuItem) {
        gsap.defaults({
            ease: "power1.inOut",
            stagger: { amount: 0.14, from: "start" },
        });
        menuItem.addEventListener("mouseover", function () {
            gsap.to(this.children[0].children[0].children, { y: "-110%" });
            gsap.to(this.children[0].children[1].children, { y: "-110%" });
        });
        menuItem.addEventListener("mouseleave", function () {
            gsap.to(this.children[0].children[0].children, { y: "0" });
            gsap.to(this.children[0].children[1].children, { y: "0" });
        });
    };

    document.querySelectorAll(".hover-wave-text").forEach((targetItem) => {
        createElm(targetItem);
        animation(targetItem);
    });

    function initMarquee() {
        const track = document.querySelector('.exp__marquee-track');
        if (!track) return;

        const clone = track.cloneNode(true);
        track.parentElement.appendChild(clone);
        const trackWidth = track.offsetWidth;

        gsap.fromTo(
            [track, clone],
            { x: 0 },
            {
                x: -trackWidth, duration: 40, ease: 'none', repeat: -1,
                onRepeat() { gsap.set([track, clone], { x: 0 }); }
            }
        );
    }

    initMarquee();

    document.querySelectorAll('.footer__menu li, .footer__grid-button').forEach(button => {
        gsap.fromTo(button,
            { opacity: 0, y: 20 },
            {
                opacity: 1, y: 0, duration: 0.6, ease: 'power2.out',
                scrollTrigger: { trigger: button, start: 'top 90%' },
            }
        );
    });

    // if (footer) {
    //     const footerBg = footer.querySelector('.footer__bg');
    //     const footerAvailable = footer.querySelector('.footer__avaliable');
    //     const footerButton = footer.querySelector('.footer__button');

    //     gsap.set(footerBg, { scaleY: 0, transformOrigin: 'bottom' });
    //     if (footerAvailable) gsap.set(footerAvailable, { opacity: 0, y: 15 });
    //     if (footerButton) gsap.set(footerButton, { opacity: 0, y: 15 });

    //     ScrollTrigger.create({
    //         trigger: footer,
    //         start: 'top 80%',
    //         once: true,
    //         onEnter: () => {
    //             const ftl = gsap.timeline();
    //             ftl.to(footerBg, { scaleY: 1, duration: 1.6, ease: 'power4.inOut' })
    //                 .to(footerAvailable || [], { opacity: 1, y: 0, duration: 0.3, ease: 'power2.out' }, '-=0.1')
    //                 .to(footerButton || [], { opacity: 1, y: 0, duration: 0.35, ease: 'power2.out' }, '-=0.1');
    //         }
    //     });
    // }

    // const productsSlide = new Swiper('.products__slider .swiper', {
    //     loop: true,
    //     slidesPerView: 1,
    //     breakpoints: {
    //         768: { slidesPerView: 2 },
    //         1280: { slidesPerView: 3 },
    //     },
    //     navigation: {
    //         nextEl: '.products__slider .swiper-button-next',
    //         prevEl: '.products__slider .swiper-button-prev',
    //     },
    // });

    window.addEventListener('load', () => {
        setTimeout(() => ScrollTrigger.refresh(), 300);
    });





    // ─── Карточки: спираль-карусель вокруг оси спирали ─────────────────
    // Карточки — живой DOM (.cards__item, кликабельны, с hover). Они «нанизаны»
    // на ту же вертикальную ось, что и 3D-спираль: у каждой свой угловой сдвиг
    // (равномерно по кругу) и своя высота (спираль вверх). При скролле общий угол
    // растёт синхронно с group.rotation.y спирали, и карточки едут сзади → фронт →
    // назад, поднимаясь по столбу. Фронтальная — крупная, чёткая, кликабельная;
    // дальние — притушены и повёрнуты ребром (имитация «за спиралью»).
    function initSpiralCards() {
        const cards = gsap.utils.toArray('.cards__item');
        const section = document.querySelector('.cards');
        const list = document.querySelector('.cards__list');
        if (!cards.length || !section || !list) return;

        const N = cards.length;
        const TWO_PI = Math.PI * 2;

        // Общий множитель размера карточек: на десктопе крупнее (+10%),
        // на мобайле мельче (−20%). Мобайл определяется классом v-mobile,
        // который вешается на <html> выше по инициализации.
        const isMobileView = document.documentElement.classList.contains('v-mobile');
        const SIZE_FACTOR = isMobileView ? 0.8 : 1.1;

        // ─── Модель раскладки ──────────────────────────────────────────
        // Карточки распределяются РАВНОМЕРНО по всей высоте прокрутки секции.
        // У каждой карточки есть «родная» точка прогресса tCard(i): в этот момент
        // она строго во фронте (лицом к камере, по центру). Отклонение текущего
        // прогресса от родной точки задаёт и угол разворота (мягкое вращение),
        // и вертикальный сдвиг — карточка «живёт» вокруг своей точки на спирали.
        // Высота берётся от РЕАЛЬНОГО прогресса секции (а не от ширины экрана),
        // поэтому лента всегда занимает всю секцию, чем бы её ни растянули.

        // Расширяем рабочий диапазон на ~10% скролла с каждой стороны:
        // карточки начинают выезжать раньше (меньше отступ сверху) и
        // доигрывают позже (меньше отступ снизу). НО отступы не обнуляем:
        // нижним карточкам нужен запас скролла внутри пина, иначе на самом
        // конце (progress→1) триггер выходит и прячет весь список раньше, чем
        // хвостовые карточки успеют плавно догаснуть — отсюда рывок в конце.
        // PAD_TOP уменьшаем (старт раньше). PAD_BOT, наоборот, держим ЗАМЕТНЫМ:
        // после родной точки последней карточки (tCard = 1 - PAD_BOT) ей нужен
        // ход вниз, чтобы уехать из фронта и плавно догаснуть ДО конца пина.
        // Если PAD_BOT мал, последняя карточка на progress≈1 всё ещё во фронте,
        // и onLeave прячет её рывком. Поэтому финиш «позже» обеспечиваем не
        // урезанием PAD_BOT, а растяжкой самого хода в place().
        const PAD_TOP = 0.12;             // старт раньше, чем было (0.22)
        const PAD_BOT = 0.14;             // запас на плавный уход хвоста
        const SPAN = 1 - PAD_TOP - PAD_BOT; // рабочий диапазон прогресса
        const PER_CARD_TURNS = SPIRAL_PER_CARD_TURNS; // размах вращения карточки

        // Родная точка прогресса для карточки i (равномерно в пределах отступов).
        const tCard = (i) => PAD_TOP + (i / (N - 1)) * SPAN;

        // Геометрия карусели в px, зависит от размеров окна.
        const geom = () => {
            const w = window.innerWidth;
            const h = window.innerHeight;
            // Радиус круга (глубина/ширина разлёта карточек).
            const R = Math.max(360, Math.min(w * 0.60, 880));
            // Полный вертикальный ход ленты = высота видимой области минус запас,
            // чтобы крайние карточки не срезались. Точная привязка к экрану, а лента
            // размазана по SPAN прогресса, т.е. по всей длине секции.
            // Вертикальный ход веера. Ключевой момент: карточки живут в пределах
            // sticky-сцены высотой в один экран (100vh). Увеличенный коэффициент
            // разводит соседние карточки дальше друг от друга по высоте — на спирали
            // между ними появляется заметный зазор (карточки идут реже, не впритык).
            const RISE = h * 1.05;
            return { R, RISE };
        };

        // perspective на родителе (то же значение, что у section в SCSS).
        list.style.perspective = '1600px';
        list.style.perspectiveOrigin = '50% 42%';
        list.style.transformStyle = 'preserve-3d';

        // Разворачиваем каждую карточку из потока в 3D-слой поверх канваса.
        cards.forEach((card) => {
            card.style.position = 'absolute';
            card.style.top = '50%';
            card.style.left = '50%';
            card.style.margin = '0';
            card.style.transformStyle = 'preserve-3d';
            card.style.backfaceVisibility = 'hidden';
            card.style.willChange = 'transform, opacity';
        });

        // Ссылка внутри карточки — для управления кликабельностью по глубине.
        const linkOf = (card) => card.querySelector('.cards__item-link');

        // Раскладывает одну карточку по текущему прогрессу секции.
        //   p        — текущий прогресс скролла секции [0..1]
        //   home     — родная точка прогресса этой карточки (tCard(i))
        // Возвращает |угол| в градусах (для выбора фронтальной карточки).
        function place(card, p, home, R, RISE) {
            // Отклонение от родной точки (в долях рабочего диапазона).
            const d = (p - home) / SPAN;

            // Угол: фронт (0°) в родной точке, дальше — плавный разворот вокруг оси.
            const phi = d * PER_CARD_TURNS * TWO_PI;
            let a = phi % TWO_PI;
            if (a > Math.PI) a -= TWO_PI;
            if (a < -Math.PI) a += TWO_PI;

            // Знак горизонтали инвертирован: карточки заходят справа и уходят влево
            // (движение справа-налево). z и глубина от знака не зависят.
            const x = -R * Math.sin(a);
            const z = R * (Math.cos(a) - 1);           // фронт z=0, тыл z=-2R
            const rotateY = -a * 180 / Math.PI;

            // Высота: прямо от отклонения прогресса — карточка едет сверху вниз
            // мимо центра ровно в свою родную точку. Гарантирует равномерное
            // заполнение всей высоты секции с отступами PAD.
            const y = d * RISE;

            // Глубина: 1 на фронте → 0 в самой дальней точке круга.
            const depth = (Math.cos(a) + 1) / 2;

            // Прозрачность: гасим карточки, ушедшие далеко за ось.
            const absDeg = Math.abs(rotateY);
            let opacity;
            if (absDeg > 108) opacity = 0;
            else if (absDeg > 72) opacity = 1 - (absDeg - 72) / 36;
            else opacity = 1;
            // Мягкое затухание по мере удаления родной точки от текущего прогресса
            // (плавный «вход/выход» карточек сверху и снизу веера, без резкого поп-ина).
            // Гасим на более широком интервале (0.55→1.0) и по плавной кривой
            // (smoothstep), чтобы хвостовые карточки уходили в 0 без ступеньки и
            // успевали догаснуть до того, как триггер выйдет из пина.
            const ad = Math.abs(d);
            if (ad >= 1) {
                opacity = 0;
            } else if (ad > 0.55) {
                const k = (ad - 0.55) / 0.45;        // 0..1 на интервале затухания
                const fade = 1 - k * k * (3 - 2 * k); // smoothstep(1→0)
                opacity *= fade;
            }

            const brightness = 0.5 + 0.5 * depth;
            const scale = (0.85 + 0.15 * depth) * SIZE_FACTOR;

            gsap.set(card, {
                xPercent: -50,
                yPercent: -50,
                x,
                y,
                z,
                rotateY,
                scale,
                opacity,
                filter: `brightness(${brightness})`,
                zIndex: Math.round(depth * 100),
                transformPerspective: 1600,
                overwrite: 'auto',
            });

            return absDeg;
        }

        let cache = geom();

        // Плавное общее затухание всего веера у краёв прогресса секции.
        // Убирает «щелчок» в конце: вместо мгновенного onLeave-скрытия список
        // за последние EDGE долей прогресса плавно уходит в 0 (и симметрично
        // проявляется в начале). Работает поверх per-card прозрачности.
        const EDGE = 0.06;
        function edgeFade(p) {
            let f = 1;
            if (p < EDGE) f = p / EDGE;
            else if (p > 1 - EDGE) f = (1 - p) / EDGE;
            f = Math.max(0, Math.min(1, f));
            return f * f * (3 - 2 * f); // smoothstep
        }

        // Раскладывает все карточки для текущего прогресса секции и назначает
        // кликабельность ЕДИНСТВЕННОЙ карточке, ближайшей к фронту.
        function layout(p) {
            const { R, RISE } = cache;
            list.style.opacity = String(edgeFade(p));
            let bestIdx = -1, bestAbs = Infinity;
            cards.forEach((card, i) => {
                const absDeg = place(card, p, tCard(i), R, RISE);
                // Кандидат во фронт — только карточка рядом со своей родной точкой.
                if (absDeg < bestAbs && Math.abs((p - tCard(i)) / SPAN) < 0.5) {
                    bestAbs = absDeg; bestIdx = i;
                }
            });

            cards.forEach((card, i) => {
                const isFront = i === bestIdx && bestAbs < 40;
                card.style.pointerEvents = isFront ? 'auto' : 'none';
                card.classList.toggle('is-front', isFront);
                const link = linkOf(card);
                if (link) link.tabIndex = isFront ? 0 : -1;
            });
        }

        const st = ScrollTrigger.create({
            trigger: section,
            // Пиним сцену карточек к вьюпорту на всё время, пока секция проходит
            // экран: от «верх секции достиг верха экрана» до «низ секции достиг
            // низа экрана». Внутри этого диапазона layout(progress) распределяет
            // карточки по вертикали. pin работает корректно со ScrollSmoother,
            // в отличие от CSS sticky.
            pin: list,
            pinSpacing: false, // секция уже достаточно высокая; лишний спейсер не нужен
            anticipatePin: 1,
            start: 'top top',
            end: 'bottom bottom',
            scrub: 1,
            onRefresh: () => { cache = geom(); },
            onUpdate: (self) => {
                layout(self.progress);
            },
            // Карточки видимы только пока секция запинена (идёт анимация).
            // До входа в триггер (скролл выше секции) и после выхода — скрыты,
            // чтобы разложенный веер не «висел» на экране до старта анимации.
            onEnter:     () => { list.style.visibility = 'visible'; },
            onEnterBack: () => { list.style.visibility = 'visible'; },
            onLeave:     () => { list.style.visibility = 'hidden'; },
            onLeaveBack: () => { list.style.visibility = 'hidden'; },
        });

        // Стартовое состояние — скрыто. Раскладываем карточки заранее (layout(0)),
        // но контейнер прячем: он проявится через onEnter, когда секция дойдёт до
        // пина и анимация действительно начнётся.
        list.style.visibility = 'hidden';
        layout(0);

        // Подстраховка на случай загрузки страницы уже внутри секции (reload на
        // середине): onEnter тогда не сработает, поэтому выставляем видимость по
        // фактическому состоянию триггера.
        if (st.isActive) {
            list.style.visibility = 'visible';
            layout(st.progress);
        }

        window.addEventListener('resize', () => {
            cache = geom();
            ScrollTrigger.refresh();
        });

        return st;
    }

    initSpiralCards();
});

// — Hero: анимированная лента
document.addEventListener('DOMContentLoaded', function () {
    initHeroRibbon();
});
