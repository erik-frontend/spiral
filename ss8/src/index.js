import * as THREE from "three";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { ScrollSmoother } from "gsap/ScrollSmoother";

import "./styles/main.scss";
import { initHeroRibbon } from "./ribbon/HeroRibbon.js";

gsap.registerPlugin(ScrollTrigger, ScrollSmoother);

const SPIRAL = {
  turns: 5.2,
  radiusRatio: 0.3,
  ribbonWidth: 4.7,
  lengthSegments: 700,
  widthSegments: 16,

  cardsPerTurn: 4.5,
  cardWidth: 3.3,
  cardHeight: 3.5,
  cardSegments: 32,
  cardOffset: 0.045,

  color: 0x0755aa,
};

function initProceduralSpiral() {
  const canvas = document.querySelector("#canvas");
  const section = document.querySelector(".cards");
  const list = document.querySelector(".cards__list");

  if (!canvas || !section || !list) return;

  const htmlCards = [...document.querySelectorAll(".cards__item")];

  if (!htmlCards.length) return;

  const scene = new THREE.Scene();

  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 100);

  camera.position.set(0, 0, 30);
  camera.lookAt(0, 0, 0);

  const renderer = new THREE.WebGLRenderer({
    canvas,
    alpha: true,
    antialias: true,
  });

  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));

  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.setClearColor(0x000000, 0);



  // --------------------------------------------------------
  // LIGHTS
  // --------------------------------------------------------
  const ambientLight = new THREE.HemisphereLight(0xffffff, 0x0a2d64, 2.2);

  scene.add(ambientLight);

  const directionalLight = new THREE.DirectionalLight(0xffffff, 2.4);

  directionalLight.position.set(-8, 12, 14);
  scene.add(directionalLight);

  const fillLight = new THREE.DirectionalLight(0x38aaff, 1.1);

  fillLight.position.set(8, -6, -8);
  scene.add(fillLight);


  

  // --------------------------------------------------------
  // SCENE DIMENSIONS
  // --------------------------------------------------------
  let spiralRadius = 1;
  let spiralHeight = 1;
  let ribbon = null;

  let currentProgress = 0;
  let scrollTrigger = null;
  let disposed = false;

  const TAU = Math.PI * 2;

  const clamp = THREE.MathUtils.clamp;

  function smooth(a, b, value) {
    const x = clamp((value - a) / (b - a), 0, 1);

    return x * x * (3 - 2 * x);
  }



  // ----------------------------------------------------------
  // SHARED SPIRAL PATH
  // --------------------------------------------------------
  function getSpiralPoint(
    t,
    radius = spiralRadius,
    target = new THREE.Vector3(),
  ) {
    const angle = t * TAU * SPIRAL.turns;

    return target.set(
      Math.sin(angle) * radius,
      spiralHeight * (0.5 - t),
      Math.cos(angle) * radius,
    );
  }





  // -----------------
  // ---------------------------------------
  // SPIRAL GEOMETRY
  // --------------------------------------------------------
  function createSpiralGeometry() {
    const L = SPIRAL.lengthSegments;
    const W = SPIRAL.widthSegments;

    const positions = [];
    const colors = [];
    const indices = [];

    const colorDark = new THREE.Color("#063b82");
    const colorLight = new THREE.Color("#087bd3");

    for (let i = 0; i <= L; i++) {
      const t = i / L;

      const angle = t * TAU * SPIRAL.turns;

      const centerY = spiralHeight * (0.5 - t);

      for (let j = 0; j <= W; j++) {
        const u = j / W;

        // const verticalOffset = (u - 0.5) * SPIRAL.ribbonWidth;

        // Длина участков с плавным сужением
const taperLength = 0.08;

// Плавное сужение в начале и конце
const startTaper = smooth(0, taperLength, t);

const endTaper = 1 - smooth(
    1 - taperLength,
    1,
    t
);

const taper = startTaper * endTaper;

// Минимальная ширина на кончиках — 8% от основной
const widthFactor = 0.08 + 0.92 * taper;

const verticalOffset =
    (u - 0.5) *
    SPIRAL.ribbonWidth *
    widthFactor;

        const x = Math.sin(angle) * spiralRadius;

        const y = centerY + verticalOffset;

        const z = Math.cos(angle) * spiralRadius;

        positions.push(x, y, z);

        const color = colorDark.clone().lerp(colorLight, u);

        colors.push(color.r, color.g, color.b);

        if (i < L && j < W) {
          const k = i * (W + 1) + j;

          indices.push(k, k + W + 1, k + 1);

          indices.push(k + 1, k + W + 1, k + W + 2);
        }
      }
    }

    const geometry = new THREE.BufferGeometry();

    geometry.setAttribute(
      "position",
      new THREE.Float32BufferAttribute(positions, 3),
    );

    geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));

    geometry.setIndex(indices);
    geometry.computeVertexNormals();

    return geometry;
  }

  const spiralMaterial = new THREE.MeshPhysicalMaterial({
    color: 0xffffff,
    vertexColors: true,
    metalness: 0.18,
    roughness: 0.34,
    clearcoat: 0.65,
    clearcoatRoughness: 0.22,
    side: THREE.DoubleSide,
    depthTest: true,
    depthWrite: true,
  });





  // --------------------------------------------------------
  // CARD CONTENT
  // --------------------------------------------------------
  function getCardData(element) {
    const title =
      element.querySelector("h3, h2, h4")?.textContent?.trim() ||
      element.querySelector(".cards__item-title")?.textContent?.trim() ||
      "Service";

    const description = element.querySelector("p")?.textContent?.trim() || "";

    const image = element.querySelector("img");

    const link = element.querySelector("a[href]");

    return {
      title,
      description,
      imageSrc: image?.currentSrc || image?.src || null,
      href: link?.href || null,
      label: link?.textContent?.trim() || "Learn more",
    };
  }

  const cardData = htmlCards.map(getCardData);





  // ---------------------------------------------------
  // TEXTURE HELPERS
  // ------------------------------------------------------


  
  function roundedRect(ctx, x, y, width, height, radius) {
    const r = Math.min(radius, width / 2, height / 2);

    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + width - r, y);
    ctx.quadraticCurveTo(x + width, y, x + width, y + r);
    ctx.lineTo(x + width, y + height - r);
    ctx.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
    ctx.lineTo(x + r, y + height);
    ctx.quadraticCurveTo(x, y + height, x, y + height - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  }

  function wrapText(ctx, text, x, y, maxWidth, lineHeight, maxLines = 4) {
    const words = text.split(/\s+/);
    let line = "";
    let lines = 0;

    for (let i = 0; i < words.length; i++) {
      const testLine = line ? `${line} ${words[i]}` : words[i];

      if (ctx.measureText(testLine).width > maxWidth && line) {
        ctx.fillText(line, x, y);
        y += lineHeight;
        lines++;

        if (lines >= maxLines) return y;

        line = words[i];
      } else {
        line = testLine;
      }
    }

    if (line && lines < maxLines) {
      ctx.fillText(line, x, y);
      y += lineHeight;
    }

    return y;
  }

  function loadImage(src) {
    return new Promise((resolve) => {
      if (!src) {
        resolve(null);
        return;
      }

      const image = new Image();
      image.crossOrigin = "anonymous";

      image.onload = () => resolve(image);
      image.onerror = () => resolve(null);

      image.src = src;
    });
  }

  async function createCardTexture(data) {
    const width = 512;
    const height = 600;

    const textureCanvas = document.createElement("canvas");

    textureCanvas.width = width;
    textureCanvas.height = height;

    const ctx = textureCanvas.getContext("2d");



    // White background
    ctx.fillStyle = "#ffffff";

    roundedRect(ctx, 0, 0, width, height, 18);

    ctx.fill();



    // Card image
    const image = await loadImage(data.imageSrc);

    if (image) {
      const imageHeight = 310;

      ctx.save();

      roundedRect(ctx, 0, 0, width, imageHeight, 18);

      ctx.clip();

      const ratio = Math.max(width / image.width, imageHeight / image.height);

      const drawWidth = image.width * ratio;
      const drawHeight = image.height * ratio;

      ctx.drawImage(
        image,
        (width - drawWidth) / 2,
        (imageHeight - drawHeight) / 2,
        drawWidth,
        drawHeight,
      );

      ctx.restore();
    } else {
      const gradient = ctx.createLinearGradient(0, 0, width, 310);

      gradient.addColorStop(0, "#0c75d4");
      gradient.addColorStop(1, "#062b67");

      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, width, 310);
    }



    // Title
    ctx.fillStyle = "#101010";
    ctx.font = "bold 39px Arial, sans-serif";

    const descriptionStart = wrapText(
      ctx,
      data.title,
      30,
      365,
      width - 60,
      43,
      2,
    );



    // Description
    ctx.fillStyle = "#555555";
    ctx.font = "23px Arial, sans-serif";

    wrapText(
      ctx,
      data.description,
      30,
      descriptionStart + 13,
      width - 60,
      29,
      4,
    );



    // Link
    ctx.fillStyle = "#0866cc";
    ctx.font = "bold 24px Arial, sans-serif";

    ctx.fillText(data.label, 30, height - 34);

    const texture = new THREE.CanvasTexture(textureCanvas);

    texture.colorSpace = THREE.SRGBColorSpace;

    texture.anisotropy = Math.min(renderer.capabilities.getMaxAnisotropy(), 8);

    texture.needsUpdate = true;

    return texture;
  }



  // -----------------------------------------------------
  // CURVED CARD GEOMETRY
  // -------------------------------------------------------



  function createCurvedCardGeometry(radius) {
    const geometry = new THREE.PlaneGeometry(
      SPIRAL.cardWidth,
      SPIRAL.cardHeight,
      SPIRAL.cardSegments,
      1,
    );

    const positions = geometry.attributes.position;

    for (let i = 0; i < positions.count; i++) {
      const x = positions.getX(i);
      const y = positions.getY(i);

      const angle = x / radius;

      positions.setXYZ(
        i,
        Math.sin(angle) * radius,
        y,
        Math.cos(angle) * radius - radius,
      );
    }

    positions.needsUpdate = true;
    geometry.computeVertexNormals();

    return geometry;
  }


  // ----------------------------------------------------
  // CARD MESHES
  // -------------------------------------------------


  const cardMeshes = [];
  const cardGroup = new THREE.Group();

  scene.add(cardGroup);

  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();

  function updateCardGeometry() {
    cardMeshes.forEach((mesh) => {
      if (!mesh) return;

      mesh.geometry.dispose();

      mesh.geometry = createCurvedCardGeometry(
        spiralRadius + SPIRAL.cardOffset,
      );
    });
  }


  // ----------------------------------------------------------
  // SCROLL ANIMATION
  // --------------------------------------------------------


