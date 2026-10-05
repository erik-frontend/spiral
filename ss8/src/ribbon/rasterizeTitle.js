/**
 * Растеризация DOM-заголовка в <canvas>.
 *
 * Заголовок остаётся в разметке (SEO, скринридеры), но получает
 * visibility: hidden — layout сохраняется, поэтому getBoundingClientRect()
 * продолжает возвращать честные координаты, и мы рисуем текст ровно там,
 * где он был бы в DOM.
 *
 * Обход идёт по текстовым узлам через Range: у каждого узла свой шрифт
 * (например, <span> внутри — курсив), и каждый рисуется своими метриками.
 * Рамка-«пилюля» вокруг growth уходит в ту же текстуру и преломляется
 * вместе с буквами.
 */

const BORDER_TOP = '#004DCE';
const BORDER_BOTTOM = '#04ECFE';

function collectTextNodes(root) {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
        acceptNode: (n) => (n.nodeValue.trim() ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT),
    });
    const out = [];
    let n;
    while ((n = walker.nextNode())) out.push(n);
    return out;
}

function roundRectPath(ctx, x, y, w, h, r) {
    const rr = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + rr, y);
    ctx.lineTo(x + w - rr, y);
    ctx.arcTo(x + w, y, x + w, y + rr, rr);
    ctx.lineTo(x + w, y + h - rr);
    ctx.arcTo(x + w, y + h, x + w - rr, y + h, rr);
    ctx.lineTo(x + rr, y + h);
    ctx.arcTo(x, y + h, x, y + h - rr, rr);
    ctx.lineTo(x, y + rr);
    ctx.arcTo(x, y, x + rr, y, rr);
    ctx.closePath();
}

/**
 * @param {HTMLCanvasElement} target  куда рисуем (текстура)
 * @param {HTMLElement} title         .hero__title
 * @param {DOMRect} originRect        rect канваса ленты — начало координат
 * @param {number} dpr
 */
export function rasterizeTitle(target, title, originRect, dpr) {
    const ctx = target.getContext('2d');

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, target.width, target.height);
    ctx.scale(dpr, dpr);

    const ox = originRect.left;
    const oy = originRect.top;

    // ── 1. Рамка вокруг growth (под текстом) ─────────────────────────
    const pill = title.querySelector('span');
    if (pill) {
        const r = pill.getBoundingClientRect();
        if (r.width > 0 && r.height > 0) {
            const x = r.left - ox;
            const y = r.top - oy;

            // rx/height = 68.5/200 из исходного SVG-бордера
            const radius = r.height * 0.3425;
            const lw = Math.max(1, r.height * 0.006);

            const grad = ctx.createLinearGradient(0, y, 0, y + r.height);
            grad.addColorStop(0, BORDER_TOP);
            grad.addColorStop(1, BORDER_BOTTOM);

            roundRectPath(ctx, x + lw / 2, y + lw / 2, r.width - lw, r.height - lw, radius);
            ctx.strokeStyle = grad;
            ctx.lineWidth = lw;
            ctx.stroke();
        }
    }

    // ── 2. Текстовые узлы ────────────────────────────────────────────
    ctx.fillStyle = '#000000';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';

    const range = document.createRange();

    for (const node of collectTextNodes(title)) {
        range.selectNodeContents(node);
        const r = range.getBoundingClientRect();
        if (r.width === 0 && r.height === 0) continue;

        const cs = getComputedStyle(node.parentElement);
        ctx.font = [
            cs.fontStyle,
            cs.fontVariant === 'normal' ? '' : cs.fontVariant,
            cs.fontWeight,
            cs.fontSize,
            cs.fontFamily,
        ]
            .filter(Boolean)
            .join(' ');

        const m = ctx.measureText(node.nodeValue);
        const asc = m.fontBoundingBoxAscent ?? m.actualBoundingBoxAscent ?? parseFloat(cs.fontSize) * 0.8;
        const desc = m.fontBoundingBoxDescent ?? m.actualBoundingBoxDescent ?? parseFloat(cs.fontSize) * 0.2;

        // Центрируем em-box внутри line-box
        const baseline = r.top - oy + (r.height - (asc + desc)) / 2 + asc;

        ctx.fillText(node.nodeValue, r.left - ox, baseline);
    }

    range.detach?.();
}
