/**
 * A uniform spatial hash for circle broad phase.
 *
 * Checking every bullet against every enemy is fine for a handful of each and
 * quadratic once a late wave is on screen. This buckets entities into fixed
 * size cells so a query only looks at the cells a circle actually touches.
 *
 * The grid is rebuilt every frame — cheaper than keeping it in sync with
 * entities that move continuously — and it recycles its bucket arrays, so a
 * steady state frame allocates nothing.
 */
export class SpatialGrid {
    /**
     * @param cellSize side of one bucket; roughly the diameter of the largest
     *        commonly queried circle is a good default
     */
    constructor(cellSize = 64) {
        this.cellSize = cellSize;
        this.cols = 0;
        this.rows = 0;
        this.buckets = [];
        // Cleared lazily: a bucket is only emptied the first time it is touched
        // in a frame, so an empty grid costs nothing to reset.
        this.stamps = [];
        this.frame = 0;
        this.scratch = [];
    }

    /**
     * Sizes the grid to the world. Safe to call every frame; the buckets are
     * only reallocated when the shape actually changes.
     */
    resize(width, height, cellSize = this.cellSize) {
        const cols = Math.max(1, Math.ceil(width / cellSize));
        const rows = Math.max(1, Math.ceil(height / cellSize));
        if (cols === this.cols && rows === this.rows && cellSize === this.cellSize) return;

        this.cellSize = cellSize;
        this.cols = cols;
        this.rows = rows;
        this.buckets = new Array(cols * rows);
        this.stamps = new Int32Array(cols * rows);
        for (let i = 0; i < this.buckets.length; i++) this.buckets[i] = [];
        this.frame = 0;
    }

    /** Starts a new frame. Buckets from the previous one are forgotten. */
    clear() {
        this.frame += 1;
    }

    bucketAt(index) {
        const bucket = this.buckets[index];
        if (this.stamps[index] !== this.frame) {
            this.stamps[index] = this.frame;
            bucket.length = 0;
        }
        return bucket;
    }

    columnOf(x) {
        const col = Math.floor(x / this.cellSize);
        return col < 0 ? 0 : col >= this.cols ? this.cols - 1 : col;
    }

    rowOf(y) {
        const row = Math.floor(y / this.cellSize);
        return row < 0 ? 0 : row >= this.rows ? this.rows - 1 : row;
    }

    /**
     * Files an entity under every cell its circle overlaps, so a query that
     * touches any one of them sees it.
     */
    insert(entity) {
        const { x, y } = entity.position;
        const radius = entity.radius || 0;
        const left = this.columnOf(x - radius);
        const right = this.columnOf(x + radius);
        const top = this.rowOf(y - radius);
        const bottom = this.rowOf(y + radius);

        for (let row = top; row <= bottom; row++) {
            const base = row * this.cols;
            for (let col = left; col <= right; col++) {
                this.bucketAt(base + col).push(entity);
            }
        }
    }

    /** Files every entity of a list in one pass. */
    insertAll(entities) {
        for (let i = 0; i < entities.length; i++) this.insert(entities[i]);
    }

    /**
     * Collects the entities whose cells overlap the given circle. The result is
     * a scratch array owned by the grid: read it before the next query, and do
     * not hold on to it.
     *
     * Entities spanning several cells can appear more than once, so callers
     * must tolerate a repeat — every use here bails out on the first hit or
     * checks an `alive` flag, both of which already do.
     */
    query(x, y, radius) {
        const out = this.scratch;
        out.length = 0;
        if (this.cols === 0) return out;

        const left = this.columnOf(x - radius);
        const right = this.columnOf(x + radius);
        const top = this.rowOf(y - radius);
        const bottom = this.rowOf(y + radius);

        for (let row = top; row <= bottom; row++) {
            const base = row * this.cols;
            for (let col = left; col <= right; col++) {
                const index = base + col;
                if (this.stamps[index] !== this.frame) continue;
                const bucket = this.buckets[index];
                for (let i = 0; i < bucket.length; i++) out.push(bucket[i]);
            }
        }
        return out;
    }
}
