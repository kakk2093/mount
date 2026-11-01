import * as THREE from 'three';
import { createNoise2D, createRng, type Noise2D } from '../../utils/random.js';

/**
 * Форма горы. Вершина — в (0, 0); угол θ отсчитывается от +Z (юг) к +X (восток): x = r·sinθ, z = r·cosθ.
 * Склон — профиль по радиусу (почти конус) + отроги (гребни, сбегающие от вершины) + неровности; вдоль тропы
 * земля срезана/подсыпана до её высоты; склон режут ущелья, через них — подвесные мосты.
 */
export const PEAK_HEIGHT = 230;
/** Радиус подножия, м: дальше — предгорья. */
export const MOUNTAIN_RADIUS = 240;
/** Показатель профиля: больше 1 — склон вогнутый (близко к 1 — почти ровный конус: круто до самого подножия). */
const PROFILE = 1.1;
/** Плоская площадка на вершине, м. */
export const SUMMIT_RADIUS = 14;
/** Тропа проходит площадку вершины насквозь и кончается у дальнего края, в стольких метрах за центром: там смотровая. */
const SUMMIT_LOOKOUT = 10;
/** Отроги: высота гребней, м, и сколько их примерно по кругу (частота шума по углу). */
const SPUR_AMPLITUDE = 10;
const SPUR_FREQUENCY = 2.5;
const RIDGE_AMPLITUDE = 6;
const DETAIL_AMPLITUDE = 1.2;
const FOOTHILL_AMPLITUDE = 4;
/**
 * Предгорья к краю земли (по большей из |x|, |z|) сходят на нет: дальше — ровная снежная равнина (см. Mountain),
 * и край сетки с ней совпадает без ступеньки.
 */
export const PLAIN_FROM = 270;
export const PLAIN_TO = 320;

/** Тропа: полуширина ровного полотна, м, и обочина, на которой земля переходит к естественной. */
export const PATH_HALF_WIDTH = 1.6;
const PATH_FLAT = PATH_HALF_WIDTH + 1.4;
const PATH_SHOULDER = 4;
/** Дальше этого от оси тропы она на землю не влияет, м. */
export const PATH_INFLUENCE = PATH_FLAT + PATH_SHOULDER;
/** Уклон тропы (подъём на метр пути) и шаг точек при построении, м. */
const PATH_GRADE = 0.17;
const PATH_STEP = 3;
/** Начало тропы — за подножием, на равнине у места старта (см. Mountain). */
export const PATH_START_RADIUS = 252;
/**
 * Насколько тропа повторяет отроги (0 — идёт ровно по профилю и режет их насквозь, 1 — лезет на каждый) и по скольким
 * точкам сглаживается этот рельеф: тропа то врезается в гребень, то идёт по насыпи — но без крутых горок.
 */
const PATH_RELIEF_FOLLOW = 0.6;
const PATH_RELIEF_SMOOTH = 12;
/** Круче этого тропа не бывает: после добавления рельефа высоты разглаживаются, пока уклон не войдёт в предел. */
const PATH_MAX_GRADE = 0.24;

export interface Gully {
	/** Ось ущелья (угол от вершины), глубина и полуширина поверху, м. */
	angle: number;
	depth: number;
	halfWidth: number;
	/** Насколько выше моста начинается ущелье (по радиусу), м. */
	headGap: number;
	/** Заполняется при построении: радиус верха ущелья и участок тропы под мост (по s). */
	head: number;
	bridgeStart: number;
	bridgeEnd: number;
}

/** Ущелья: через каждое тропа проходит один раз (по мосту). */
const GULLIES: Pick<Gully, 'angle' | 'depth' | 'halfWidth' | 'headGap'>[] = [
	{ angle: 0.75, depth: 22, halfWidth: 16, headGap: 30 },
	{ angle: 2.3, depth: 26, halfWidth: 13, headGap: 22 },
];
/** Мост начинается, где ущелье глубже этого, м (плюс заход на берег BRIDGE_EXTRA). */
const BRIDGE_MIN_DEPTH = 1;
const BRIDGE_EXTRA = 1.5;

/** Высота профиля без шума: по ней идёт тропа. На вершине — площадка. */
export function profileHeight(r: number): number {
	const t = Math.min(Math.max(r, SUMMIT_RADIUS), MOUNTAIN_RADIUS) / MOUNTAIN_RADIUS;
	return PEAK_HEIGHT * Math.pow(1 - t, PROFILE);
}

/** Угол точки (см. описание осей) в (−π, π]. */
export function angleOf(x: number, z: number): number {
	return Math.atan2(x, z);
}