function updateCards(progress) {
    currentProgress = progress;

    const count = cardMeshes.length;

    if (!count) return;

    const stride =
        1 / (SPIRAL.turns * SPIRAL.cardsPerTurn);

    // Длина одного полного цикла карточек
    const cycleLength = count * stride;

    // Насколько карточки сдвигаются при прокрутке
    const scrollOffset = progress * cycleLength;

    const radius =
        spiralRadius + SPIRAL.cardOffset;

    cardMeshes.forEach((mesh, index) => {
        if (!mesh) return;

        // Каждая карточка получает своё место в последовательности
        let t = index * stride + scrollOffset;

        // Циклический переход
        t = ((t % cycleLength) + cycleLength) % cycleLength;

        // Центрируем последовательность на спирали
        t += (1 - cycleLength) / 2;

        // Если карточка вышла за границы ленты временно скрываем её
        if (t < 0 || t > 1) {
            mesh.visible = false;
            return;
        }

        mesh.visible = true;

        const angleOffset =
            THREE.MathUtils.degToRad(10);

        const adjustedT =
            t + angleOffset / (TAU * SPIRAL.turns);

        const angle =
            adjustedT * TAU * SPIRAL.turns;

        getSpiralPoint(
            adjustedT,
            radius,
            mesh.position
        );

        // Сохраняем наклон карточки вправо
        mesh.rotation.set(
            0,
            angle,
            THREE.MathUtils.degToRad(-5)
        );

        // Плавное появление и исчезновение
        const fadeIn = smooth(0.02, 0.12, t);

        const fadeOut =
            1 - smooth(0.88, 0.98, t);

        mesh.material.opacity =
            fadeIn * fadeOut;
    });

    renderer.render(scene, camera);
}


  // ------------------------------------------------------------
  // RESIZE
  // ----------------------------------------------------------



  function resizeScene() {
    if (disposed) return;

    const rect = canvas.getBoundingClientRect();

    const width = Math.max(1, rect.width);
    const height = Math.max(1, rect.height);

    const worldW = width / 100;
    const worldH = height / 100;

    camera.left = -worldW / 2;
    camera.right = worldW / 2;
    camera.top = worldH / 2;
    camera.bottom = -worldH / 2;

    camera.updateProjectionMatrix();

    renderer.setSize(width, height, false);

    spiralRadius = Math.min(worldW * SPIRAL.radiusRatio, 6.8);

    spiralHeight = worldH * 0.94;

    if (ribbon) {
      scene.remove(ribbon);
      ribbon.geometry.dispose();
    }

    ribbon = new THREE.Mesh(createSpiralGeometry(), spiralMaterial);

    scene.add(ribbon);

    updateCardGeometry();
    updateCards(currentProgress);
  }

  // ----------------------------------------------------------
  // CREATE ALL CARDS
  // -----------------------------------------------------------

  
