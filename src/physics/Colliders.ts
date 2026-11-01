/**
 * Статичные коллайдеры на плоскости XZ: круги (столбы, деревья, люди) — в пространственной сетке,
 * и прямоугольники по осям (стены, ящики) — их обычно немного, проверяются все.
 */
export interface Circle {
	x: number;
	z: number;
	radius: number;
}

export interface Box {
	minX: number;
	minZ: number;
	maxX: number;
	maxZ: number;
}

export class Colliders {
	private readonly cells = new Map<number, Circle[]>();
	private readonly boxes: Box[] = [];

	/** @param cellSize размер ячейки сетки, м (≥ диаметра крупнейшего круга) */
	constructor(private readonly cellSize = 2) {}

	add(x: number, z: number, radius: number): Circle {
		const circle = { x, z, radius };
		const key = this._key(this._cell(x), this._cell(z));
		let list = this.cells.get(key);
		if (!list) this.cells.set(key, (list = []));
		list.push(circle);
		return circle;
	}

	remove(circle: Circle): void {
		const list = this.cells.get(this._key(this._cell(circle.x), this._cell(circle.z)));
		const i = list ? list.indexOf(circle) : -1;
		if (i >= 0) list!.splice(i, 1);
	}

	/** Прямоугольник с центром (x, z) и размерами width (по X) × depth (по Z). */
	addBox(x: number, z: number, width: number, depth: number): Box {
		const box = { minX: x - width / 2, minZ: z - depth / 2, maxX: x + width / 2, maxZ: z + depth / 2 };
		this.boxes.push(box);
		return box;
	}

	removeBox(box: Box): void {
		const i = this.boxes.indexOf(box);
		if (i >= 0) this.boxes.splice(i, 1);
	}

	/** Пересекается ли круг (x, z, radius) хоть с одним коллайдером. */
	overlaps(x: number, z: number, radius: number): boolean {
		for (const b of this.boxes) {
			const dx = x - Math.max(b.minX, Math.min(x, b.maxX));
			const dz = z - Math.max(b.minZ, Math.min(z, b.maxZ));
			if (dx * dx + dz * dz < radius * radius) return true;
		}
		const cx = this._cell(x);
		const cz = this._cell(z);
		for (let i = cx - 1; i <= cx + 1; i++) {
			for (let j = cz - 1; j <= cz + 1; j++) {
				const list = this.cells.get(this._key(i, j));
				if (!list) continue;
				for (const c of list) {
					const min = radius + c.radius;
					if ((x - c.x) ** 2 + (z - c.z) ** 2 < min * min) return true;
				}
			}
		}
		return false;
	}

	/** Выталкивает круг игрока из пересекающихся коллайдеров. Меняет position.x / position.z. */
	resolve(position: { x: number; z: number }, radius: number): void {
		// Пара итераций — чтобы выталкивание из одного не заталкивало в соседний.
		for (let iter = 0; iter < 2; iter++) {
			for (const b of this.boxes) this._pushBox(position, radius, b);
			const cx = this._cell(position.x);
			const cz = this._cell(position.z);
			for (let i = cx - 1; i <= cx + 1; i++) {
				for (let j = cz - 1; j <= cz + 1; j++) {
					const list = this.cells.get(this._key(i, j));
					if (list) for (const c of list) this._push(position, radius, c);
				}
			}
		}
	}

	private _push(position: { x: number; z: number }, radius: number, c: Circle): void {
		const dx = position.x - c.x;
		const dz = position.z - c.z;
		const minDist = radius + c.radius;
		const distSq = dx * dx + dz * dz;
		if (distSq >= minDist * minDist) return;

		const dist = Math.sqrt(distSq);
		if (dist < 1e-6) {
			position.x += minDist;
			return;
		}
		const k = (minDist - dist) / dist;
		position.x += dx * k;
		position.z += dz * k;
	}

	/** Круг против прямоугольника: от ближайшей точки прямоугольника; центр внутри — наружу по кратчайшей оси. */
	private _pushBox(position: { x: number; z: number }, radius: number, b: Box): void {
		const nx = Math.max(b.minX, Math.min(position.x, b.maxX));
		const nz = Math.max(b.minZ, Math.min(position.z, b.maxZ));
		const dx = position.x - nx;
		const dz = position.z - nz;
		const distSq = dx * dx + dz * dz;
		if (distSq >= radius * radius) return;
		if (distSq > 1e-12) {
			const dist = Math.sqrt(distSq);
			const k = (radius - dist) / dist;
			position.x += dx * k;
			position.z += dz * k;
			return;
		}
		const left = position.x - b.minX;
		const right = b.maxX - position.x;
		const back = position.z - b.minZ;
		const front = b.maxZ - position.z;
		const min = Math.min(left, right, back, front);
		if (min === left) position.x = b.minX - radius;
		else if (min === right) position.x = b.maxX + radius;
		else if (min === back) position.z = b.minZ - radius;
		else position.z = b.maxZ + radius;
	}

	private _cell(v: number): number {
		return Math.floor(v / this.cellSize);
	}

	private _key(cx: number, cz: number): number {
		return (cx + 1048576) * 2097152 + (cz + 1048576);
	}
}