export interface PathPoint {
	x: number;
	y: number;
	z: number;
	/** Пройдено от начала тропы, м (по плану). */
	s: number;
}

export interface PathHit {
	/** Расстояние до оси по плану, м. */
	dist: number;
	/** Высота полотна в ближайшей точке. */
	y: number;
	s: number;
}

/** Ось тропы — ломаная с шагом ~PATH_STEP м и сеткой отрезков для быстрого поиска ближайшей точки. */
export class MountainPath {
	readonly length: number;
	private readonly cells = new Map<number, number[]>();
	private static readonly CELL = 16;

	constructor(readonly points: PathPoint[]) {
		this.length = points[points.length - 1].s;
		const c = MountainPath.CELL;
		for (let i = 0; i < points.length - 1; i++) {
			const a = points[i];
			const b = points[i + 1];
			const x0 = Math.floor((Math.min(a.x, b.x) - PATH_INFLUENCE) / c);
			const x1 = Math.floor((Math.max(a.x, b.x) + PATH_INFLUENCE) / c);
			const z0 = Math.floor((Math.min(a.z, b.z) - PATH_INFLUENCE) / c);
			const z1 = Math.floor((Math.max(a.z, b.z) + PATH_INFLUENCE) / c);
			for (let cx = x0; cx <= x1; cx++) {
				for (let cz = z0; cz <= z1; cz++) {
					const key = this._key(cx, cz);
					let list = this.cells.get(key);
					if (!list) this.cells.set(key, (list = []));
					list.push(i);
				}
			}
		}
	}

	/** Ближайшая точка оси не дальше PATH_INFLUENCE (и maxDist); null — тропа далеко. */
	nearest(x: number, z: number, maxDist = PATH_INFLUENCE): PathHit | null {
		const c = MountainPath.CELL;
		const list = this.cells.get(this._key(Math.floor(x / c), Math.floor(z / c)));
		if (!list) return null;
		let best: PathHit | null = null;
		for (const i of list) {
			const hit = this._segmentHit(i, x, z);
			if (hit.dist < maxDist && (!best || hit.dist < best.dist)) best = hit;
		}
		return best;
	}

	/** Ближайшая к (x, z) точка отрезка i. */
	private _segmentHit(i: number, x: number, z: number): PathHit {
		const a = this.points[i];
		const b = this.points[i + 1];
		const dx = b.x - a.x;
		const dz = b.z - a.z;
		const lenSq = dx * dx + dz * dz;
		const t = lenSq > 0 ? THREE.MathUtils.clamp(((x - a.x) * dx + (z - a.z) * dz) / lenSq, 0, 1) : 0;
		return { dist: Math.hypot(a.x + dx * t - x, a.z + dz * t - z), y: a.y + (b.y - a.y) * t, s: a.s + (b.s - a.s) * t };
	}

	/**
	 * Ближайшие точки всех отрезков тропы рядом (не дальше maxDist). На развороте серпантина рядом два витка
	 * на разной высоте, на крутом изгибе один виток ближе всего сразу в двух местах — высоту надо смешивать по всем,
	 * иначе там, где меняется «ближайший», ступенька.
	 */
	nearby(x: number, z: number, maxDist = PATH_INFLUENCE): PathHit[] {
		const c = MountainPath.CELL;
		const list = this.cells.get(this._key(Math.floor(x / c), Math.floor(z / c)));
		const hits: PathHit[] = [];
		if (!list) return hits;
		for (const i of list) {
			const hit = this._segmentHit(i, x, z);
			if (hit.dist <= maxDist) hits.push(hit);
		}
		return hits;
	}

	/** Точка на оси на расстоянии s от начала и направление тропы там (по плану, нормированное). */
	pointAt(s: number, out: THREE.Vector3, dir?: THREE.Vector3): THREE.Vector3 {
		const pts = this.points;
		s = THREE.MathUtils.clamp(s, 0, this.length);
		let lo = 0;
		let hi = pts.length - 1;
		while (hi - lo > 1) {
			const mid = (lo + hi) >> 1;
			if (pts[mid].s <= s) lo = mid;
			else hi = mid;
		}
		const a = pts[lo];
		const b = pts[hi];
		const t = b.s > a.s ? (s - a.s) / (b.s - a.s) : 0;
		out.set(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t, a.z + (b.z - a.z) * t);
		if (dir) dir.set(b.x - a.x, 0, b.z - a.z).normalize();
		return out;
	}

	private _key(cx: number, cz: number): number {
		return (cx + 4096) * 8192 + (cz + 4096);
	}
}

