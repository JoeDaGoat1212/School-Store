"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.COUNTER_HEIGHT = void 0;
exports.unitLayout = unitLayout;
const catalog_1 = require("./catalog");
/** A number from a product id that's always the same for that product. */
function hashOf(id) {
    let h = 0;
    for (const ch of id)
        h = (h * 33 + ch.charCodeAt(0)) >>> 0;
    return h;
}
/** Counter top height (the candy rack stands on it). */
exports.COUNTER_HEIGHT = 3.1;
const SPECS = {
    drinks: { perShelf: 2, minShelves: 5, facings: 3, base: 0.75, depth: 1.3, frame: 0.16, gap: 0.035, headroom: 0.24, inset: 0.24, rowDepth: 0.34, rows: (id) => 1 + (hashOf(id) % 3), tilt: 0, tierStep: 0 },
    snacks: { perShelf: 2, minShelves: 4, facings: 2, base: 0.5, depth: 1.05, frame: 0.12, gap: 0.06, headroom: 0.28, inset: 0.2, rowDepth: 0.26, rows: (id) => 2 + (hashOf(id) % 2), tilt: -0.16, tierStep: 0 },
    candy: { perShelf: 3, minShelves: 3, facings: 1, base: exports.COUNTER_HEIGHT + 0.12, depth: 1.5, frame: 0.1, gap: 0.05, headroom: 0.16, inset: 0.12, rowDepth: 0.12, rows: () => 3, tilt: -0.3, tierStep: 0.42 },
};
/** Width taken by one copy of an item (plus the gap to the next). */
function stepOf(model, gap) {
    return model.width + gap;
}
/** How tall an item stands once it leans back. */
function standingHeight(model, tilt) {
    return model.height * Math.cos(tilt) + (model.type === "pack" ? model.puff : 0);
}
function unitLayout(key, items) {
    const unit = catalog_1.UNITS.find((u) => u.key === key);
    const spec = SPECS[key];
    const mine = items.filter((i) => i.unit === key);
    if (mine.length === 0)
        return null;
    // Sections in their set order, skipping empty ones.
    const sections = unit.sections.map((s) => ({ ...s, items: mine.filter((i) => i.section === s.key) })).filter((s) => s.items.length > 0);
    const shelfCount = Math.max(spec.minShelves, ...sections.map((s) => Math.ceil(s.items.length / spec.perShelf)));
    const rowHeight = Math.max(...mine.map((i) => standingHeight(i.model, spec.tilt))) + spec.headroom;
    const widest = Math.max(...mine.map((i) => stepOf(i.model, spec.gap)));
    // Every bay the same width (like matching fridge doors), wide enough for the target number of copies.
    const bayWidth = spec.perShelf * widest * spec.facings + 0.16;
    const width = sections.length * bayWidth + (sections.length + 1) * spec.frame;
    const shelves = Array.from({ length: shelfCount }, (_, k) => ({ y: spec.base + k * rowHeight, z: -k * spec.tierStep }));
    const height = spec.base + shelfCount * rowHeight;
    const bays = [];
    const placements = [];
    const tags = [];
    sections.forEach((section, b) => {
        const left = -width / 2 + spec.frame + b * (bayWidth + spec.frame);
        bays.push({ key: section.key, title: section.title, x: left + bayWidth / 2, width: bayWidth });
        const share = bayWidth / spec.perShelf;
        shelves.forEach((shelf, row) => {
            // Fill every spot on every shelf, repeating the section's products if there are fewer than spots.
            // Top shelf first, so the first products sit at eye level.
            const top = shelfCount - 1 - row;
            for (let k = 0; k < spec.perShelf; k++) {
                const item = section.items[(top * spec.perShelf + k) % section.items.length];
                const step = stepOf(item.model, spec.gap);
                const facings = Math.max(1, Math.floor((share - 0.04) / step));
                const cx = left + share * (k + 0.5);
                const rows = item.soldOut ? 1 : spec.rows(item.id);
                const start = cx - ((facings - 1) * step) / 2;
                const lift = standingHeight(item.model, spec.tilt) / 2;
                for (let r = 0; r < rows; r++) {
                    for (let f = 0; f < facings; f++) {
                        const h = hashOf(`${item.id}${row}${r}${f}`);
                        placements.push({
                            id: item.id,
                            x: start + f * step,
                            y: shelf.y + lift,
                            z: shelf.z - spec.inset - r * spec.rowDepth,
                            tilt: spec.tilt,
                            // A small random-looking turn so the rows don't look copy-pasted.
                            turn: ((h % 9) - 4) * (item.model.type === "lathe" ? 0.06 : 0.015),
                        });
                    }
                }
                tags.push({ id: item.id, x: cx, y: shelf.y, z: shelf.z, width: share - 0.08 });
            }
        });
    });
    return { key, title: unit.title, sign: unit.sign, width, height, depth: spec.depth + (shelfCount - 1) * spec.tierStep, base: spec.base, rowHeight, shelves, bays, placements, tags };
}
