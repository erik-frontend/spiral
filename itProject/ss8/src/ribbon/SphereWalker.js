import * as THREE from 'three';
import { perlin1D } from './perlin.js';

/**
 * Голова ленты, ползающая по поверхности невидимой сферы.
 *
 * Каждый шаг:
 *   1. строим локальный базис на сфере (нормаль / бинормаль / касательная);
 *   2. плавно подтягиваем радиус к целевому;
 *   3. «дышим» — пульсируем радиусом ±15 %;
 *   4. рулим: 1D-шум Перлина, прикрытый окном sin², — повороты плавно
 *      нарастают и затухают, а не дёргаются;
 *   5. шагаем по касательной и проецируем результат обратно на сферу.
 *
 * `velocity.x *= 0.98` — лёгкая асимметрия, из-за которой траектория
 * медленно дрейфует и никогда не зацикливается.
 */
export class SphereWalker {
    constructor(radius, frequency = 0.55) {
        this.targetRadius = radius;
        this.radius = radius;
        this.frequency = frequency;

        this._n = new THREE.Vector3();
        this._b = new THREE.Vector3();
        this._t = new THREE.Vector3();
        this._q = new THREE.Quaternion();

        this._recalcSpeed();

        this.velocity = new THREE.Vector3(0, 0, -this.speed);
        this.p0 = new THREE.Vector3(-0.5, 1, 2).normalize().multiplyScalar(this.radius);
        this.p1 = this.p0.clone().add(this.velocity).normalize().multiplyScalar(this.radius);
    }

    setRadius(r) {
        this.targetRadius = r;
    }

    _recalcSpeed() {
        // За период `e` голова проходит ровно одну окружность сферы
        this.speed = (2 * Math.PI * this.radius) * (this.frequency / 1000);
    }

    /**
     * @param {number} totalMs — суммарное время симуляции, мс
     * @param {number} deltaMs — шаг, мс (у нас всегда 1000/60)
     * @returns {THREE.Vector3} новое положение головы
     */
    step(totalMs, deltaMs) {
        // 1. локальный базис
        this._n.copy(this.p1).normalize();                     // радиальная нормаль
        this._b.crossVectors(this.p0, this.p1).normalize();    // бинормаль
        this._t.crossVectors(this._b, this._n);                // касательная = куда идём

        const e = 1000 / this.frequency;

        // 2. радиус подтягивается к целевому
        this.radius += 0.1 * (this.targetRadius - this.radius);
        this._recalcSpeed();

        // 3. «дыхание»: ±15 %, период 2e/3
        const breathing = this.radius + Math.sin((3 * Math.PI * totalMs) / e) * this.radius * 0.15;

        // 4. рулевое управление
        const window_ = Math.sin((2 * Math.PI * totalMs) / e);
        const noise = perlin1D(totalMs / e);
        const steer = Math.min(0.1, Math.max(-0.1, noise * window_ * window_));

        // 5. шаг + поворот вокруг нормали
        this.velocity.copy(this._t).multiplyScalar(this.speed * deltaMs);
        const angle = ((deltaMs / 60) * steer) / (e / 1000);
        this._q.setFromAxisAngle(this._n, angle);
        this.velocity.applyQuaternion(this._q);
        this.velocity.x *= 0.98;

        this.p0.copy(this.p1);
        this.p1.copy(this.p0).add(this.velocity).normalize().multiplyScalar(breathing);

        return this.p1;
    }
}