/** Выровненная площадка (у костров): внутри radius — ровно на height, за blend — плавно к рельефу. */
export interface Site {
	x: number;
	z: number;
	radius: number;
	blend: number;
	height: number;
}

/** Полная форма: профиль, шум, ущелья, тропа, площадки. Чистая функция высоты — по ней строится сетка земли. */
export class MountainShape {
	readonly path: MountainPath;
	/** Где на тропе (s) кончаются участки — там костры; последний — на вершине. */
	readonly legEnds: number[];
	/** Где на тропе (s) первые развороты (до второго костра) — туда ведёт маркер, чтобы не потерять тропу. */
	readonly turns: number[];
	readonly gullies: Gully[] = [];
	readonly sites: Site[] = [];
	private readonly noise: Noise2D;

	constructor(seed: number) {
		this.noise = createNoise2D(createRng(seed));
		const { points, legEnds, turns } = buildPath();
		this.legEnds = legEnds;
		this.turns = turns;
		this._followRelief(points);
		this.path = new MountainPath(points);

		// Ущелья: верх — на headGap выше места, где тропа (впервые) пересекает ось; мост — сплошной участок вокруг
		// пересечения, где ущелье глубже BRIDGE_MIN_DEPTH.
		for (const spec of GULLIES) {
			let cross = points[0];
			for (let i = 1; i < points.length; i++) {
				if (angleOf(points[i - 1].x, points[i - 1].z) < spec.angle && angleOf(points[i].x, points[i].z) >= spec.angle) {
					cross = points[i];
					break;
				}
			}
			const gully: Gully = { ...spec, head: Math.hypot(cross.x, cross.z) - spec.headGap, bridgeStart: cross.s, bridgeEnd: cross.s };
			for (const p of points) {
				if (Math.abs(p.s - cross.s) > 60 || this._gullyDepth(gully, p.x, p.z) < BRIDGE_MIN_DEPTH) continue;
				gully.bridgeStart = Math.min(gully.bridgeStart, p.s);
				gully.bridgeEnd = Math.max(gully.bridgeEnd, p.s);
			}
			gully.bridgeStart -= BRIDGE_EXTRA;
			gully.bridgeEnd += BRIDGE_EXTRA;
			this.gullies.push(gully);
		}
	}

	/** Площадку регистрировать до постройки земли. Высота — тропы рядом (или рельефа). */
	addSite(x: number, z: number, radius: number, blend = 3, height = this.heightAt(x, z)): Site {
		const site = { x, z, radius, blend, height };
		this.sites.push(site);
		return site;
	}

	/** Участок тропы s — на мосту. */
	onBridge(s: number): boolean {
		return this.gullies.some((g) => s > g.bridgeStart && s < g.bridgeEnd);
	}

	/**
	 * Высота земли (до сетки): рельеф, тропа, площадки. Рядом с тропой — её высота, смешанная по всем ближним
	 * отрезкам с весом по близости (см. MountainPath.nearby): между витками — ровный скат, а не уступ.
	 */
	heightAt(x: number, z: number): number {
		let h = this.naturalHeight(x, z);
		let mask = 0;
		let sumW = 0;
		let sumY = 0;
		for (const hit of this.path.nearby(x, z)) {
			const m = this.pathMask(hit);
			if (m <= 0) continue;
			const w = m / (hit.dist + 0.5) ** 2;
			sumW += w;
			sumY += w * hit.y;
			mask = Math.max(mask, m);
		}
		if (mask > 0) h = THREE.MathUtils.lerp(h, sumY / sumW, mask);
		for (const s of this.sites) {
			const d = Math.hypot(x - s.x, z - s.z);
			if (d < s.radius + s.blend) h = THREE.MathUtils.lerp(s.height, h, THREE.MathUtils.smoothstep(d, s.radius, s.radius + s.blend));
		}
		return h;
	}

	/** 1 — на полотне тропы, 0 — вне обочины; на мосту — 0 (там ущелье остаётся ущельем). */
	pathMask(hit: PathHit): number {
		if (this.onBridge(hit.s)) return 0;
		return 1 - THREE.MathUtils.smoothstep(hit.dist, PATH_FLAT, PATH_FLAT + PATH_SHOULDER);
	}

	/** Рельеф без тропы: профиль, отроги, гребни и предгорья (relief), мелкие неровности, минус ущелья. */
	naturalHeight(x: number, z: number): number {
		const r = Math.hypot(x, z);
		const detail = (this.noise(x / 9 + 100, z / 9 + 100, 2) - 0.5) * 2 * DETAIL_AMPLITUDE;
		const edge = 1 - THREE.MathUtils.smoothstep(Math.max(Math.abs(x), Math.abs(z)), PLAIN_FROM, PLAIN_TO);
		return profileHeight(r) + this.relief(x, z) + detail * edge - this.gullyDepth(x, z);
	}

