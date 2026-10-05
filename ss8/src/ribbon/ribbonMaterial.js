import * as THREE from 'three';

/**
 * Материал ленты: «стекло», преломляющее размытый текст заголовка.
 *
 * uContent — предварительно размытый рендер текстовой плоскости на белом фоне.
 *            Белый = пусто, чёрный = чернила буквы.
 *            В шейдере берём (1 - refr): там, где за лентой буква,
 *            яркость добавляется → буква проступает светлым призраком.
 *
 * Преломление считается только для передней половины ленты (vWPos.z > 0).
 * Задняя половина лежит за текстовой плоскостью и перекрывается ею по depth-тесту,
 * поэтому там буквы остаются чистым #000 — ровно как в макете.
 */

const vertexShader = /* glsl */ `
    varying vec3 vWPos;
    varying vec3 vWNormal;
    varying vec2 vUv;

    void main() {
        vUv = uv;
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vWPos = wp.xyz;
        vWNormal = normalize(mat3(modelMatrix) * normal);
        gl_Position = projectionMatrix * viewMatrix * wp;
    }
`;

const fragmentShader = /* glsl */ `
    precision highp float;

    varying vec3 vWPos;
    varying vec3 vWNormal;
    varying vec2 vUv;

    uniform sampler2D uContent;
    uniform vec2  uResolution;
    uniform vec3  uColorHead;
    uniform vec3  uColorTail;
    uniform vec3  uCameraPos;
    uniform vec3  uLightDir;

    uniform float uIor;
    uniform float uRefractStrength;
    uniform float uAberration;
    uniform float uAberrationBase;
    uniform float uRefractMix;
    uniform float uExposure;

    void main() {
        vec3 N = normalize(vWNormal);
        if (!gl_FrontFacing) N = -N;

        vec3 V = normalize(uCameraPos - vWPos);

        // 0 в центре полосы, 1 у краёв
        float edge = pow(clamp(abs(vUv.x * 2.0 - 1.0), 0.0, 1.0), 3.0);

        // Градиент вдоль ленты: голова — циан, хвост — синий
        vec3 base = mix(uColorHead, uColorTail, vUv.y);

        // ── Освещение ────────────────────────────────────────────────
        vec3 L = normalize(uLightDir);
        float diff = max(dot(N, L), 0.0);
        vec3 H = normalize(L + V);
        float spec = pow(max(dot(N, H), 0.0), 42.0);

        vec3 col = base * (0.58 + 0.62 * diff) + vec3(0.30) * spec;
        col *= (1.0 + 0.18 * edge);

        // ── Преломление текста (только передняя половина) ────────────
        if (vWPos.z > 0.0) {
            vec3 R = refract(-V, N, 1.0 / uIor);

            if (dot(R, R) > 0.0) {
                R = normalize(R);

                float depth = clamp(vWPos.z, 0.0, 1.0);
                vec2  off   = R.xy * uRefractStrength * depth;

                float px = 1.0 / uResolution.x;
                float D  = px * uAberration;
                vec2  ab = vec2(px * uAberrationBase, 0.0);

                vec2 uvS = gl_FragCoord.xy / uResolution;

                vec3 refr = vec3(
                    texture2D(uContent, uvS + off * D + ab).r,
                    texture2D(uContent, uvS).g,
                    texture2D(uContent, uvS - off * D - ab).b
                );

                // (1.0 - refr) — маска чернил. Буквы становятся светлее ленты.
                float k = (edge * 0.6 + 0.4) * uRefractMix;
                col += (1.0 - refr) * k;
            }
        }

        gl_FragColor = vec4(col * uExposure, 1.0);
        #include <colorspace_fragment>
    }
`;

export function createRibbonMaterial(cfg) {
    return new THREE.ShaderMaterial({
        vertexShader,
        fragmentShader,
        transparent: false,   // opaque-очередь → рисуется до текстовой плоскости
        depthWrite: true,
        depthTest: true,
        side: THREE.DoubleSide,
        uniforms: {
            uContent: { value: null },
            uResolution: { value: new THREE.Vector2(1, 1) },
            uColorHead: { value: new THREE.Color(cfg.COLOR_HEAD) },
            uColorTail: { value: new THREE.Color(cfg.COLOR_TAIL) },
            uCameraPos: { value: new THREE.Vector3() },
            uLightDir: { value: new THREE.Vector3(0.18, 0.36, 1.0) },
            uIor: { value: cfg.IOR },
            uRefractStrength: { value: cfg.REFRACT_STRENGTH },
            uAberration: { value: cfg.ABERRATION },
            uAberrationBase: { value: cfg.ABERRATION_BASE },
            uRefractMix: { value: cfg.REFRACT_MIX },
            uExposure: { value: cfg.EXPOSURE },
        },
    });
}
