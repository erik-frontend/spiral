import * as THREE from 'three';

const VERTS_PER_RING = 8;   
const FLOATS_PER_RING = VERTS_PER_RING * 3;

export class RibbonTrailGeometry extends THREE.BufferGeometry {
    constructor(numNodes, width, thickness, maxLength, start) {
        super();

        this.numNodes = numNodes;
        this.halfWidth = width / 2;
        this.halfThickness = thickness / 2;
        this.maxLength = maxLength;

        const capOffset = numNodes * VERTS_PER_RING;
        const total = capOffset + 4; 

        this.positions = new Float32Array(total * 3);
        this.normals = new Float32Array(total * 3); // Выделяем память под нормали
        this.uvs = new Float32Array(total * 2);
        this.centers = new Float32Array(numNodes * 3);
        this.capOffset = capOffset;

        // UVs
        const U = [0, 1, 1, 1, 1, 0, 0, 0];
        for (let i = 0; i < numNodes; i++) {
            const v = i / (numNodes - 1);
            for (let k = 0; k < VERTS_PER_RING; k++) {
                const o = (i * VERTS_PER_RING + k) * 2;
                this.uvs[o] = U[k];
                this.uvs[o + 1] = v;
            }
        }
        for (let k = 0; k < 4; k++) {
            this.uvs[(capOffset + k) * 2] = 0.5;
            this.uvs[(capOffset + k) * 2 + 1] = 0;
        }

        // Индексы
        const idx = [];
        for (let i = 0; i < numNodes - 1; i++) {
            for (let f = 0; f < 4; f++) {
                const a = i * VERTS_PER_RING + f * 2;
                const b = a + 1;
                const c = (i + 1) * VERTS_PER_RING + f * 2;
                const d = c + 1;
                idx.push(a, c, b, b, c, d);
            }
        }
        idx.push(capOffset + 0, capOffset + 1, capOffset + 2);
        idx.push(capOffset + 0, capOffset + 2, capOffset + 3);

        this._posAttr = new THREE.BufferAttribute(this.positions, 3);
        this._posAttr.setUsage(THREE.DynamicDrawUsage);
        
        this._normAttr = new THREE.BufferAttribute(this.normals, 3);
        this._normAttr.setUsage(THREE.DynamicDrawUsage);

        this.setIndex(idx);
        this.setAttribute('position', this._posAttr);
        this.setAttribute('normal', this._normAttr);
        this.setAttribute('uv', new THREE.BufferAttribute(this.uvs, 2));

        this.prevHead = start.clone();
        this._tmp = {
            tangent: new THREE.Vector3(),
            radial: new THREE.Vector3(),
            right: new THREE.Vector3(),
            up: new THREE.Vector3(),
            corner: new THREE.Vector3(),
        };

        const seed = start.clone().add(new THREE.Vector3(0, 0, 0.001));
        this._buildRing(0, seed, start);
        for (let i = 1; i < numNodes; i++) {
            this.positions.copyWithin(i * FLOATS_PER_RING, 0, FLOATS_PER_RING);
            this.normals.copyWithin(i * FLOATS_PER_RING, 0, FLOATS_PER_RING);
        }
        for (let i = 0; i < numNodes; i++) {
            this.centers[i * 3] = start.x;
            this.centers[i * 3 + 1] = start.y;
            this.centers[i * 3 + 2] = start.z;
        }
        this._updateCap();
        this.computeBoundingSphere();
    }

    _buildRing(i, p, from) {
        const { tangent, radial, right, up, corner } = this._tmp;

        tangent.subVectors(p, from);
        if (tangent.lengthSq() < 1e-12) tangent.set(0, 0, 1);
        tangent.normalize();

        radial.copy(p).normalize();
        if (radial.lengthSq() < 1e-12) radial.set(0, 1, 0);

        right.crossVectors(tangent, radial);
        if (right.lengthSq() < 1e-12) right.set(1, 0, 0);
        right.normalize();

        up.crossVectors(right, tangent).normalize();

        const hw = this.halfWidth;
        const ht = this.halfThickness;

        const cx = [-hw, hw, hw, -hw];
        const cy = [ht, ht, -ht, -ht];
        const order = [0, 1, 1, 2, 2, 3, 3, 0];

        // Аналитический расчет нормалей граней
        const faceNormals = [
            up,                          // Верхняя грань
            right,                       // Правая грань
            up.clone().negate(),         // Нижняя грань
            right.clone().negate()       // Левая грань
        ];

        const base = i * FLOATS_PER_RING;
        for (let k = 0; k < VERTS_PER_RING; k++) {
            const c = order[k];
            corner
                .copy(p)
                .addScaledVector(right, cx[c])
                .addScaledVector(up, cy[c]);

            this.positions[base + k * 3]     = corner.x;
            this.positions[base + k * 3 + 1] = corner.y;
            this.positions[base + k * 3 + 2] = corner.z;

            // Запись нормали без выполнения вычислений на CPU
            const fn = faceNormals[Math.floor(k / 2)];
            this.normals[base + k * 3]     = fn.x;
            this.normals[base + k * 3 + 1] = fn.y;
            this.normals[base + k * 3 + 2] = fn.z;
        }

        this.centers[i * 3]     = p.x;
        this.centers[i * 3 + 1] = p.y;
        this.centers[i * 3 + 2] = p.z;
    }

    _updateCap() {
        const src = [0, 2, 4, 6];
        for (let k = 0; k < 4; k++) {
            const s = src[k] * 3;
            const d = (this.capOffset + k) * 3;
            this.positions[d]     = this.positions[s];
            this.positions[d + 1] = this.positions[s + 1];
            this.positions[d + 2] = this.positions[s + 2];

            // Касательный вектор для крышки
            this.normals[d]     = this._tmp.tangent.x;
            this.normals[d + 1] = this._tmp.tangent.y;
            this.normals[d + 2] = this._tmp.tangent.z;
        }
    }

    moveTo(head) {
        const N = this.numNodes;

        for (let i = N - 1; i >= 1; i--) {
            this.positions.copyWithin(i * FLOATS_PER_RING, (i - 1) * FLOATS_PER_RING, i * FLOATS_PER_RING);
            this.normals.copyWithin(i * FLOATS_PER_RING, (i - 1) * FLOATS_PER_RING, i * FLOATS_PER_RING);
            this.centers.copyWithin(i * 3, (i - 1) * 3, i * 3);
        }

        this._buildRing(0, head, this.prevHead);
        this.prevHead.copy(head);

        let acc = 0;
        let cut = -1;
        for (let i = 1; i < N; i++) {
            const dx = this.centers[i * 3] - this.centers[(i - 1) * 3];
            const dy = this.centers[i * 3 + 1] - this.centers[(i - 1) * 3 + 1];
            const dz = this.centers[i * 3 + 2] - this.centers[(i - 1) * 3 + 2];
            acc += Math.sqrt(dx * dx + dy * dy + dz * dz);
            if (acc >= this.maxLength) {
                cut = i;
                break;
            }
        }

        if (cut > 0) {
            for (let i = cut + 1; i < N; i++) {
                this.positions.copyWithin(i * FLOATS_PER_RING, cut * FLOATS_PER_RING, (cut + 1) * FLOATS_PER_RING);
                this.normals.copyWithin(i * FLOATS_PER_RING, cut * FLOATS_PER_RING, (cut + 1) * FLOATS_PER_RING);
            }
        }

        this._updateCap();
        this._posAttr.needsUpdate = true;
        this._normAttr.needsUpdate = true;
        // Тяжелый вызов computeVertexNormals() полностью удален!
    }
}