async function createCards() {
    // Рассчитываем количество карточек,
    // необходимое для заполнения спирали
    const totalCards = Math.ceil(
        SPIRAL.turns * SPIRAL.cardsPerTurn
    );

    // Создаём текстуры только для уникальных карточек
    const textures = await Promise.all(
        cardData.map(data => createCardTexture(data))
    );

    if (disposed) {
        textures.forEach(texture => texture.dispose());
        return;
    }

    // Создаём нужное количество 3D-карточек
    for (let i = 0; i < totalCards; i++) {
        // Повторяем исходные карточки по кругу
        const originalIndex = i % cardData.length;

        const data = cardData[originalIndex];
        const texture = textures[originalIndex];

        const material = new THREE.MeshBasicMaterial({
            map: texture,
            transparent: true,
            opacity: 1,
            side: THREE.DoubleSide,
            depthTest: true,
            depthWrite: false,
            polygonOffset: true,
            polygonOffsetFactor: -1,
            polygonOffsetUnits: -1,
        });

        const mesh = new THREE.Mesh(
            createCurvedCardGeometry(
                spiralRadius + SPIRAL.cardOffset
            ),
            material
        );

        mesh.userData = {
            index: i,
            originalIndex,
            href: data.href,
        };

        mesh.visible = false;

        cardGroup.add(mesh);
        cardMeshes.push(mesh);
    }

    // Скрываем исходные HTML-карточки
    htmlCards.forEach(card => {
        card.style.visibility = 'hidden';
        card.style.pointerEvents = 'none';
    });

    // Обновляем расположение всех 3D-карточек
    updateCards(currentProgress);

    // Обновляем ScrollTrigger после создания карточек
    ScrollTrigger.refresh();
}



  // ----------------------------------------------------------
  // CLICK ON 3D CARD-
  // -------------------------------------------------------------




  function handleCanvasClick(event) {
    const rect = canvas.getBoundingClientRect();

    pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;

    pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

    raycaster.setFromCamera(pointer, camera);

    // Check both ribbon and cards, so cards
    // behind the ribbon are not clickable.
    const objects = [...cardMeshes.filter(Boolean), ribbon].filter(Boolean);

    const intersections = raycaster.intersectObjects(objects, false);

    if (!intersections.length) return;

    const first = intersections[0].object;

    if (!cardMeshes.includes(first)) return;

    const href = first.userData.href;

    if (href) {
      window.location.href = href;
    }
  }

  canvas.addEventListener("click", handleCanvasClick);


  // ------------------------------------------------------------
  // SCROLLTRIGGER
  // -----------------------------------------------------------



 function initScroll() {
    scrollTrigger = ScrollTrigger.create({
        id: 'proceduralSpiral',

        trigger: section,

        pin: list,
        pinSpacing: false,
        anticipatePin: 1,

        start: 'top 40%',

        // Продолжаем анимацию, пока секция
        // почти полностью не уйдёт за экран
        end: 'bottom top',

        scrub: 1,

        invalidateOnRefresh: true,

        onUpdate: self => {
            updateCards(self.progress);
        },

        onRefresh: self => {
            updateCards(self.progress);
        }
    });

    updateCards(scrollTrigger.progress);
}

  
  // INITIALIZATION
  

  resizeScene();

  createCards().catch((error) => {
    console.error("Failed to create 3D cards:", error);
  });

  initScroll();

  window.addEventListener("resize", resizeScene, { passive: true });

  window.addEventListener("load", () => {
    resizeScene();
    ScrollTrigger.refresh();
  });
}