	/**
	 * Крупный рельеф склона поверх профиля: отроги — острые гребни, сбегающие от вершины (шум по углу, медленно
	 * меняется с радиусом), и гребни помельче. У вершины и у подножия сходит на нет. foothills — с холмами предгорий
	 * (без них — только гребни: по ним раскраска скал и останцы).
	 */
	relief(x: number, z: number, foothills = true): number {
		const r = Math.hypot(x, z);
		// Предгорья — холмы у подножия (тропа их тоже повторяет), к краю земли — на нет.
		const edge = 1 - THREE.MathUtils.smoothstep(Math.max(Math.abs(x), Math.abs(z)), PLAIN_FROM, PLAIN_TO);
		const hills = foothills
			? (this.noise(x / 80 + 300, z / 80, 2) - 0.5) * 2 * FOOTHILL_AMPLITUDE * THREE.MathUtils.smoothstep(r, MOUNTAIN_RADIUS * 0.8, MOUNTAIN_RADIUS) * edge
			: 0;
		const k = THREE.MathUtils.smoothstep(r, SUMMIT_RADIUS, 50) * (1 - THREE.MathUtils.smoothstep(r, MOUNTAIN_RADIUS * 0.85, MOUNTAIN_RADIUS));
		if (k <= 0) return hills;
		const th = angleOf(x, z);
		const n = this.noise(Math.sin(th) * SPUR_FREQUENCY + 40, Math.cos(th) * SPUR_FREQUENCY + r / 110, 3);
		// «Гребенчатый» шум: 1 − |2n − 1| — острые вершины гребней; снизу срезан — ложбины между ними широкие
		// и неглубокие (узкие глубокие ямы тропа переходила бы по высокой насыпи).
		const spurs = (Math.max(1 - Math.abs(2 * n - 1), 0.5) - 0.7) * 2 * SPUR_AMPLITUDE;
		const ridges = (this.noise(x / 50, z / 50, 3) - 0.5) * 2 * RIDGE_AMPLITUDE;
		return (spurs + ridges) * k + hills;
	}

	/** Насколько ущелья врезаны в склон в этой точке, м. */
	gullyDepth(x: number, z: number): number {
		let depth = 0;
		for (const g of this.gullies) depth = Math.max(depth, this._gullyDepth(g, x, z));
		return depth;
	}

	/** Ущелье: верх — обрыв, к подножию сходит на нет; поперёк — плоское дно и крутые стенки. */
	private _gullyDepth(g: Gully, x: number, z: number): number {
		const r = Math.hypot(x, z);
		const lateral = Math.abs(THREE.MathUtils.euclideanModulo(angleOf(x, z) - g.angle + Math.PI, Math.PI * 2) - Math.PI) * r;
		if (lateral > g.halfWidth) return 0;
		const along = THREE.MathUtils.smoothstep(r, g.head - 2, g.head + 5) * (1 - THREE.MathUtils.smoothstep(r, MOUNTAIN_RADIUS * 0.85, MOUNTAIN_RADIUS));
		return g.depth * along * (1 - THREE.MathUtils.smoothstep(lateral, g.halfWidth * 0.3, g.halfWidth));
	}

	/**
	 * Тропа частично повторяет отроги: к высоте по профилю — доля рельефа, сглаженная вдоль тропы
	 * (иначе на каждом гребне горка). Потом уклон подрезается до PATH_MAX_GRADE (и на сжатых сглаживанием разворотах).
	 */
	private _followRelief(points: PathPoint[]): void {
		const relief = points.map((p) => this.relief(p.x, p.z));
		const n = PATH_RELIEF_SMOOTH;
		for (let i = 0; i < points.length; i++) {
			let sum = 0;
			let count = 0;
			for (let j = Math.max(0, i - n); j <= Math.min(points.length - 1, i + n); j++) {
				sum += relief[j];
				count++;
			}
			points[i].y += (sum / count) * PATH_RELIEF_FOLLOW;
		}
		// Где рельеф всё же сделал тропу круче предела — подрезаем: проходы вперёд и назад, каждая точка не дальше
		// PATH_MAX_GRADE·ds по высоте от соседней.
		for (let pass = 0; pass < 4; pass++) {
			for (let i = 1; i < points.length; i++) {
				const max = PATH_MAX_GRADE * (points[i].s - points[i - 1].s);
				points[i].y = THREE.MathUtils.clamp(points[i].y, points[i - 1].y - max, points[i - 1].y + max);
			}
			for (let i = points.length - 2; i >= 0; i--) {
				const max = PATH_MAX_GRADE * (points[i + 1].s - points[i].s);
				points[i].y = THREE.MathUtils.clamp(points[i].y, points[i + 1].y - max, points[i + 1].y + max);
			}
		}
	}
}

