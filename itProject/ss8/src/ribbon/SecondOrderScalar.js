// Пружина второго порядка (second-order dynamics).
// Модель t3ssel8r — та же, что использует atuin для наклона и масштаба ленты.
//
//   f — частота собственных колебаний, Гц
//   z — коэффициент затухания (1 = критическое, <1 = с перелётом)
//   r — начальный отклик (0 = плавный старт, >0 = «выстреливает» вперёд)
//
// Ключевая деталь — T_stable: он гарантирует устойчивость при любом dt,
// поэтому лаги и вкладки в фоне не разносят симуляцию.

export class SecondOrderScalar {
    constructor(f, z, r, x0 = 0) {
        this.setParams(f, z, r);
        this.x = x0;
        this.v = 0;
        this.prevTarget = x0;
    }

    setParams(f, z, r) {
        const w = 2 * Math.PI * f;
        this.k1 = z / (Math.PI * f);
        this.k2 = 1 / (w * w);
        this.k3 = (r * z) / w;
    }

    /** dt — в секундах */
    update(dt, target) {
        if (dt <= 0) return this.x;

        const dTarget = (target - this.prevTarget) / dt;
        this.prevTarget = target;

        // Устойчивый эквивалент k2 при большом шаге интегрирования
        const k2 = Math.max(this.k2, (dt * dt) / 2 + (dt * this.k1) / 2, dt * this.k1);

        this.x += this.v * dt;
        this.v += (dt * (target + this.k3 * dTarget - this.x - this.k1 * this.v)) / k2;

        return this.x;
    }

    reset(x0) {
        this.x = x0;
        this.v = 0;
        this.prevTarget = x0;
    }
}