// DOM

document.addEventListener("DOMContentLoaded", () => {
    // ACCORDION


  document.querySelectorAll(".industries__item-toggle").forEach((toggle) => {
    toggle.addEventListener("click", () => {
      const item = toggle.closest(".industries__item");

      if (!item) return;

      const body = item.querySelector(".industries__item-body");

      const isActive = item.classList.contains("active");

      document
        .querySelectorAll(".industries__item.active")
        .forEach((activeItem) => {
          activeItem.classList.remove("active");

          activeItem
            .querySelector(".industries__item-body")
            ?.classList.remove("open");
        });

      if (!isActive) {
        item.classList.add("active");
        body?.classList.add("open");
      }
    });
  });




  // DEVICE CLASS



  const mobileRegex =
    /Android|BlackBerry|iPhone|iPad|iPod|Opera Mini|IEMobile/i;

  const mobile = mobileRegex.test(navigator.userAgent);

  document.body.classList.add(mobile ? "v-mobile" : "v-desk");

  document.documentElement.classList.add(mobile ? "v-mobile" : "v-desk");



  // HEADER / FOOTER



  const header = document.querySelector("header");
  const footer = document.querySelector("footer");

  const headerBg = document.querySelector(".header__bg");

  const menu = document.querySelector(".header__menu");

  const menuOpen = document.querySelector(".header__burger");

  const menuClose = document.querySelector(".header__menu-close");

  function updateLayoutVariables() {
    document.body.style.setProperty(
      "--header",
      `${header?.offsetHeight || 0}px`,
    );

    document.body.style.setProperty(
      "--footer",
      `${footer?.offsetHeight || 0}px`,
    );
  }

  updateLayoutVariables();

  window.addEventListener("resize", updateLayoutVariables);

  window.addEventListener("scroll", () => {
    header?.classList.toggle("scrolled", window.scrollY > 0);
  });

 

  // MOBILE MENU
 


  function openMenu() {
    if (!menu) return;

    headerBg?.classList.add("active");
    menu.classList.add("active");
    menuOpen?.classList.add("active");

    document.body.classList.add("_lock");

    const items = menu.querySelectorAll("a");

    gsap.killTweensOf(items);

    gsap.fromTo(
      items,
      {
        opacity: 0,
        y: 30,
      },
      {
        opacity: 1,
        y: 0,
        duration: 0.4,
        stagger: 0.05,
        delay: 0.3,
        ease: "power1.out",
      },
    );
  }

  function closeMenu() {
    headerBg?.classList.remove("active");
    menu?.classList.remove("active");
    menuOpen?.classList.remove("active");

    document.body.classList.remove("_lock");
  }

  menuOpen?.addEventListener("click", () => {
    if (menu?.classList.contains("active")) {
      closeMenu();
    } else {
      openMenu();
    }
  });

  menuClose?.addEventListener("click", closeMenu);

  headerBg?.addEventListener("click", closeMenu);



  // CURRENCY DROPDOWNS



  const currencyDropdowns = document.querySelectorAll(".banner__currency");

  currencyDropdowns.forEach((dropdown) => {
    const toggle = dropdown.querySelector(".banner__currency-current");

    const dropdownMenu = dropdown.querySelector(".banner__currency-list");

    const items = dropdown.querySelectorAll(".banner__currency-item");

    const hiddenInput = dropdown
      .closest(".banner__form-input")
      ?.querySelector('input[name="buy_currency"]');

    toggle?.addEventListener("click", (event) => {
      event.stopPropagation();

      currencyDropdowns.forEach((other) => {
        if (other !== dropdown) {
          other
            .querySelector(".banner__currency-list")
            ?.classList.remove("active");
        }
      });

      dropdownMenu?.classList.toggle("active");
    });

    items.forEach((item) => {
      if (item === toggle) return;

      item.addEventListener("click", (event) => {
        event.stopPropagation();

        items.forEach((el) => {
          el.classList.remove("active");
        });

        item.classList.add("active");

        const name = item.querySelector(".banner__currency-item--name");

        const icon = item.querySelector(".banner__currency-item--icon");

        const toggleName = toggle?.querySelector(
          ".banner__currency-item--name",
        );

        const toggleIcon = toggle?.querySelector(
          ".banner__currency-item--icon",
        );

        if (name && toggleName) {
          toggleName.innerHTML = name.innerHTML;
        }

        if (icon && toggleIcon) {
          toggleIcon.innerHTML = icon.innerHTML;
        }

        if (hiddenInput) {
          hiddenInput.value =
            item.querySelector("strong")?.textContent?.trim() || "";
        }

        dropdownMenu?.classList.remove("active");
      });
    });
  });

  document.addEventListener("click", () => {
    document
      .querySelectorAll(".banner__currency-list")
      .forEach((el) => el.classList.remove("active"));
  });


  // POPUP


  const popup = document.querySelector(".popup");

  function closePopup() {
    popup?.classList.remove("active");
    document.body.style.overflow = "";
  }

  if (popup) {
    document.querySelectorAll(".open-popup").forEach((button) => {
      button.addEventListener("click", (event) => {
        event.preventDefault();

        popup.classList.add("active");
        document.body.style.overflow = "hidden";
      });
    });

    popup.querySelector(".popup__close")?.addEventListener("click", closePopup);

    popup.addEventListener("click", (event) => {
      if (!event.target.closest(".popup__content")) {
        closePopup();
      }
    });
  }



  // SCROLL SMOOTHER
 

  const smoothWrapper = document.querySelector("#smooth-wrapper");

  const smoothContent = document.querySelector("#smooth-content");

  const smoother =
    smoothWrapper && smoothContent
      ? ScrollSmoother.create({
          wrapper: "#smooth-wrapper",
          content: "#smooth-content",
          smooth: 1,
          effects: true,
          smoothTouch: 0.1,
        })
      : null;

 
  // FOOTER HEADER ANIMATION


  if (footer && header) {
    ScrollTrigger.create({
      trigger: footer,
      start: "top bottom",

      onEnter: () => {
        gsap.to(header, {
          opacity: 0,
          visibility: "hidden",
          duration: 0.4,
          ease: "power2.in",
        });
      },

      onLeaveBack: () => {
        gsap.to(header, {
          opacity: 1,
          visibility: "visible",
          duration: 0.4,
          ease: "power2.out",
        });
      },
    });
  }

  
  // ANCHOR NAVIGATION
  

  document.addEventListener("click", (event) => {
    const gotoButton = event.target.closest("[data-goto]");

    const anchor = event.target.closest('a[href*="#"]');

    let targetSelector = null;

    if (gotoButton) {
      targetSelector = gotoButton.dataset.goto;
    } else if (anchor) {
      const hash = anchor.hash;

      if (hash && document.querySelector(hash)) {
        targetSelector = hash;
      }
    }

    if (!targetSelector) return;

    const target = document.querySelector(targetSelector);

    if (!target) return;

    event.preventDefault();
    closeMenu();

    if (smoother) {
      smoother.scrollTo(target, true, `top top+=${header?.offsetHeight || 0}`);
    } else {
      target.scrollIntoView({
        behavior: "smooth",
      });
    }
  });

  window.addEventListener("load", () => {
    if (!window.location.hash) return;

    const target = document.querySelector(window.location.hash);

    if (!target) return;

    setTimeout(() => {
      if (smoother) {
        smoother.scrollTo(
          target,
          true,
          `top top+=${header?.offsetHeight || 0}`,
        );
      } else {
        target.scrollIntoView();
      }
    }, 100);
  });

  
  // ANIMATED TITLES
 

  const animatedTitles = document.querySelectorAll(".animated-title");

  animatedTitles.forEach((title) => {
    const rows = title.querySelectorAll("p");

    rows.forEach((row) => {
      const letters = [...row.textContent];

      row.textContent = "";

      letters.forEach((letter) => {
        const span = document.createElement("span");

        span.textContent = letter === " " ? "\u00A0" : letter;

        span.style.display = "inline-block";

        row.appendChild(span);
      });
    });

    const spans = title.querySelectorAll("p span");

    if (!spans.length) return;

    gsap.fromTo(
      spans,
      {
        opacity: 0,
        y: 5,
      },
      {
        opacity: 1,
        y: 0,
        duration: 0.2,
        stagger: 0.8 / spans.length,
        ease: "power2.out",

        scrollTrigger: {
          trigger: title,
          start: "top 80%",
        },
      },
    );
  });

  
  // ANIMATED TEXT
  

  document.querySelectorAll(".animated-text").forEach((block) => {
    gsap.fromTo(
      block.querySelectorAll("p"),
      {
        opacity: 0,
        y: 20,
      },
      {
        opacity: 1,
        y: 0,
        duration: 0.6,
        stagger: 0.08,
        ease: "power2.out",

        scrollTrigger: {
          trigger: block,
          start: "top 80%",
        },
      },
    );
  });

 
  // LINES AND PARTNERS
 

  document
    .querySelectorAll(
      ".anim-line-top, .anim-line-bottom, .anim-line-left, .anim-line-right",
    )
    .forEach((line, index) => {
      const partnerItem = line.closest(".partners__item");

      ScrollTrigger.create({
        trigger: line,
        start: "top 95%",
        once: true,

        onEnter: () => {
          if (partnerItem) {
            line.classList.add("animated");

            if (!partnerItem._imgAnimated) {
              partnerItem._imgAnimated = true;

              gsap.fromTo(
                partnerItem.querySelectorAll("img, svg"),
                {
                  opacity: 0,
                  scale: 0,
                },
                {
                  opacity: 1,
                  scale: 1,
                  duration: 0.5,
                  ease: "power2.out",
                },
              );
            }
          } else {
            gsap.delayedCall(index * 0.02, () =>
              line.classList.add("animated"),
            );
          }
        },
      });
    });

  
  // FADE ANIMATIONS
 

  function createFadeAnimation(selector, from, duration) {
    document.querySelectorAll(selector).forEach((element) => {
      gsap.fromTo(
        element,
        {
          opacity: 0,
          ...from,
        },
        {
          opacity: 1,
          x: 0,
          y: 0,
          duration,
          ease: "power2.out",

          scrollTrigger: {
            trigger: element,
            start: "top 80%",
          },
        },
      );
    });
  }

  createFadeAnimation(".fadeInUp", { y: 20 }, 0.6);

  createFadeAnimation(".fadeInRight", { x: -40 }, 1.2);

  createFadeAnimation(".fadeInLeft", { x: 40 }, 1.2);

  
  // HOVER WAVE TEXT
  

  document.querySelectorAll(".hover-wave-text").forEach((item) => {
    const wrapper = item.children[0];
    const textElement = wrapper?.children[0];

    if (!textElement) return;

    const text = [...textElement.textContent];

    textElement.textContent = "";

    text.forEach((character) => {
      const span = document.createElement("span");

      span.textContent = character === " " ? "\u00A0" : character;

      textElement.appendChild(span);
    });

    const height = wrapper.clientHeight;

    wrapper.style.height = `${height}px`;

    const clone = textElement.cloneNode(true);

    wrapper.appendChild(clone);

    item.addEventListener("mouseover", () => {
      gsap.to([textElement.children, clone.children], {
        y: "-110%",
        stagger: 0.02,
        ease: "power1.inOut",
      });
    });

    item.addEventListener("mouseleave", () => {
      gsap.to([textElement.children, clone.children], {
        y: "0%",
        stagger: 0.02,
        ease: "power1.inOut",
      });
    });
  });

  
  // MARQUEE
 

  function initMarquee() {
    const track = document.querySelector(".exp__marquee-track");

    if (!track) return;

    const clone = track.cloneNode(true);

    track.parentElement.appendChild(clone);

    const trackWidth = track.offsetWidth;

    gsap.fromTo(
      [track, clone],
      {
        x: 0,
      },
      {
        x: -trackWidth,
        duration: 40,
        ease: "none",
        repeat: -1,

        onRepeat: () => {
          gsap.set([track, clone], { x: 0 });
        },
      },
    );
  }

  initMarquee();

  
  // FOOTER ANIMATIONS
  

  document
    .querySelectorAll(".footer__menu li, .footer__grid-button")
    .forEach((element) => {
      gsap.fromTo(
        element,
        {
          opacity: 0,
          y: 20,
        },
        {
          opacity: 1,
          y: 0,
          duration: 0.6,
          ease: "power2.out",

          scrollTrigger: {
            trigger: element,
            start: "top 90%",
          },
        },
      );
    });

  
  // INITIALIZE THREE.JS SPIRAL

  initProceduralSpiral();


  // INITIALIZE HERO RIBBON
 
  initHeroRibbon();


  // REFRESH SCROLLTRIGGER
  

  window.addEventListener("load", () => {
    setTimeout(() => {
      ScrollTrigger.refresh();
    }, 300);
  });
});