/** Крутизна профиля (dh/dr по модулю). */
function profileSlope(r: number): number {
	const t = Math.min(r / MOUNTAIN_RADIUS, 0.999);
	return ((PROFILE * PEAK_HEIGHT) / MOUNTAIN_RADIUS) * Math.pow(1 - t, PROFILE - 1);
}

/**
 * Маршрут серпантином: идём по склону вбок, понемногу забирая к вершине так, чтобы подъём был PATH_GRADE; в конце
 * отрезка — разворот. Участки (после каждого — костёр): короткие зигзаги на юге; траверс на восток через первое
 * ущелье; зигзаги и траверс дальше через второе; зигзаги к вершине (посередине — ещё костёр). Потом сглаживаем
 * углы (развороты становятся петлями) и ставим высоту по профилю.
 */
function buildPath(): { points: PathPoint[]; legEnds: number[]; turns: number[] } {
	let r = PATH_START_RADIUS;
	let th = 0;
	const plan: { r: number; th: number }[] = [{ r, th }];
	const fireIndex: number[] = [];
	const stopR = SUMMIT_RADIUS + 0.5;
	const leg = (target: number) => {
		const d = target > th ? 1 : -1;
		while ((target - th) * d > 0 && r > stopR) {
			// Шаг: вглубь (к вершине) — сколько нужно для уклона, остальное — вбок.
			const dr = Math.max(-(PATH_GRADE * PATH_STEP) / Math.max(profileSlope(r), 1e-3), -PATH_STEP * 0.9);
			r += dr;
			th += (d * Math.sqrt(PATH_STEP * PATH_STEP - dr * dr)) / r;
			plan.push({ r, th });
		}
	};
	/** Зигзаги вокруг угла center длиной примерно legLength м: count отрезков или до вершины. */
	const zigzag = (center: number, legLength: number, count = Infinity) => {
		for (let i = 0; i < count && r > stopR; i++) {
			const half = legLength / 2 / r;
			leg(i % 2 === 0 ? center + half : center - half);
		}
	};
	const fire = () => fireIndex.push(plan.length - 1);
	const turnIndex: number[] = [];
	const turn = () => turnIndex.push(plan.length - 1);

	leg(0.14);
	turn();
	leg(-0.14);
	turn();
	leg(0.1);
	fire();
	leg(1.3);
	fire();
	zigzag(1.65, 70, 3);
	leg(2.9);
	fire();
	zigzag(3.25, 60, 4);
	fire();
	zigzag(3.25, 60);
	// Последний отрезок — прямо через центр площадки к дальнему её краю (r < 0 — по ту сторону центра).
	const lastTh = th;
	for (let rr = r - PATH_STEP; rr > -SUMMIT_LOOKOUT; rr -= PATH_STEP) plan.push({ r: rr, th: lastTh });
	plan.push({ r: -SUMMIT_LOOKOUT, th: lastTh });

	let xs = plan.map((p) => p.r * Math.sin(p.th));
	let zs = plan.map((p) => p.r * Math.cos(p.th));
	// Сглаживание скользящим средним: развороты — петлями, а не иглой. Концы на месте.
	for (let pass = 0; pass < 3; pass++) {
		const nx = xs.slice();
		const nz = zs.slice();
		for (let i = 2; i < xs.length - 2; i++) {
			nx[i] = (xs[i - 2] + xs[i - 1] + xs[i] + xs[i + 1] + xs[i + 2]) / 5;
			nz[i] = (zs[i - 2] + zs[i - 1] + zs[i] + zs[i + 1] + zs[i + 2]) / 5;
		}
		xs = nx;
		zs = nz;
	}
	// Высота — по профилю в самой точке; на разворотах сглаживание сжало путь по горизонтали — там уклон потом
	// подрезается (см. _followRelief).
	const points: PathPoint[] = [];
	let s = 0;
	for (let i = 0; i < xs.length; i++) {
		if (i > 0) s += Math.hypot(xs[i] - xs[i - 1], zs[i] - zs[i - 1]);
		points.push({ x: xs[i], y: profileHeight(Math.hypot(xs[i], zs[i])), z: zs[i], s });
	}
	const legEnds = [...fireIndex.map((i) => points[i].s), s];
	return { points, legEnds, turns: turnIndex.map((i) => points[i].s) };
}
